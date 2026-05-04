import { MapData } from './MapData.js';
import { CONFIG } from './GameConfig.js';
import { STRINGS } from './GameStrings.js';
import { eventBus } from './EventBus.js';

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
            budget: CONFIG.INITIAL_BUDGET,
            currentPlayerNodeId: null,
            gameActive: false,
            isMoving: false,
            targetPubNodeId: null,
            radarUnlocked: false,
            lastRadarTime: 0,
            lastPubVisitTime: 0,
            showPubCooldownText: false,
            moveCount: 0,
            missionPhase: 1,
            infoMenuOpenUntilMove: -1,
            isInfoMenuOpen: false,
            activeCrimeTargets: [],
            logbook: []
        };

        this._stateChangeCallbacks  = [];
        this._positionCallbacks     = [];
        this._targetReachedCallbacks = [];
        this._firstMoveCallbacks     = [];

        this._setupInteractionListeners();
        this._firstMoveFired = false;
        this._animFrameId = null;
    }

    _setupInteractionListeners() {
        eventBus.subscribe('INTERACTION_SELECTED', ({ key, option }) => {
            if (key === 'B') {
                if (this.canAfford(75)) {
                    this.deductBudget(75);
                    eventBus.emit('OPEN_INVESTMENT', { cityName: this._mapData.cityName });
                } else {
                    eventBus.emit('SHOW_INTERACTION_RESULT', { msg: "Nicht genug Geld für den Berater!", type: 'fail' });
                    this.resume();
                }
            } else {
                const msg = this.handleInteractionDecision(key, option);
                eventBus.emit('SHOW_INTERACTION_RESULT', { 
                    msg, 
                    type: msg.includes('✅') ? 'success' : 'fail' 
                });
                
                // Spezialfall: Radar freigeschaltet
                if (key === 'A' && this._state.radarUnlocked) {
                    // Radar Tutorial etc. (könnte man auch in IM auslagern)
                    this._state.missionPhase = 2;
                    this._state.lastRadarTime = Date.now();
                    this.resume();
                    this.triggerNewInfo();
                } else {
                    this.resume();
                }
            }
        });

        eventBus.subscribe('INVESTMENT_SELECTED', (targetType) => {
            this.spawnTargets(targetType, this._state.currentPlayerNodeId);
            this.resume();
        });

        eventBus.subscribe('INVESTMENT_CANCELLED', () => {
            this.resume();
        });

        eventBus.subscribe('START_BURGLARY', ({ target, riskData }) => {
            setTimeout(() => {
                const roll = Math.floor(Math.random() * 100) + 1;
                const isSuccess = roll <= riskData.successProbability;

                if (isSuccess) {
                    const amount = this.calculateLoot(target.type);
                    this.addReward(amount);
                    eventBus.emit('SHOW_DIALOG', {
                        title: 'Erfolg!',
                        text: `Du hast ${amount} € erbeutet!`,
                        buttons: [{ text: 'Hervorragend', event: 'RESUME_GAME' }]
                    });
                } else {
                    eventBus.emit('SHOW_DIALOG', {
                        title: 'Fehlschlag!',
                        text: 'Die Polizei war schneller.',
                        buttons: [{ text: 'Verdammt', event: 'RESUME_GAME' }]
                    });
                }
                this.resetBurglaryState();
            }, 2000);
        });

        eventBus.subscribe('RESUME_GAME', () => this.resume());
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
        this._updateHUDInfo();
        eventBus.emit('INFO_MENU_STATE', this._state.isInfoMenuOpen);
    }

    _notifyPosition(lat, lon, budget) {
        this._positionCallbacks.forEach(cb => cb(lat, lon, budget));
        eventBus.emit('BUDGET_UPDATED', budget);
    }

    /** Callback wenn der Spieler das Missions-Ziel erreicht. */
    onTargetReached(callback) {
        if (typeof callback === 'function') this._targetReachedCallbacks.push(callback);
    }

    _notifyTargetReached() {
        const targetNode = this._mapData.getNode(this._state.targetPubNodeId);
        const cityName = this._mapData.cityName || 'dieser Stadt';

        const optionsData = {
            A: { 
                text: STRINGS.interactions.pub.optionA(cityName),
                cost: 50, 
                risk: 0 
            },
            B: { 
                text: STRINGS.interactions.pub.optionB(0),
                requiresConfirmation: false,
                cost: 75 
            },
            C: { 
                text: STRINGS.interactions.pub.optionC('?'), 
                requiresConfirmation: true,
                reward: 300 
            },
            D: { 
                text: STRINGS.interactions.pub.optionD, 
                cost: 10, 
                risk: 0 
            }
        };

        const currentNode = this._mapData.getNode(this._state.currentPlayerNodeId);
        const riskData = this._mapData.getPoliceRiskModifier([currentNode.lat, currentNode.lon]);
        
        eventBus.emit('OPEN_INTERACTION', { 
            optionsData, 
            riskData, 
            getPreviewFn: (key) => this.getInteractionPreview(key) 
        });
        
        this._targetReachedCallbacks.forEach(cb => cb(this._state.currentPlayerNodeId, optionsData, riskData));
    }

    /**
     * Berechnet die Risiko-Vorschau für eine zweistufige Interaktion.
     * @param {string} key - B oder C
     */
    getInteractionPreview(key) {
        const targetNode = this._mapData.getNode(this._state.targetPubNodeId);
        if (!targetNode) return null;

        const riskData = this._mapData.getPoliceRiskModifier([targetNode.lat, targetNode.lon]);
        const baseRisk = (key === 'B') ? 20 : 85;
        const finalRisk = Math.min(100, baseRisk + riskData.riskMalus);

        let previewText = '';
        if (key === 'B') previewText = STRINGS.interactions.pub.previewB(finalRisk);
        if (key === 'C') previewText = STRINGS.interactions.pub.previewC(finalRisk);

        return {
            key,
            risk: finalRisk,
            text: previewText
        };
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
            budget: CONFIG.INITIAL_BUDGET,
            currentPlayerNodeId: String(startNodeId),
            gameActive: true,
            isMoving: false,
            targetPubNodeId: String(targetNodeId),
            radarUnlocked: false,
            lastRadarTime: 0,
            lastPubVisitTime: 0,
            showPubCooldownText: false,
            moveCount: 0,
            missionPhase: 1,
            infoMenuOpenUntilMove: -1,
            isInfoMenuOpen: false,
            logbook: []
        };
        this._firstMoveFired = false;
        console.log('🎯 MISSION GESTARTET! Ziel-ID:', this._state.targetPubNodeId);
        this._notify();
    }

    pause() {
        this._state.gameActive = false;
        this._notify();
    }

    resume() {
        this._state.gameActive = true;
        this._notify();
    }

    setGameActive(active) {
        this._state.gameActive = !!active;
        this._notify();
    }

    isGameActive() {
        return this._state.gameActive;
    }

    getBudget() {
        return this._state.budget;
    }

    getState() {
        return { ...this._state };
    }


    canAfford(amount) {
        return this._state.budget >= amount;
    }

    deductBudget(amount) {
        this._state.budget = Math.max(0, this._state.budget - amount);
        eventBus.emit('BUDGET_UPDATED', this._state.budget);
        this._notify();
    }

    addReward(amount) {
        this._state.budget += amount;
        eventBus.emit('BUDGET_UPDATED', this._state.budget);
        this._notify();
    }

    resetBurglaryState() {
        this._state.activeCrimeTargets = [];
        this._state.missionPhase = 1;
        this.resume();
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
        if (Date.now() - this._state.lastRadarTime < CONFIG.RADAR_COOLDOWN) return 'cooldown';
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
            } else if (this._state.budget >= CONFIG.RADAR_COST) {
                this._state.budget -= CONFIG.RADAR_COST;
                this._state.radarUnlocked = true;
                
                const currentNode = this._mapData.getNode(this._state.currentPlayerNodeId);
                const risk = this._mapData.getPoliceRiskModifier([currentNode.lat, currentNode.lon]);
                const stations = risk.activeStations;
                msg = `Der Barkeeper meint, dass hier ${stations} Polizeiwache(n) in der Umgebung sind.`;
                
                // Menü automatisch für neue Infos öffnen
                this.triggerNewInfo();
            } else {
                msg = `❌ Nicht genug Geld! Du brauchst ${CONFIG.RADAR_COST} €.`;
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
            msg = opt.caughtMsg ? opt.caughtMsg(fine) : `🚨 ERWISCHT! Strafe: ${fine} €.`;
        } else {
            this._state.budget += opt.reward;
            msg = opt.successMsg ? opt.successMsg(opt.reward) : `✅ Erfolg! Du kassierst ${opt.reward} € für "${opt.text}".`;
        }

        // Cooldown setzen und Steuerung reaktivieren
        this._state.lastPubVisitTime = Date.now();
        this._state.gameActive = true;

        // Im Logbuch speichern
        this._state.logbook.push({ 
            time: Date.now(), 
            text: msg, 
            type: (roll < (opt.risk || 0)) ? 'fail' : 'success' 
        });

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
     * Schaltet das Info-Menü manuell an/aus.
     */
    toggleInfoMenu() {
        this._state.isInfoMenuOpen = !this._state.isInfoMenuOpen;
        eventBus.emit('INFO_MENU_STATE', this._state.isInfoMenuOpen);
        this._notify();
    }

    /**
     * Berechnet die Info-Karten für den HUDManager basierend auf dem aktuellen Zustand.
     */
    _updateHUDInfo() {
        const state = this._state;
        if (!state.gameActive && state.currentPlayerNodeId === null) {
            eventBus.emit('INFO_UPDATED', []);
            return;
        }

        const infoCards = [];
        const targetNode = this._mapData.getNode(state.targetPubNodeId);
        const targetName = targetNode?.tags?.name || 'Unbekannte Gaststätte';

        if (state.gameActive) {
            if (state.missionPhase === 1) {
                infoCards.push(
                    { title: 'AKTUELLES ZIEL', body: targetName },
                    { title: 'AUFGABE', body: 'Erreiche die Kneipe, um Informationen zu sammeln.' },
                    { title: 'STEUERUNG', body: 'Klicke auf die grünen Punkte, um dich durch die Stadt zu bewegen.' }
                );
            } else if (state.missionPhase === 2) {
                infoCards.push({ 
                    title: 'RADAR-SYSTEM', 
                    body: 'Drücke "P", um Standorte der Polizei für 5 Sek. aufzudecken. (5 Min. Cooldown)' 
                });
            }
        }

        if (state.showPubCooldownText) {
            infoCards.push({ 
                title: 'HINWEIS', 
                body: 'Du kannst erst wieder in drei Minuten die Kneipe besuchen.' 
            });
        }

        eventBus.emit('INFO_UPDATED', infoCards);
    }

    /**
     * Berechnet das Risiko für ein spezifisches Ziel basierend auf Typ und Polizeinähe.
     * @param {Object} targetNode - Das Ziel-Node-Objekt mit .type, .lat und .lon.
     * @returns {Object} { totalRisk, successProbability, policePenalty, baseQuote }
     */
    calculateTargetRisk(targetNode) {
        if (!targetNode) return { totalRisk: 0, successProbability: 100, policePenalty: 0, baseQuote: 0 };

        // 1. Basis-Risiko (Aufklärungsquote nach Gebäudetyp)
        const baseMapping = {
            'commercial': 30,
            'residential': 15,
            'public': 40,
            'allotments': 5
        };
        const baseQuote = baseMapping[targetNode.type] || 20;

        // 2. Polizei-Aufschlag (Distanz zur nächsten Wache)
        let minPoliceDist = Infinity;
        // Zugriff auf die geladenen Polizeistationen aus MapData
        const stations = this._mapData._policeStations || [];
        
        stations.forEach(station => {
            const dist = this._mapData.calculateDistance(
                { lat: targetNode.lat, lon: targetNode.lon },
                { lat: station.lat, lon: station.lon }
            );
            if (dist < minPoliceDist) minPoliceDist = dist;
        });

        let policePenalty = 0;
        if (minPoliceDist < 1000) {
            // Linear abnehmend: 10% bei 0m, 0% bei 1000m
            policePenalty = 10 * (1 - (minPoliceDist / 1000));
        }

        // 3. Finale Berechnung
        const totalRisk = baseQuote + policePenalty;
        const successProbability = 100 - totalRisk;

        return {
            totalRisk: Number(totalRisk.toFixed(2)),
            successProbability: Number(successProbability.toFixed(2)),
            policePenalty: Number(policePenalty.toFixed(2)),
            baseQuote: baseQuote
        };
    }

    /**
     * Öffnet das Info-Menü automatisch für die nächsten 5 Züge.
     */
    triggerNewInfo() {
        this._state.isInfoMenuOpen = true;
        this._state.infoMenuOpenUntilMove = this._state.moveCount + CONFIG.INFO_MENU_AUTO_OPEN_TURNS;
        this._notify();
    }

    // ----------------------------------------------------------------
    //  Hilfsfunktionen
    // ----------------------------------------------------------------

    getState() {
        return { ...this._state };
    }

    /** Prüft, ob genug Budget vorhanden ist. */
    canAfford(amount) {
        return this._state.budget >= amount;
    }

    /** Zieht einen Betrag vom Budget ab. */
    deductBudget(amount) {
        this._state.budget = Math.max(0, this._state.budget - amount);
        eventBus.emit('BUDGET_UPDATED', this._state.budget);
    }

    /**
     * Wählt 3 reale Gebäude aus den OSM-Rohdaten anhand ihrer Tags und Distanz aus.
     * @param {string} targetType - 'residential', 'commercial', 'public', 'allotments'
     * @param {string} centerNodeId 
     */
    spawnTargets(targetType, centerNodeId) {
        const centerNode = this._mapData.getNode(centerNodeId);
        if (!centerNode) return false;

        console.log(`[GAME] Suche reale Gebäude vom Typ "${targetType}"...`);

        // Tag-Mapping für OSM "building"-Werte
        const tagMap = {
            'residential': ['residential', 'apartments', 'house', 'detached', 'terrace', 'residential_complex'],
            'commercial':  ['commercial', 'office', 'retail', 'supermarket', 'bank', 'hotel', 'industrial'],
            'public':      ['public', 'civic', 'government', 'hospital', 'school', 'university', 'kindergarten', 'townhall', 'church'],
            'allotments':  ['allotment_house', 'shed', 'cabin', 'bungalow', 'garden_house', 'farm_auxiliary']
        };

        const allowedTags = tagMap[targetType] || [];
        const candidates = [];

        // Wir iterieren über die rohen Ways (Karten-Features), nicht den Graphen!
        this._mapData._ways.forEach((way, id) => {
            const bTag = way.tags?.building;
            if (!bTag || !allowedTags.includes(bTag)) return;

            // Zentrum des Gebäudes nutzen (aus Overpass center)
            const lat = way.center?.lat || (this._mapData._nodes.get(String(way.nodes?.[0]))?.lat);
            const lon = way.center?.lon || (this._mapData._nodes.get(String(way.nodes?.[0]))?.lon);
            if (!lat || !lon) return;

            const dist = this._mapData.calculateDistance(centerNode, { lat, lon });
            
            // Gebäude im Umkreis von 50m bis 250m
            if (dist >= 50 && dist <= 250) {
                // Zugangsknoten (nächste Straßenkreuzung) ermitteln
                let accessNodeId = null;
                let minDistToNode = Infinity;
                
                this._mapData._macroGraph.forEach((edges, nodeId) => {
                    const node = this._mapData.getNode(nodeId);
                    if (!node) return;
                    const d = this._mapData.calculateDistance({ lat, lon }, node);
                    if (d < minDistToNode) {
                        minDistToNode = d;
                        accessNodeId = nodeId;
                    }
                });

                candidates.push({
                    id: `bldg_${id}`,
                    lat: lat,
                    lon: lon,
                    type: targetType,
                    accessNodeId: accessNodeId,
                    name: way.tags.name || `${targetType}-Gebäude`
                });
            }
        });

        console.log(`[GAME] ${candidates.length} passende Gebäude gefunden.`);

        // Randomisiert 3 auswählen
        const shuffled = candidates.sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 3);

        // Debug-Log für die gefundenen Ziele
        console.log("[DEBUG TARGETS] Gefilterte Gebäude für Typ", targetType, ":", selected);

        // Im State registrieren
        if (selected.length === 0) return false;

        this._state.activeCrimeTargets = selected;
        this._state.missionPhase = 3;
        this._notify();
        return true;
    }

    /**
     * Berechnet die Beute für einen erfolgreichen Einbruch basierend auf dem Gebäudetyp.
     * @param {string} targetType 
     */
    calculateLoot(targetType) {
        const ranges = {
            'residential': { min: 150, max: 1500 },
            'commercial':  { min: 300, max: 2000 },
            'public':      { min: 200, max: 1500 },
            'allotments':  { min: 100, max: 1000 }
        };

        const config = ranges[targetType] || { min: 50, max: 500 };
        return Math.floor(Math.random() * (config.max - config.min + 1)) + config.min;
    }

    /**
     * Berechnet Optionen und Risiken für einen Einbruch in ein spezifisches Gebäude.
     * @param {string} targetId 
     */
    getBurglaryData(targetId) {
        const target = this._state.activeCrimeTargets?.find(t => t.id === targetId);
        if (!target) return null;

        const riskData = this._mapData.getPoliceRiskModifier([target.lat, target.lon]);
        
        // Multiplikator je nach Gebäudetyp
        let mult = 1.0;
        if (target.type === 'commercial') mult = 1.2;
        if (target.type === 'public') mult = 1.5;
        if (target.type === 'allotments') mult = 0.6;

        return {
            title: STRINGS.interactions.burglary.title(target.type),
            options: {
                A: { 
                    text: STRINGS.interactions.burglary.optionA, 
                    risk: Math.min(95, Math.round((15 + riskData.riskMalus) * mult)), 
                    reward: 180, 
                    preview: STRINGS.interactions.burglary.previewA,
                    successMsg: STRINGS.interactions.burglary.success,
                    caughtMsg: STRINGS.interactions.burglary.caught
                },
                B: { 
                    text: STRINGS.interactions.burglary.optionB, 
                    risk: Math.min(95, Math.round((35 + riskData.riskMalus) * mult)), 
                    reward: 450, 
                    preview: STRINGS.interactions.burglary.previewB,
                    successMsg: STRINGS.interactions.burglary.success,
                    caughtMsg: STRINGS.interactions.burglary.caught
                },
                C: { 
                    text: STRINGS.interactions.burglary.optionC, 
                    risk: Math.min(98, Math.round((70 + riskData.riskMalus) * mult)), 
                    reward: 1350, 
                    preview: STRINGS.interactions.burglary.previewC,
                    successMsg: STRINGS.interactions.burglary.success,
                    caughtMsg: STRINGS.interactions.burglary.caught
                }
            }
        };
    }
}

export { Game };
