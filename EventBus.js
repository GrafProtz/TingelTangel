/**
 * EventBus - Zentraler Pub/Sub-Mechanismus für GridCrime.
 * 
 * Diese Klasse ermöglicht eine lose Kopplung zwischen den Spiel-Modulen.
 * Sie implementiert robuste Fehlerbehandlung, Memory-Leak-Prävention 
 * und ein striktes Singleton-Pattern via ES6 Module Caching.
 */
import { log } from './Utils.js';

class EventBus {
    /** @type {Map<string, Set<Function>>} */
    #listeners = new Map();
    
    /** @type {boolean} */
    #debug = false;

    constructor() {
        // Sicherstellung des Singletons bei direktem Aufruf (Defensive Programming)
        if (EventBus.instance) {
            return EventBus.instance;
        }
        EventBus.instance = this;
    }

    /**
     * Aktiviert das Logging für alle Events.
     * @param {boolean} value 
     */
    set debug(value) {
        this.#debug = !!value;
    }

    /**
     * Abonniert ein Event.
     * 
     * @param {string} event - Der Name des Events.
     * @param {Function} callback - Die Funktion, die bei Auslösung gerufen wird.
     * @returns {Function} Eine Unsubscribe-Funktion (Closure), um den Listener sauber zu entfernen.
     */
    subscribe(event, callback) {
        if (typeof callback !== 'function') {
            console.error(`[EventBus] Fehler: Callback für "${event}" ist keine Funktion.`);
            return () => {};
        }

        if (!this.#listeners.has(event)) {
            this.#listeners.set(event, new Set());
        }

        this.#listeners.get(event).add(callback);

        if (this.#debug) {
            console.debug(`[EventBus] + Subscriber für "${event}". Gesamt: ${this.#listeners.get(event).size}`);
        }

        // Closure-Pattern zur Memory-Leak-Prävention
        let isSubscribed = true;
        return () => {
            if (!isSubscribed) return;
            isSubscribed = false;
            this.#unsubscribe(event, callback);
        };
    }

    /**
     * Alias für subscribe (Common Pattern).
     */
    on(event, callback) {
        return this.subscribe(event, callback);
    }

    /**
     * Entfernt einen Listener intern.
     * @param {string} event 
     * @param {Function} callback 
     */
    #unsubscribe(event, callback) {
        const eventSet = this.#listeners.get(event);
        if (eventSet) {
            eventSet.delete(callback);
            if (eventSet.size === 0) {
                this.#listeners.delete(event);
            }
            if (this.#debug) {
                console.debug(`[EventBus] - Subscriber von "${event}" entfernt.`);
            }
        }
    }

    /**
     * Sendet ein Event an alle Abonnenten.
     * 
     * @param {string} event - Der Name des Events.
     * @param {any} [payload] - Optionale Daten für die Subscriber.
     */
    emit(event, payload = null) {
        const eventSet = this.#listeners.get(event);
        
        if (this.#debug) {
            console.groupCollapsed(`[EventBus] Emit: "${event}"`);
            log('Payload:', payload);
            log('Abonnenten:', eventSet ? eventSet.size : 0);
            console.groupEnd();
        }

        if (!eventSet || eventSet.size === 0) return;

        // Kopie des Sets erstellen, um Probleme bei Unsubscribes während des Iterierens zu vermeiden
        const currentListeners = [...eventSet];

        currentListeners.forEach(callback => {
            try {
                callback(payload);
            } catch (error) {
                // Robustheit: Fehler in einem Subscriber dürfen die Kette nicht unterbrechen
                console.error(
                    `[EventBus] KRITISCHER FEHLER in Subscriber für Event "${event}":`,
                    "\nFehler:", error.message,
                    "\nStack:", error.stack,
                    "\nPayload:", payload
                );
            }
        });
    }

    /**
     * Alias für emit (Common Pattern).
     */
    publish(event, payload) {
        this.emit(event, payload);
    }

    /**
     * Entfernt alle Listener (Nützlich für harten Reset).
     */
    clearAll() {
        this.#listeners.clear();
        if (this.#debug) console.warn('[EventBus] Alle Listener wurden gelöscht.');
    }
}

// Erzeuge die Singleton-Instanz
const instance = new EventBus();

// Friere die Instanz ein, um Manipulationen an der API zu verhindern
Object.freeze(instance);

// Exportiere die Instanz (ES6 Module Caching sorgt für Singleton-Verhalten)
export { instance as eventBus };
