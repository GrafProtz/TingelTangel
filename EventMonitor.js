/**
 * EventMonitor.js - Diagnose-Werkzeug zur Überwachung des EventBus-Traffics.
 * 
 * Bietet volle Sichtbarkeit über alle abgefeuerten Events, Zeitstempel und Payloads.
 * Steuerung erfolgt über das globale Flag: window.GRIDCRIME_DEBUG_EVENTS = true/false
 */
import { eventBus } from './EventBus.js';

class EventMonitor {
    constructor() {
        // Initialisierung des Debug-Flags in window (Default: false)
        if (typeof window.GRIDCRIME_DEBUG_EVENTS === 'undefined') {
            window.GRIDCRIME_DEBUG_EVENTS = false;
        }

        this.#init();
    }

    #init() {
        console.log('%c[EventMonitor] Initialisiert. Nutze window.GRIDCRIME_DEBUG_EVENTS = true zum Loggen.', 'color: #00ff00; font-weight: bold;');

        // Einklinken in den EventBus via die neue globale Subscription
        eventBus.subscribeToAll((eventName, payload) => {
            if (window.GRIDCRIME_DEBUG_EVENTS) {
                this.#logEvent(eventName, payload);
            }
        });
    }

    /**
     * Formatiert und loggt das Event in die Konsole.
     * @param {string} eventName 
     * @param {any} payload 
     */
    #logEvent(eventName, payload) {
        const timestamp = performance.now().toFixed(2);
        const color = this.#getEventColor(eventName);

        console.groupCollapsed(
            `%c[EVENT] %c${timestamp}ms %c${eventName}`,
            'color: #888;',
            'color: #00bcd4;',
            `color: ${color}; font-weight: bold;`
        );
        
        if (payload !== null && typeof payload !== 'undefined') {
            console.log('Payload:', payload);
        } else {
            console.log('Payload: (keine Daten)');
        }
        
        // Stacktrace für Ursprungs-Analyse (optional, aber extrem wertvoll bei Race Conditions)
        // console.trace('Source:'); 

        console.groupEnd();
    }

    /**
     * Gibt eine Farbe basierend auf der Domäne des Events zurück (für bessere Scanbarkeit).
     * @param {string} name 
     */
    #getEventColor(name) {
        if (name.startsWith('GAME:')) return '#ff9800'; // Orange
        if (name.startsWith('PLAYER:')) return '#4caf50'; // Green
        if (name.startsWith('MAP:')) return '#2196f3'; // Blue
        if (name.startsWith('UI:')) return '#9c27b0'; // Purple
        if (name.startsWith('MISSION:')) return '#f44336'; // Red
        return '#ffffff';
    }
}

// Singleton Instanziierung
export const eventMonitor = new EventMonitor();
