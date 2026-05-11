import { eventBus } from './EventBus.js';
import { log } from './Utils.js';

/**
 * SaveManager - Verwaltet persistente Spielstände (pro Stadt) im localStorage.
 * Agiert vollständig entkoppelt via EventBus.
 */
export class SaveManager {
    #debounceTimer = null;
    #currentCity = null;

    constructor() {
        this.#setupListeners();
    }

    #setupListeners() {
        // Horcht auf jede Änderung des Game-States für Auto-Save
        eventBus.subscribe('GAME_STATE_CHANGED', (state) => {
            if (!this.#currentCity || !state.gameActive) return;
            this.#triggerAutoSave(state);
        });

        // Horcht auf das Ende des Spiels, um den Speicherstand zu löschen
        eventBus.subscribe('GAME_OVER', () => {
            this.deleteSave(this.#currentCity);
        });
    }

    setCurrentCity(cityName) {
        this.#currentCity = cityName;
    }

    #getStorageKey(cityName) {
        return `tingeltangel_save_${cityName.replace(/\s+/g, '_')}`;
    }

    /**
     * Führt einen asynchronen, debounced Auto-Save durch.
     */
    #triggerAutoSave(state) {
        if (this.#debounceTimer) {
            clearTimeout(this.#debounceTimer);
        }

        this.#debounceTimer = setTimeout(() => {
            try {
                const key = this.#getStorageKey(this.#currentCity);
                localStorage.setItem(key, JSON.stringify(state));
                eventBus.emit('SAVE_COMPLETED');
                log(`[SaveManager] Auto-Save für ${this.#currentCity} erfolgreich.`);
            } catch (err) {
                console.error('[SaveManager] Auto-Save fehlgeschlagen:', err);
            }
        }, 1000); // 1 Sekunde Debounce
    }

    /**
     * Prüft, ob ein Spielstand für die angegebene Stadt existiert.
     */
    hasSave(cityName) {
        if (!cityName) return false;
        return localStorage.getItem(this.#getStorageKey(cityName)) !== null;
    }

    /**
     * Lädt den Spielstand für die angegebene Stadt.
     */
    loadSave(cityName) {
        if (!cityName) return null;
        try {
            const data = localStorage.getItem(this.#getStorageKey(cityName));
            return data ? JSON.parse(data) : null;
        } catch (err) {
            console.error('[SaveManager] Fehler beim Laden des Spielstands:', err);
            return null;
        }
    }

    /**
     * Löscht den Spielstand für die angegebene Stadt.
     */
    deleteSave(cityName) {
        if (!cityName) return;
        localStorage.removeItem(this.#getStorageKey(cityName));
        log(`[SaveManager] Savegame für ${cityName} gelöscht.`);
    }
}
