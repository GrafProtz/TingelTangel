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
            eventBus.subscribe(EVENTS.CMD_MUTATE_STATE, (delta) => {
                console.groupCollapsed(`[Tracer] CMD_MUTATE_STATE: ${Object.keys(delta || {}).join(', ')}`);
                console.table(delta);
                console.groupEnd();
            })
        );

        this.#subscriptions.push(
            eventBus.subscribe(EVENTS.STATE_GAME_CHANGED, (state) => {
                console.groupCollapsed(`[Tracer] STATE_GAME_CHANGED`);
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
