import { eventBus } from './EventBus.js';
import { EVENTS } from './EventTypes.js';
import { CONFIG } from './GameConfig.js';
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
            eventBus.subscribe(EVENTS.CMD_START_BURGLARY, (payload) => {
                this.#handleBurglary(payload);
            })
        );

        // --- Fahrraddiebstahl (RNG-Phase) ---
        this.#subscriptions.push(
            eventBus.subscribe(EVENTS.CMD_START_BICYCLE_THEFT, (payload) => {
                this.#handleBicycleTheftRNG(payload);
            })
        );

        // --- Kategorie-Auswahl (Ziel-Spawning) ---
        const categoryMap = {
            [EVENTS.ACTION_SELECT_RESIDENTIAL]: 'residential',
            [EVENTS.ACTION_SELECT_COMMERCIAL]:  'commercial',
            [EVENTS.ACTION_SELECT_PUBLIC]:       'public',
            [EVENTS.ACTION_SELECT_ALLOTMENTS]:   'allotments'
        };

        Object.entries(categoryMap).forEach(([event, type]) => {
            this.#subscriptions.push(
                eventBus.subscribe(event, () => {
                    eventBus.emit(EVENTS.CMD_SPAWN_TARGETS, {
                        targetType: type,
                        centerNodeId: this.#gameState.currentPlayerNodeId
                    });
                    this.#setGameActive(true);
                })
            );
        });

        // --- Intent Events (Etappe 5) ---
        this.#subscriptions.push(
            eventBus.subscribe(EVENTS.CMD_SET_CRIME_TARGETS, ({ targets }) => {
                this.setCrimeTargets(targets);
            })
        );

        this.#subscriptions.push(
            eventBus.subscribe(EVENTS.CMD_SCOUT_TARGET, ({ target }) => {
                const playerIdStr = String(this.#gameState.currentPlayerNodeId);
                const targetIdStr = String(target.accessNodeId || target.id);
                
                // Hole Nachbarn des Spielers für Umkreisprüfung (Etappe 5.3.2)
                const neighbors = this.#mapData.getNeighbors(playerIdStr);
                const isNear = (playerIdStr === targetIdStr) || 
                               neighbors.some(n => String(n.id) === targetIdStr);
                
                if (!isNear) {
                    eventBus.emit(EVENTS.UI_SHOW_TOAST, { message: "Du musst exakt am Icon stehen!", type: 'fail' });
                    return;
                }
                
                eventBus.emit(EVENTS.CMD_MUTATE_STATE, { gameActive: false });
                eventBus.emit(EVENTS.SYS_GAME_PAUSED);
                
                const riskData = this.calculateTargetRisk(target);
                eventBus.emit(EVENTS.UI_OPEN_SCOUTING_REPORT, { target, riskData });
            })
        );

        this.#subscriptions.push(
            eventBus.subscribe(EVENTS.CMD_BICYCLE_TARGET, ({ target }) => {
                const playerIdStr = String(this.#gameState.currentPlayerNodeId);
                const targetIdStr = String(target.accessNodeId || target.id);
                
                const neighbors = this.#mapData.getNeighbors(playerIdStr);
                const isNear = (playerIdStr === targetIdStr) || 
                               neighbors.some(n => String(n.id) === targetIdStr);
                
                if (!isNear) {
                    eventBus.emit(EVENTS.UI_SHOW_TOAST, { message: "Steh direkt am Rad, um es zu knacken!", type: 'fail' });
                    return;
                }
                const riskData = this.calculateTargetRisk(target);
                eventBus.emit(EVENTS.NOTIFY_BICYCLE_INTERACTION, { target, riskData });
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
                eventBus.emit(EVENTS.NOTIFY_BURGLARY_RESOLVED, {
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

                eventBus.emit(EVENTS.NOTIFY_BURGLARY_RESOLVED, {
                    outcome: 'caught',
                    fine,
                    target
                });
                this.#resetBurglaryState();
                return;
            }

            // 3. Erfolg!
            const baseLoot = this.#calculateBaseLoot(target);
            
            // Finanzen & Kredit-Inkasso an EconomyController delegieren
            eventBus.emit(EVENTS.NOTIFY_BURGLARY_SUCCESS, { 
                baseLoot, 
                target, 
                riskData 
            });

            this.#resetBurglaryState();
        }, 500);
    }

    /**
     * Berechnet die Basis-Beute basierend auf dem Immobilientyp.
     * @param {Object} target 
     * @returns {number}
     */
    #calculateBaseLoot(target) {
        const category = target.type || 'residential';
        const stats = CONFIG.RISK.CATEGORY_STATS[category] || CONFIG.RISK.CATEGORY_STATS.residential;
        const range = stats.maxLoot - stats.minLoot;
        return stats.minLoot + Math.floor(Math.random() * range);
    }

    /**
     * Setzt den State nach einem Einbruch zurück (egal ob Erfolg/Fail).
     */
    #resetBurglaryState() {
        eventBus.emit(EVENTS.CMD_MUTATE_STATE, {
            activeCrimeTargets: [],
            isDisguised: false,
            missionPhase: 1
        });

        eventBus.emit(EVENTS.STATE_MISSION_CHANGED, {
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
        eventBus.emit(EVENTS.CMD_ADD_LOG_ENTRY, {
            shortText: 'Knackversuch läuft...',
            logId: 'bicycle-theft-progress',
            notify: false
        });

        const success = Math.random() * 100 > riskData.totalRisk;

        if (success) {
            eventBus.emit(EVENTS.CMD_MUTATE_STATE, { isBiking: true, hasBicycle: true });

            eventBus.emit(EVENTS.STATE_BIKING_CHANGED, true);
            eventBus.emit(EVENTS.CMD_REMOVE_LOG_ENTRY, { logId: 'goal-steal-bicycle' });
            eventBus.emit(EVENTS.CMD_REMOVE_LOG_ENTRY, { logId: 'bicycle-theft-progress' });
            eventBus.emit(EVENTS.CMD_ADD_LOG_ENTRY, { shortText: '✅ Fahrrad erfolgreich geklaut.', notify: true });
        } else {
            const fine = Math.ceil(this.#budgetManager.budget * CONFIG.ECONOMY.FINE_FACTOR_BICYCLE);
            this.#budgetManager.deductBudget(fine);

            eventBus.emit(EVENTS.CMD_REMOVE_LOG_ENTRY, { logId: 'bicycle-theft-progress' });
            eventBus.emit(EVENTS.CMD_ADD_LOG_ENTRY, { shortText: '🚨 Beim Fahrraddiebstahl erwischt!', notify: true });
        }

        // Daten-Event für die UI-Schicht
        eventBus.emit(EVENTS.NOTIFY_BICYCLE_THEFT_RESOLVED, {
            outcome: success ? 'success' : 'caught',
            fine: success ? 0 : Math.ceil(this.#budgetManager.budget * CONFIG.ECONOMY.FINE_FACTOR_BICYCLE),
            target
        });

        eventBus.emit(EVENTS.CMD_MUTATE_STATE, { activeBicycleTargets: [] });
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
        const riskData = this.#riskCalculator.calculateTargetRisk(
            targetNode,
            this.#gameState.isDisguised
        );

        // Loot-Range hier hinzufügen, da der RiskCalculator nur noch Risiken berechnet
        const category = targetNode.type || 'residential';
        const stats = CONFIG.RISK.CATEGORY_STATS[category] || CONFIG.RISK.CATEGORY_STATS.residential;

        return { 
            ...riskData, 
            minLoot: stats.minLoot, 
            maxLoot: stats.maxLoot 
        };
    }

    /**
     * Berechnet die Einbruchsziele und wechselt in die nächste Missionsphase.
     * @param {Array} targets
     */
    setCrimeTargets(targets) {
        eventBus.emit(EVENTS.CMD_MUTATE_STATE, { 
            activeCrimeTargets: targets,
            missionPhase: 3 
        });

        eventBus.emit(EVENTS.STATE_MISSION_CHANGED, {
            phase: 3,
            moveCount: this.#gameState.moveCount
        });
        eventBus.emit(EVENTS.STATE_TARGETS_UPDATED, this.#gameState.getState());
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
        eventBus.emit(EVENTS.CMD_MUTATE_STATE, { gameActive: active });
        if (active) {
            eventBus.emit(EVENTS.SYS_GAME_RESUMED);
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
