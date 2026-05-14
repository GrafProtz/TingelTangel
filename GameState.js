import { eventBus } from './EventBus.js';
import { EVENTS } from './EventTypes.js';

/**
 * GameState - Die "Single Source of Truth" für GridCrime.
 * Kapselt alle reinen Daten-Felder streng privat.
 * ARCHITEKTUR:
 * - Keine Setter! Mutation erfolgt ausschließlich über die validierte mutate()-Schnittstelle.
 * - hydrate() nutzt dieselbe validierte Schnittstelle.
 */
export class GameState {
    // --- Player Position & Equipment ---
    #currentPlayerNodeId = null;
    #isBiking = false;
    #isDisguised = false;
    #hasBoltCutter = false;
    #hasBicycle = false;
    
    // --- Financial State ---
    #budget = 0;
    #hasActiveLoan = false;
    #loanInterestSteps = 0;
    #syndicateLoanOffered = false;
    #syndicateLoanActive = false;
    #syndicateLoanCount = 0;
    #syndicateLoanAmount = 0;

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
    get syndicateLoanOffered() { return this.#syndicateLoanOffered; }
    get syndicateLoanActive() { return this.#syndicateLoanActive; }
    get syndicateLoanCount() { return this.#syndicateLoanCount; }
    get syndicateLoanAmount() { return this.#syndicateLoanAmount; }
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

    /**
     * Fügt einen neuen Eintrag zum Logbuch hinzu (interne Helper).
     */
    #addLogEntry(entry) {
        if (entry && typeof entry === 'object') {
            this.#logbook.push(entry);
        }
    }

    // ----------------------------------------------------------------
    //  State Access
    // ----------------------------------------------------------------
    
    /**
     * Gibt eine flache, unveränderliche Kopie des Public State zurück.
     */
    getState() {
        return Object.freeze({
            currentPlayerNodeId: this.#currentPlayerNodeId,
            isBiking: this.#isBiking,
            isDisguised: this.#isDisguised,
            hasBoltCutter: this.#hasBoltCutter,
            hasBicycle: this.#hasBicycle,
            budget: this.#budget,
            hasActiveLoan: this.#hasActiveLoan,
            loanInterestSteps: this.#loanInterestSteps,
            syndicateLoanOffered: this.#syndicateLoanOffered,
            syndicateLoanActive: this.#syndicateLoanActive,
            syndicateLoanCount: this.#syndicateLoanCount,
            syndicateLoanAmount: this.#syndicateLoanAmount,
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
        });
    }

    // ----------------------------------------------------------------
    //  Zentrale Mutations-Schnittstelle (Reducer-Pattern)
    // ----------------------------------------------------------------
    
    /**
     * Der einzige Weg, den GameState zu verändern.
     * Nutzt striktes Type-Checking und Validierung für jeden Key.
     */
    mutate(delta) {
        if (!delta || typeof delta !== 'object') return;

        if (delta.currentPlayerNodeId !== undefined) this.#currentPlayerNodeId = delta.currentPlayerNodeId !== null ? String(delta.currentPlayerNodeId) : null;
        if (delta.isBiking !== undefined)            this.#isBiking = !!delta.isBiking;
        if (delta.isDisguised !== undefined)         this.#isDisguised = !!delta.isDisguised;
        if (delta.hasBoltCutter !== undefined)       this.#hasBoltCutter = !!delta.hasBoltCutter;
        if (delta.hasBicycle !== undefined)          this.#hasBicycle = !!delta.hasBicycle;
        if (delta.budget !== undefined)              this.#budget = Number(delta.budget) || 0;
        if (delta.budgetDelta !== undefined)         this.#budget += Number(delta.budgetDelta) || 0;
        if (delta.hasActiveLoan !== undefined)       this.#hasActiveLoan = !!delta.hasActiveLoan;
        if (delta.loanInterestSteps !== undefined)   this.#loanInterestSteps = Number(delta.loanInterestSteps) || 0;
        if (delta.syndicateLoanOffered !== undefined) this.#syndicateLoanOffered = !!delta.syndicateLoanOffered;
        if (delta.syndicateLoanActive !== undefined)  this.#syndicateLoanActive = !!delta.syndicateLoanActive;
        if (delta.syndicateLoanCount !== undefined)   this.#syndicateLoanCount = Number(delta.syndicateLoanCount) || 0;
        if (delta.syndicateLoanAmount !== undefined)  this.#syndicateLoanAmount = Number(delta.syndicateLoanAmount) || 0;
        if (delta.gameActive !== undefined)          this.#gameActive = !!delta.gameActive;
        if (delta.isMoving !== undefined)            this.#isMoving = !!delta.isMoving;
        if (delta.moveCount !== undefined)           this.#moveCount = Number(delta.moveCount) || 0;
        if (delta.missionPhase !== undefined)        this.#missionPhase = Number(delta.missionPhase) || 1;
        if (delta.targetPubNodeId !== undefined)     this.#targetPubNodeId = delta.targetPubNodeId !== null ? String(delta.targetPubNodeId) : null;
        if (delta.targetPubName !== undefined)       this.#targetPubName = String(delta.targetPubName);
        if (delta.activeCrimeTargets !== undefined)  this.#activeCrimeTargets = Array.isArray(delta.activeCrimeTargets) ? delta.activeCrimeTargets : [];
        if (delta.activeBicycleTargets !== undefined)this.#activeBicycleTargets = Array.isArray(delta.activeBicycleTargets) ? delta.activeBicycleTargets : [];
        if (delta.activeBarber !== undefined)        this.#activeBarber = delta.activeBarber;
        if (delta.lastRadarTime !== undefined)       this.#lastRadarTime = Number(delta.lastRadarTime) || 0;
        if (delta.radarUnlocked !== undefined)       this.#radarUnlocked = !!delta.radarUnlocked;
        if (delta.lastPubVisit !== undefined)        this.#lastPubVisit = Number(delta.lastPubVisit) || 0;
        if (delta.showPubCooldownText !== undefined) this.#showPubCooldownText = !!delta.showPubCooldownText;
        if (delta.isInfoMenuOpen !== undefined)      this.#isInfoMenuOpen = !!delta.isInfoMenuOpen;
        if (delta.infoMenuOpenUntilMove !== undefined) this.#infoMenuOpenUntilMove = Number(delta.infoMenuOpenUntilMove) || -1;
        if (delta.isInPub !== undefined)             this.#isInPub = !!delta.isInPub;
        if (delta.logbook !== undefined)             this.#logbook = Array.isArray(delta.logbook) ? delta.logbook : [];
        if (delta.firstMoveFired !== undefined)      this.#firstMoveFired = !!delta.firstMoveFired;
        if (delta.devEncountersDisabled !== undefined) this.#devEncountersDisabled = !!delta.devEncountersDisabled;

        if (delta.newLogEntry) {
            this.#addLogEntry(delta.newLogEntry);
        }
    }

    /**
     * Lädt den Zustand aus einem gespeicherten Objekt.
     * Nutzt intern mutate() um die Kapselung und Validierung nicht zu umgehen.
     */
    hydrate(data) {
        if (!data || typeof data !== 'object') return;
        
        this.mutate(data);
        
        // Zwangsanpassungen nach dem Laden (Spieler darf beim Laden nicht "in Bewegung" stecken bleiben)
        this.mutate({ isMoving: false });
    }
}
