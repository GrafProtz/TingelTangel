import { CONFIG } from './GameConfig.js';
import { EVENTS } from './EventTypes.js';
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
        this.#budget = CONFIG.INITIAL_BUDGET;
    }

    /**
     * Initialisiert das Budget für eine neue Mission.
     */
    init() {
        this.#budget = CONFIG.INITIAL_BUDGET;
        this.#hasActiveLoan = false;
        this.#loanInterestSteps = 0;
        this.#notifyChange();
    }

    /**
     * Lädt einen gespeicherten Finanz-Zustand.
     * @param {Object} savedState 
     */
    hydrate(savedState) {
        if (!savedState) return;
        this.#budget = savedState.budget ?? CONFIG.INITIAL_BUDGET;
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
    getFinanceState() {
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
     * Spezielles Budget-Update für Animationen (Tick).
     * Verhindert schwere Full-State Broadcasts.
     */
    applyBudgetTick(newBudget, diff) {
        this.#budget = newBudget;
        eventBus.emit(EVENTS.BUDGET_TICK, { total: this.#budget, diff });
    }

    /**
     * Verarbeitet Zinsen für den laufenden Kredit bei jedem Schritt.
     */
    applyStepInterest() {
        if (this.#hasActiveLoan) {
            this.#loanInterestSteps += 1; // 1 € pro Schritt (Fixer Wert laut Game.js Legacy)
        }
    }

    calculateLoot(riskData) {
        const { minLoot, maxLoot } = riskData;
        return Math.floor(minLoot + Math.random() * (maxLoot - minLoot));
    }

    /**
     * Berechnet die Schuldenrückzahlung bei einem erfolgreichen Coup.
     * @returns {number} Der abgezogene Schuldenbetrag.
     */
    processLoanRepayment() {
        if (!this.#hasActiveLoan) return 0;

        // In der aktuellen Version: Rückzahlung = Basis (2000) + aufgelaufene Zinsen
        const debt = 2000 + this.#loanInterestSteps; 
        this.#hasActiveLoan = false;
        this.#loanInterestSteps = 0;
        
        return debt;
    }

    handleAcceptLoan() {
        this.#budget = 1500; // Fixbetrag laut Legacy-Logik
        this.#hasActiveLoan = true;
        this.#loanInterestSteps = 0;
        this.#notifyChange();
    }

    #handleInsolvency() {
        if (!this.#hasActiveLoan) {
            // Wenn pleite, aber noch kein Kredit: Angebot machen
            eventBus.emit(EVENTS.SHOW_DIALOG, {
                title: 'Pleite!',
                text: 'Du hast keinen Cent mehr in der Tasche. Ein alter Bekannter bietet dir einen Not-Kredit von 1.500 € an. Aber pass auf: Er will das Geld nach dem nächsten erfolgreichen Bruch mit Zinsen zurück!',
                buttons: [
                    { text: 'Kredit annehmen', event: 'ACCEPT_LOAN_OFFER' },
                    { text: 'Aufgeben', event: 'RELOAD_GAME' }
                ]
            });
        } else {
            // Wenn bereits verschuldet und pleite: Game Over
            eventBus.emit(EVENTS.PLAYER_BUSTED, { reason: 'BANKRUPTCY' });
        }
    }

    #notifyChange(diff = 0) {
        eventBus.emit(EVENTS.BUDGET_UPDATED, {
            total: this.#budget,
            diff: diff
        });
    }
}
