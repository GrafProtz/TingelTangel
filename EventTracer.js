import { eventBus } from './EventBus.js';
import { EVENTS } from './EventTypes.js';

/**
 * EventTracer - Analysiert und loggt den asynchronen Datenfluss im System,
 * ohne die eigentlichen Controller mit Logging-Logik zu belasten.
 */
export class EventTracer {
    #subscriptions = [];
    #debugMode = true;

    constructor(debugMode = true) {
        this.#debugMode = debugMode;
    }

    init() {
        if (!this.#debugMode) return;

        this.#subscriptions.push(
            eventBus.subscribe(EVENTS.MUTATE_STATE, (delta) => {
                console.groupCollapsed(`[Tracer] MUTATE_STATE: ${Object.keys(delta || {}).join(', ')}`);
                console.table(delta);
                console.groupEnd();
            })
        );

        this.#subscriptions.push(
            eventBus.subscribe(EVENTS.GAME_STATE_CHANGED, (state) => {
                console.groupCollapsed(`[Tracer] GAME_STATE_CHANGED`);
                console.log(state);
                console.groupEnd();
            })
        );
    }

    destroy() {
        this.#subscriptions.forEach(unsub => unsub());
        this.#subscriptions = [];
    }
}
