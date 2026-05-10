import { CONFIG, EVENTS } from './GameConfig.js';
import { eventBus } from './EventBus.js';

/**
 * BudgetManager - Verwaltet alle finanziellen Aspekte des Spiels.
 * Kapselt Budget, Strafen, Belohnungen und das Kredit-System.
 */
export class BudgetManager {
    #budget = 0;
    #hasActiveLoan = false;
    #loanInterestSteps = 0;

    constructor() {
        this.#setupEventListeners();
    }

    #setupEventListeners() {
        // Horcht auf globale Finanz-Events
        eventBus.subscribe(EVENTS.GAME.ACCEPT_LOAN, () => this.handleAcceptLoan());
    }

    /**
     * Initialisiert das Budget für eine neue Mission.
     */
    init() {
        this.#budget = CONFIG.FINANCE.INITIAL_BUDGET;
        this.#hasActiveLoan = false;
        this.#loanInterestSteps = 0;
        this.#notifyChange();
    }

    /**
     * Lädt einen gespeicherten Finanz-Zustand.
     * @param {Object} savedState 
     */
    hydrate(savedState) {
        this.#budget = savedState.budget ?? CONFIG.FINANCE.INITIAL_BUDGET;
        this.#hasActiveLoan = savedState.hasActiveLoan ?? false;
        this.#loanInterestSteps = savedState.loanInterestSteps ?? 0;
        this.#notifyChange();
    }

    // --- Getters ---

    get budget() { return this.#budget; }
    get hasActiveLoan() { return this.#hasActiveLoan; }
    get loanInterestSteps() { return this.#loanInterestSteps; }

    /**
     * Gibt den finanzspezifischen Teil des States zurück.
     */
    getState() {
        return {
            budget: this.#budget,
            hasActiveLoan: this.#hasActiveLoan,
            loanInterestSteps: this.#loanInterestSteps
        };
    }

    // --- Logik ---

    canAfford(amount) {
        return this.#budget >= amount;
    }

    addReward(amount) {
        const oldBudget = this.#budget;
        this.#budget += amount;
        this.#notifyChange(this.#budget - oldBudget);
    }

    deductBudget(amount) {
        const oldBudget = this.#budget;
        this.#budget = Math.max(0, this.#budget - amount);
        this.#notifyChange(this.#budget - oldBudget);
        
        if (this.#budget <= 0) {
            this.#handleInsolvency();
        }
    }

    /**
     * Verarbeitet Zinsen für den laufenden Kredit bei jedem Schritt.
     */
    applyStepInterest() {
        if (this.#hasActiveLoan) {
            this.#loanInterestSteps += CONFIG.FINANCE.LOAN_INTEREST_PER_STEP;
        }
    }

    /**
     * Berechnet die Schuldenrückzahlung bei einem erfolgreichen Coup.
     * @returns {number} Der abgezogene Schuldenbetrag.
     */
    processLoanRepayment() {
        if (!this.#hasActiveLoan) return 0;

        const debt = CONFIG.FINANCE.LOAN_DEBT_BASE + this.#loanInterestSteps;
        this.#hasActiveLoan = false;
        this.#loanInterestSteps = 0;
        
        return debt;
    }

    handleAcceptLoan() {
        this.#budget = CONFIG.FINANCE.LOAN_AMOUNT;
        this.#hasActiveLoan = true;
        this.#loanInterestSteps = 0;
        this.#notifyChange();
    }

    #handleInsolvency() {
        if (!this.#hasActiveLoan) {
            eventBus.emit(EVENTS.UI.SHOW_LOAN_MODAL);
        } else {
            eventBus.emit(EVENTS.GAME.OVER, { reason: 'OUT_OF_MONEY' });
        }
    }

    /**
     * Informiert das System über Budgetänderungen.
     * @param {number} diff - Die Differenz zum vorherigen Stand (für Animationen).
     */
    #notifyChange(diff = 0) {
        eventBus.emit(EVENTS.PLAYER.BUDGET_UPDATED, {
            total: this.#budget,
            diff: diff,
            hasActiveLoan: this.#hasActiveLoan
        });
    }
}
