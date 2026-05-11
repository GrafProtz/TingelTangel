import { MapData } from './MapData.js';
import { CONFIG } from './GameConfig.js';
import { STRINGS } from './GameStrings.js';
import { eventBus } from './EventBus.js';
import { EncounterManager } from './EncounterManager.js';
import { DialogFactory } from './DialogFactory.js';
import { EVENTS } from './EventTypes.js';
import { BudgetManager } from './BudgetManager.js';
import { MovementEngine } from './MovementEngine.js';

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
    #currentPlayerNodeId = null;
    #gameActive = false;
    #movementEngine;
    #targetPubNodeId = null;
    #targetPubName = "Kneipe";
    #radarUnlocked = false;
    #lastRadarTime = 0;
    #lastPubVisit = 0;
    #showPubCooldownText = false;
    #moveCount = 0;
    #missionPhase = 1;
    #infoMenuOpenUntilMove = -1;
    #isInfoMenuOpen = false;
    #activeCrimeTargets = [];
    #logbook = [];
    
    #firstMoveFired = false;
    #isInPub = false;
    #activeBarber = null;
    #isDisguised = false;
    #hasBoltCutter = false;
    #isBiking = false;
    #hasBicycle = false;
    #activeBicycleTargets = [];

    /**
     * @param {MapData} mapData
     * @param {MissionService} missionService
     */
    constructor(mapData, missionService) {
        this.#mapData = mapData;
        this.#missionService = missionService;
        this.#budgetManager = new BudgetManager();
        this.#movementEngine = new MovementEngine(this.#mapData);
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
    }

    #registerInteractionSelection() {
        eventBus.subscribe('INTERACTION_SELECTED', (payload) => {
            const { key, option } = payload;
            
            if (key === 'B') {
                this.#handleInvestmentConsultant();
                return;
            }

            const msg = this.handleInteractionDecision(key, option);
            
            eventBus.emit('REMOVE_LOG_ENTRY', { logId: 'goal-visit-pub' });
            eventBus.emit('CLOSE_INTERACTION');

            // Radar-Tutorial bei Erstkauf (Option A)
            if (key === 'A' && this.#radarUnlocked && this.#missionPhase < 2) {
                this.#triggerRadarTutorial();
            } else {
                this.resume();
            }
        });
    }

    #handleInvestmentConsultant() {
        const cost = 75; // TODO: In CONFIG verschieben
        if (!this.canAfford(cost)) {
            eventBus.emit('SHOW_TOAST', { msg: "Nicht genug Geld für den Berater!", type: 'fail' });
            this.resume();
            return;
        }

        this.deductBudget(cost);
        eventBus.emit('REMOVE_LOG_ENTRY', { logId: 'goal-visit-pub' });
        eventBus.emit('ADD_LOG_ENTRY', {
            shortText: "Ziel: Halte an den grünen Knotenpunkten Ausschau nach lukrativen Objekten für deinen ersten Bruch.",
            logId: 'goal-find-target',
            notify: true
        });
        eventBus.emit('OPEN_INVESTMENT', { cityName: this.#mapData.cityName });
    }

    #triggerRadarTutorial() {
        this.#missionPhase = 2;
        this.#emitMissionUpdate();
        
        const numberOfPoliceStations = this.#mapData.getPoliceStations().length;
        
        eventBus.emit('SHOW_INFO_CASCADE', DialogFactory.getRadarTutorial(numberOfPoliceStations));
    }

    #registerPurchaseFlows() {
        eventBus.subscribe('BUY_BOLT_CUTTER', (payload) => {
            const cost = payload.cost || 75;
            if (!this.canAfford(cost)) {
                eventBus.emit('SHOW_TOAST', { msg: "Nicht genug Geld für den Bolzenschneider!", type: 'fail' });
                this.resume();
                return;
            }

            this.deductBudget(cost);
            this.#hasBoltCutter = true;
            
            const playerNode = this.#mapData.getNode(this.#currentPlayerNodeId);
            const targets = this.#missionService.spawnBicycleTargets(this.#mapData, playerNode);
            this.#activeBicycleTargets = targets;

            eventBus.emit('REMOVE_LOG_ENTRY', { logId: 'goal-visit-pub' });
            eventBus.emit('ADD_LOG_ENTRY', {
                shortText: "Ziel: Knacke ein Fahrrad an einem der markierten Stellplätze.",
                logId: 'goal-steal-bicycle',
                notify: true
            });

            const coordsToFit = [];
            if (playerNode) coordsToFit.push([playerNode.lat, playerNode.lon]);
            targets.forEach(t => coordsToFit.push([t.lat, t.lon]));
            eventBus.emit('CAMERA_FIT_BOUNDS_REQUESTED', coordsToFit);

            eventBus.emit('CLOSE_INTERACTION');
            this.resume();
            this.#notifyStateChange();
        });

        eventBus.subscribe('INVESTMENT_CANCELLED', () => this.resume());
    }

    #registerCategorySelection() {
        const categories = {
            'WOHNUNG': 'residential',
            'GEWERBE': 'commercial',
            'OEFFENTLICH': 'public',
            'LAUBE': 'allotments'
        };

        Object.entries(categories).forEach(([key, type]) => {
            eventBus.subscribe(`SELECT_CATEGORY_${key}`, () => {
                eventBus.emit('SPAWN_TARGETS', { targetType: type, centerNodeId: this.#currentPlayerNodeId });
                this.resume();
            });
        });
    }

    #registerBurglaryFlow() {
        eventBus.subscribe('START_BURGLARY', ({ target, riskData }) => {
            setTimeout(() => {
                // 1. Abbruch-Check
                if (Math.random() * 100 <= riskData.abortRate) {
                    eventBus.emit('SHOW_DIALOG', DialogFactory.getBurglaryAbort());
                    this.#resetBurglaryState();
                    return;
                }

                // 2. Risiko-Check
                if (Math.random() * 100 <= riskData.totalRisk) {
                    const fine = Math.ceil(this.#budgetManager.budget * 0.2);
                    this.deductBudget(fine);
                    eventBus.emit('SHOW_DIALOG', DialogFactory.getBurglaryCaught(fine));
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
            eventBus.emit('REMOVE_LOG_ENTRY', { logId: 'loan-entry' });
        }

        this.addReward(amount);
        eventBus.emit('SHOW_DIALOG', DialogFactory.getBurglarySuccess(amount, loanInfo));
    }

    #registerBicycleTheftFlow() {
        eventBus.subscribe('START_BICYCLE_THEFT_RNG', ({ target, riskData }) => {
            eventBus.emit('ADD_LOG_ENTRY', { shortText: "Knackversuch läuft...", logId: 'bicycle-theft-progress', notify: false });

            if (Math.random() * 100 > riskData.totalRisk) {
                this.#handleBicycleTheftSuccess();
            } else {
                this.#handleBicycleTheftFailure();
            }

            this.#activeBicycleTargets = [];
            this.#notifyStateChange();
        });
    }

    #handleBicycleTheftSuccess() {
        this.#isBiking = true;
        this.#hasBicycle = true;
        document.getElementById('app-container')?.classList.add('state-biking');
        document.body.classList.add('state-biking');

        eventBus.emit('SHOW_DIALOG', DialogFactory.getBicycleTheftSuccess());

        eventBus.emit('REMOVE_LOG_ENTRY', { logId: 'goal-steal-bicycle' });
        eventBus.emit('REMOVE_LOG_ENTRY', { logId: 'bicycle-theft-progress' });
        eventBus.emit('ADD_LOG_ENTRY', { shortText: "✅ Fahrrad erfolgreich geklaut.", notify: true });
    }

    #handleBicycleTheftFailure() {
        const fine = Math.ceil(this.#budgetManager.budget * 0.1);
        this.deductBudget(fine);
        eventBus.emit('SHOW_DIALOG', DialogFactory.getBicycleTheftFailure(fine));

        eventBus.emit('REMOVE_LOG_ENTRY', { logId: 'bicycle-theft-progress' });
        eventBus.emit('ADD_LOG_ENTRY', { shortText: "🚨 Beim Fahrraddiebstahl erwischt!", notify: true });
    }

    #registerGameControlFlows() {
        eventBus.subscribe('TOGGLE_BICYCLE', () => {
            if (!this.#hasBicycle) return;
            this.#isBiking = !this.#isBiking;
            const msg = this.#isBiking ? "Aufgestiegen. Du bist jetzt schneller." : "Abgestiegen. Du bist wieder zu Fuß unterwegs.";
            document.getElementById('app-container')?.classList.toggle('state-biking', this.#isBiking);
            document.body.classList.toggle('state-biking', this.#isBiking);
            eventBus.emit('SHOW_TOAST', { msg, type: 'success' });
            this.#notifyStateChange();
        });

        eventBus.subscribe('RESUME_GAME', () => {
            eventBus.emit('REMOVE_LOG_ENTRY', { logId: 'goal-find-target' });
            this.resume();
        });
    }

    #registerEncounterHooks() {
        eventBus.subscribe('ENCOUNTER_TRIGGERED', (encounter) => {
            this.pause();
            this.deductBudget(encounter.cost);
            eventBus.emit('SHOW_ENCOUNTER', encounter);
            this.#notifyStateChange();
        });

        eventBus.subscribe('RADAR_ACKNOWLEDGED', () => {});
    }

    #registerLoanFlow() {
        eventBus.subscribe('ACCEPT_LOAN_OFFER', () => {
            this.#budgetManager.handleAcceptLoan();
            eventBus.emit('ADD_LOG_ENTRY', { shortText: "Not-Kredit erhalten: 1500 € (Zinsen laufen...)", logId: 'loan-entry', notify: true });
            this.resume();
        });

        eventBus.subscribe('RELOAD_GAME', () => location.reload());
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
        const currentId = String(this.#currentPlayerNodeId);
        const sid = String(targetNodeId);
        
        if (currentId === sid) return true;

        const neighbors = this.#mapData.getNeighbors(currentId, this.#isBiking);
        return neighbors.some(nb => String(nb.id) === sid);
    }

    /**
     * Gibt eine tiefe Kopie des aktuellen Spielzustands zurück.
     * Nutzt structuredClone, um Referenz-Leaks zu verhindern.
     */
    getState() {
        return structuredClone({
            ...this.#budgetManager.getFinanceState(),
            currentPlayerNodeId: this.#currentPlayerNodeId,
            gameActive: this.#gameActive,
            isMoving: this.#movementEngine.isMoving,
            targetPubNodeId: this.#targetPubNodeId,
            targetPubName: this.#targetPubName,
            radarUnlocked: this.#radarUnlocked,
            lastRadarTime: this.#lastRadarTime,
            lastPubVisit: this.#lastPubVisit,
            showPubCooldownText: this.#showPubCooldownText,
            moveCount: this.#moveCount,
            missionPhase: this.#missionPhase,
            infoMenuOpenUntilMove: this.#infoMenuOpenUntilMove,
            isInfoMenuOpen: this.#isInfoMenuOpen,
            activeCrimeTargets: this.#activeCrimeTargets.map(t => ({
                ...t,
                isPlayerAtTarget: this.#checkProximity(t.accessNodeId)
            })),
            activeBarber: this.#activeBarber ? {
                ...this.#activeBarber,
                isPlayerAtBarber: this.#checkProximity(this.#activeBarber.accessNodeId)
            } : null,
            activeBicycleTargets: this.#activeBicycleTargets.map(t => ({
                ...t,
                isPlayerAtBicycle: this.#checkProximity(t.accessNodeId)
            })),
            isDisguised: this.#isDisguised,
            hasBoltCutter: this.#hasBoltCutter,
            isBiking: this.#isBiking,
            hasBicycle: this.#hasBicycle,
            isInPub: this.#isInPub,
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

    /** Informiert über Fortschritt in der Mission. */
    #emitMissionUpdate() {
        eventBus.emit(EVENTS.MISSION_STATE_CHANGED, {
            phase: this.#missionPhase,
            moveCount: this.#moveCount
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
        this.#currentPlayerNodeId = String(startNodeId);
        this.#gameActive = false; // Spiel ist pausiert bis INTRO_COMPLETE!
        this.#movementEngine.stop();
        this.#targetPubNodeId = String(targetNodeId);
        this.#targetPubName = pubName;
        this.#radarUnlocked = false;
        this.#lastRadarTime = 0;
        this.#lastPubVisit = 0;
        this.#showPubCooldownText = false;
        this.#moveCount = 0;
        this.#missionPhase = 1;
        this.#infoMenuOpenUntilMove = -1;
        this.#isInfoMenuOpen = false;
        this.#activeCrimeTargets = [];
        this.#logbook = [];
        this.#isInPub = false;
        
        this.#firstMoveFired = false;
        
        console.log('🎯 MISSION GESTARTET! Ziel-ID:', this.#targetPubNodeId);

        // Modal SOFORT aufploppen lassen
        const cityName = this.#mapData.cityName || "der Stadt";
        
        eventBus.emit('SHOW_INFO_CASCADE', DialogFactory.getWelcomeDialog(cityName, this.#targetPubName));
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

        this.#budgetManager.hydrate(savedState);
        this.#currentPlayerNodeId = savedState.currentPlayerNodeId;
        this.#gameActive = savedState.gameActive ?? true;
        this.#movementEngine.stop(); // Zur Sicherheit Bewegung zurücksetzen
        this.#targetPubNodeId = savedState.targetPubNodeId;
        this.#targetPubName = savedState.targetPubName || "Kneipe";
        this.#radarUnlocked = savedState.radarUnlocked ?? false;
        this.#lastRadarTime = savedState.lastRadarTime ?? 0;
        this.#lastPubVisit = savedState.lastPubVisit ?? 0;
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
        this.#emitMissionUpdate();
    }

    pause() {
        this.#gameActive = false;
        this.#movementEngine.stop();
        eventBus.emit('GAME_PAUSED');
        this.#notifyStateChange();
    }

    resume() {
        if (this.#isInPub) {
            this.#lastPubVisit = Date.now();
            console.log("DEBUG 4: Neuer Zeitstempel gesetzt auf:", this.#lastPubVisit);
            this.#isInPub = false;
        }
        this.#gameActive = true;
        eventBus.emit('GAME_RESUMED');
        this.#notifyStateChange();
    }

    isGameActive() {
        return this.#gameActive;
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
        this.#activeCrimeTargets = [];
        this.#isDisguised = false;
        this.#missionPhase = 1;
        this.#emitMissionUpdate();
        this.resume();
    }

    // ----------------------------------------------------------------
    //  Bewegung
    // ----------------------------------------------------------------

    moveToNode(targetId) {
        if (!this.#gameActive || this.#movementEngine.isMoving) return;

        // Kredit-Zinsen: Jeder Schritt kostet 1 € Zinsen, wenn man Schulden hat
        this.#budgetManager.applyStepInterest();

        this.#movementEngine.moveTo(targetId, this.#currentPlayerNodeId, this.#isBiking, {
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
        this.#currentPlayerNodeId = String(targetId);
        this.#moveCount++;

        this.#handleInfoMenuMoveLogic();
        this.#handleFirstMoveLogic();
        this.#handleBankruptcyCheck();

        // Ziel-Prüfung
        if (String(this.#currentPlayerNodeId) === String(this.#targetPubNodeId)) {
            this.#checkPubArrival();
        }

        // Zufalls-Begegnung (Encounter Hook)
        EncounterManager.checkAndTriggerEvent(this.getState());

        this.#notifyStateChange();
        this.#emitPlayerMoved();
    }

    #handleInfoMenuMoveLogic() {
        if (!this.#isInfoMenuOpen || this.#infoMenuOpenUntilMove === -1) return;
        if (this.#moveCount < this.#infoMenuOpenUntilMove) return;

        this.#isInfoMenuOpen = false;
        this.#infoMenuOpenUntilMove = -1;
        eventBus.emit('INFO_MENU_STATE', false);
    }

    #handleFirstMoveLogic() {
        if (this.#firstMoveFired) return;
        this.#firstMoveFired = true;
        eventBus.emit('FIRST_MOVE_COMPLETED');
    }

    #handleBankruptcyCheck() {
        if (this.#budgetManager.budget > 0) return;

        this.#gameActive = false;
        
        if (!this.#budgetManager.hasActiveLoan) {
            eventBus.emit(EVENTS.SHOW_DIALOG, {
                title: 'Pleite!',
                text: 'Du hast keinen Cent mehr in der Tasche. Ein alter Bekannter bietet dir einen Not-Kredit von 1.500 € an. Aber pass auf: Er will das Geld nach dem nächsten erfolgreichen Bruch mit Zinsen zurück!',
                buttons: [
                    { text: 'Kredit annehmen', event: 'ACCEPT_LOAN_OFFER' },
                    { text: 'Aufgeben', event: 'RELOAD_GAME' }
                ]
            });
        } else {
            eventBus.emit(EVENTS.PLAYER_BUSTED, { reason: 'BANKRUPTCY' });
        }
    }

    #checkPubArrival() {
        const diff = (Date.now() - this.#lastPubVisit) / 1000;
        const cooldownSec = CONFIG.PUB_COOLDOWN / 1000;

        if (diff < cooldownSec) {
            const remaining = Math.ceil(cooldownSec - diff);
            eventBus.emit('SHOW_TOAST', { 
                msg: `Der Kneipier ist mal kurz mit einem Gast in den Hinterraum gegangen und hat für ${remaining} Sekunden keine Zeit.`, 
                type: 'fail' 
            });
            return;
        }

        this.#gameActive = false;
        this.#isInPub = true;
        eventBus.emit('PUB_TARGET_REACHED', { nodeId: this.#currentPlayerNodeId });
        this.#notifyTargetReached();
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
        if (this.#radarUnlocked) return '📡 Du hast die Frequenz bereits!';
        
        if (!this.canAfford(CONFIG.RADAR_COST)) {
            return `❌ Nicht genug Geld! Du brauchst ${CONFIG.RADAR_COST} €.`;
        }

        this.deductBudget(CONFIG.RADAR_COST);
        this.#radarUnlocked = true;
        
        const currentNode = this.#mapData.getNode(this.#currentPlayerNodeId);
        const risk = this.#mapData.getPoliceRiskModifier([currentNode.lat, currentNode.lon]);
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
        this.#logbook.push({ time: Date.now(), text: msg, type });
        this.#lastPubVisit = Date.now();
        this.resume();

        // UI-Timeouts für Cooldown-Text
        setTimeout(() => {
            this.#showPubCooldownText = true;
            this.#notifyStateChange();
        }, 5000);

        setTimeout(() => {
            this.#showPubCooldownText = false;
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
            C: { text: STRINGS.interactions.pub.optionC(), requiresConfirmation: false, customEvent: 'OPTION_C_CLICKED' },
            D: { text: STRINGS.interactions.pub.optionD, requiresConfirmation: false, customEvent: 'OPTION_D_CLICKED' }
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
        const statsMap = {
            'residential': { baseRisk: 15, abortRate: 47, minLoot: 1500, maxLoot: 6100, label: 'Wohnobjekt' },
            'commercial':  { baseRisk: 30, abortRate: 28, minLoot: 500,  maxLoot: 15000, label: 'Gewerbeobjekt' },
            'public':      { baseRisk: 30, abortRate: 25, minLoot: 100,  maxLoot: 8000,  label: 'Öffentliche Einrichtung' },
            'allotments':  { baseRisk: 15, abortRate: 15, minLoot: 50,   maxLoot: 1950,  label: 'Kleingarten/Schuppen' },
            'bicycle':     { baseRisk: 9.7, abortRate: 0, minLoot: 0,    maxLoot: 0,     label: 'Fahrradständer' }
        };

        const category = targetNode.type || 'residential';
        const config = statsMap[category] || statsMap.residential;

        const stations = this.#mapData.getPoliceStations();
        let proximityRisk = 0;
        let nearbyCount = 0;

        stations.forEach(station => {
            const dist = this.#mapData.calculateDistance(
                { lat: targetNode.lat, lon: targetNode.lon },
                { lat: station.lat, lon: station.lon }
            );

            if (dist < 500) {
                nearbyCount++;
                proximityRisk += (500 - dist) / 500 * 25;
            }
        });

        const interferenceRisk = nearbyCount > 1 ? (nearbyCount - 1) * 15 : 0;
        
        let totalRisk = Math.min(95, config.baseRisk + proximityRisk + interferenceRisk);
        let abortRate = config.abortRate;

        // Tarnung-Buff anwenden (Halbierung)
        if (this.#isDisguised) {
            totalRisk *= 0.5;
            abortRate *= 0.5;
        }

        const successProbability = 100 - totalRisk;

        return {
            label: config.label,
            minLoot: config.minLoot,
            maxLoot: config.maxLoot,
            baseRisk: config.baseRisk,
            abortRate: Number(abortRate.toFixed(1)),
            proximityRisk: Number(proximityRisk.toFixed(1)),
            interferenceRisk: interferenceRisk,
            nearbyCount: nearbyCount,
            totalRisk: Number(totalRisk.toFixed(1)),
            successProbability: Number(successProbability.toFixed(1)),
            isDisguised: this.#isDisguised
        };
    }

    startBicycleTheft(targetId) {
        const target = this.#activeBicycleTargets.find(t => t.id === targetId);
        if (!target) return;

        const riskData = this.calculateTargetRisk(target);
        const roll = Math.random() * 100;

        if (roll > riskData.totalRisk) {
            // Erfolg
            this.#isBiking = true;
            this.#activeBicycleTargets = [];
            
            // UI Feedback (CSS Klasse für Speed-Feeling etc)
            document.getElementById('app-container')?.classList.add('state-biking');
            document.body.classList.add('state-biking');
            
            eventBus.emit('SHOW_TOAST', { msg: "Rad geknackt! Du bist jetzt lautlos und schnell.", type: 'success' });
            
            this.#notifyStateChange();
        } else {
            // Scheitern -> Bestehende Busted-Logik
            eventBus.emit('SHOW_TOAST', { msg: "Verdammt! Ein Zeuge hat dich gesehen!", type: 'fail' });
            eventBus.emit('PLAYER_BUSTED');
        }
    }

    calculateLoot(riskData) {
        return this.#budgetManager.calculateLoot(riskData);
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
        this.#emitTargetsUpdated();
        this.#notifyStateChange();
    }

    findNearestHairdresser() {
        const playerNode = this.#mapData.getNode(this.#currentPlayerNodeId);
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
        this.#activeBarber = barber;
        this.#emitTargetsUpdated();
        this.#notifyStateChange();
    }

    applyBarberBuff() {
        this.#isDisguised = true;
        this.#activeBarber = null; // POI deaktivieren (aus dem State entfernen)
        this.#notifyStateChange();
    }

    getActiveBicycleTargets() {
        return this.#activeBicycleTargets;
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
