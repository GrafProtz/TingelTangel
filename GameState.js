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
    hydrate(savedState) {
        if (!savedState) return;
        this.currentPlayerNodeId = savedState.currentPlayerNodeId;
        this.gameActive = savedState.gameActive ?? true;
        this.targetPubNodeId = savedState.targetPubNodeId;
        this.targetPubName = savedState.targetPubName || "Kneipe";
        this.radarUnlocked = savedState.radarUnlocked ?? false;
        this.lastRadarTime = savedState.lastRadarTime ?? 0;
        this.lastPubVisit = savedState.lastPubVisit ?? 0;
        this.showPubCooldownText = savedState.showPubCooldownText ?? false;
        this.moveCount = savedState.moveCount ?? 0;
        this.missionPhase = savedState.missionPhase ?? 1;
        this.infoMenuOpenUntilMove = savedState.infoMenuOpenUntilMove ?? -1;
        this.isInfoMenuOpen = savedState.isInfoMenuOpen ?? false;
        this.activeCrimeTargets = savedState.activeCrimeTargets || [];
        this.logbook = savedState.logbook || [];
        this.firstMoveFired = savedState.firstMoveFired ?? false;
        this.isInPub = savedState.isInPub ?? false;
        this.activeBarber = savedState.activeBarber || null;
        this.isDisguised = savedState.isDisguised ?? false;
        this.hasBoltCutter = savedState.hasBoltCutter ?? false;
        this.isBiking = savedState.isBiking ?? false;
        this.hasBicycle = savedState.hasBicycle ?? false;
        this.activeBicycleTargets = savedState.activeBicycleTargets || [];
    }
}
