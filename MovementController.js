import { eventBus } from './EventBus.js';
import { EVENTS } from './EventTypes.js';
import { CONFIG } from './GameConfig.js';
import { EncounterManager } from './EncounterManager.js';
import { log } from './Utils.js';

/**
 * MovementController – Verantwortlich für den gesamten Bewegungszyklus.
 *
 * ARCHITEKTUR:
 * - Empfängt ausschließlich Intent-Events von der UI (PLAYER_MOVE_INTENT).
 * - Validiert Züge über die MapData-Nachbarschaftslisten.
 * - Delegiert die rAF-Animation an die bestehende MovementEngine.
 * - Mutiert den GameState nur über dessen Reducer-API.
 * - Feuert nach Abschluss granulare Events (PLAYER_MOVED, STATE_UPDATED).
 *
 * Abhängigkeiten (Dependency Injection):
 * @param {GameState}      gameState      – Die Single Source of Truth.
 * @param {MovementEngine} movementEngine – Die Animations-Engine.
 * @param {MapData}        mapData        – Graphdaten für Nachbarschafts-Lookups.
 * @param {BudgetManager}  budgetManager  – Finanzverwaltung (Schritt-Kosten, Zinsen).
 */
export class MovementController {
    #gameState;
    #movementEngine;
    #mapData;
    #budgetManager;

    /** @type {Function[]} Unsubscribe-Handles für sauberes Teardown */
    #subscriptions = [];

    constructor({ gameState, movementEngine, mapData, budgetManager }) {
        this.#gameState      = gameState;
        this.#movementEngine = movementEngine;
        this.#mapData        = mapData;
        this.#budgetManager  = budgetManager;

        this.#registerListeners();
    }

    // ----------------------------------------------------------------
    //  Event-Registrierung
    // ----------------------------------------------------------------

    #registerListeners() {
        // Primärer Einsprungpunkt: UI feuert PLAYER_MOVE_INTENT
        this.#subscriptions.push(
            eventBus.subscribe(EVENTS.PLAYER_MOVE_INTENT, ({ targetId }) => {
                this.#handleMoveIntent(targetId);
            })
        );

        this.#subscriptions.push(
            eventBus.subscribe(EVENTS.INTENT_MOVE_PLAYER, ({ targetId }) => {
                this.#handleMoveIntent(targetId);
            })
        );

        // Fahrrad Auf-/Absteigen
        this.#subscriptions.push(
            eventBus.subscribe(EVENTS.TOGGLE_BICYCLE, () => {
                this.#handleToggleBicycle();
            })
        );
    }

    // ----------------------------------------------------------------
    //  Bewegungs-Validierung & Start
    // ----------------------------------------------------------------

    /**
     * Zentrale Methode: Empfängt den Intent, validiert und startet die Bewegung.
     * @param {string} targetId – Ziel-Knoten-ID aus dem Klick der UI.
     */
    #handleMoveIntent(targetId) {
        // Guard: Spiel muss aktiv und keine Bewegung laufend sein
        if (!this.#gameState.gameActive || this.#movementEngine.isMoving) return;

        // Kredit-Zinsen: Jeder Schritt kostet Zinsen, wenn Schulden bestehen
        this.#budgetManager.applyStepInterest();

        this.#movementEngine.moveTo(
            targetId,
            this.#gameState.currentPlayerNodeId,
            this.#gameState.isBiking,
            {
                currentBudget: this.#budgetManager.budget,
                onBudgetTick: (newBudget) => {
                    const diff = newBudget - this.#budgetManager.budget;
                    this.#budgetManager.applyBudgetTick(newBudget, diff);
                },
                onComplete:   (reachedId) => this.#finishMovement(reachedId)
            }
        );
    }

    // ----------------------------------------------------------------
    //  Post-Movement Pipeline
    // ----------------------------------------------------------------

    /**
     * Wird von der MovementEngine aufgerufen, sobald die rAF-Animation
     * abgeschlossen ist. Hier laufen alle Post-Move-Hooks sequenziell ab.
     * @param {string} reachedId – Die ID des Knotens, der erreicht wurde.
     */
    #finishMovement(reachedId) {
        // 1. Reisekosten berechnen (Etappe 6.6 Batching)
        const startId = this.#gameState.currentPlayerNodeId;
        const neighbors = this.#mapData.getNeighbors(startId, this.#gameState.isBiking);
        const neighbor = neighbors.find(nb => String(nb.id) === String(reachedId));
        
        let cost = 0;
        if (neighbor) {
            const edge = neighbor.edgeData;
            const costMultiplier = this.#gameState.isBiking ? 1.5 : 1.0;
            cost = Math.max(1, Math.ceil(edge.distance * CONFIG.COST_PER_METER * costMultiplier));
        }

        const newMoveCount = this.#gameState.moveCount + 1;
        eventBus.emit(EVENTS.MUTATE_STATE, { 
            currentPlayerNodeId: String(reachedId),
            moveCount: newMoveCount,
            budgetDelta: -cost
        });

        // 2. Info-Menü Zähler prüfen
        this.#handleInfoMenuMoveLogic();

        // 3. Tutorial-Trigger (einmalig)
        this.#handleFirstMoveLogic();

        // 4. Pub-Ankunfts-Check (delegiert an Game.js via Event)
        if (String(this.#gameState.currentPlayerNodeId) === String(this.#gameState.targetPubNodeId)) {
            eventBus.emit(EVENTS.INTENT_PUB_INTERACTION);
        }

        // 5. Zufalls-Begegnung (Etappe 6.9 Dev-Toggle Fix)
        if (!this.#gameState.devEncountersDisabled) {
            EncounterManager.checkAndTriggerEvent(this.#gameState.getState());
        }

        // 6. Broadcasts
        eventBus.emit(EVENTS.PLAYER_MOVED, this.#gameState.getState());
    }

    // ----------------------------------------------------------------
    //  Sub-Hooks (Info-Menü, Tutorial)
    // ----------------------------------------------------------------

    /**
     * Schließt das Info-Menü automatisch nach einer bestimmten Anzahl Züge.
     */
    #handleInfoMenuMoveLogic() {
        // Dirty-Check: Nichts tun, wenn das Menü bereits geschlossen und der Timer inaktiv ist (Etappe 6.7)
        if (!this.#gameState.isInfoMenuOpen && this.#gameState.infoMenuOpenUntilMove === -1) return;

        // Timer-Check: Warten, bis die Ziel-Anzahl an Zügen erreicht ist
        if (this.#gameState.moveCount < this.#gameState.infoMenuOpenUntilMove) return;

        eventBus.emit(EVENTS.MUTATE_STATE, { 
            isInfoMenuOpen: false,
            infoMenuOpenUntilMove: -1 
        });
        eventBus.emit(EVENTS.INFO_MENU_STATE, false);
    }

    /**
     * Feuert ein einmaliges Event nach dem allerersten Spielerzug.
     */
    #handleFirstMoveLogic() {
        if (this.#gameState.firstMoveFired) return;
        eventBus.emit(EVENTS.MUTATE_STATE, { firstMoveFired: true });
        eventBus.emit(EVENTS.FIRST_MOVE_COMPLETED);
    }

    // ----------------------------------------------------------------
    //  Fahrrad-Toggle
    // ----------------------------------------------------------------

    #handleToggleBicycle() {
        if (!this.#gameState.hasBicycle) return;

        const newState = !this.#gameState.isBiking;
        eventBus.emit(EVENTS.MUTATE_STATE, { isBiking: newState });

        const msg = newState
            ? 'Aufgestiegen. Du bist jetzt schneller.'
            : 'Abgestiegen. Du bist wieder zu Fuß unterwegs.';

        eventBus.emit(EVENTS.BIKING_STATE_CHANGED, newState);
        eventBus.emit(EVENTS.SHOW_TOAST, { message: msg, type: 'success' });
    }

    // ----------------------------------------------------------------
    //  Proximity Check (Public API für andere Controller)
    // ----------------------------------------------------------------

    /**
     * Prüft, ob der Spieler direkt auf oder neben einem Knoten steht.
     * @param {string|number} targetNodeId
     * @returns {boolean}
     */
    checkProximity(targetNodeId) {
        const currentId = String(this.#gameState.currentPlayerNodeId);
        const sid = String(targetNodeId);

        if (currentId === sid) return true;

        const neighbors = this.#mapData.getNeighbors(currentId, this.#gameState.isBiking);
        return neighbors.some(nb => String(nb.id) === sid);
    }

    // ----------------------------------------------------------------
    //  Helper
    // ----------------------------------------------------------------

    /**
     * Entfernt alle registrierten Event-Listener (für Tests / Cleanup).
     */
    destroy() {
        this.#subscriptions.forEach(unsub => unsub());
        this.#subscriptions = [];
        this.#movementEngine.stop();
    }
}
