/**
 * EventBus - Ein leichtgewichtiger Pub/Sub-Mechanismus.
 * Kern-Architektur für lose gekoppelte Modulkommunikation.
 */
class EventBus {
    // Private Field für die strikte Kapselung (ES2022)
    #listeners = new Map();
    
    // Optionaler Debug-Modus für Performance- und Architektur-Tracking
    #debugMode = false;

    /**
     * Aktiviert oder deaktiviert den Debug-Modus.
     * @param {boolean} state 
     */
    setDebugMode(state) {
        this.#debugMode = Boolean(state);
    }

    /**
     * Registriert einen Callback für ein bestimmtes Event.
     * @param {string} event - Der Name des Events.
     * @param {Function} callback - Die auszuführende Funktion.
     * @returns {Function} Unsubscribe-Funktion, um den Listener sauber zu entfernen.
     * @throws {TypeError} Wenn Event-Name kein String oder Callback keine Funktion ist.
     */
    subscribe(event, callback) {
        if (typeof event !== 'string' || event.trim() === '') {
            throw new TypeError('EventBus: Event-Name muss ein nicht-leerer String sein.');
        }
        if (typeof callback !== 'function') {
            throw new TypeError(`EventBus: Callback für Event "${event}" muss eine Funktion sein.`);
        }

        if (!this.#listeners.has(event)) {
            this.#listeners.set(event, new Set());
        }
        this.#listeners.get(event).add(callback);

        if (this.#debugMode) {
            console.log(`[EventBus] Subscribed to "${event}"`);
        }

        // Return Unsubscribe-Funktion zur Memory-Leak Prävention
        return () => this.unsubscribe(event, callback);
    }

    /**
     * Entfernt einen spezifischen Callback für ein bestimmtes Event.
     * @param {string} event - Der Name des Events.
     * @param {Function} callback - Die zu entfernende Funktion.
     */
    unsubscribe(event, callback) {
        if (!this.#listeners.has(event)) return;
        
        const eventListeners = this.#listeners.get(event);
        const removed = eventListeners.delete(callback);

        if (this.#debugMode && removed) {
            console.log(`[EventBus] Unsubscribed from "${event}"`);
        }

        // Cleanup: Leeres Set entfernen, um Speicherplatz zu sparen
        if (eventListeners.size === 0) {
            this.#listeners.delete(event);
        }
    }

    /**
     * Entfernt alle Callbacks für ein bestimmtes Event oder den kompletten Bus.
     * @param {string} [event] - Optional. Wenn angegeben, wird nur dieses Event gecleart.
     */
    clear(event) {
        if (event) {
            this.#listeners.delete(event);
            if (this.#debugMode) console.log(`[EventBus] Cleared all listeners for "${event}"`);
        } else {
            this.#listeners.clear();
            if (this.#debugMode) console.log(`[EventBus] Cleared ALL events`);
        }
    }

    /**
     * Feuert ein Event und ruft alle registrierten Callbacks auf.
     * @param {string} event - Der Name des Events.
     * @param {any} [payload] - Die an die Callbacks zu übermittelnden Daten.
     */
    emit(event, payload = null) {
        if (this.#debugMode) {
            console.log(`[EventBus] Emitting "${event}"`, payload);
        }

        if (!this.#listeners.has(event)) return;

        const eventListeners = this.#listeners.get(event);
        
        // Iteration über alle Callbacks
        eventListeners.forEach(callback => {
            // Error Isolation: Fehler in einem Callback blockieren nicht die anderen
            try {
                callback(payload);
            } catch (err) {
                console.error(`[EventBus] Fehler im Callback für Event "${event}":`, err);
                if (this.#debugMode) {
                    console.error('Payload:', payload);
                    console.error('Stacktrace:', err.stack);
                }
            }
        });
    }
}

// Singleton Pattern: Nur eine Instanz global verfügbar machen und vor Modifikationen schützen
export const eventBus = Object.freeze(new EventBus());
