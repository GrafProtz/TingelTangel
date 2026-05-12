import { CONFIG } from './GameConfig.js';
import { EVENTS } from './EventTypes.js';
import { eventBus } from './EventBus.js';

/**
 * BudgetManager - Verwaltet alle finanziellen Aspekte des Spiels.
 * Kapselt Budget, Strafen, Belohnungen und das Kredit-System.
 */
export class BudgetManager {
    #gameState;
    
    constructor(gameState) {
        this.#gameState = gameState;
        // Initialisierung erfolgt nun via GameState Defaults oder init()
    }

    /**
     * Initialisiert das Budget für eine neue Mission.
     */
    init() {
        this.#gameState.budget = CONFIG.INITIAL_BUDGET;
        this.#gameState.hasActiveLoan = false;
        this.#gameState.loanInterestSteps = 0;
        this.#notifyChange();
    }

    /**
     * Lädt einen gespeicherten Finanz-Zustand.
     * @param {Object} savedState 
     */
    hydrate(savedState) {
        if (!savedState) return;
        this.#gameState.budget = savedState.budget ?? CONFIG.INITIAL_BUDGET;
        this.#gameState.hasActiveLoan = savedState.hasActiveLoan ?? false;
        this.#gameState.loanInterestSteps = savedState.loanInterestSteps ?? 0;
        this.#notifyChange();
    }

    // --- Getters ---

    get budget() { return this.#gameState.budget; }
    get hasActiveLoan() { return this.#gameState.hasActiveLoan; }
    get loanInterestSteps() { return this.#gameState.loanInterestSteps; }

    /**
     * Gibt den finanzspezifischen Teil des States zurück.
     */
    getFinanceState() {
        return {
            budget: this.#gameState.budget,
            hasActiveLoan: this.#gameState.hasActiveLoan,
            loanInterestSteps: this.#gameState.loanInterestSteps
        };
    }

    // --- Logik ---

    canAfford(amount) {
        return this.#gameState.budget >= amount;
    }

    addReward(amount) {
        const oldBudget = this.#gameState.budget;
        this.#gameState.budget += amount;
        this.#notifyChange(this.#gameState.budget - oldBudget);
    }

    deductBudget(amount) {
        const oldBudget = this.#gameState.budget;
        this.#gameState.budget = Math.max(0, this.#gameState.budget - amount);
        this.#notifyChange(this.#gameState.budget - oldBudget);
        
        if (this.#gameState.budget <= 0) {
            this.#handleInsolvency();
        }
    }

    /**
     * Spezielles Budget-Update für Animationen (Tick).
     * Verhindert schwere Full-State Broadcasts.
     */
    applyBudgetTick(newBudget, diff) {
        this.#gameState.budget = newBudget;
        eventBus.emit(EVENTS.BUDGET_TICK, { total: this.#gameState.budget, diff });
    }

    /**
     * Verarbeitet Zinsen für den laufenden Kredit bei jedem Schritt.
     */
    applyStepInterest() {
        if (this.#gameState.hasActiveLoan) {
            this.#gameState.loanInterestSteps += CONFIG.LOAN.STEP_INTEREST; 
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
        if (!this.#gameState.hasActiveLoan) return 0;

        const debt = CONFIG.LOAN.REPAYMENT_BASE + this.#gameState.loanInterestSteps; 
        this.#gameState.hasActiveLoan = false;
        this.#gameState.loanInterestSteps = 0;
        
        return debt;
    }

    handleAcceptLoan() {
        this.#gameState.budget = CONFIG.LOAN.AMOUNT; 
        this.#gameState.hasActiveLoan = true;
        this.#gameState.loanInterestSteps = 0;
        this.#notifyChange();
    }

    #handleInsolvency() {
        if (!this.#gameState.hasActiveLoan) {
            // Wenn pleite, aber noch kein Kredit: Angebot machen
            eventBus.emit(EVENTS.SHOW_DIALOG, {
                title: 'Pleite!',
                text: 'Du hast keinen Cent mehr in der Tasche. Ein alter Bekannter bietet dir einen Not-Kredit von 1.500 € an. Aber pass auf: Er will das Geld nach dem nächsten erfolgreichen Bruch mit Zinsen zurück!',
                buttons: [
                    { text: 'Kredit annehmen', event: EVENTS.ACCEPT_LOAN_OFFER },
                    { text: 'Aufgeben', event: EVENTS.RELOAD_GAME }
                ]
            });
        } else {
            // Wenn bereits verschuldet und pleite: Game Over
            eventBus.emit(EVENTS.PLAYER_BUSTED, { reason: 'BANKRUPTCY' });
        }
    }

    #notifyChange(diff = 0) {
        eventBus.emit(EVENTS.BUDGET_UPDATED, {
            total: this.#gameState.budget,
            diff: diff
        });
    }
}
