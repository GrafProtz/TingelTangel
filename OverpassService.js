/**
 * OverpassService.js - Zentraler Netzwerk-Layer mit Caching, Retry und OSM-Härtung.
 * Konsolidiert alle API-Aufrufe und verwaltet den IndexedDB Cache.
 */
import { eventBus } from './EventBus.js';
import { OSMValidator } from './OSMValidator.js';
import { EVENTS } from './EventTypes.js';
import { log } from './Utils.js';

class OverpassService {
    #dbName = 'GridCrimeOSM';
    #storeName = 'osm_cache';
    #CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 Tage
    #endpoint = 'https://overpass-api.de/api/interpreter';
    
    /** @type {Map<string, Promise>} Request-Locking gegen Mehrfach-Loads */
    #pendingRequests = new Map();

    constructor() {
        if (OverpassService.instance) return OverpassService.instance;
        OverpassService.instance = this;
    }

    /**
     * Hauptmethode zum Laden von Stadtdaten.
     * Implementiert Cache-Check, Fetch-Retry und OSM-Validierung.
     */
    async fetchCityData(coords) {
        const cacheKey = this.#generateCacheKey(coords);

        // 1. Request-Locking (De-Duplizierung)
        if (this.#pendingRequests.has(cacheKey)) {
            log(`[OverpassService] Bestehender Request erkannt für: ${cacheKey}`);
            return this.#pendingRequests.get(cacheKey);
        }

        const fetchPromise = this.#executeFlow(coords, cacheKey);
        this.#pendingRequests.set(cacheKey, fetchPromise);

        try {
            return await fetchPromise;
        } finally {
            this.#pendingRequests.delete(cacheKey);
        }
    }

    async #executeFlow(coords, cacheKey) {
        // 2. Cache-Check
        const cached = await this.#getFromCache(cacheKey);
        if (cached) {
            log(`[OverpassService] Cache-Hit für ${cacheKey}`);
            return cached;
        }

        // 3. API Fetch mit Retry-Logik
        eventBus.emit(EVENTS.MAP_LOAD_PROGRESS, { stage: 'download', progress: 0, message: 'Lade Stadt-Daten von OSM...' });
        
        const query = this.#buildQuery(coords);
        
        try {
            const rawData = await this.#fetchWithRetry(query);
            
            // 4. Strikte Middleware: Validierung & Sanitizing
            eventBus.emit(EVENTS.MAP_LOAD_PROGRESS, { stage: 'parsing', progress: 0, message: 'Härte Daten (XSS-Schutz)...' });
            const cleanData = OSMValidator.validate(rawData);
            
            // 5. Caching
            await this.#saveToCache(cacheKey, cleanData);
            
            return cleanData;
        } catch (error) {
            console.error("[OverpassService] Kritischer Ladefehler:", error);
            eventBus.emit(EVENTS.MAP_LOAD_ERROR, { error: error.message });
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
        return `[out:json][timeout:60];(
            way["highway"](${s},${w},${n},${e});
            node["amenity"~"pub|bar|restaurant"](${s},${w},${n},${e});
            way["amenity"~"pub|bar|restaurant"](${s},${w},${n},${e});
            node["amenity"~"police|police_station"](${s},${w},${n},${e});
            way["amenity"~"police|police_station"](${s},${w},${n},${e});
            way["building"](${s},${w},${n},${e});
            node["shop"="hairdresser"](${s},${w},${n},${e});
            way["shop"="hairdresser"](${s},${w},${n},${e});
            node["amenity"="bicycle_parking"](${s},${w},${n},${e});
            way["amenity"="bicycle_parking"](${s},${w},${n},${e});
            relation["amenity"~"police|police_station"](${s},${w},${n},${e});
            node["office"="government"]["government"="police"](${s},${w},${n},${e});
            way["office"="government"]["government"="police"](${s},${w},${n},${e});
            relation["office"="government"]["government"="police"](${s},${w},${n},${e});
        );(._;>;);out body center;`;
    }

    async #fetchWithRetry(query, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(this.#endpoint, {
                    method: 'POST',
                    body: 'data=' + encodeURIComponent(query)
                });

                if (response.status === 429 || response.status === 504) {
                    log(`[OverpassService] Server beschäftigt (${response.status}), Retry ${i+1}/${retries}...`);
                    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
                    continue;
                }

                if (!response.ok) throw new Error(`Overpass API Error: ${response.status}`);
                return await response.json();
            } catch (err) {
                if (i === retries - 1) throw err;
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    // --- IndexedDB Cache Logic ---

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

    async #getFromCache(cacheKey) {
        try {
            const db = await this.#getDB();
            return new Promise((resolve) => {
                const tx = db.transaction(this.#storeName, 'readonly');
                const store = tx.objectStore(this.#storeName);
                const req = store.get(cacheKey);
                req.onsuccess = () => {
                    if (req.result && (Date.now() - req.result.timestamp < this.#CACHE_TTL_MS)) {
                        resolve(req.result.data);
                    } else {
                        resolve(null);
                    }
                };
                req.onerror = () => resolve(null);
            });
        } catch (e) {
            return null;
        }
    }

    async #saveToCache(cacheKey, data) {
        try {
            const db = await this.#getDB();
            const tx = db.transaction(this.#storeName, 'readwrite');
            tx.objectStore(this.#storeName).put({
                cacheKey,
                data,
                timestamp: Date.now()
            });
        } catch (e) {
            console.warn("[OverpassService] Cache-Save fehlgeschlagen:", e);
        }
    }
}

export const overpassService = new OverpassService();
