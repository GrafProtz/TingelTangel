/**
 * EventBus - Ein leichtgewichtiger Pub/Sub-Mechanismus.
 * Ermöglicht die Kommunikation zwischen Modulen, ohne diese direkt zu koppeln.
 */
class EventBus {
    constructor() {
        this._listeners = new Map();
    }

    /**
     * Registriert einen Callback für ein bestimmtes Event.
     * @param {string} event - Der Name des Events
     * @param {Function} callback - Die auszuführende Funktion
     */
    subscribe(event, callback) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event).add(callback);
    }

    /**
     * Entfernt einen Callback für ein bestimmtes Event.
     * @param {string} event - Der Name des Events
     * @param {Function} callback - Die zu entfernende Funktion
     */
    unsubscribe(event, callback) {
        if (!this._listeners.has(event)) return;
        this._listeners.get(event).delete(callback);
    }

    /**
     * Feuert ein Event und ruft alle registrierten Callbacks auf.
     * @param {string} event - Der Name des Events
     * @param {any} payload - Die an die Callbacks zu übermittelnden Daten
     */
    emit(event, payload) {
        if (!this._listeners.has(event)) return;
        this._listeners.get(event).forEach(callback => {
            try {
                callback(payload);
            } catch (err) {
                console.error(`Fehler im EventBus-Callback für "${event}":`, err);
            }
        });
    }
}

// Globales Singleton für die App
export const eventBus = new EventBus();
