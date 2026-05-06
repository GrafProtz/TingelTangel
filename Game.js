import { MapData } from './MapData.js';
import { CONFIG } from './GameConfig.js';
import { STRINGS } from './GameStrings.js';
import { eventBus } from './EventBus.js';

/**
 * Game - Die Logik-Schicht.
 * Verwaltet Spielzustand, validiert Züge und steuert die Pfad-Animation.
 * 
 * ARCHITEKTUR:
 * - Kapselung: Alle Status-Variablen sind Private Fields (#).
 * - Pub/Sub: Keine direkten Manager-Aufrufe, Kommunikation nur via EventBus.
 * - Pure Logic: Berechnungen basieren auf Input und CONFIG.
 */
class Game {
    // Private Fields (Encapsulation)
    #mapData;
    #budget = CONFIG.INITIAL_BUDGET;
    #currentPlayerNodeId = null;
    #gameActive = false;
    #isMoving = false;
    #targetPubNodeId = null;
    #targetPubName = "Kneipe";
    #radarUnlocked = false;
    #lastRadarTime = 0;
    #lastPubVisitTime = 0;
    #showPubCooldownText = false;
    #moveCount = 0;
    #missionPhase = 1;
    #infoMenuOpenUntilMove = -1;
    #isInfoMenuOpen = false;
    #activeCrimeTargets = [];
    #logbook = [];
    
    #firstMoveFired = false;
    #animFrameId = null;

    /**
     * @param {MapData} mapData
     */
    constructor(mapData) {
        this.#mapData = mapData;
        this.#setupInteractionListeners();
    }

    /**
     * Initialisiert alle Subscriber für externe Events.
     */
    #setupInteractionListeners() {
        eventBus.subscribe('INTERACTION_SELECTED', (payload) => {
            const { key, option } = payload;
            
            if (key === 'B') {
                // Spezialfall: Investment Consultant
                const cost = 75; // TODO: In CONFIG verschieben
                if (this.canAfford(cost)) {
                    this.deductBudget(cost);
                    eventBus.emit('OPEN_INVESTMENT', { cityName: this.#mapData.cityName });
                } else {
                    eventBus.emit('SHOW_TOAST', { msg: "Nicht genug Geld für den Berater!", type: 'fail' });
                    this.resume();
                }
            } else {
                // Standard-Entscheidungen (A, C, D)
                const msg = this.handleInteractionDecision(key, option);
                
                eventBus.emit('SHOW_TOAST', { 
                    msg, 
                    type: (msg.includes('✅') || msg.includes('📡') || !msg.includes('❌')) ? 'success' : 'fail' 
                });

                eventBus.emit('CLOSE_INTERACTION');

                // Spezialfall: Radar-Tutorial bei Erstkauf (Option A)
                if (key === 'A' && this.#radarUnlocked) {
                    this.#missionPhase = 2;
                    this.#emitMissionUpdate();
                    
                    eventBus.emit('SHOW_DIALOG', {
                        title: '📡 Radar freigeschaltet',
                        text: 'Du hast die Polizeifrequenzen! Drücke ab jetzt jederzeit "P", um die Standorte der Polizei für 5 Sekunden auf der Karte aufzudecken. Nutze es weise!',
                        buttons: [{ text: 'Verstanden', event: 'RADAR_ACKNOWLEDGED' }],
                        isRadarUnlock: true
                    });
                } else {
                    this.resume();
                }
            }
        });

        eventBus.subscribe('INVESTMENT_SELECTED', (targetType) => {
            eventBus.emit('SPAWN_TARGETS', { targetType, centerNodeId: this.#currentPlayerNodeId });
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
                    const amount = this.calculateLoot(riskData.totalRisk);
                    this.addReward(amount);
                    eventBus.emit('SHOW_DIALOG', {
                        title: 'Erfolg!',
                        text: `Du hast ${amount} € erbeutet!`,
                        buttons: [{ text: 'Hervorragend', event: 'RESUME_GAME' }]
                    });
                } else {
                    const fine = Math.ceil(this.#budget * 0.2); // Strafe bei Fehlschlag
                    this.deductBudget(fine);
                    eventBus.emit('SHOW_DIALOG', {
                        title: 'Fehlschlag!',
                        text: `Die Polizei war schneller. Du musstest ${fine} € Strafe zahlen.`,
                        buttons: [{ text: 'Verdammt', event: 'RESUME_GAME' }]
                    });
                }
                this.#resetBurglaryState();
            }, 500);
        });

        eventBus.subscribe('RESUME_GAME', () => this.resume());
        eventBus.subscribe('RADAR_ACKNOWLEDGED', () => {
            // Wird in main.js abgefangen für die Kamerafahrt, Game bleibt pausiert
        });
    }

    // ----------------------------------------------------------------
    //  State & Getters
    // ----------------------------------------------------------------

    /**
     * Gibt eine tiefe Kopie des aktuellen Spielzustands zurück.
     * Nutzt structuredClone, um Referenz-Leaks zu verhindern.
     */
    getState() {
        return structuredClone({
            budget: this.#budget,
            currentPlayerNodeId: this.#currentPlayerNodeId,
            gameActive: this.#gameActive,
            isMoving: this.#isMoving,
            targetPubNodeId: this.#targetPubNodeId,
            targetPubName: this.#targetPubName,
            radarUnlocked: this.#radarUnlocked,
            lastRadarTime: this.#lastRadarTime,
            lastPubVisitTime: this.#lastPubVisitTime,
            showPubCooldownText: this.#showPubCooldownText,
            moveCount: this.#moveCount,
            missionPhase: this.#missionPhase,
            infoMenuOpenUntilMove: this.#infoMenuOpenUntilMove,
            isInfoMenuOpen: this.#isInfoMenuOpen,
            activeCrimeTargets: this.#activeCrimeTargets,
            logbook: this.#logbook
        });
    }

    // ----------------------------------------------------------------
    //  Ereignis-Benachrichtigungen (Internal Only)
    // ----------------------------------------------------------------

    /** Informiert das System über allgemeine Statusänderungen. */
    #notifyStateChange() {
        eventBus.emit('GAME_STATE_CHANGED', this.getState());
        this.#updateHUDInfo();
    }

    /** Spezielles Event für Budget-Änderungen inkl. Delta für Animationen. */
    #emitBudgetUpdate(diff = 0) {
        eventBus.emit('BUDGET_UPDATED', {
            total: this.#budget,
            diff: diff
        });
    }

    /** Informiert über Fortschritt in der Mission. */
    #emitMissionUpdate() {
        eventBus.emit('MISSION_STATE_CHANGED', {
            phase: this.#missionPhase,
            moveCount: this.#moveCount
        });
    }

    // ----------------------------------------------------------------
    //  Mission & Steuerung
    // ----------------------------------------------------------------

    startMission(startNodeId, targetNodeId, pubName = "Kneipe") {
        this.#budget = CONFIG.INITIAL_BUDGET;
        this.#currentPlayerNodeId = String(startNodeId);
        this.#gameActive = false; // Spiel ist pausiert bis INTRO_COMPLETE!
        this.#isMoving = false;
        this.#targetPubNodeId = String(targetNodeId);
        this.#targetPubName = pubName;
        this.#radarUnlocked = false;
        this.#lastRadarTime = 0;
        this.#lastPubVisitTime = 0;
        this.#showPubCooldownText = false;
        this.#moveCount = 0;
        this.#missionPhase = 1;
        this.#infoMenuOpenUntilMove = -1;
        this.#isInfoMenuOpen = false;
        this.#activeCrimeTargets = [];
        this.#logbook = [];
        
        this.#firstMoveFired = false;
        
        console.log('🎯 MISSION GESTARTET! Ziel-ID:', this.#targetPubNodeId);
        this.#emitBudgetUpdate();

        // Modal SOFORT aufploppen lassen
        const cityName = this.#mapData.cityName || "der Stadt";
        
        eventBus.emit('SHOW_INFO_CASCADE', {
            title: "Willkommen in der Unterwelt",
            fullText: "Willkommen in " + cityName + ", Grünschnabel. Die städtische Verbrecher-Innung gewährt dir ein Startkapital von 300 Euro. Betrachte es als Vorschuss. Dein erstes Ziel: Beweg deinen Hintern in die Kneipe namens '" + this.#targetPubName + "', nicht weit weg von hier. Dort schnappen wir ein paar lukrative Gerüchte auf, wie man hier an echtes Geld kommt.<br><br>Aber merk dir eins: Wir spazieren hier nicht gemütlich über den Bürgersteig. Wir bewegen uns unter dem Radar, von Knotenpunkt zu Knotenpunkt – wir 'hoppeln' quasi unsichtbar durch die Stadt. Und das kostet! Jeder verdammte Meter frisst dein Guthaben auf. Plane deine Route über die grünen Punkte also extrem clever, sonst bist du pleite, bevor du überhaupt dein erstes Ding gedreht hast.",
            shortText: "Ziel: Erreiche die Kneipe '" + this.#targetPubName + "'. (Achtung: Jeder Meter über die Knotenpunkte kostet Startkapital!)"
        });
    }

    triggerIntroRender() {
        this.#notifyStateChange(); // Jetzt rendern die POIs und Knoten
        
        setTimeout(() => {
            this.#gameActive = true;
            eventBus.emit('INTRO_COMPLETE');
        }, 6000); // 5s Spawn-Animation + 1s Puffer
    }

    /**
     * Lädt einen gespeicherten Spielstand in die Private Fields und aktualisiert die UI.
     * @param {Object} savedState - Der aus dem localStorage geladene JSON-State
     */
    hydrateState(savedState) {
        if (!savedState) return;

        this.#budget = savedState.budget ?? CONFIG.INITIAL_BUDGET;
        this.#currentPlayerNodeId = savedState.currentPlayerNodeId;
        this.#gameActive = savedState.gameActive ?? true;
        this.#isMoving = false; // Zur Sicherheit Bewegung zurücksetzen
        this.#targetPubNodeId = savedState.targetPubNodeId;
        this.#targetPubName = savedState.targetPubName || "Kneipe";
        this.#radarUnlocked = savedState.radarUnlocked ?? false;
        this.#lastRadarTime = savedState.lastRadarTime ?? 0;
        this.#lastPubVisitTime = savedState.lastPubVisitTime ?? 0;
        this.#showPubCooldownText = savedState.showPubCooldownText ?? false;
        this.#moveCount = savedState.moveCount ?? 0;
        this.#missionPhase = savedState.missionPhase ?? 1;
        this.#infoMenuOpenUntilMove = savedState.infoMenuOpenUntilMove ?? -1;
        this.#isInfoMenuOpen = savedState.isInfoMenuOpen ?? false;
        this.#activeCrimeTargets = savedState.activeCrimeTargets || [];
        this.#logbook = savedState.logbook || [];
        
        this.#firstMoveFired = true; // Verhindert, dass das Tutorial nach dem Laden triggert
        
        console.log('💾 Spielstand erfolgreich geladen. Aktueller Knoten:', this.#currentPlayerNodeId);
        
        this.#notifyStateChange();
        this.#emitBudgetUpdate();
        this.#emitMissionUpdate();
    }

    pause() {
        this.#gameActive = false;
        eventBus.emit('GAME_PAUSED');
        this.#notifyStateChange();
    }

    resume() {
        this.#gameActive = true;
        eventBus.emit('GAME_RESUMED');
        this.#notifyStateChange();
    }

    isGameActive() {
        return this.#gameActive;
    }

    canAfford(amount) {
        return this.#budget >= amount;
    }

    deductBudget(amount) {
        const oldBudget = this.#budget;
        this.#budget = Math.max(0, this.#budget - amount);
        this.#emitBudgetUpdate(this.#budget - oldBudget);
        this.#notifyStateChange();
    }

    addReward(amount) {
        const oldBudget = this.#budget;
        this.#budget += amount;
        this.#emitBudgetUpdate(this.#budget - oldBudget);
        this.#notifyStateChange();
    }

    #resetBurglaryState() {
        this.#activeCrimeTargets = [];
        this.#missionPhase = 1;
        this.#emitMissionUpdate();
        this.resume();
    }

    // ----------------------------------------------------------------
    //  Bewegung
    // ----------------------------------------------------------------

    moveToNode(targetId) {
        if (!this.#gameActive || this.#isMoving) return;

        const edge = this.#mapData.getEdge(this.#currentPlayerNodeId, targetId);
        if (!edge) return;

        this.#isMoving = true;
        this.#notifyStateChange();

        const startNode = this.#mapData.getNode(this.#currentPlayerNodeId);
        const fullPath = [[startNode.lat, startNode.lon], ...edge.path];

        const totalCost = Math.max(1, Math.ceil(edge.distance * CONFIG.COST_PER_METER));
        const budgetAtStart = this.#budget;

        const speed = 120; // Meter pro Sekunde
        const durationMs = (edge.distance / speed) * 1000;
        const startTime = performance.now();

        const animate = (now) => {
            const elapsed = now - startTime;
            const t = Math.min(elapsed / durationMs, 1);

            const pos = this.#interpolatePath(fullPath, t);
            
            const costSoFar = Math.ceil(totalCost * t);
            const newBudget = Math.max(0, budgetAtStart - costSoFar);
            
            if (newBudget !== this.#budget) {
                const diff = newBudget - this.#budget;
                this.#budget = newBudget;
                this.#emitBudgetUpdate(diff);
            }

            eventBus.emit('PLAYER_POSITION_UPDATED', { lat: pos[0], lon: pos[1], budget: this.#budget });

            if (t < 1) {
                this.#animFrameId = requestAnimationFrame(animate);
            } else {
                this.#finishMovement(targetId);
            }
        };

        this.#animFrameId = requestAnimationFrame(animate);
    }

    #finishMovement(targetId) {
        this.#currentPlayerNodeId = String(targetId);
        this.#isMoving = false;
        this.#moveCount++;

        // Info-Menü Management
        if (this.#isInfoMenuOpen && this.#infoMenuOpenUntilMove !== -1) {
            if (this.#moveCount >= this.#infoMenuOpenUntilMove) {
                this.#isInfoMenuOpen = false;
                this.#infoMenuOpenUntilMove = -1;
                eventBus.emit('INFO_MENU_STATE', false);
            }
        }

        // Erst-Zug Logik
        if (!this.#firstMoveFired) {
            this.#firstMoveFired = true;
            eventBus.emit('FIRST_MOVE_COMPLETED');
        }

        if (this.#budget <= 0) {
            this.#budget = 0;
            this.#gameActive = false;
            eventBus.emit('GAME_OVER', { reason: 'OUT_OF_MONEY' });
        }

        // Ziel-Prüfung
        if (String(this.#currentPlayerNodeId) === String(this.#targetPubNodeId)) {
            this.#checkPubArrival();
        }

        this.#notifyStateChange();
    }

    #checkPubArrival() {
        const timeSinceLastVisit = Date.now() - this.#lastPubVisitTime;

        if (timeSinceLastVisit > CONFIG.PUB_COOLDOWN) {
            this.#gameActive = false;
            eventBus.emit('PUB_TARGET_REACHED', { nodeId: this.#currentPlayerNodeId });
            this.#notifyTargetReached();
        } else {
            const remaining = Math.ceil((CONFIG.PUB_COOLDOWN - timeSinceLastVisit) / 1000);
            eventBus.emit('SHOW_TOAST', { msg: `Der Barkeeper ist noch beschäftigt. (${remaining}s)`, type: 'fail' });
        }
    }

    #interpolatePath(path, t) {
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

    triggerRadar(force = false) {
        if (!this.#radarUnlocked) return null;
        if (!force && (Date.now() - this.#lastRadarTime < CONFIG.RADAR_COOLDOWN)) return 'cooldown';
        
        if (!force) this.#lastRadarTime = Date.now();
        this.#notifyStateChange();

        const playerNode = this.#mapData.getNode(this.#currentPlayerNodeId);
        const playerCoords = playerNode ? [playerNode.lat, playerNode.lon] : [0, 0];

        return {
            stations: this.#mapData.getPoliceStations(),
            playerCoords
        };
    }

    handleInteractionDecision(key, opt) {
        const targetNode = this.#mapData.getNode(this.#targetPubNodeId);
        const riskData = targetNode ? this.#mapData.getPoliceRiskModifier([targetNode.lat, targetNode.lon]) : { riskMalus: 0 };
        
        const finalRisk = opt.risk !== undefined ? opt.risk : Math.min(100, (opt.risk || 0) + riskData.riskMalus);
        const roll = Math.random() * 100;
        let msg = '';

        if (key === 'A') {
            if (this.#radarUnlocked) {
                msg = '📡 Du hast die Frequenz bereits!';
            } else if (this.#budget >= CONFIG.RADAR_COST) {
                this.deductBudget(CONFIG.RADAR_COST);
                this.#radarUnlocked = true;
                
                const currentNode = this.#mapData.getNode(this.#currentPlayerNodeId);
                const risk = this.#mapData.getPoliceRiskModifier([currentNode.lat, currentNode.lon]);
                msg = `Der Barkeeper meint, dass hier ${risk.activeStations} Polizeiwache(n) in der Umgebung sind.`;
            } else {
                msg = `❌ Nicht genug Geld! Du brauchst ${CONFIG.RADAR_COST} €.`;
            }
        } else if (key === 'D') {
            const cost = CONFIG.INFO_COST;
            if (this.canAfford(cost)) {
                this.deductBudget(cost);
                msg = `Du kaufst Infos für ${cost} €. Ein Tipp: "Halte dich vom Osten fern."`;
            } else {
                msg = '❌ Nicht genug Geld für Informationen.';
            }
        } else if (roll < finalRisk) {
            const fine = Math.ceil(opt.reward * 0.5);
            this.deductBudget(fine);
            msg = opt.caughtMsg ? opt.caughtMsg(fine) : `🚨 ERWISCHT! Strafe: ${fine} €.`;
        } else {
            this.addReward(opt.reward);
            msg = opt.successMsg ? opt.successMsg(opt.reward) : `✅ Erfolg! Du kassierst ${opt.reward} € für "${opt.text}".`;
        }

        this.#lastPubVisitTime = Date.now();
        this.#gameActive = true;

        this.#logbook.push({ 
            time: Date.now(), 
            text: msg, 
            type: (roll < finalRisk) ? 'fail' : 'success' 
        });

        this.#notifyStateChange();

        // UI-Timeouts für Cooldown-Text
        setTimeout(() => {
            this.#showPubCooldownText = true;
            this.#notifyStateChange();
        }, 5000);

        setTimeout(() => {
            this.#showPubCooldownText = false;
            this.#notifyStateChange();
        }, CONFIG.PUB_COOLDOWN);

        return msg;
    }

    // ----------------------------------------------------------------
    //  Interaktion-Vorschau & Risiko
    // ----------------------------------------------------------------

    #notifyTargetReached() {
        const cityName = this.#mapData.cityName || 'dieser Stadt';

        const optionsData = {
            A: { text: STRINGS.interactions.pub.optionA(cityName), cost: CONFIG.RADAR_COST, risk: 0 },
            B: { text: STRINGS.interactions.pub.optionB(0), requiresConfirmation: false, cost: 75 },
            C: { text: STRINGS.interactions.pub.optionC('?'), requiresConfirmation: true, reward: 300 },
            D: { text: STRINGS.interactions.pub.optionD, cost: CONFIG.INFO_COST, risk: 0 }
        };

        const currentNode = this.#mapData.getNode(this.#currentPlayerNodeId);
        const riskData = this.#mapData.getPoliceRiskModifier([currentNode.lat, currentNode.lon]);
        
        if (riskData.riskMalus > 0) {
            ['B', 'C'].forEach(k => {
                if (optionsData[k]) optionsData[k].text = `🚨 ${optionsData[k].text} (Erhöhtes Risiko!)`;
            });
        }

        eventBus.emit('OPEN_INTERACTION', { 
            optionsData, 
            riskData, 
            getPreviewFn: (key) => this.getInteractionPreview(key) 
        });
    }

    getInteractionPreview(key) {
        const targetNode = this.#mapData.getNode(this.#targetPubNodeId);
        if (!targetNode) return null;

        const riskData = this.#mapData.getPoliceRiskModifier([targetNode.lat, targetNode.lon]);
        const baseRisk = (key === 'B') ? CONFIG.RISK_PUB_EASY : CONFIG.RISK_PUB_HARD;
        const finalRisk = Math.min(100, baseRisk + riskData.riskMalus);

        let previewText = '';
        if (key === 'B') previewText = STRINGS.interactions.pub.previewB(finalRisk);
        if (key === 'C') previewText = STRINGS.interactions.pub.previewC(finalRisk);

        if (riskData.riskMalus > 0) {
            previewText = `<div style="color: #ef4444; font-weight: bold; margin-bottom: 8px;">🚨 WARNUNG: Erhöhte Polizeipräsenz im Viertel!</div>${previewText}`;
        }

        return { key, risk: finalRisk, text: previewText };
    }

    calculateTargetRisk(targetNode) {
        if (!targetNode) return { totalRisk: 0, successProbability: 100, policePenalty: 0, baseQuote: 0 };

        const baseMapping = {
            'commercial':  CONFIG.RISK_COMMERCIAL,
            'residential': CONFIG.RISK_RESIDENTIAL,
            'public':      CONFIG.RISK_PUBLIC,
            'allotments':  CONFIG.RISK_ALLOTMENTS
        };
        const baseQuote = baseMapping[targetNode.type] || 20;

        let minPoliceDist = Infinity;
        const stations = this.#mapData.getPoliceStations();
        
        stations.forEach(station => {
            const dist = this.#mapData.calculateDistance(
                { lat: targetNode.lat, lon: targetNode.lon },
                { lat: station.lat, lon: station.lon }
            );
            if (dist < minPoliceDist) minPoliceDist = dist;
        });

        let policePenalty = 0;
        if (minPoliceDist < CONFIG.POLICE_MAX_RADIUS) {
            policePenalty = CONFIG.POLICE_MAX_MALUS * (1 - (minPoliceDist / CONFIG.POLICE_MAX_RADIUS));
        }

        const totalRisk = Math.min(CONFIG.POLICE_HARD_CAP + baseQuote, baseQuote + policePenalty);
        const successProbability = 100 - totalRisk;

        return {
            totalRisk: Number(totalRisk.toFixed(2)),
            successProbability: Number(successProbability.toFixed(2)),
            policePenalty: Number(policePenalty.toFixed(2)),
            baseQuote: baseQuote
        };
    }

    calculateLoot(totalRisk) {
        const baseAmount = totalRisk * 20;
        const variance = 0.8 + (Math.random() * 0.4);
        return Math.floor(baseAmount * variance);
    }

    // ----------------------------------------------------------------
    //  HUD & Info
    // ----------------------------------------------------------------

    toggleInfoMenu() {
        this.#isInfoMenuOpen = !this.#isInfoMenuOpen;
        eventBus.emit('INFO_MENU_STATE', this.#isInfoMenuOpen);
        this.#notifyStateChange();
    }

    #updateHUDInfo() {
        if (!this.#gameActive && this.#currentPlayerNodeId === null) {
            eventBus.emit('INFO_UPDATED', []);
            return;
        }

        const infoCards = [];
        const targetNode = this.#mapData.getNode(this.#targetPubNodeId);
        const targetName = targetNode?.tags?.name || 'Unbekannte Gaststätte';

        if (this.#gameActive) {
            if (this.#missionPhase === 1) {
                infoCards.push(
                    { title: 'AKTUELLES ZIEL', body: targetName },
                    { title: 'AUFGABE', body: 'Erreiche die Kneipe, um Informationen zu sammeln.' },
                    { title: 'STEUERUNG', body: 'Klicke auf die grünen Punkte, um dich durch die Stadt zu bewegen.' }
                );
            } else if (this.#missionPhase === 2) {
                infoCards.push({ 
                    title: 'RADAR-SYSTEM', 
                    body: 'Drücke "P", um Standorte der Polizei für 5 Sek. aufzudecken. (5 Min. Cooldown)' 
                });
            }
        }

        if (this.#showPubCooldownText) {
            infoCards.push({ 
                title: 'HINWEIS', 
                body: 'Du kannst erst wieder in drei Minuten die Kneipe besuchen.' 
            });
        }

        eventBus.emit('INFO_UPDATED', infoCards);
    }

    setCrimeTargets(targets) {
        this.#activeCrimeTargets = targets;
        this.#missionPhase = 3;
        this.#emitMissionUpdate();
        this.#notifyStateChange();
    }

    getBurglaryData(targetId) {
        const target = this.#activeCrimeTargets?.find(t => t.id === targetId);
        if (!target) return null;

        const riskData = this.#mapData.getPoliceRiskModifier([target.lat, target.lon]);
        
        let mult = 1.0;
        if (target.type === 'commercial') mult = 1.2;
        if (target.type === 'public') mult = 1.5;
        if (target.type === 'allotments') mult = 0.6;

        const warning = riskData.riskMalus > 0 ? '🚨 ' : '';
        const warningSuffix = riskData.riskMalus > 0 ? ' (Hohe Polizeipräsenz!)' : '';

        return {
            title: STRINGS.interactions.burglary.title(target.type),
            options: {
                A: { 
                    text: `${warning}${STRINGS.interactions.burglary.optionA}${warningSuffix}`, 
                    risk: Math.min(95, Math.round((CONFIG.RISK_BURGLARY_EASY + riskData.riskMalus) * mult)), 
                    reward: 180, 
                    preview: (warning ? `<div style="color: #ef4444; font-weight: bold;">🚨 WARNUNG: Hohes Risiko durch Polizei!</div>` : '') + STRINGS.interactions.burglary.previewA,
                    successMsg: STRINGS.interactions.burglary.success,
                    caughtMsg: STRINGS.interactions.burglary.caught
                },
                B: { 
                    text: `${warning}${STRINGS.interactions.burglary.optionB}${warningSuffix}`, 
                    risk: Math.min(95, Math.round((CONFIG.RISK_BURGLARY_MEDIUM + riskData.riskMalus) * mult)), 
                    reward: 450, 
                    preview: (warning ? `<div style="color: #ef4444; font-weight: bold;">🚨 WARNUNG: Hohes Risiko durch Polizei!</div>` : '') + STRINGS.interactions.burglary.previewB,
                    successMsg: STRINGS.interactions.burglary.success,
                    caughtMsg: STRINGS.interactions.burglary.caught
                },
                C: { 
                    text: `${warning}${STRINGS.interactions.burglary.optionC}${warningSuffix}`, 
                    risk: Math.min(98, Math.round((CONFIG.RISK_BURGLARY_HARD + riskData.riskMalus) * mult)), 
                    reward: 1350, 
                    preview: (warning ? `<div style="color: #ef4444; font-weight: bold;">🚨 WARNUNG: Hohes Risiko durch Polizei!</div>` : '') + STRINGS.interactions.burglary.previewC,
                    successMsg: STRINGS.interactions.burglary.success,
                    caughtMsg: STRINGS.interactions.burglary.caught
                }
            }
        };
    }
}

export { Game };
