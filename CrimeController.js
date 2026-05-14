import { eventBus } from './EventBus.js';
import { EVENTS } from './EventTypes.js';
import { log } from './Utils.js';

/**
 * CrimeController – Verwaltet die gesamte Einbruchs- und Diebstahl-Logik.
 *
 * ARCHITEKTUR:
 * - 100% UI-agnostisch: Kein HTML, kein DOM, keine DialogFactory-Aufrufe.
 * - Empfängt Intent-Events → berechnet Ergebnis → feuert Daten-Events.
 * - Die UI-Schicht (UIManager/DialogFactory) lauscht auf die Daten-Events
 *   und rendert daraus die passenden Dialoge.
 *
 * Abhängigkeiten (Dependency Injection):
 * @param {GameState}      gameState      – Single Source of Truth.
 * @param {RiskCalculator} riskCalculator – Risiko-Berechnungen.
 * @param {BudgetManager}  budgetManager  – Finanzlogik.
 * @param {MapData}        mapData        – Geodaten für Target-Spawning.
 */
export class CrimeController {
    #gameState;
    #riskCalculator;
    #budgetManager;
    #mapData;

    /** @type {Function[]} Unsubscribe-Handles für sauberes Teardown */
    #subscriptions = [];

    constructor({ gameState, riskCalculator, budgetManager, mapData }) {
        this.#gameState      = gameState;
        this.#riskCalculator = riskCalculator;
        this.#budgetManager  = budgetManager;
        this.#mapData        = mapData;

        this.#registerListeners();
    }

    // ================================================================
    //  Event-Registrierung
    // ================================================================

    #registerListeners() {
        // --- Einbruch ---
        this.#subscriptions.push(
            eventBus.subscribe(EVENTS.START_BURGLARY, (payload) => {
                this.#handleBurglary(payload);
            })
        );

        // --- Fahrraddiebstahl (RNG-Phase) ---
        this.#subscriptions.push(
            eventBus.subscribe(EVENTS.START_BICYCLE_THEFT_RNG, (payload) => {
                this.#handleBicycleTheftRNG(payload);
            })
        );

        // --- Kategorie-Auswahl (Ziel-Spawning) ---
        const categoryMap = {
            [EVENTS.SELECT_CATEGORY_RESIDENTIAL]: 'residential',
            [EVENTS.SELECT_CATEGORY_COMMERCIAL]:  'commercial',
            [EVENTS.SELECT_CATEGORY_PUBLIC]:       'public',
            [EVENTS.SELECT_CATEGORY_ALLOTMENTS]:   'allotments'
        };

        Object.entries(categoryMap).forEach(([event, type]) => {
            this.#subscriptions.push(
                eventBus.subscribe(event, () => {
                    eventBus.emit(EVENTS.SPAWN_TARGETS, {
                        targetType: type,
                        centerNodeId: this.#gameState.currentPlayerNodeId
                    });
                    this.#setGameActive(true);
                })
            );
        });

        // --- Intent Events (Etappe 5) ---
        this.#subscriptions.push(
            eventBus.subscribe(EVENTS.INTENT_SET_CRIME_TARGETS, ({ targets }) => {
                this.setCrimeTargets(targets);
            })
        );

        this.#subscriptions.push(
            eventBus.subscribe(EVENTS.INTENT_SCOUT_TARGET, ({ target }) => {
                const playerIdStr = String(this.#gameState.currentPlayerNodeId);
                const targetIdStr = String(target.accessNodeId || target.id);
                
                // Hole Nachbarn des Spielers für Umkreisprüfung (Etappe 5.3.2)
                const neighbors = this.#mapData.getNeighbors(playerIdStr);
                const isNear = (playerIdStr === targetIdStr) || 
                               neighbors.some(n => String(n.id) === targetIdStr);
                
                if (!isNear) {
                    eventBus.emit(EVENTS.SHOW_TOAST, { message: "Du musst exakt am Icon stehen!", type: 'fail' });
                    return;
                }
                
                eventBus.emit(EVENTS.MUTATE_STATE, { gameActive: false });
                eventBus.emit(EVENTS.GAME_PAUSED);
                
                const riskData = this.calculateTargetRisk(target);
                eventBus.emit(EVENTS.OPEN_SCOUTING_REPORT, { target, riskData });
            })
        );

        this.#subscriptions.push(
            eventBus.subscribe(EVENTS.INTENT_BICYCLE_TARGET, ({ target }) => {
                const playerIdStr = String(this.#gameState.currentPlayerNodeId);
                const targetIdStr = String(target.accessNodeId || target.id);
                
                const neighbors = this.#mapData.getNeighbors(playerIdStr);
                const isNear = (playerIdStr === targetIdStr) || 
                               neighbors.some(n => String(n.id) === targetIdStr);
                
                if (!isNear) {
                    eventBus.emit(EVENTS.SHOW_TOAST, { message: "Steh direkt am Rad, um es zu knacken!", type: 'fail' });
                    return;
                }
                const riskData = this.calculateTargetRisk(target);
                eventBus.emit(EVENTS.BICYCLE_INTERACTION_READY, { target, riskData });
            })
        );
    }

    // ================================================================
    //  Einbruch-Logik (UI-agnostisch)
    // ================================================================

    /**
     * Berechnet das Ergebnis eines Einbruchs und feuert ein reines Daten-Event.
     * Die UI lauscht auf BURGLARY_RESOLVED und rendert dann den Dialog.
     */
    #handleBurglary({ target, riskData }) {
        setTimeout(() => {
            // 1. Abbruch-Check (mechanische Sicherungen)
            if (Math.random() * 100 <= riskData.abortRate) {
                eventBus.emit(EVENTS.BURGLARY_RESOLVED, {
                    outcome: 'aborted',
                    target
                });
                this.#resetBurglaryState();
                return;
            }

            // 2. Risiko-Check (Entdeckung)
            if (Math.random() * 100 <= riskData.totalRisk) {
                const fine = Math.ceil(this.#budgetManager.budget * CONFIG.ECONOMY.FINE_FACTOR_BURGLARY);
                this.#budgetManager.deductBudget(fine);

                eventBus.emit(EVENTS.BURGLARY_RESOLVED, {
                    outcome: 'caught',
                    fine,
                    target
                });
                this.#resetBurglaryState();
                return;
            }

            // 3. Erfolg!
            const result = this.#calculateBurglarySuccess(riskData);

            eventBus.emit(EVENTS.BURGLARY_RESOLVED, {
                outcome: 'success',
                loot: result.netLoot,
                loanRepaid: result.loanRepaid,
                debtAmount: result.debtAmount,
                target
            });
            this.#resetBurglaryState();
        }, 500);
    }

    /**
     * Berechnet Beute und ggf. Kredit-Rückzahlung.
     * Gibt ein reines Datenobjekt zurück – kein HTML.
     */
    #calculateBurglarySuccess(riskData) {
        let amount = this.#budgetManager.calculateLoot(riskData);
        let loanRepaid = false;
        let debtAmount = 0;

        if (this.#budgetManager.hasActiveLoan) {
            debtAmount = this.#budgetManager.processLoanRepayment();
            amount = Math.max(0, amount - debtAmount);
            loanRepaid = true;
            eventBus.emit(EVENTS.REMOVE_LOG_ENTRY, { logId: 'loan-entry' });
        }

        this.#budgetManager.addReward(amount);

        return { netLoot: amount, loanRepaid, debtAmount };
    }

    /**
     * Setzt den State nach einem Einbruch zurück (egal ob Erfolg/Fail).
     */
    #resetBurglaryState() {
        eventBus.emit(EVENTS.MUTATE_STATE, {
            activeCrimeTargets: [],
            isDisguised: false,
            missionPhase: 1
        });

        eventBus.emit(EVENTS.MISSION_STATE_CHANGED, {
            phase: 1,
            moveCount: this.#gameState.moveCount
        });

        this.#setGameActive(true);
    }

    // ================================================================
    //  Fahrraddiebstahl-Logik (UI-agnostisch)
    // ================================================================

    /**
     * Verarbeitet den RNG-Check beim Fahrraddiebstahl.
     * Feuert BICYCLE_THEFT_RESOLVED mit dem Ergebnis.
     */
    #handleBicycleTheftRNG({ target, riskData }) {
        eventBus.emit(EVENTS.ADD_LOG_ENTRY, {
            shortText: 'Knackversuch läuft...',
            logId: 'bicycle-theft-progress',
            notify: false
        });

        const success = Math.random() * 100 > riskData.totalRisk;

        if (success) {
            eventBus.emit(EVENTS.MUTATE_STATE, { isBiking: true, hasBicycle: true });

            eventBus.emit(EVENTS.BIKING_STATE_CHANGED, true);
            eventBus.emit(EVENTS.REMOVE_LOG_ENTRY, { logId: 'goal-steal-bicycle' });
            eventBus.emit(EVENTS.REMOVE_LOG_ENTRY, { logId: 'bicycle-theft-progress' });
            eventBus.emit(EVENTS.ADD_LOG_ENTRY, { shortText: '✅ Fahrrad erfolgreich geklaut.', notify: true });
        } else {
            const fine = Math.ceil(this.#budgetManager.budget * CONFIG.ECONOMY.FINE_FACTOR_BICYCLE);
            this.#budgetManager.deductBudget(fine);

            eventBus.emit(EVENTS.REMOVE_LOG_ENTRY, { logId: 'bicycle-theft-progress' });
            eventBus.emit(EVENTS.ADD_LOG_ENTRY, { shortText: '🚨 Beim Fahrraddiebstahl erwischt!', notify: true });
        }

        // Daten-Event für die UI-Schicht
        eventBus.emit(EVENTS.BICYCLE_THEFT_RESOLVED, {
            outcome: success ? 'success' : 'caught',
            fine: success ? 0 : Math.ceil(this.#budgetManager.budget * CONFIG.ECONOMY.FINE_FACTOR_BICYCLE),
            target
        });

        eventBus.emit(EVENTS.MUTATE_STATE, { activeBicycleTargets: [] });
    }

    // ================================================================
    //  Public API (für Game.js / main.js Bridging)
    // ================================================================

    /**
     * Berechnet das detaillierte Risiko für ein Ziel.
     * @param {Object} targetNode
     * @returns {Object} riskData
     */
    calculateTargetRisk(targetNode) {
        return this.#riskCalculator.calculateTargetRisk(
            targetNode,
            this.#gameState.isDisguised
        );
    }

    /**
     * Berechnet den Loot basierend auf riskData.
     * @param {Object} riskData
     * @returns {number}
     */
    calculateLoot(riskData) {
        return this.#budgetManager.calculateLoot(riskData);
    }

    /**
     * Setzt die Einbruchsziele und wechselt in die nächste Missionsphase.
     * @param {Array} targets
     */
    setCrimeTargets(targets) {
        eventBus.emit(EVENTS.MUTATE_STATE, { 
            activeCrimeTargets: targets,
            missionPhase: 3 
        });

        eventBus.emit(EVENTS.MISSION_STATE_CHANGED, {
            phase: 3,
            moveCount: this.#gameState.moveCount
        });
        eventBus.emit(EVENTS.TARGETS_UPDATED, this.#gameState.getState());
    }

    /**
     * Liefert die reinen Daten für einen Einbruch (ohne HTML) zurück.
     * @param {string} targetId
     * @returns {Object|null}
     */
    getBurglaryData(targetId) {
        const target = this.#gameState.activeCrimeTargets
            ? this.#gameState.activeCrimeTargets.find(t => t.id === targetId)
            : null;
        if (!target) return null;

        const riskData = this.#riskCalculator.getPoliceRiskModifier([target.lat, target.lon]);

        const typeConfig = CONFIG.RISK.CATEGORY_STATS[target.type] || CONFIG.RISK.CATEGORY_STATS.residential;
        const mult = typeConfig.mult;

        return {
            target,
            riskData,
            mult,
            isDisguised: this.#gameState.isDisguised
        };
    }

    // ================================================================
    //  Helpers
    // ================================================================

    #setGameActive(active) {
        eventBus.emit(EVENTS.MUTATE_STATE, { gameActive: active });
        if (active) {
            eventBus.emit(EVENTS.GAME_RESUMED);
        }
    }

    /**
     * Entfernt alle registrierten Event-Listener (Tests / Cleanup).
     */
    destroy() {
        this.#subscriptions.forEach(unsub => unsub());
        this.#subscriptions = [];
    }
}
