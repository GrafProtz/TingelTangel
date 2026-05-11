import { MapData } from './MapData.js';
import { log } from './Utils.js';
import { CONFIG } from './GameConfig.js';
import { STRINGS } from './GameStrings.js';
import { eventBus } from './EventBus.js';
import { EncounterManager } from './EncounterManager.js';
import { DialogFactory } from './DialogFactory.js';
import { EVENTS } from './EventTypes.js';
import { BudgetManager } from './BudgetManager.js';
import { MovementEngine } from './MovementEngine.js';
import { RiskCalculator } from './RiskCalculator.js';
import { GameState } from './GameState.js';

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
    #missionService;
    #budgetManager;
    #movementEngine;
    #riskCalculator;
    #gameState;

    /**
     * @param {MapData} mapData
     * @param {MissionService} missionService
     */
    constructor(mapData, missionService) {
        this.#mapData = mapData;
        this.#missionService = missionService;
        this.#gameState = new GameState();
        this.#budgetManager = new BudgetManager();
        this.#movementEngine = new MovementEngine(this.#mapData);
        this.#riskCalculator = new RiskCalculator(this.#mapData);
        this.#setupInteractionListeners();
    }

    /**
     * Initialisiert alle Subscriber für externe Events.
     */
    #setupInteractionListeners() {
        this.#registerInteractionSelection();
        this.#registerPurchaseFlows();
        this.#registerCategorySelection();
        this.#registerBurglaryFlow();
        this.#registerBicycleTheftFlow();
        this.#registerGameControlFlows();
        this.#registerEncounterHooks();
        this.#registerLoanFlow();
        this.#registerBarberFlow(); // Neu: Friseur-Logik konsolidiert
    }

    #registerInteractionSelection() {
        eventBus.subscribe(EVENTS.INTERACTION_SELECTED, (payload) => {
            const { key, option } = payload;
            
            if (key === 'B') {
                this.#handleInvestmentConsultant();
                return;
            }

            const msg = this.handleInteractionDecision(key, option);
            
            eventBus.emit(EVENTS.REMOVE_LOG_ENTRY, { logId: 'goal-visit-pub' });
            eventBus.emit(EVENTS.CLOSE_INTERACTION);

            // Radar-Tutorial bei Erstkauf (Option A)
            if (key === 'A' && this.#gameState.radarUnlocked && this.#gameState.missionPhase < 2) {
                this.#triggerRadarTutorial();
            } else {
                this.resume();
            }
        });
    }

    #handleInvestmentConsultant() {
        const cost = 75; // TODO: In CONFIG verschieben
        if (!this.canAfford(cost)) {
            eventBus.emit(EVENTS.SHOW_TOAST, { message: "Nicht genug Geld für den Berater!", type: 'fail' });
            this.resume();
            return;
        }

        this.deductBudget(cost);
        eventBus.emit(EVENTS.REMOVE_LOG_ENTRY, { logId: 'goal-visit-pub' });
        eventBus.emit(EVENTS.ADD_LOG_ENTRY, {
            shortText: "Ziel: Halte an den grünen Knotenpunkten Ausschau nach lukrativen Objekten für deinen ersten Bruch.",
            logId: 'goal-find-target',
            notify: true
        });
        eventBus.emit(EVENTS.OPEN_INVESTMENT, { cityName: this.#mapData.cityName });
    }

    #triggerRadarTutorial() {
        this.#gameState.missionPhase = 2;
        this.#emitMissionUpdate();
        
        const numberOfPoliceStations = this.#mapData.getPoliceStations().length;
        
        eventBus.emit(EVENTS.SHOW_INFO_CASCADE, DialogFactory.getRadarTutorial(numberOfPoliceStations));
    }

    #registerPurchaseFlows() {
        eventBus.subscribe(EVENTS.BUY_BOLT_CUTTER, (payload) => {
            const cost = payload.cost || 75;
            if (!this.canAfford(cost)) {
                eventBus.emit(EVENTS.SHOW_TOAST, { message: "Nicht genug Geld für den Bolzenschneider!", type: 'fail' });
                this.resume();
                return;
            }

            this.deductBudget(cost);
            this.#gameState.hasBoltCutter = true;
            
            const playerNode = this.#mapData.getNode(this.#gameState.currentPlayerNodeId);
            const targets = this.#missionService.spawnBicycleTargets(this.#mapData, playerNode);
            this.#gameState.activeBicycleTargets = targets;

            eventBus.emit(EVENTS.REMOVE_LOG_ENTRY, { logId: 'goal-visit-pub' });
            
            // Fix Etappe 7.2.1: Direkter Logbuch-Aufruf für Persistenz
            this.#gameState.addLogEntry({
                time: Date.now(),
                text: "Ziel: Knacke ein Fahrrad an einem der markierten Stellplätze.",
                type: 'info'
            });

            const coordsToFit = [];
            if (playerNode) coordsToFit.push([playerNode.lat, playerNode.lon]);
            targets.forEach(t => coordsToFit.push([t.lat, t.lon]));
            eventBus.emit(EVENTS.CAMERA_FIT_BOUNDS_REQUESTED, coordsToFit);

            eventBus.emit(EVENTS.CLOSE_INTERACTION);
            this.resume();
            this.#notifyStateChange();
        });

        // Fix Etappe 7.2.1: Friseur-Ticket Flow konsolidiert
        eventBus.subscribe(EVENTS.BUY_BARBER_TICKET, ({ barber, barberName }) => {
            const cost = 50; 
            if (!this.canAfford(cost)) {
                eventBus.emit(EVENTS.SHOW_TOAST, { message: "Nicht genug Kohle für den Friseur!", type: 'fail' });
                return;
            }

            this.deductBudget(cost);
            eventBus.emit(EVENTS.REMOVE_LOG_ENTRY, { logId: 'goal-visit-pub' });
            eventBus.emit(EVENTS.CLOSE_INTERACTION);
            
            // Logbuch-Eintrag (Goal) für Persistenz
            this.#gameState.addLogEntry({
                time: Date.now(),
                text: `Ziel: Besuche ${barberName} für eine Tarnung.`,
                type: 'info'
            });

            if (barber) {
                eventBus.emit(EVENTS.START_BARBER_REVEAL, { node: barber });
                this.setActiveBarber(barber);
            }
            
            this.resume();
            this.#notifyStateChange();
        });

        eventBus.subscribe(EVENTS.INVESTMENT_CANCELLED, () => this.resume());
    }

    #registerCategorySelection() {
        // Mapping von deutschen UI-Konzepten auf interne Typen & Event-Konstanten.
        // Dies behebt den Bug, dass EVENTS[`SELECT_CATEGORY_${key}`] undefined war.
        const categoryMap = {
            'WOHNUNG':      { type: 'residential', event: EVENTS.SELECT_CATEGORY_RESIDENTIAL },
            'GEWERBE':      { type: 'commercial',  event: EVENTS.SELECT_CATEGORY_COMMERCIAL },
            'OEFFENTLICH':  { type: 'public',      event: EVENTS.SELECT_CATEGORY_PUBLIC },
            'KLEINGARTEN':  { type: 'allotments',  event: EVENTS.SELECT_CATEGORY_ALLOTMENTS }
        };

        Object.values(categoryMap).forEach(({ type, event }) => {
            eventBus.subscribe(event, () => {
                eventBus.emit(EVENTS.SPAWN_TARGETS, { targetType: type, centerNodeId: this.#gameState.currentPlayerNodeId });
                this.resume();
            });
        });
    }

    #registerBurglaryFlow() {
        eventBus.subscribe(EVENTS.START_BURGLARY, ({ target, riskData }) => {
            setTimeout(() => {
                // 1. Abbruch-Check
                if (Math.random() * 100 <= riskData.abortRate) {
                    eventBus.emit(EVENTS.SHOW_DIALOG, DialogFactory.getBurglaryAbort());
                    this.#resetBurglaryState();
                    return;
                }

                // 2. Risiko-Check
                if (Math.random() * 100 <= riskData.totalRisk) {
                    const fine = Math.ceil(this.#budgetManager.budget * 0.2);
                    this.deductBudget(fine);
                    eventBus.emit(EVENTS.SHOW_DIALOG, DialogFactory.getBurglaryCaught(fine));
                } else {
                    // 3. Erfolg
                    this.#handleBurglarySuccess(riskData);
                }
                this.#resetBurglaryState();
            }, 500);
        });
    }

    #handleBurglarySuccess(riskData) {
        let amount = this.calculateLoot(riskData);
        let loanInfo = "";
        
        if (this.#budgetManager.hasActiveLoan) {
            const debt = this.#budgetManager.processLoanRepayment();
            amount = Math.max(0, amount - debt);
            loanInfo = `<br><br><span style="color:var(--color-danger); font-size:0.9rem;">Rückzahlung an die Verbrecher*innen-Innung: ${debt} € wurden von deiner Beute einbehalten. Deine Weste bei der Verbrecher*innen-Innung ist vorerst wieder sauber.</span>`;
            eventBus.emit(EVENTS.REMOVE_LOG_ENTRY, { logId: 'loan-entry' });
        }

        this.addReward(amount);
        eventBus.emit(EVENTS.SHOW_DIALOG, DialogFactory.getBurglarySuccess(amount, loanInfo));
    }

    #registerBicycleTheftFlow() {
        eventBus.subscribe(EVENTS.START_BICYCLE_THEFT_RNG, ({ target, riskData }) => {
            eventBus.emit(EVENTS.ADD_LOG_ENTRY, { shortText: "Knackversuch läuft...", logId: 'bicycle-theft-progress', notify: false });

            if (Math.random() * 100 > riskData.totalRisk) {
                this.#handleBicycleTheftSuccess();
            } else {
                this.#handleBicycleTheftFailure();
            }

            this.#gameState.activeBicycleTargets = [];
            this.#notifyStateChange();
        });
    }

    #handleBicycleTheftSuccess() {
        this.#gameState.isBiking = true;
        this.#gameState.hasBicycle = true;
        
        eventBus.emit(EVENTS.BIKING_STATE_CHANGED, true);
        eventBus.emit(EVENTS.SHOW_DIALOG, DialogFactory.getBicycleTheftSuccess());

        eventBus.emit(EVENTS.REMOVE_LOG_ENTRY, { logId: 'goal-steal-bicycle' });
        eventBus.emit(EVENTS.REMOVE_LOG_ENTRY, { logId: 'bicycle-theft-progress' });
        eventBus.emit(EVENTS.ADD_LOG_ENTRY, { shortText: "✅ Fahrrad erfolgreich geklaut.", notify: true });
    }

    #handleBicycleTheftFailure() {
        const fine = Math.ceil(this.#budgetManager.budget * 0.1);
        this.deductBudget(fine);
        eventBus.emit(EVENTS.SHOW_DIALOG, DialogFactory.getBicycleTheftFailure(fine));

        eventBus.emit(EVENTS.REMOVE_LOG_ENTRY, { logId: 'bicycle-theft-progress' });
        eventBus.emit(EVENTS.ADD_LOG_ENTRY, { shortText: "🚨 Beim Fahrraddiebstahl erwischt!", notify: true });
    }

    #registerGameControlFlows() {
        eventBus.subscribe(EVENTS.TOGGLE_BICYCLE, () => {
            if (!this.#gameState.hasBicycle) return;
            this.#gameState.isBiking = !this.#gameState.isBiking;
            const msg = this.#gameState.isBiking ? "Aufgestiegen. Du bist jetzt schneller." : "Abgestiegen. Du bist wieder zu Fuß unterwegs.";
            
            eventBus.emit(EVENTS.BIKING_STATE_CHANGED, this.#gameState.isBiking);
            eventBus.emit(EVENTS.SHOW_TOAST, { message: msg, type: 'success' });
            this.#notifyStateChange();
        });

        eventBus.subscribe(EVENTS.RESUME_GAME, () => {
            eventBus.emit(EVENTS.REMOVE_LOG_ENTRY, { logId: 'goal-find-target' });
            this.resume();
        });
    }

    #registerEncounterHooks() {
        eventBus.subscribe(EVENTS.ENCOUNTER_TRIGGERED, (encounter) => {
            this.pause();
            this.deductBudget(encounter.cost);
            eventBus.emit(EVENTS.SHOW_ENCOUNTER, encounter);
            this.#notifyStateChange();
        });

        eventBus.subscribe(EVENTS.RADAR_ACKNOWLEDGED, () => {});
    }

    #registerLoanFlow() {
        eventBus.subscribe(EVENTS.ACCEPT_LOAN_OFFER, () => {
            this.#budgetManager.handleAcceptLoan();
            eventBus.emit(EVENTS.ADD_LOG_ENTRY, { shortText: "Not-Kredit erhalten: 1500 € (Zinsen laufen...)", logId: 'loan-entry', notify: true });
            this.resume();
        });

        eventBus.subscribe(EVENTS.RELOAD_GAME, () => location.reload());
        eventBus.subscribe(EVENTS.REJECT_LOAN, () => location.reload());
    }

    // ----------------------------------------------------------------
    //  State & Getters
    // ----------------------------------------------------------------

    /**
     * Zentraler Check für die Nähe zu einem POI.
     * Gültig, wenn der Spieler auf dem Zugriffsknoten steht ODER ein direkter Nachbar ist.
     * @param {string|number} targetNodeId 
     * @returns {boolean}
     */
    checkProximity(targetNodeId) {
        return this.#checkProximity(targetNodeId);
    }

    #checkProximity(targetNodeId) {
        const currentId = String(this.#gameState.currentPlayerNodeId);
        const sid = String(targetNodeId);
        
        if (currentId === sid) return true;

        const neighbors = this.#mapData.getNeighbors(currentId, this.#gameState.isBiking);
        return neighbors.some(nb => String(nb.id) === sid);
    }

    /**
     * Gibt eine tiefe Kopie des aktuellen Spielzustands zurück.
     * Nutzt structuredClone, um Referenz-Leaks zu verhindern.
     */
    getState() {
        return structuredClone({
            ...this.#budgetManager.getFinanceState(),
            currentPlayerNodeId: this.#gameState.currentPlayerNodeId,
            gameActive: this.#gameState.gameActive,
            isMoving: this.#movementEngine.isMoving,
            targetPubNodeId: this.#gameState.targetPubNodeId,
            targetPubName: this.#gameState.targetPubName,
            radarUnlocked: this.#gameState.radarUnlocked,
            lastRadarTime: this.#gameState.lastRadarTime,
            lastPubVisit: this.#gameState.lastPubVisit,
            showPubCooldownText: this.#gameState.showPubCooldownText,
            moveCount: this.#gameState.moveCount,
            missionPhase: this.#gameState.missionPhase,
            infoMenuOpenUntilMove: this.#gameState.infoMenuOpenUntilMove,
            isInfoMenuOpen: this.#gameState.isInfoMenuOpen,
            activeCrimeTargets: this.#gameState.activeCrimeTargets.map(t => ({
                ...t,
                isPlayerAtTarget: this.#checkProximity(t.accessNodeId)
            })),
            activeBarber: this.#gameState.activeBarber ? {
                ...this.#gameState.activeBarber,
                isPlayerAtBarber: this.#checkProximity(this.#gameState.activeBarber.accessNodeId)
            } : null,
            activeBicycleTargets: this.#gameState.activeBicycleTargets.map(t => ({
                ...t,
                isPlayerAtBicycle: this.#checkProximity(t.accessNodeId)
            })),
            isDisguised: this.#gameState.isDisguised,
            hasBoltCutter: this.#gameState.hasBoltCutter,
            isBiking: this.#gameState.isBiking,
            hasBicycle: this.#gameState.hasBicycle,
            isInPub: this.#gameState.isInPub,
            logbook: this.#gameState.logbook
        });
    }

    // ----------------------------------------------------------------
    //  Ereignis-Benachrichtigungen (Internal Only)
    // ----------------------------------------------------------------

    /** Informiert das System über allgemeine Statusänderungen. */
    #notifyStateChange() {
        eventBus.emit(EVENTS.GAME_STATE_CHANGED, this.getState());
        this.#updateHUDInfo();
    }

    /** Informiert über Fortschritt in der Mission. */
    #emitMissionUpdate() {
        eventBus.emit(EVENTS.MISSION_STATE_CHANGED, {
            phase: this.#gameState.missionPhase,
            moveCount: this.#gameState.moveCount
        });
    }

    /** Spezielles Event nach Abschluss einer Bewegung. */
    #emitPlayerMoved() {
        eventBus.emit(EVENTS.PLAYER_MOVED, this.getState());
    }

    /** Wird gefeuert, wenn sich die Liste der aktiven POIs (Ziele, Barber, Bikes) ändert. */
    #emitTargetsUpdated() {
        eventBus.emit(EVENTS.TARGETS_UPDATED, this.getState());
    }

    // ----------------------------------------------------------------
    //  Mission & Steuerung
    // ----------------------------------------------------------------

    startMission(startNodeId, targetNodeId, pubName = "Kneipe") {
        this.#budgetManager.init();
        this.#gameState.currentPlayerNodeId = String(startNodeId);
        this.#gameState.gameActive = false; // Spiel ist pausiert bis INTRO_COMPLETE!
        this.#movementEngine.stop();
        this.#gameState.targetPubNodeId = String(targetNodeId);
        this.#gameState.targetPubName = pubName;
        this.#gameState.radarUnlocked = false;
        this.#gameState.lastRadarTime = 0;
        this.#gameState.lastPubVisit = 0;
        this.#gameState.showPubCooldownText = false;
        this.#gameState.moveCount = 0;
        this.#gameState.missionPhase = 1;
        this.#gameState.infoMenuOpenUntilMove = -1;
        this.#gameState.isInfoMenuOpen = false;
        this.#gameState.activeCrimeTargets = [];
        this.#gameState.logbook = [];
        this.#gameState.isInPub = false;
        
        this.#gameState.firstMoveFired = false;
        
        log('🎯 MISSION GESTARTET! Ziel-ID:', this.#gameState.targetPubNodeId);

        // Modal SOFORT aufploppen lassen
        const cityName = this.#mapData.cityName || "der Stadt";
        
        eventBus.emit(EVENTS.SHOW_INFO_CASCADE, DialogFactory.getWelcomeDialog(cityName, this.#gameState.targetPubName));
    }

    triggerIntroRender() {
        this.#notifyStateChange(); // Jetzt rendern die POIs und Knoten
        
        setTimeout(() => {
            this.#gameState.gameActive = true;
            eventBus.emit(EVENTS.INTRO_COMPLETE);
        }, 6000); // 5s Spawn-Animation + 1s Puffer
    }

    /**
     * Lädt einen gespeicherten Spielstand in die Private Fields und aktualisiert die UI.
     * @param {Object} savedState - Der aus dem localStorage geladene JSON-State
     */
    hydrateState(savedState) {
        if (!savedState) return;

        this.#budgetManager.hydrate(savedState);
        this.#gameState.hydrate(savedState);
        
        this.#movementEngine.stop(); // Zur Sicherheit Bewegung zurücksetzen
        this.#gameState.firstMoveFired = true; // Verhindert, dass das Tutorial nach dem Laden triggert
        
        log('💾 Spielstand erfolgreich geladen. Aktueller Knoten:', this.#gameState.currentPlayerNodeId);
        
        this.#notifyStateChange();
        this.#emitMissionUpdate();
    }

    pause() {
        this.#gameState.gameActive = false;
        this.#movementEngine.stop();
        eventBus.emit(EVENTS.GAME_PAUSED);
        this.#notifyStateChange();
    }

    resume() {
        if (this.#gameState.isInPub) {
            this.#gameState.lastPubVisit = Date.now();
            log("DEBUG 4: Neuer Zeitstempel gesetzt auf:", this.#gameState.lastPubVisit);
            this.#gameState.isInPub = false;
        }
        this.#gameState.gameActive = true;
        eventBus.emit(EVENTS.GAME_RESUMED);
        this.#notifyStateChange();
    }

    isGameActive() {
        return this.#gameState.gameActive;
    }

    canAfford(amount) {
        return this.#budgetManager.canAfford(amount);
    }

    deductBudget(amount) {
        this.#budgetManager.deductBudget(amount);
        this.#notifyStateChange();
    }

    addReward(amount) {
        this.#budgetManager.addReward(amount);
        this.#notifyStateChange();
    }

    #resetBurglaryState() {
        this.#gameState.activeCrimeTargets = [];
        this.#gameState.isDisguised = false;
        this.#gameState.missionPhase = 1;
        this.#emitMissionUpdate();
        this.resume();
    }

    // ----------------------------------------------------------------
    //  Bewegung
    // ----------------------------------------------------------------

    moveToNode(targetId) {
        if (!this.#gameState.gameActive || this.#movementEngine.isMoving) return;

        // Kredit-Zinsen: Jeder Schritt kostet 1 € Zinsen, wenn man Schulden hat
        this.#budgetManager.applyStepInterest();

        this.#movementEngine.moveTo(targetId, this.#gameState.currentPlayerNodeId, this.#gameState.isBiking, {
            currentBudget: this.#budgetManager.budget,
            onStart: () => this.#notifyStateChange(),
            onBudgetTick: (newBudget) => {
                const diff = newBudget - this.#budgetManager.budget;
                this.#budgetManager.applyBudgetTick(newBudget, diff);
            },
            onComplete: (reachedId) => this.#finishMovement(reachedId)
        });
    }

    #finishMovement(targetId) {
        this.#gameState.currentPlayerNodeId = String(targetId);
        this.#gameState.moveCount++;

        this.#handleInfoMenuMoveLogic();
        this.#handleFirstMoveLogic();

        // Ziel-Prüfung
        if (String(this.#gameState.currentPlayerNodeId) === String(this.#gameState.targetPubNodeId)) {
            this.#checkPubArrival();
        }

        // Zufalls-Begegnung (Encounter Hook)
        EncounterManager.checkAndTriggerEvent(this.getState());

        this.#notifyStateChange();
        this.#emitPlayerMoved();
    }

    #handleInfoMenuMoveLogic() {
        if (!this.#gameState.isInfoMenuOpen || this.#gameState.infoMenuOpenUntilMove === -1) return;
        if (this.#gameState.moveCount < this.#gameState.infoMenuOpenUntilMove) return;

        this.#gameState.isInfoMenuOpen = false;
        this.#gameState.infoMenuOpenUntilMove = -1;
        eventBus.emit(EVENTS.INFO_MENU_STATE, false);
    }

    #handleFirstMoveLogic() {
        if (this.#gameState.firstMoveFired) return;
        this.#gameState.firstMoveFired = true;
        eventBus.emit(EVENTS.FIRST_MOVE_COMPLETED);
    }


    #checkPubArrival() {
        const diff = (Date.now() - this.#gameState.lastPubVisit) / 1000;
        const cooldownSec = CONFIG.PUB_COOLDOWN / 1000;

        if (diff < cooldownSec) {
            const remaining = Math.ceil(cooldownSec - diff);
            eventBus.emit(EVENTS.SHOW_TOAST, { 
                message: `Der Kneipier ist mal kurz mit einem Gast in den Hinterraum gegangen und hat für ${remaining} Sekunden keine Zeit.`, 
                type: 'fail' 
            });
            return;
        }

        this.#gameState.gameActive = false;
        this.#gameState.isInPub = true;
        eventBus.emit(EVENTS.PUB_TARGET_REACHED, { nodeId: this.#gameState.currentPlayerNodeId });
        this.#notifyTargetReached();
    }

    // ----------------------------------------------------------------
    //  Radar & Items
    // ----------------------------------------------------------------

    triggerRadar(force = false) {
        if (!this.#gameState.radarUnlocked) return null;
        if (!force && (Date.now() - this.#gameState.lastRadarTime < CONFIG.RADAR_COOLDOWN)) return 'cooldown';
        
        if (!force) this.#gameState.lastRadarTime = Date.now();
        this.#notifyStateChange();

        const playerNode = this.#mapData.getNode(this.#gameState.currentPlayerNodeId);
        const playerCoords = playerNode ? [playerNode.lat, playerNode.lon] : [0, 0];

        return {
            stations: this.#mapData.getPoliceStations(),
            playerCoords
        };
    }

    handleInteractionDecision(key, opt) {
        const targetNode = this.#mapData.getNode(this.#gameState.targetPubNodeId);
        const riskData = targetNode ? this.#riskCalculator.getPoliceRiskModifier([targetNode.lat, targetNode.lon]) : { riskMalus: 0 };
        
        const finalRisk = opt.risk !== undefined ? opt.risk : Math.min(100, (opt.risk || 0) + riskData.riskMalus);
        const roll = Math.random() * 100;

        // 1. Radar-Kauf (Key A)
        if (key === 'A') return this.#handleRadarPurchase();

        // 2. Info-Kauf (Key D)
        if (key === 'D') return this.#handleInfoPurchase();

        // 3. Risiko-Check (Erwischt)
        if (roll < finalRisk) {
            return this.#handleInteractionFailure(opt);
        }

        // 4. Erfolg
        return this.#handleInteractionSuccess(opt);
    }

    #handleRadarPurchase() {
        if (this.#gameState.radarUnlocked) return '📡 Du hast die Frequenz bereits!';
        
        if (!this.canAfford(CONFIG.RADAR_COST)) {
            return `❌ Nicht genug Geld! Du brauchst ${CONFIG.RADAR_COST} €.`;
        }

        this.deductBudget(CONFIG.RADAR_COST);
        this.#gameState.radarUnlocked = true;
        
        const currentNode = this.#mapData.getNode(this.#gameState.currentPlayerNodeId);
        const risk = this.#riskCalculator.getPoliceRiskModifier([currentNode.lat, currentNode.lon]);
        const msg = `Der Barkeeper meint, dass hier ${risk.activeStations} Polizeiwache(n) in der Umgebung sind.`;
        
        this.#recordDecision(msg, 'success');
        return msg;
    }

    #handleInfoPurchase() {
        if (!this.canAfford(CONFIG.INFO_COST)) return '❌ Nicht genug Geld für Informationen.';

        this.deductBudget(CONFIG.INFO_COST);
        const msg = `Du kaufst Infos für ${CONFIG.INFO_COST} €. Ein Tipp: "Halte dich vom Osten fern."`;
        this.#recordDecision(msg, 'success');
        return msg;
    }

    #handleInteractionFailure(opt) {
        const fine = Math.ceil(opt.reward * 0.5);
        this.deductBudget(fine);
        const msg = opt.caughtMsg ? opt.caughtMsg(fine) : `🚨 ERWISCHT! Strafe: ${fine} €.`;
        this.#recordDecision(msg, 'fail');
        return msg;
    }

    #handleInteractionSuccess(opt) {
        this.addReward(opt.reward);
        const msg = opt.successMsg ? opt.successMsg(opt.reward) : `✅ Erfolg! Du kassierst ${opt.reward} € für "${opt.text}".`;
        this.#recordDecision(msg, 'success');
        return msg;
    }

    #recordDecision(msg, type) {
        this.#gameState.addLogEntry({ time: Date.now(), text: msg, type });
        this.#gameState.lastPubVisit = Date.now();
        this.resume();

        // UI-Timeouts für Cooldown-Text
        setTimeout(() => {
            this.#gameState.showPubCooldownText = true;
            this.#notifyStateChange();
        }, 5000);

        setTimeout(() => {
            this.#gameState.showPubCooldownText = false;
            this.#notifyStateChange();
        }, CONFIG.PUB_COOLDOWN);
    }

    // ----------------------------------------------------------------
    //  Interaktion-Vorschau & Risiko
    // ----------------------------------------------------------------

    #notifyTargetReached() {
        const cityName = this.#mapData.cityName || 'dieser Stadt';

        const optionsData = {
            A: { text: STRINGS.interactions.pub.optionA(cityName), cost: CONFIG.RADAR_COST, risk: 0 },
            B: { text: STRINGS.interactions.pub.optionB(0), requiresConfirmation: false, cost: 75 },
            C: { text: STRINGS.interactions.pub.optionC(), requiresConfirmation: false, customEvent: EVENTS.OPTION_C_CLICKED },
            D: { text: STRINGS.interactions.pub.optionD, requiresConfirmation: false, customEvent: EVENTS.OPTION_D_CLICKED }
        };

        const currentNode = this.#mapData.getNode(this.#gameState.currentPlayerNodeId);
        const riskData = this.#riskCalculator.getPoliceRiskModifier([currentNode.lat, currentNode.lon]);
        
        if (riskData.riskMalus > 0) {
            ['B', 'C'].forEach(k => {
                if (optionsData[k]) optionsData[k].text = `🚨 ${optionsData[k].text} (Erhöhtes Risiko!)`;
            });
        }

        eventBus.emit(EVENTS.OPEN_INTERACTION, { 
            optionsData, 
            riskData, 
            getPreviewFn: (key) => this.getInteractionPreview(key) 
        });
    }

    getInteractionPreview(key) {
        const targetNode = this.#mapData.getNode(this.#gameState.targetPubNodeId);
        if (!targetNode) return null;

        const riskData = this.#riskCalculator.getPoliceRiskModifier([targetNode.lat, targetNode.lon]);
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
        return this.#riskCalculator.calculateTargetRisk(targetNode, this.#gameState.isDisguised);
    }

    startBicycleTheft(targetId) {
        const target = this.#gameState.activeBicycleTargets.find(t => t.id === targetId);
        if (!target) return;

        const riskData = this.calculateTargetRisk(target);
        const roll = Math.random() * 100;

        if (roll > riskData.totalRisk) {
            // Erfolg
            this.#gameState.isBiking = true;
            this.#gameState.activeBicycleTargets = [];
            
            eventBus.emit(EVENTS.BIKING_STATE_CHANGED, true);
            eventBus.emit(EVENTS.SHOW_TOAST, { message: "Rad geknackt! Du bist jetzt lautlos und schnell.", type: 'success' });
            
            this.#notifyStateChange();
        } else {
            // Scheitern -> Bestehende Busted-Logik
            eventBus.emit(EVENTS.SHOW_TOAST, { message: "Verdammt! Ein Zeuge hat dich gesehen!", type: 'fail' });
            eventBus.emit(EVENTS.PLAYER_BUSTED);
        }
    }

    calculateLoot(riskData) {
        return this.#budgetManager.calculateLoot(riskData);
    }

    // ----------------------------------------------------------------
    //  HUD & Info
    // ----------------------------------------------------------------

    toggleInfoMenu() {
        this.#gameState.isInfoMenuOpen = !this.#gameState.isInfoMenuOpen;
        eventBus.emit(EVENTS.INFO_MENU_STATE, this.#gameState.isInfoMenuOpen);
        this.#notifyStateChange();
    }

    #updateHUDInfo() {
        if (!this.#gameState.gameActive && this.#gameState.currentPlayerNodeId === null) {
            eventBus.emit(EVENTS.INFO_UPDATED, []);
            return;
        }

        const infoCards = [];
        const targetNode = this.#mapData.getNode(this.#gameState.targetPubNodeId);
        const targetName = targetNode?.tags?.name || 'Unbekannte Gaststätte';

        if (this.#gameState.gameActive) {
            if (this.#gameState.missionPhase === 1) {
                infoCards.push(
                    { title: 'AKTUELLES ZIEL', body: targetName },
                    { title: 'AUFGABE', body: 'Erreiche die Kneipe, um Informationen zu sammeln.' },
                    { title: 'STEUERUNG', body: 'Klicke auf die grünen Punkte, um dich durch die Stadt zu bewegen.' }
                );
            } else if (this.#gameState.missionPhase === 2) {
                infoCards.push({ 
                    title: 'RADAR-SYSTEM', 
                    body: 'Drücke "P", um Standorte der Polizei für 5 Sek. aufzudecken. (5 Min. Cooldown)' 
                });
            }
        }

        if (this.#gameState.showPubCooldownText) {
            infoCards.push({ 
                title: 'HINWEIS', 
                body: 'Du kannst erst wieder in drei Minuten die Kneipe besuchen.' 
            });
        }

        eventBus.emit(EVENTS.INFO_UPDATED, infoCards);
    }

    setCrimeTargets(targets) {
        this.#gameState.activeCrimeTargets = targets;
        this.#gameState.missionPhase = 3;
        this.#emitMissionUpdate();
        this.#emitTargetsUpdated();
        this.#notifyStateChange();
    }

    findNearestHairdresser() {
        const playerNode = this.#mapData.getNode(this.#gameState.currentPlayerNodeId);
        if (!playerNode) return null;

        const hairdressers = this.#mapData.getHairdressers();
        if (!hairdressers || hairdressers.length === 0) {
            const fallback = {
                id: 'barber-fallback',
                tags: { name: "Schnittwunde (Schwarzmarkt)" },
                lat: playerNode.lat + 0.002,
                lon: playerNode.lon + 0.002
            };
            const access = this.#mapData.findNearestGraphNode(fallback.lat, fallback.lon);
            return { ...fallback, accessNodeId: access ? String(access.id) : null };
        }

        let nearest = null;
        let minDist = Infinity;

        hairdressers.forEach(h => {
            const d = this.#mapData.calculateDistance(playerNode, h);
            if (d < minDist) {
                minDist = d;
                nearest = h;
            }
        });

        if (nearest) {
            const access = this.#mapData.findNearestGraphNode(nearest.lat, nearest.lon);
            return { ...nearest, accessNodeId: access ? String(access.id) : null };
        }

        return nearest;
    }

    setActiveBarber(barber) {
        this.#gameState.activeBarber = barber;
        this.#emitTargetsUpdated();
        this.#notifyStateChange();
    }

    #registerBarberFlow() {
        eventBus.subscribe(EVENTS.BARBER_TRANSFORM_START, () => {
            // 1. Visuelles Feedback via Event (MapView/UIAnimator hört hierauf)
            eventBus.emit(EVENTS.START_BARBER_ANIMATION);

            // 2. Mechanik aktivieren
            this.applyBarberBuff();
            
            // 3. UI-Bereinigung
            eventBus.emit(EVENTS.SHOW_TOAST, { message: "Tarnung aktiv! Du bist jetzt ein Geist.", type: 'success' });
            eventBus.emit(EVENTS.CLOSE_INTERACTION);
            eventBus.emit(EVENTS.REMOVE_LOG_ENTRY, { logId: 'goal-visit-barber' });

            // 4. Spiel fortsetzen
            this.resume();
        });
    }

    applyBarberBuff() {
        this.#gameState.isDisguised = true;
        this.#gameState.activeBarber = null; // POI deaktivieren (aus dem State entfernen)
        
        // Fix Etappe 7.2.1: Logbuch-Eintrag für den Erfolg (Persistenz via GameState)
        this.#gameState.addLogEntry({
            time: Date.now(),
            text: "Beim Friseur gewesen. Neues Gesicht erhalten.",
            type: 'success'
        });

        this.#notifyStateChange();
    }

    getActiveBicycleTargets() {
        return this.#gameState.activeBicycleTargets;
    }

    getBurglaryData(targetId) {
        const target = this.#gameState.activeCrimeTargets?.find(t => t.id === targetId);
        if (!target) return null;

        const riskData = this.#riskCalculator.getPoliceRiskModifier([target.lat, target.lon]);
        
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
