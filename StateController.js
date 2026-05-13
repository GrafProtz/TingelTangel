import { eventBus } from './EventBus.js';
import { EVENTS } from './EventTypes.js';
import { GameState } from './GameState.js';
import { CONFIG } from './GameConfig.js';
import { log } from './Utils.js';

/**
 * StateController - Zentraler Waechter ueber den GameState (Single Source of Truth).
 * Verarbeitet Mutationen via Events und garantiert die Konsistenz.
 */
export class StateController {
    #state;
    #subscriptions = [];

    constructor() {
        this.#state = new GameState();
        
        // Initialisierung des Startzustands (analog zu Game.js startMission)
        this.#state.budget = CONFIG.INITIAL_BUDGET || 300;
        
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
     * Wendet Aenderungen auf den State an und benachrichtigt die Aussenwelt.
     * @param {Object} delta - Die zu aendernden Felder
     */
    #handleMutation(delta) {
        if (!delta || typeof delta !== 'object') return;

        log('[StateController] Mutation:', delta);

        // Felder auf den State anwenden
        Object.entries(delta).forEach(([key, value]) => {
            if (key === 'newLogEntry') {
                this.#state.addLogEntry(value);
            } else if (key in this.#state) {
                this.#state[key] = value;
            } else {
                // Fallback fuer private Felder via Setter (GameState nutzt Setter)
                try {
                    this.#state[key] = value;
                } catch (e) {
                    console.warn(`[StateController] Feld ${key} konnte nicht gesetzt werden.`);
                }
            }
        });

        // Broadcast des neuen Gesamt-Zustands
        eventBus.emit(EVENTS.GAME_STATE_CHANGED, this.#state.getState());
    }

    /**
     * Gibt den aktuellen State fuer Lesezugriffe (z.B. Initialisierung) zurueck.
     */
    getState() {
        return this.#state.getState();
    }

    /**
     * Liefert die Instanz des GameState (NUR ZUM LESEN).
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
