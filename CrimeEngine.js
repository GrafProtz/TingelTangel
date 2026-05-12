import { eventBus } from './EventBus.js';
import { EVENTS } from './EventTypes.js';
import { DialogFactory } from './DialogFactory.js';

/**
 * CrimeEngine - Orchestriert die Logik von Einbrüchen und Diebstählen.
 * Koordiniert Risiko-Checks und Belohnungs-Events.
 */
export class CrimeEngine {
    #gameState;
    #economyEngine;

    constructor(gameState, economyEngine) {
        this.#gameState = gameState;
        this.#economyEngine = economyEngine;
        this.#setupListeners();
    }

    #setupListeners() {
        eventBus.subscribe(EVENTS.START_BURGLARY, (payload) => this.#handleBurglary(payload));
        eventBus.subscribe(EVENTS.START_BICYCLE_THEFT_RNG, (payload) => this.#handleBicycleTheft(payload));
    }

    #handleBurglary({ target, riskData }) {
        // Verzögerung für Spannung
        setTimeout(() => {
            // 1. Abbruch-Check (Mechanischer Widerstand)
            if (Math.random() * 100 <= riskData.abortRate) {
                eventBus.emit(EVENTS.SHOW_DIALOG, DialogFactory.getBurglaryAbort());
                this.#resetCrimeState();
                return;
            }

            // 2. Risiko-Check (Erwischt werden)
            if (Math.random() * 100 <= riskData.totalRisk) {
                const fine = Math.ceil(this.#gameState.budget * 0.2);
                eventBus.emit(EVENTS.DEDUCT_BUDGET, fine);
                eventBus.emit(EVENTS.SHOW_DIALOG, DialogFactory.getBurglaryCaught(fine));
            } else {
                // 3. Erfolg
                this.#handleBurglarySuccess(riskData);
            }
            this.#resetCrimeState();
        }, 800);
    }

    #handleBurglarySuccess(riskData) {
        // Loot berechnen (basierend auf Min/Max in riskData)
        let amount = Math.floor(riskData.minLoot + Math.random() * (riskData.maxLoot - riskData.minLoot));
        let loanInfo = "";
        
        if (this.#gameState.hasActiveLoan) {
            const debt = this.#economyEngine.processLoanRepayment();
            amount = Math.max(0, amount - debt);
            loanInfo = `<br><br><span style="color:var(--color-danger); font-size:0.9rem;">Rückzahlung an die Innung: ${debt} € wurden einbehalten.</span>`;
            eventBus.emit(EVENTS.REMOVE_LOG_ENTRY, { logId: 'loan-entry' });
        }

        eventBus.emit(EVENTS.ADD_REWARD, amount);
        eventBus.emit(EVENTS.SHOW_DIALOG, DialogFactory.getBurglarySuccess(amount, loanInfo));
    }

    #handleBicycleTheft({ target, riskData }) {
        eventBus.emit(EVENTS.ADD_LOG_ENTRY, { 
            shortText: "Knackversuch läuft...", 
            logId: 'bicycle-theft-progress' 
        });

        setTimeout(() => {
            if (Math.random() * 100 > riskData.totalRisk) {
                this.#gameState.isBiking = true;
                this.#gameState.hasBicycle = true;
                
                eventBus.emit(EVENTS.BIKING_STATE_CHANGED, true);
                eventBus.emit(EVENTS.SHOW_DIALOG, DialogFactory.getBicycleTheftSuccess());
                eventBus.emit(EVENTS.ADD_LOG_ENTRY, { shortText: "✅ Fahrrad geklaut.", notify: true });
            } else {
                const fine = Math.ceil(this.#gameState.budget * 0.1);
                eventBus.emit(EVENTS.DEDUCT_BUDGET, fine);
                eventBus.emit(EVENTS.SHOW_DIALOG, DialogFactory.getBicycleTheftFailure(fine));
                eventBus.emit(EVENTS.ADD_LOG_ENTRY, { shortText: "🚨 Erwischt!", notify: true });
            }
            
            this.#gameState.activeBicycleTargets = [];
            eventBus.emit(EVENTS.REMOVE_LOG_ENTRY, { logId: 'bicycle-theft-progress' });
            eventBus.emit(EVENTS.TARGETS_UPDATED, this.#gameState.collectState());
        }, 1000);
    }

    #resetCrimeState() {
        this.#gameState.activeCrimeTargets = [];
        this.#gameState.isDisguised = false;
        this.#gameState.missionPhase = 1;
        eventBus.emit(EVENTS.RESUME_GAME);
        eventBus.emit(EVENTS.TARGETS_UPDATED, this.#gameState.collectState());
    }
}
