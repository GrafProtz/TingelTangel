/**
 * OverpassService.js - Netzwerk-Layer mit Caching, Retry und Validierung.
 */
import { eventBus } from './EventBus.js';
import { gameState, GamePhase } from './GameState.js';
import { OSMValidator } from './OSMValidator.js';

class OverpassService {
    #cache = new Map();
    #endpoint = 'https://overpass-api.de/api/interpreter';
    
    constructor() {
        if (OverpassService.instance) return OverpassService.instance;
        OverpassService.instance = this;
    }

    async fetchCityData(coords) {
        const range = 0.008;
        const s = coords[0] - range, w = coords[1] - range;
        const n = coords[0] + range, e = coords[1] + range;
        const cacheKey = `${s.toFixed(3)}_${w.toFixed(3)}_${n.toFixed(3)}_${e.toFixed(3)}`;
        
        if (this.#cache.has(cacheKey)) {
            const data = this.#cache.get(cacheKey);
            this.#finalize(data);
            return data;
        }

        gameState.setPhase(GamePhase.LOADING_MAP);
        eventBus.emit('API_FETCH_START', { coords });

        const query = `[out:json][timeout:60];(way["highway"](${s},${w},${n},${e});node["amenity"~"pub|bar|restaurant"](${s},${w},${n},${e});node["amenity"~"police|police_station"](${s},${w},${n},${e});way["building"](${s},${w},${n},${e});node["shop"="hairdresser"](${s},${w},${n},${e});node["amenity"="bicycle_parking"](${s},${w},${n},${e}););(._;>;);out body center;`;

        try {
            const rawData = await this.#fetchWithRetry(query);
            const cleanData = OSMValidator.validate(rawData);
            
            this.#cache.set(cacheKey, cleanData);
            this.#finalize(cleanData);
            return cleanData;
        } catch (error) {
            console.error("[OverpassService] API-Fehler:", error);
            eventBus.emit('SHOW_TOAST', { msg: "Verbindung fehlgeschlagen.", type: 'fail' });
            gameState.setPhase(GamePhase.INIT);
            throw error;
        }
    }

    async #fetchWithRetry(query, maxRetries = 3) {
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await fetch(this.#endpoint, {
                    method: 'POST',
                    body: 'data=' + encodeURIComponent(query)
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return await response.json();
            } catch (error) {
                lastError = error;
                if (attempt < maxRetries) await new Promise(res => setTimeout(res, Math.pow(2, attempt) * 1000));
            }
        }
        throw lastError;
    }

    #finalize(data) {
        eventBus.emit('DATA_LOADED', data);
        gameState.setPhase(GamePhase.READY);
    }
}

export const overpassService = new OverpassService();
