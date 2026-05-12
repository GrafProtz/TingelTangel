/**
 * EventBus - Zentraler Pub/Sub-Mechanismus für GridCrime.
 * Ermöglicht die lose Kopplung zwischen Logic-Engines und View-Komponenten.
 */
class EventBus {
    /** @type {Map<string, Set<Function>>} */
    #listeners = new Map();
    
    /** @type {boolean} */
    #debug = false;

    /**
     * Aktiviert das Logging für alle Events.
     */
    set debug(value) {
        this.#debug = !!value;
    }

    /**
     * Abonniert ein Event.
     * @param {string} event - Der Name des Events.
     * @param {Function} callback - Die Funktion, die bei Auslösung gerufen wird.
     * @returns {Function} Eine Unsubscribe-Funktion, um den Listener sauber zu entfernen.
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

        // Unsubscribe-Funktion zurückgeben
        return () => this.#unsubscribe(event, callback);
    }

    /** Alias für subscribe */
    on(event, callback) {
        return this.subscribe(event, callback);
    }

    /**
     * Entfernt einen Listener.
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
     * @param {string} event - Der Name des Events.
     * @param {any} [payload] - Optionale Daten für die Subscriber.
     */
    emit(event, payload = null) {
        const eventSet = this.#listeners.get(event);
        
        if (this.#debug) {
            console.groupCollapsed(`[EventBus] Emit: "${event}"`);
            console.log('Payload:', payload);
            console.groupEnd();
        }

        if (!eventSet || eventSet.size === 0) return;

        // Kopie erstellen, um Concurrent Modification zu vermeiden
        const currentListeners = [...eventSet];

        currentListeners.forEach(callback => {
            try {
                callback(payload);
            } catch (error) {
                console.error(
                    `[EventBus] KRITISCHER FEHLER in Subscriber für Event "${event}":`,
                    error.message,
                    payload
                );
            }
        });
    }

    /** Alias für emit */
    publish(event, payload) {
        this.emit(event, payload);
    }

    /**
     * Entfernt alle Listener (Harter Reset).
     */
    clearAll() {
        this.#listeners.clear();
        if (this.#debug) console.warn('[EventBus] Alle Listener wurden gelöscht.');
    }
}

// Singleton-Instanz exportieren
const eventBus = new EventBus();
Object.freeze(eventBus);
export { eventBus };
