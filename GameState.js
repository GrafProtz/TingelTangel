import { CONFIG } from './GameConfig.js';
import { log } from './Utils.js';

/**
 * DEFAULT_STATE - Fallback für fehlerhafte Hydrierung oder Initialisierung.
 */
const DEFAULT_STATE = {
    currentPlayerNodeId: null,
    isBiking: false,
    isDisguised: false,
    hasBoltCutter: false,
    hasBicycle: false,
    isInPub: false,
    gameActive: false,
    moveCount: 0,
    missionPhase: 1,
    targetPubNodeId: null,
    targetPubName: "Kneipe",
    activeCrimeTargets: [],
    activeBicycleTargets: [],
    activeBarber: null,
    lastPubVisit: 0,
    radarUnlocked: false,
    lastRadarTime: 0,
    showPubCooldownText: false,
    infoMenuOpenUntilMove: -1,
    isInfoMenuOpen: false,
    logbook: [],
    firstMoveFired: false,
    // Finance State
    budget: 0,
    hasActiveLoan: false,
    loanInterestSteps: 0,
    // Movement State
    isMoving: false
};

/**
 * GamePhase - Mögliche Zustände des Spielzyklus.
 */
export const GamePhase = {
    INIT: 'INIT',
    LOADING_MAP: 'LOADING_MAP',
    READY: 'READY',
    PAUSED: 'PAUSED',
    CINEMATIC: 'CINEMATIC'
};

/**
 * GameState - Die "Single Source of Truth" für GridCrime.
 * Kapselt alle reinen Daten-Felder und stellt Getter/Setter bereit.
 * Härtung: Nutzt Deep Cloning (structuredClone) zur Wahrung der Kapselung.
 */
export class GameState {
    // Player State
    #currentPlayerNodeId = DEFAULT_STATE.currentPlayerNodeId;
    #isBiking = DEFAULT_STATE.isBiking;
    #isDisguised = DEFAULT_STATE.isDisguised;
    #hasBoltCutter = DEFAULT_STATE.hasBoltCutter;
    #hasBicycle = DEFAULT_STATE.hasBicycle;
    #isInPub = DEFAULT_STATE.isInPub;

    // Game Logic State
    #gameActive = DEFAULT_STATE.gameActive;
    #moveCount = DEFAULT_STATE.moveCount;
    #missionPhase = DEFAULT_STATE.missionPhase;
    #firstMoveFired = DEFAULT_STATE.firstMoveFired;
    
    // Mission / Targets
    #targetPubNodeId = DEFAULT_STATE.targetPubNodeId;
    #targetPubName = DEFAULT_STATE.targetPubName;
    #activeCrimeTargets = [...DEFAULT_STATE.activeCrimeTargets];
    #activeBicycleTargets = [...DEFAULT_STATE.activeBicycleTargets];
    #activeBarber = DEFAULT_STATE.activeBarber;
    #lastPubVisit = DEFAULT_STATE.lastPubVisit;
    
    // UI / Utility
    #radarUnlocked = DEFAULT_STATE.radarUnlocked;
    #lastRadarTime = DEFAULT_STATE.lastRadarTime;
    #showPubCooldownText = DEFAULT_STATE.showPubCooldownText;
    #infoMenuOpenUntilMove = DEFAULT_STATE.infoMenuOpenUntilMove;
    #isInfoMenuOpen = DEFAULT_STATE.isInfoMenuOpen;
    #logbook = [...DEFAULT_STATE.logbook];

    // Finance State
    #budget = DEFAULT_STATE.budget;
    #hasActiveLoan = DEFAULT_STATE.hasActiveLoan;
    #loanInterestSteps = DEFAULT_STATE.loanInterestSteps;

    // Movement State
    #isMoving = DEFAULT_STATE.isMoving;

    // --- Getter (Härtung via structuredClone) ---
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
    
    // Komplexe Objekte werden defensiv geklont
    get activeCrimeTargets() { return structuredClone(this.#activeCrimeTargets); }
    get activeBicycleTargets() { return structuredClone(this.#activeBicycleTargets); }
    get activeBarber() { return this.#activeBarber ? structuredClone(this.#activeBarber) : null; }
    get logbook() { return structuredClone(this.#logbook); }

    get lastRadarTime() { return this.#lastRadarTime; }
    get radarUnlocked() { return this.#radarUnlocked; }
    get lastPubVisit() { return this.#lastPubVisit; }
    get showPubCooldownText() { return this.#showPubCooldownText; }
    get isInfoMenuOpen() { return this.#isInfoMenuOpen; }
    get infoMenuOpenUntilMove() { return this.#infoMenuOpenUntilMove; }
    get firstMoveFired() { return this.#firstMoveFired; }

    // Finance & Movement
    get budget() { return this.#budget; }
    get hasActiveLoan() { return this.#hasActiveLoan; }
    get loanInterestSteps() { return this.#loanInterestSteps; }
    get isMoving() { return this.#isMoving; }

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

    set budget(val) { this.#budget = val; }
    set hasActiveLoan(val) { this.#hasActiveLoan = !!val; }
    set loanInterestSteps(val) { this.#loanInterestSteps = val; }
    set isMoving(val) { this.#isMoving = !!val; }

    /**
     * Fügt einen neuen Eintrag zum Logbuch hinzu.
     * @param {Object} entry - { time, text, type }
     */
    addLogEntry(entry) {
        if (entry && typeof entry === 'object' && entry.text) {
            this.#logbook.push(structuredClone(entry));
        }
    }

    /**
     * Erstellt einen einmaligen, tiefen Snapshot des gesamten Spielzustands.
     * Optimierung: Nutzt structuredClone nur einmal für den gesamten Export.
     */
    getSnapshot() {
        return structuredClone({
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
            firstMoveFired: this.#firstMoveFired,
            budget: this.#budget,
            hasActiveLoan: this.#hasActiveLoan,
            loanInterestSteps: this.#loanInterestSteps,
            isMoving: this.#isMoving
        });
    }

    /**
     * Sammelt alle Daten für den globalen State-Broadcast.
     */
    collectState(financeState, movementState) {
        return {
            ...this.getSnapshot(),
            ...financeState,
            ...movementState
        };
    }

    /**
     * Lädt den Zustand aus einem gespeicherten Objekt mit tiefer Schema-Validierung.
     */
    hydrate(data) {
        if (!data || typeof data !== 'object') {
            log("GameState: Hydrierung fehlgeschlagen - Daten ungültig. Nutze Defaults.");
            this.#resetToDefaults();
            return;
        }

        const isStr = (v) => typeof v === 'string';
        const isNum = (v) => typeof v === 'number' && !isNaN(v);
        const isBool = (v) => typeof v === 'boolean';
        const isArr = (v) => Array.isArray(v);

        // Sanity Check: Wenn Basiselemente fehlen, ist das File korrupt
        if (data.missionPhase === undefined || data.moveCount === undefined) {
            log("GameState: Sanity Check fehlgeschlagen - Korrupte Daten erkannt.");
            this.#resetToDefaults();
            return;
        }

        try {
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

            // Mission / Targets (Validierung der Array-Elemente)
            this.activeCrimeTargets = isArr(data.activeCrimeTargets) 
                ? data.activeCrimeTargets.filter(t => t && t.id) 
                : [];
            
            this.activeBicycleTargets = isArr(data.activeBicycleTargets) 
                ? data.activeBicycleTargets.filter(t => t && t.id) 
                : [];

            this.targetPubNodeId = isStr(data.targetPubNodeId) ? data.targetPubNodeId : null;
            this.targetPubName = isStr(data.targetPubName) ? data.targetPubName : "Kneipe";
            this.activeBarber = (data.activeBarber && typeof data.activeBarber === 'object') ? data.activeBarber : null;
            this.lastPubVisit = isNum(data.lastPubVisit) && data.lastPubVisit >= 0 ? data.lastPubVisit : 0;

            // UI / Utility
            this.radarUnlocked = isBool(data.radarUnlocked) ? data.radarUnlocked : false;
            this.lastRadarTime = isNum(data.lastRadarTime) && data.lastRadarTime >= 0 ? data.lastRadarTime : 0;
            this.showPubCooldownText = isBool(data.showPubCooldownText) ? data.showPubCooldownText : false;
            this.infoMenuOpenUntilMove = isNum(data.infoMenuOpenUntilMove) ? data.infoMenuOpenUntilMove : -1;
            this.isInfoMenuOpen = isBool(data.isInfoMenuOpen) ? data.isInfoMenuOpen : false;
            
            // Logbook Validierung
            this.logbook = isArr(data.logbook) 
                ? data.logbook.filter(e => e && e.text) 
                : [];
        } catch (err) {
            console.error("GameState: Fehler bei Hydrierung:", err);
            this.#resetToDefaults();
        }
    }

    #resetToDefaults() {
        this.#currentPlayerNodeId = DEFAULT_STATE.currentPlayerNodeId;
        this.#isBiking = DEFAULT_STATE.isBiking;
        this.#isDisguised = DEFAULT_STATE.isDisguised;
        this.#hasBoltCutter = DEFAULT_STATE.hasBoltCutter;
        this.#hasBicycle = DEFAULT_STATE.hasBicycle;
        this.#isInPub = DEFAULT_STATE.isInPub;
        this.#gameActive = DEFAULT_STATE.gameActive;
        this.#moveCount = DEFAULT_STATE.moveCount;
        this.#missionPhase = DEFAULT_STATE.missionPhase;
        this.#firstMoveFired = DEFAULT_STATE.firstMoveFired;
        this.#targetPubNodeId = DEFAULT_STATE.targetPubNodeId;
        this.#targetPubName = DEFAULT_STATE.targetPubName;
        this.#activeCrimeTargets = [...DEFAULT_STATE.activeCrimeTargets];
        this.#activeBicycleTargets = [...DEFAULT_STATE.activeBicycleTargets];
        this.#activeBarber = DEFAULT_STATE.activeBarber;
        this.#lastPubVisit = DEFAULT_STATE.lastPubVisit;
        this.#radarUnlocked = DEFAULT_STATE.radarUnlocked;
        this.#lastRadarTime = DEFAULT_STATE.lastRadarTime;
        this.#showPubCooldownText = DEFAULT_STATE.showPubCooldownText;
        this.#infoMenuOpenUntilMove = DEFAULT_STATE.infoMenuOpenUntilMove;
        this.#isInfoMenuOpen = DEFAULT_STATE.isInfoMenuOpen;
        this.#logbook = [...DEFAULT_STATE.logbook];
    }
}
