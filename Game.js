import { MapData } from './MapData.js';

/**
 * Game - Die Logik-Schicht.
 * Verwaltet Spielzustand, validiert Züge und steuert die Pfad-Animation.
 */
class Game {
    /**
     * @param {MapData} mapData
     */
    constructor(mapData) {
        this._mapData = mapData;

        this._state = {
            budget: 300,
            currentPlayerNodeId: null,
            gameActive: false,
            isMoving: false,          // Sperrt Eingaben während der Animation
            moveCounter: 0,
            targetPubNodeId: null
        };

        this._stateChangeCallbacks  = [];
        this._positionCallbacks     = [];
        this._targetReachedCallbacks = [];
        this._animFrameId = null;
    }

    // ----------------------------------------------------------------
    //  Event-System
    // ----------------------------------------------------------------

    /** UI-Update bei logischen State-Änderungen (Ankunft, Budget, Game-Over). */
    onStateChange(callback) {
        if (typeof callback === 'function') {
            this._stateChangeCallbacks.push(callback);
            callback({ ...this._state });
        }
    }

    /** Frame-genaues Positions-Update während der Bewegung. */
    onPositionUpdate(callback) {
        if (typeof callback === 'function') {
            this._positionCallbacks.push(callback);
        }
    }

    _notify() {
        const copy = { ...this._state };
        this._stateChangeCallbacks.forEach(cb => cb(copy));
    }

    _notifyPosition(lat, lon, budget) {
        this._positionCallbacks.forEach(cb => cb(lat, lon, budget));
    }

    /** Callback wenn der Spieler das Missions-Ziel erreicht. */
    onTargetReached(callback) {
        if (typeof callback === 'function') this._targetReachedCallbacks.push(callback);
    }

    _notifyTargetReached() {
        this._targetReachedCallbacks.forEach(cb => cb(this._state.targetPubNodeId));
    }

    // ----------------------------------------------------------------
    //  Mission
    // ----------------------------------------------------------------

    startMission(startNodeId, targetNodeId) {
        this._state = {
            budget: 300,
            currentPlayerNodeId: String(startNodeId),
            gameActive: true,
            isMoving: false,
            moveCounter: 0,
            targetPubNodeId: String(targetNodeId)
        };
        console.log('🎯 MISSION GESTARTET! Ziel-ID gesetzt auf:', this._state.targetPubNodeId, '| Typ:', typeof this._state.targetPubNodeId);
        console.log('🏁 Start-ID:', this._state.currentPlayerNodeId, '| Typ:', typeof this._state.currentPlayerNodeId);
        this._notify();
    }

    // ----------------------------------------------------------------
    //  Bewegung mit Pfad-Animation
    // ----------------------------------------------------------------

    /**
     * Bewegt die Spielfigur zum Zielknoten, entlang des Makro-Pfads.
     * Während der Animation: Eingaben gesperrt, Budget sinkt kontinuierlich,
     * Frame-genaue Positions-Updates werden gefeuert.
     */
    moveToNode(targetId) {
        if (!this._state.gameActive || this._state.isMoving) return;

        const edge = this._mapData.getEdge(this._state.currentPlayerNodeId, targetId);
        if (!edge) {
            console.warn(`Game: Keine Kante von ${this._state.currentPlayerNodeId} nach ${targetId}`);
            return;
        }

        // Eingaben sperren
        this._state.isMoving = true;
        this._notify();

        // Pfad vorbereiten: Startpunkt + alle Zwischenpunkte (path enthält bereits das Ziel)
        const startNode = this._mapData.getNode(this._state.currentPlayerNodeId);
        const fullPath = [[startNode.lat, startNode.lon], ...edge.path];

        // Kosten berechnen: 1 € pro 10 Meter
        const totalCost = Math.max(1, Math.ceil(edge.distance / 10));
        const budgetAtStart = this._state.budget;

        // Animation starten
        const speed = 120;     // Meter pro Sekunde (Spieltempo, nicht realistisch)
        const durationMs = (edge.distance / speed) * 1000;
        const startTime = performance.now();

        const animate = (now) => {
            const elapsed = now - startTime;
            const t = Math.min(elapsed / durationMs, 1);   // 0 → 1

            // Interpolierte Position auf dem Pfad
            const pos = this._interpolatePath(fullPath, t);
            
            // Budget kontinuierlich reduzieren
            const costSoFar = Math.ceil(totalCost * t);
            this._state.budget = Math.max(0, budgetAtStart - costSoFar);

            // Frame-Update feuern (View bewegt Marker + HUD)
            this._notifyPosition(pos[0], pos[1], this._state.budget);

            if (t < 1) {
                this._animFrameId = requestAnimationFrame(animate);
            } else {
                this._state.currentPlayerNodeId = String(targetId);
                this._state.isMoving = false;
                this._state.moveCounter++;

                console.log('--- ANIMATION BEENDET ---');
                console.log('Angekommen auf Knoten:', String(this._state.currentPlayerNodeId), '| Typ:', typeof this._state.currentPlayerNodeId);
                console.log('Gesuchtes Ziel ist:   ', String(this._state.targetPubNodeId), '| Typ:', typeof this._state.targetPubNodeId);

                if (this._state.budget <= 0) {
                    this._state.budget = 0;
                    this._state.gameActive = false;
                }

                // Ziel erreicht? (Primär: ID-Vergleich)
                const idA = String(this._state.currentPlayerNodeId);
                const idB = String(this._state.targetPubNodeId);
                let arrived = idA === idB;
                console.log('ID-Vergleich:', idA, '===', idB, '->', arrived);

                // Sicherheitsnetz: 15m Proximity-Check
                if (!arrived && this._state.targetPubNodeId) {
                    const playerNode = this._mapData.getNode(this._state.currentPlayerNodeId);
                    const targetNode = this._mapData.getNode(this._state.targetPubNodeId);
                    if (playerNode && targetNode) {
                        const dist = this._haversine(playerNode, targetNode);
                        console.log('ID-Match fehlgeschlagen. Distanz zum Ziel:', dist.toFixed(1), 'Meter');
                        if (dist < 15) {
                            console.log('✅ PROXIMITY TRIGGER! Unter 15m → Ziel erreicht.');
                            arrived = true;
                        }
                    } else {
                        console.warn('⚠️ Node-Lookup fehlgeschlagen! player:', !!playerNode, 'target:', !!targetNode);
                    }
                }

                if (arrived) {
                    console.log('🍺 ZIEL ERREICHT! Callback wird gefeuert.');
                    this._state.gameActive = false;
                    this._notifyTargetReached();
                }

                this._notify();
            }
        };

        this._animFrameId = requestAnimationFrame(animate);
    }

    /**
     * Interpoliert eine Position auf einem Pfad-Array bei Fortschritt t (0–1).
     * Verteilt t gleichmäßig über die Segmente (vereinfachte Variante).
     */
    _interpolatePath(path, t) {
        if (path.length < 2) return path[0] || [0, 0];
        if (t <= 0) return path[0];
        if (t >= 1) return path[path.length - 1];

        const totalSegments = path.length - 1;
        const exactIndex = t * totalSegments;
        const segIndex = Math.floor(exactIndex);
        const segT = exactIndex - segIndex;

        const a = path[segIndex];
        const b = path[Math.min(segIndex + 1, path.length - 1)];

        return [
            a[0] + (b[0] - a[0]) * segT,
            a[1] + (b[1] - a[1]) * segT
        ];
    }

    // ----------------------------------------------------------------
    //  Hilfsfunktionen
    // ----------------------------------------------------------------

    _haversine(a, b) {
        const R = 6_371_000;
        const toR = Math.PI / 180;
        const dLat = (b.lat - a.lat) * toR;
        const dLon = (b.lon - a.lon) * toR;
        const s = Math.sin(dLat / 2) ** 2 +
                  Math.cos(a.lat * toR) * Math.cos(b.lat * toR) *
                  Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
    }

    getState() {
        return { ...this._state };
    }
}

export { Game };
