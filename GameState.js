/**
 * GameState - Die "Single Source of Truth" für GridCrime.
 * Kapselt alle reinen Daten-Felder und stellt Getter/Setter bereit.
 */
export class GameState {
    // Player State
    #currentPlayerNodeId = null;
    #isBiking = false;
    #isDisguised = false;
    #hasBoltCutter = false;
    #hasBicycle = false;
    #isInPub = false;

    // Game Logic State
    #gameActive = false;
    #moveCount = 0;
    #missionPhase = 1;
    #firstMoveFired = false;
    
    // Mission / Targets
    #targetPubNodeId = null;
    #targetPubName = "Kneipe";
    #activeCrimeTargets = [];
    #activeBicycleTargets = [];
    #activeBarber = null;
    #lastPubVisit = 0;
    
    // UI / Utility
    #radarUnlocked = false;
    #lastRadarTime = 0;
    #showPubCooldownText = false;
    #infoMenuOpenUntilMove = -1;
    #isInfoMenuOpen = false;
    #logbook = [];

    // --- Getter ---
    get currentPlayerNodeId() { return this.#currentPlayerNodeId; }
    get isBiking() { return this.#isBiking; }
    get isDisguised() { return this.#isDisguised; }
    get hasBoltCutter() { return this.#hasBoltCutter; }
    get hasBicycle() { return this.#hasBicycle; }
    get isInPub() { return this.#isInPub; }
    get gameActive() { return this.#gameActive; }
    get moveCount() { return this.#moveCount; }
    get missionPhase() { return this.#missionPhase; }
    get targetPubNodeId() { return this.#targetPubNodeId; }
    get targetPubName() { return this.#targetPubName; }
    get activeCrimeTargets() { return [...this.#activeCrimeTargets]; }
    get activeBicycleTargets() { return [...this.#activeBicycleTargets]; }
    get activeBarber() { return this.#activeBarber; }
    get lastRadarTime() { return this.#lastRadarTime; }
    get radarUnlocked() { return this.#radarUnlocked; }
    get lastPubVisit() { return this.#lastPubVisit; }
    get showPubCooldownText() { return this.#showPubCooldownText; }
    get isInfoMenuOpen() { return this.#isInfoMenuOpen; }
    get infoMenuOpenUntilMove() { return this.#infoMenuOpenUntilMove; }
    get logbook() { return [...this.#logbook]; }
    get firstMoveFired() { return this.#firstMoveFired; }

    // --- Setter ---
    set currentPlayerNodeId(val) { this.#currentPlayerNodeId = val !== null ? String(val) : null; }
    set isBiking(val) { this.#isBiking = !!val; }
    set isDisguised(val) { this.#isDisguised = !!val; }
    set hasBoltCutter(val) { this.#hasBoltCutter = !!val; }
    set hasBicycle(val) { this.#hasBicycle = !!val; }
    set isInPub(val) { this.#isInPub = !!val; }
    set gameActive(val) { this.#gameActive = !!val; }
    set moveCount(val) { this.#moveCount = val; }
    set missionPhase(val) { this.#missionPhase = val; }
    set targetPubNodeId(val) { this.#targetPubNodeId = val !== null ? String(val) : null; }
    set targetPubName(val) { this.#targetPubName = val; }
    set activeCrimeTargets(val) { this.#activeCrimeTargets = Array.isArray(val) ? val : []; }
    set activeBicycleTargets(val) { this.#activeBicycleTargets = Array.isArray(val) ? val : []; }
    set activeBarber(val) { this.#activeBarber = val; }
    set lastRadarTime(val) { this.#lastRadarTime = val; }
    set radarUnlocked(val) { this.#radarUnlocked = !!val; }
    set lastPubVisit(val) { this.#lastPubVisit = val; }
    set showPubCooldownText(val) { this.#showPubCooldownText = !!val; }
    set isInfoMenuOpen(val) { this.#isInfoMenuOpen = !!val; }
    set infoMenuOpenUntilMove(val) { this.#infoMenuOpenUntilMove = val; }
    set logbook(val) { this.#logbook = Array.isArray(val) ? val : []; }
    set firstMoveFired(val) { this.#firstMoveFired = !!val; }

    /**
     * Sammelt alle Daten für den globalen State-Broadcast.
     */
    collectState(financeState, movementState) {
        return structuredClone({
            ...financeState,
            ...movementState,
            currentPlayerNodeId: this.#currentPlayerNodeId,
            isBiking: this.#isBiking,
            isDisguised: this.#isDisguised,
            hasBoltCutter: this.#hasBoltCutter,
            hasBicycle: this.#hasBicycle,
            isInPub: this.#isInPub,
            gameActive: this.#gameActive,
            moveCount: this.#moveCount,
            missionPhase: this.#missionPhase,
            targetPubNodeId: this.#targetPubNodeId,
            targetPubName: this.#targetPubName,
            activeCrimeTargets: this.#activeCrimeTargets,
            activeBicycleTargets: this.#activeBicycleTargets,
            activeBarber: this.#activeBarber,
            radarUnlocked: this.#radarUnlocked,
            lastRadarTime: this.#lastRadarTime,
            lastPubVisit: this.#lastPubVisit,
            showPubCooldownText: this.#showPubCooldownText,
            isInfoMenuOpen: this.#isInfoMenuOpen,
            infoMenuOpenUntilMove: this.#infoMenuOpenUntilMove,
            logbook: this.#logbook,
            firstMoveFired: this.#firstMoveFired
        });
    }

    /**
     * Lädt den Zustand aus einem gespeicherten Objekt.
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
        this.isInPub = isBool(data.isInPub) ? data.isInPub : false;

        // Game Logic State
        this.gameActive = isBool(data.gameActive) ? data.gameActive : true;
        this.moveCount = isNum(data.moveCount) && data.moveCount >= 0 ? data.moveCount : 0;
        this.missionPhase = isNum(data.missionPhase) && [1, 2, 3].includes(data.missionPhase) ? data.missionPhase : 1;
        this.firstMoveFired = isBool(data.firstMoveFired) ? data.firstMoveFired : false;

        // Mission / Targets
        this.targetPubNodeId = isStr(data.targetPubNodeId) ? data.targetPubNodeId : null;
        this.targetPubName = isStr(data.targetPubName) ? data.targetPubName : "Kneipe";
        this.activeCrimeTargets = isArr(data.activeCrimeTargets) ? data.activeCrimeTargets : [];
        this.activeBicycleTargets = isArr(data.activeBicycleTargets) ? data.activeBicycleTargets : [];
        this.activeBarber = (data.activeBarber && typeof data.activeBarber === 'object') ? data.activeBarber : null;
        this.lastPubVisit = isNum(data.lastPubVisit) && data.lastPubVisit >= 0 ? data.lastPubVisit : 0;

        // UI / Utility
        this.radarUnlocked = isBool(data.radarUnlocked) ? data.radarUnlocked : false;
        this.lastRadarTime = isNum(data.lastRadarTime) && data.lastRadarTime >= 0 ? data.lastRadarTime : 0;
        this.showPubCooldownText = isBool(data.showPubCooldownText) ? data.showPubCooldownText : false;
        this.infoMenuOpenUntilMove = isNum(data.infoMenuOpenUntilMove) ? data.infoMenuOpenUntilMove : -1;
        this.isInfoMenuOpen = isBool(data.isInfoMenuOpen) ? data.isInfoMenuOpen : false;
        this.logbook = isArr(data.logbook) ? data.logbook : [];
    }
}
