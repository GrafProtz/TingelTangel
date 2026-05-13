import { eventBus } from './EventBus.js';
import { EVENTS } from './EventTypes.js';
import { GameState } from './GameState.js';
import { CONFIG } from './GameConfig.js';
import { log } from './Utils.js';

/**
 * StateController - Zentraler Waechter ueber den GameState (Single Source of Truth).
 * Verarbeitet Mutationen via Events und garantiert die Konsistenz.
 * 
 * ARCHITEKTUR-UPDATE (Etappe 3): 
 * Implementiert Event-Batching via Microtask-Queue. Mutationen werden synchron 
 * auf den GameState angewendet (verhindert State-Tearing bei synchronen Getter-Aufrufen), 
 * aber das GAME_STATE_CHANGED Event wird nur einmal pro Execution-Tick gefeuert.
 */
export class StateController {
    #state;
    #subscriptions = [];
    #batchPending = false;

    constructor() {
        this.#state = new GameState();
        
        // Initialisierung des Startzustands
        this.#state.mutate({ budget: CONFIG.INITIAL_BUDGET || 300 });
        
        this.#registerListeners();
        log('[StateController] Initialisiert.');
    }

    #registerListeners() {
        // Der einzige Weg, den State zu aendern
        this.#subscriptions.push(
            eventBus.subscribe(EVENTS.MUTATE_STATE, (delta) => this.#handleMutation(delta))
        );
    }

    /**
     * Wendet Aenderungen synchron auf den State an und batcht das Change-Event.
     * @param {Object} delta - Die zu aendernden Felder
     */
    #handleMutation(delta) {
        if (!delta || typeof delta !== 'object') return;

        log('[StateController] Mutation:', delta);

        // 1. Synchrone Anwendung: Garantiert, dass controller.getState() 
        // direkt im Anschluss an einen Emit die neuen Werte liefert.
        this.#state.mutate(delta);

        // 2. Event-Batching via Microtask: Verhindert Event-Kaskaden, 
        // wenn mehrere MUTATE_STATE Events nacheinander abgefeuert werden.
        if (!this.#batchPending) {
            this.#batchPending = true;
            Promise.resolve().then(() => {
                this.#batchPending = false;
                eventBus.emit(EVENTS.GAME_STATE_CHANGED, this.#state.getState());
            });
        }
    }

    /**
     * Gibt den aktuellen State fuer Lesezugriffe zurueck.
     * Liefert nun ein tief gefrorenes Objekt (Object.freeze aus GameState),
     * was unbeabsichtigte Manipulationen unmoeglich macht.
     */
    getState() {
        return this.#state.getState();
    }

    /**
     * Liefert die Instanz des GameState (NUR ZUM LESEN, z.B. fuer Getter).
     * Da Setter entfernt wurden, ist dies nun sicher.
     */
    getStateInstance() {
        return this.#state;
    }

    /**
     * Ermoeglicht Hydrierung (Laden von Spielstaenden).
     */
    hydrate(data) {
        this.#state.hydrate(data);
        eventBus.emit(EVENTS.GAME_STATE_CHANGED, this.#state.getState());
    }

    destroy() {
        this.#subscriptions.forEach(unsub => unsub());
        this.#subscriptions = [];
        log('[StateController] Zerstoert.');
    }
}
