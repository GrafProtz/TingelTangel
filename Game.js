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
            isMoving: false,
            moveCounter: 0,
            targetPubNodeId: null,
            radarUnlocked: false,
            lastRadarTime: 0,
            lastPubVisitTime: 0,
            showPubCooldownText: false,
            moveCount: 0,
            infoMenuOpenUntilMove: -1,
            isInfoMenuOpen: false
        };

        this._stateChangeCallbacks  = [];
        this._positionCallbacks     = [];
        this._targetReachedCallbacks = [];
        this._firstMoveCallbacks     = [];
        this._firstMoveFired = false;
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
        // Risiko-Daten berechnen
        const targetNode = this._mapData.getNode(this._state.targetPubNodeId);
        let riskData = { riskMalus: 0, activeStations: 0 };
        if (targetNode) {
            riskData = this._mapData.getPoliceRiskModifier([targetNode.lat, targetNode.lon]);
        }

        // Optionen mit dynamischem Risiko
        const optionsData = {
            A: { text: `Sprich mit dem Barkeeper. Wenn du ihm 50 Euro Trinkgeld gibst, erzählt er dir vielleicht, wie die Polizei in ${this._mapData.cityName || 'dieser Stadt'} organisiert ist.`,
                 cost: 50, risk: 0 },
            B: { text: 'Einbruch',       reward: 100, risk: Math.min(100, 45 + riskData.riskMalus) },
            C: { text: 'Straßenraub',    reward: 300, risk: Math.min(100, 85 + riskData.riskMalus) },
            D: { text: 'Nur Infos kaufen (Sicher)', cost: 10, risk: 0 }
        };

        console.log('\ud83d\udea8 Risiko-Daten:', riskData, 'Optionen:', optionsData);
        this._targetReachedCallbacks.forEach(cb => cb(this._state.targetPubNodeId, optionsData, riskData));
    }

    /** Callback für den allerersten erfolgreichen Zug. */
    onFirstMove(callback) {
        if (typeof callback === 'function') this._firstMoveCallbacks.push(callback);
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
            targetPubNodeId: String(targetNodeId),
            radarUnlocked: false,
            lastRadarTime: 0,
            lastPubVisitTime: 0,
            showPubCooldownText: false,
            moveCount: 0,
            infoMenuOpenUntilMove: -1,
            isInfoMenuOpen: false
        };
        this._firstMoveFired = false;
        console.log('🎯 MISSION GESTARTET! Ziel-ID gesetzt auf:', this._state.targetPubNodeId);
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
                this._state.moveCount++;

                // Info-Menü automatisch schließen nach X Zügen
                if (this._state.isInfoMenuOpen && this._state.infoMenuOpenUntilMove !== -1) {
                    if (this._state.moveCount >= this._state.infoMenuOpenUntilMove) {
                        this._state.isInfoMenuOpen = false;
                        this._state.infoMenuOpenUntilMove = -1;
                    }
                }

                this._state.moveCounter++;

                // Erster Zug → Tutorial-Fade-out auslösen
                if (!this._firstMoveFired) {
                    this._firstMoveFired = true;
                    this._firstMoveCallbacks.forEach(cb => cb());
                }

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

                // Sicherheitsnetz: 50m Proximity-Check
                if (!arrived && this._state.targetPubNodeId) {
                    const playerNode = this._mapData.getNode(this._state.currentPlayerNodeId);
                    const targetNode = this._mapData.getNode(this._state.targetPubNodeId);
                    if (playerNode && targetNode) {
                        const dist = this._haversine(playerNode, targetNode);
                        console.log('ID-Match fehlgeschlagen. Distanz zum Ziel:', dist.toFixed(1), 'Meter');
                        if (dist < 50) {
                            console.log('✅ PROXIMITY TRIGGER! Unter 50m → Ziel erreicht.');
                            arrived = true;
                        }
                    } else {
                        console.warn('⚠️ Node-Lookup fehlgeschlagen! player:', !!playerNode, 'target:', !!targetNode);
                    }
                }

                if (arrived) {
                    const cooldownMs = 180000; // 3 Minuten
                    const timeSinceLastVisit = Date.now() - this._state.lastPubVisitTime;

                    if (timeSinceLastVisit > cooldownMs) {
                        console.log('🍺 ZIEL ERREICHT! Callback wird gefeuert.');
                        this._state.gameActive = false;
                        this._notifyTargetReached();
                    } else {
                        const remaining = Math.ceil((cooldownMs - timeSinceLastVisit) / 1000);
                        console.log(`🍺 Ziel erreicht, aber Cooldown aktiv: ${remaining}s`);
                    }
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
    //  Radar & Items
    // ----------------------------------------------------------------

    /**
     * Aktiviert das Polizei-Radar (5-Minuten-Cooldown).
     * @returns {Array|string|null} Stationen, 'cooldown' oder null
     */
    triggerRadar() {
        if (!this._state.radarUnlocked) return null;
        const COOLDOWN = 300_000; // 5 Minuten
        if (Date.now() - this._state.lastRadarTime < COOLDOWN) return 'cooldown';
        this._state.lastRadarTime = Date.now();
        this._notify();
        return [...this._mapData._policeStations];
    }

    /**
     * Verarbeitet die Entscheidung im Kneipen-Dialog.
     * @param {string} key - A, B, C oder D
     * @param {object} opt - Die gewählte Option { text, reward, risk, cost }
     * @returns {string} Ergebnismeldung
     */
    handleInteractionDecision(key, opt) {
        const roll = Math.random() * 100;
        let msg = '';

        if (key === 'A') {
            if (this._state.radarUnlocked) {
                msg = '📡 Du hast die Frequenz bereits!';
            } else if (this._state.budget >= 50) {
                this._state.budget -= 50;
                this._state.radarUnlocked = true;
                
                const currentNode = this._mapData.getNode(this._state.currentPlayerNodeId);
                const risk = this._mapData.getPoliceRiskModifier([currentNode.lat, currentNode.lon]);
                const stations = risk.activeStations;
                msg = `Der Barkeeper meint, dass hier ${stations} Polizeiwache(n) in der Umgebung sind.`;
                
                // Menü automatisch für neue Infos öffnen
                this.triggerNewInfo();
            } else {
                msg = '❌ Nicht genug Geld! Du brauchst 50 €.';
            }
        } else if (key === 'D') {
            const cost = opt.cost || 10;
            if (this._state.budget >= cost) {
                this._state.budget -= cost;
                msg = `Du kaufst Infos für ${cost} €. Ein Tipp: "Halte dich vom Osten fern."`;
            } else {
                msg = '❌ Nicht genug Geld für Informationen.';
            }
        } else if (roll < opt.risk) {
            const fine = Math.ceil(opt.reward * 0.5);
            this._state.budget = Math.max(0, this._state.budget - fine);
            msg = `🚨 ERWISCHT! Strafe: ${fine} €.`;
        } else {
            this._state.budget += opt.reward;
            msg = `✅ Erfolg! Du kassierst ${opt.reward} € für "${opt.text}".`;
        }

        // Cooldown setzen und Steuerung reaktivieren
        this._state.lastPubVisitTime = Date.now();
        this._state.gameActive = true;
        this._notify();

        // UI-Timeouts für Cooldown-Text
        setTimeout(() => {
            this._state.showPubCooldownText = true;
            this._notify();
        }, 5000);

        setTimeout(() => {
            this._state.showPubCooldownText = false;
            this._notify();
        }, 180000);

        return msg;
    }

    /**
     * Öffnet das Info-Menü automatisch für die nächsten 5 Züge.
     */
    triggerNewInfo() {
        this._state.isInfoMenuOpen = true;
        this._state.infoMenuOpenUntilMove = this._state.moveCount + 5;
        this._notify();
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
