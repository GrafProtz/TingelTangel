/**
 * GameState - Die "Single Source of Truth" für GridCrime.
 * Kapselt alle reinen Daten-Felder und stellt Getter/Setter bereit.
 * ARCHITEKTUR:
 * - Enthält keine Geschäftslogik (Pure Data).
 * - Bietet tiefe Kopien via collectState() für die View-Schicht.
 */
import { eventBus } from './EventBus.js';
import { EVENTS } from './EventTypes.js';
export class GameState {
    // --- Player Position & Equipment ---
    #currentPlayerNodeId = null;
    #isBiking = false;
    #isDisguised = false;
    #hasBoltCutter = false;
    #hasBicycle = false;
    
    // --- Financial State (Zentralisiert aus BudgetManager) ---
    #budget = 0;
    #hasActiveLoan = false;
    #loanInterestSteps = 0;

    // --- Game Engine State ---
    #gameActive = false;
    #isMoving = false;
    #moveCount = 0;
    #missionPhase = 1;
    #firstMoveFired = false;
    #isInPub = false;
    
    // --- Mission & Targets ---
    #targetPubNodeId = null;
    #targetPubName = "Kneipe";
    #activeCrimeTargets = [];
    #activeBicycleTargets = [];
    #activeBarber = null;
    #lastPubVisit = 0;
    
    // --- UI & Utility State ---
    #radarUnlocked = false;
    #lastRadarTime = 0;
    #showPubCooldownText = false;
    #infoMenuOpenUntilMove = -1;
    #isInfoMenuOpen = false;
    #logbook = [];
    #devEncountersDisabled = false;

    // --- Getter (Liefern einfache Werte oder flache Kopien für internen Gebrauch) ---
    get currentPlayerNodeId() { return this.#currentPlayerNodeId; }
    get isBiking() { return this.#isBiking; }
    get isDisguised() { return this.#isDisguised; }
    get hasBoltCutter() { return this.#hasBoltCutter; }
    get hasBicycle() { return this.#hasBicycle; }
    get budget() { return this.#budget; }
    get hasActiveLoan() { return this.#hasActiveLoan; }
    get loanInterestSteps() { return this.#loanInterestSteps; }
    get gameActive() { return this.#gameActive; }
    get isMoving() { return this.#isMoving; }
    get moveCount() { return this.#moveCount; }
    get missionPhase() { return this.#missionPhase; }
    get targetPubNodeId() { return this.#targetPubNodeId; }
    get targetPubName() { return this.#targetPubName; }
    get activeCrimeTargets() { return [...this.#activeCrimeTargets]; }
    get activeBicycleTargets() { return [...this.#activeBicycleTargets]; }
    get activeBarber() { return this.#activeBarber; }
    get logbook() { return [...this.#logbook]; }
    get lastRadarTime() { return this.#lastRadarTime; }
    get radarUnlocked() { return this.#radarUnlocked; }
    get lastPubVisit() { return this.#lastPubVisit; }
    get showPubCooldownText() { return this.#showPubCooldownText; }
    get isInfoMenuOpen() { return this.#isInfoMenuOpen; }
    get infoMenuOpenUntilMove() { return this.#infoMenuOpenUntilMove; }
    get isInPub() { return this.#isInPub; }
    get firstMoveFired() { return this.#firstMoveFired; }
    get devEncountersDisabled() { return this.#devEncountersDisabled; }

    // --- Setter ---
    set currentPlayerNodeId(val) { this.#currentPlayerNodeId = val !== null ? String(val) : null; }
    set isBiking(val) { this.#isBiking = !!val; }
    set isDisguised(val) { this.#isDisguised = !!val; }
    set hasBoltCutter(val) { this.#hasBoltCutter = !!val; }
    set hasBicycle(val) { this.#hasBicycle = !!val; }
    set budget(val) { this.#budget = Number(val) || 0; }
    set hasActiveLoan(val) { this.#hasActiveLoan = !!val; }
    set loanInterestSteps(val) { this.#loanInterestSteps = Number(val) || 0; }
    set gameActive(val) { this.#gameActive = !!val; }
    set isMoving(val) { this.#isMoving = !!val; }
    set moveCount(val) { this.#moveCount = Number(val) || 0; }
    set missionPhase(val) { this.#missionPhase = Number(val) || 1; }
    set targetPubNodeId(val) { this.#targetPubNodeId = val !== null ? String(val) : null; }
    set targetPubName(val) { this.#targetPubName = val; }
    set activeCrimeTargets(val) { this.#activeCrimeTargets = Array.isArray(val) ? val : []; }
    set activeBicycleTargets(val) { this.#activeBicycleTargets = Array.isArray(val) ? val : []; }
    set activeBarber(val) { this.#activeBarber = val; }
    set lastRadarTime(val) { this.#lastRadarTime = Number(val) || 0; }
    set radarUnlocked(val) { this.#radarUnlocked = !!val; }
    set lastPubVisit(val) { this.#lastPubVisit = Number(val) || 0; }
    set showPubCooldownText(val) { this.#showPubCooldownText = !!val; }
    set isInfoMenuOpen(val) { this.#isInfoMenuOpen = !!val; }
    set infoMenuOpenUntilMove(val) { this.#infoMenuOpenUntilMove = Number(val) || -1; }
    set isInPub(val) { this.#isInPub = !!val; }
    set logbook(val) { this.#logbook = Array.isArray(val) ? val : []; }
    set firstMoveFired(val) { this.#firstMoveFired = !!val; }
    set devEncountersDisabled(val) { this.#devEncountersDisabled = !!val; }

    /**
     * Fügt einen neuen Eintrag zum Logbuch hinzu.
     */
    addLogEntry(entry) {
        if (entry && typeof entry === 'object') {
            this.#logbook.push(entry);
        }
    }

    // ----------------------------------------------------------------
    //  State Access & Diff Helpers
    // ----------------------------------------------------------------
    /**
     * Returns a **shallow** copy of the public state. Only primitive fields
     * and shallow array copies are returned – this is sufficient for the UI
     * layer because it never mutates the returned objects.
     */
    getState() {
        return {
            currentPlayerNodeId: this.#currentPlayerNodeId,
            isBiking: this.#isBiking,
            isDisguised: this.#isDisguised,
            hasBoltCutter: this.#hasBoltCutter,
            hasBicycle: this.#hasBicycle,
            budget: this.#budget,
            hasActiveLoan: this.#hasActiveLoan,
            loanInterestSteps: this.#loanInterestSteps,
            gameActive: this.#gameActive,
            isMoving: this.#isMoving,
            moveCount: this.#moveCount,
            missionPhase: this.#missionPhase,
            targetPubNodeId: this.#targetPubNodeId,
            targetPubName: this.#targetPubName,
            activeCrimeTargets: [...this.#activeCrimeTargets],
            activeBicycleTargets: [...this.#activeBicycleTargets],
            activeBarber: this.#activeBarber,
            radarUnlocked: this.#radarUnlocked,
            lastRadarTime: this.#lastRadarTime,
            lastPubVisit: this.#lastPubVisit,
            showPubCooldownText: this.#showPubCooldownText,
            isInfoMenuOpen: this.#isInfoMenuOpen,
            infoMenuOpenUntilMove: this.#infoMenuOpenUntilMove,
            logbook: [...this.#logbook],
            firstMoveFired: this.#firstMoveFired,
            isInPub: this.#isInPub,
            devEncountersDisabled: this.#devEncountersDisabled
        };
    }

    /**
     * Helper that emits a STATE_UPDATED event containing only the changed
     * fragment. Consumers can merge this payload into their cached state.
     */
    #emitStateUpdate(changedFragment) {
        if (typeof eventBus !== 'undefined' && typeof EVENTS !== 'undefined') {
            eventBus.emit(EVENTS.STATE_UPDATED, changedFragment);
        }
    }

    // ----------------------------------------------------------------
    //  Mutation (Reducer‑Style) API
    // ----------------------------------------------------------------
    /** Update player position (node id) */
    updatePlayerPosition(nodeId) {
        const old = this.#currentPlayerNodeId;
        this.#currentPlayerNodeId = nodeId !== null ? String(nodeId) : null;
        if (old !== this.#currentPlayerNodeId) {
            this.#emitStateUpdate({ currentPlayerNodeId: this.#currentPlayerNodeId });
        }
    }

    /** Add loot (increase budget) */
    addLoot(amount) {
        const old = this.#budget;
        this.#budget = Number(this.#budget) + Number(amount);
        if (old !== this.#budget) {
            this.#emitStateUpdate({ budget: this.#budget });
        }
    }

    /** Toggle biking state */
    setBiking(flag) {
        const newVal = !!flag;
        if (this.#isBiking !== newVal) {
            this.#isBiking = newVal;
            this.#emitStateUpdate({ isBiking: this.#isBiking });
        }
    }

    /** Generic dispatcher – can be extended later */
    dispatch(action) {
        const { type, payload } = action;
        switch (type) {
            case 'UPDATE_PLAYER_POSITION':
                this.updatePlayerPosition(payload.nodeId);
                break;
            case 'ADD_LOOT':
                this.addLoot(payload.amount);
                break;
            case 'SET_BIKING':
                this.setBiking(payload.enabled);
                break;
            default:
                console.warn('[GameState] Unhandled action type:', type);
        }
    }

    // ----------------------------------------------------------------
    //  Legacy API – retained for backward compatibility
    // ----------------------------------------------------------------
    /**
     * Legacy wrapper – returns shallow copy; new code should use `getState()`.
     */
    collectState() {
        return this.getState();
    }

    /**
     * Lädt den Zustand aus einem gespeicherten Objekt mit Basis-Validierung.
     */
    hydrate(data) {
        if (!data || typeof data !== 'object') return;

        const isStr = (v) => typeof v === 'string';
        const isNum = (v) => typeof v === 'number' && !isNaN(v);
        const isBool = (v) => typeof v === 'boolean';
        const isArr = (v) => Array.isArray(v);

        // Player & Position
        this.currentPlayerNodeId = isStr(data.currentPlayerNodeId) ? data.currentPlayerNodeId : null;
        this.isBiking = isBool(data.isBiking) ? data.isBiking : false;
        this.isDisguised = isBool(data.isDisguised) ? data.isDisguised : false;
        this.hasBoltCutter = isBool(data.hasBoltCutter) ? data.hasBoltCutter : false;
        this.hasBicycle = isBool(data.hasBicycle) ? data.hasBicycle : false;
        
        // Finances
        this.budget = isNum(data.budget) ? data.budget : 0;
        this.hasActiveLoan = isBool(data.hasActiveLoan) ? data.hasActiveLoan : false;
        this.loanInterestSteps = isNum(data.loanInterestSteps) ? data.loanInterestSteps : 0;

        // Game State
        this.gameActive = isBool(data.gameActive) ? data.gameActive : true;
        this.isMoving = false; // Nach dem Laden niemals in Bewegung
        this.moveCount = isNum(data.moveCount) && data.moveCount >= 0 ? data.moveCount : 0;
        this.missionPhase = isNum(data.missionPhase) ? data.missionPhase : 1;
        this.firstMoveFired = isBool(data.firstMoveFired) ? data.firstMoveFired : false;
        this.isInPub = isBool(data.isInPub) ? data.isInPub : false;

        // Targets
        this.targetPubNodeId = isStr(data.targetPubNodeId) ? data.targetPubNodeId : null;
        this.targetPubName = isStr(data.targetPubName) ? data.targetPubName : "Kneipe";
        this.activeCrimeTargets = isArr(data.activeCrimeTargets) ? data.activeCrimeTargets : [];
        this.activeBicycleTargets = isArr(data.activeBicycleTargets) ? data.activeBicycleTargets : [];
        this.activeBarber = (data.activeBarber && typeof data.activeBarber === 'object') ? data.activeBarber : null;
        this.lastPubVisit = isNum(data.lastPubVisit) ? data.lastPubVisit : 0;

        // UI
        this.radarUnlocked = isBool(data.radarUnlocked) ? data.radarUnlocked : false;
        this.lastRadarTime = isNum(data.lastRadarTime) ? data.lastRadarTime : 0;
        this.showPubCooldownText = isBool(data.showPubCooldownText) ? data.showPubCooldownText : false;
        this.infoMenuOpenUntilMove = isNum(data.infoMenuOpenUntilMove) ? data.infoMenuOpenUntilMove : -1;
        this.isInfoMenuOpen = isBool(data.isInfoMenuOpen) ? data.isInfoMenuOpen : false;
        this.logbook = isArr(data.logbook) ? data.logbook : [];
        this.devEncountersDisabled = isBool(data.devEncountersDisabled) ? data.devEncountersDisabled : false;
    }
}
