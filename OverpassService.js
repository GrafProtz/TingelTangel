/**
 * OverpassService.js - Netzwerk-Layer mit Caching, Retry und Validierung.
 */
import { eventBus } from './EventBus.js';
import { gameState, GamePhase } from './GameState.js';
import { OSMValidator } from './OSMValidator.js';

class OverpassService {
    #inMemoryCache = new Map();
    #pendingRequests = new Map();
    #endpoint = 'https://overpass-api.de/api/interpreter';
    #dbName = 'GridCrimeOSM';
    #storeName = 'osm_cache';
    #CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 Tage

    constructor() {
        if (OverpassService.instance) return OverpassService.instance;
        OverpassService.instance = this;
    }

    /**
     * Hauptmethode zum Laden von Stadtdaten.
     * Implementiert Request-Locking und Cache-Validierung.
     */
    async fetchCityData(coords) {
        const cacheKey = this.#generateCacheKey(coords);

        // 1. Request-Locking: Falls derselbe Bereich gerade geladen wird, hänge dich an das Promise
        if (this.#pendingRequests.has(cacheKey)) {
            console.log(`[OverpassService] Request-Lock aktiv für: ${cacheKey}`);
            return this.#pendingRequests.get(cacheKey);
        }

        const fetchPromise = this.#executeFetchFlow(coords, cacheKey);
        this.#pendingRequests.set(cacheKey, fetchPromise);

        try {
            return await fetchPromise;
        } finally {
            this.#pendingRequests.delete(cacheKey);
        }
    }

    async #executeFetchFlow(coords, cacheKey) {
        // 2. Cache-Check (Memory -> DB)
        const cachedData = await this.#getFromCache(cacheKey);
        if (cachedData) {
            this.#finalize(cachedData);
            return cachedData;
        }

        // 3. API Fetch
        gameState.setPhase(GamePhase.LOADING_MAP);
        eventBus.emit('API_FETCH_START', { coords });

        const query = this.#buildQuery(coords);

        try {
            const rawData = await this.#fetchWithRetry(query);
            const cleanData = OSMValidator.validate(rawData);
            
            await this.#saveToCache(cacheKey, cleanData);
            this.#finalize(cleanData);
            return cleanData;
        } catch (error) {
            console.error("[OverpassService] API-Fehler:", error);
            eventBus.emit('SHOW_TOAST', { msg: "Verbindung fehlgeschlagen.", type: 'fail' });
            gameState.setPhase(GamePhase.INIT);
            throw error;
        }
    }

    #generateCacheKey(coords) {
        const range = 0.008;
        const s = coords[0] - range, w = coords[1] - range;
        const n = coords[0] + range, e = coords[1] + range;
        return `osm_${s.toFixed(3)}_${w.toFixed(3)}_${n.toFixed(3)}_${e.toFixed(3)}`;
    }

    #buildQuery(coords) {
        const range = 0.008;
        const s = coords[0] - range, w = coords[1] - range;
        const n = coords[0] + range, e = coords[1] + range;
        return `[out:json][timeout:60];(way["highway"](${s},${w},${n},${e});node["amenity"~"pub|bar|restaurant"](${s},${w},${n},${e});node["amenity"~"police|police_station"](${s},${w},${n},${e});way["building"](${s},${w},${n},${e});node["shop"="hairdresser"](${s},${w},${n},${e});node["amenity"="bicycle_parking"](${s},${w},${n},${e}););(._;>;);out body center;`;
    }

    async #getFromCache(cacheKey) {
        // Memory-Check
        if (this.#inMemoryCache.has(cacheKey)) return this.#inMemoryCache.get(cacheKey);

        // Persistent Check (IndexedDB)
        try {
            const db = await this.#getDB();
            return new Promise((resolve) => {
                const tx = db.transaction(this.#storeName, 'readonly');
                const store = tx.objectStore(this.#storeName);
                const req = store.get(cacheKey);
                req.onsuccess = () => {
                    if (req.result) {
                        const age = Date.now() - req.result.timestamp;
                        if (age < this.#CACHE_TTL_MS) {
                            this.#inMemoryCache.set(cacheKey, req.result.data);
                            resolve(req.result.data);
                            return;
                        }
                        console.log(`[OverpassService] Cache abgelaufen für: ${cacheKey}`);
                    }
                    resolve(null);
                };
                req.onerror = () => resolve(null);
            });
        } catch (e) {
            return null;
        }
    }

    async #saveToCache(cacheKey, data) {
        this.#inMemoryCache.set(cacheKey, data);
        try {
            const db = await this.#getDB();
            const tx = db.transaction(this.#storeName, 'readwrite');
            tx.objectStore(this.#storeName).put({
                cacheKey,
                data,
                timestamp: Date.now()
            });
        } catch (e) {
            console.warn("[OverpassService] Cache-Speicherung fehlgeschlagen", e);
        }
    }

    async #getDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.#dbName, 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.#storeName)) {
                    db.createObjectStore(this.#storeName, { keyPath: 'cacheKey' });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
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
