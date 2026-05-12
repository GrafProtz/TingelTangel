import { eventBus } from './EventBus.js';
import { EVENTS } from './EventTypes.js';
import { CONFIG } from './GameConfig.js';

/**
 * EconomyEngine - Verwaltet alle finanziellen Transaktionen und das Kreditsystem.
 * Kommuniziert via EventBus und aktualisiert den GameState.
 */
export class EconomyEngine {
    #gameState;

    constructor(gameState) {
        this.#gameState = gameState;
        this.#setupListeners();
    }

    #setupListeners() {
        eventBus.subscribe(EVENTS.ADD_REWARD, (amount) => this.addReward(amount));
        eventBus.subscribe(EVENTS.DEDUCT_BUDGET, (amount) => this.deductBudget(amount));
        eventBus.subscribe(EVENTS.ACCEPT_LOAN_OFFER, () => this.handleAcceptLoan());
        
        // Zinsen werden nach jedem Zug berechnet
        eventBus.subscribe(EVENTS.PLAYER_MOVED, () => this.applyStepInterest());
    }

    addReward(amount) {
        this.#gameState.budget += amount;
        this.#notifyChange(amount);
    }

    deductBudget(amount) {
        const oldBudget = this.#gameState.budget;
        this.#gameState.budget = Math.max(0, oldBudget - amount);
        this.#notifyChange(this.#gameState.budget - oldBudget);
        
        if (this.#gameState.budget <= 0) {
            this.#handleInsolvency();
        }
    }

    applyStepInterest() {
        if (this.#gameState.hasActiveLoan) {
            this.#gameState.loanInterestSteps += 1; // 1 € pro Schritt
        }
    }

    processLoanRepayment() {
        if (!this.#gameState.hasActiveLoan) return 0;

        const debt = 2000 + this.#gameState.loanInterestSteps; 
        this.#gameState.hasActiveLoan = false;
        this.#gameState.loanInterestSteps = 0;
        
        return debt;
    }

    handleAcceptLoan() {
        this.#gameState.budget = 1500;
        this.#gameState.hasActiveLoan = true;
        this.#gameState.loanInterestSteps = 0;
        eventBus.emit(EVENTS.ADD_LOG_ENTRY, { 
            shortText: "Not-Kredit erhalten: 1500 € (Zinsen laufen...)", 
            logId: 'loan-entry', 
            notify: true 
        });
        this.#notifyChange();
    }

    #handleInsolvency() {
        if (!this.#gameState.hasActiveLoan) {
            eventBus.emit(EVENTS.SHOW_DIALOG, {
                title: 'Pleite!',
                text: 'Du hast keinen Cent mehr. Ein alter Bekannter bietet dir einen Not-Kredit von 1.500 € an. Rückzahlung nach dem nächsten Bruch!',
                buttons: [
                    { text: 'Kredit annehmen', event: EVENTS.ACCEPT_LOAN_OFFER },
                    { text: 'Aufgeben', event: EVENTS.RELOAD_GAME }
                ]
            });
        } else {
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
