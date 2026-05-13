import { CONFIG } from './GameConfig.js';
import { eventBus } from './EventBus.js';
import { EVENTS } from './EventTypes.js';
import { log } from './Utils.js';
import { overpassService } from './OverpassService.js';

/**
 * MapData - Der Data-Layer der Engine.
 * Zuständig für Graph-Building, Spatial Indexing und POI-Management.
 */
class MapData {
    #nodes = new Map();
    #ways = new Map();
    #pubs = [];
    #policeStations = [];
    #hairdressers = [];
    #bicycleParkings = [];
    #macroGraph = new Map();
    #spatialIndex = new Map();
    #gridSize = 0.001;

    #abortController = null;
    
    // Max ms pro Frame für Time-Slicing
    #YIELD_THRESHOLD_MS = 15;

    constructor() {
        this.cityName = '';
    }

    getBicycleParkings() {
        return this.#bicycleParkings;
    }

    async #yieldToMain() {
        return new Promise(resolve => setTimeout(resolve, 0));
    }

    // ----------------------------------------------------------------
    //  Laden
    // ----------------------------------------------------------------

    /**
     * Lädt Stadtdaten über den zentralen OverpassService.
     * @param {Array} coords - [lat, lon]
     */
    async loadCityData(coords) {
        eventBus.emit(EVENTS.MAP_LOAD_START, { message: 'Prüfe Datenquelle...' });

        try {
            // Die gesamte Netzwerk- und Caching-Logik liegt nun im OverpassService
            const data = await overpassService.fetchCityData(coords);

            if (!data || !data.elements) {
                throw new Error('Ungültige Kartendaten empfangen.');
            }

            // Lokales Parsing und Graph-Building (mit Time-Slicing)
            await this.#parseOSMData(data);
            await this.#buildMacroGraph();

            if (this.#macroGraph.size === 0) {
                throw new Error('Keine befahrbaren Straßen im gewählten Bereich gefunden.');
            }

            eventBus.emit(EVENTS.MAP_LOAD_SUCCESS);
            log(`MapData: "${this.cityName}" erfolgreich geladen und verarbeitet.`);

        } catch (err) {
            console.error('MapData.loadCityData Fehler:', err);
            // Das Error-Event wird bereits teilweise vom Service gefeuert, 
            // aber wir fangen hier App-spezifische Graph-Fehler ab.
            if (!err.message.includes('Aborted')) {
                eventBus.emit(EVENTS.MAP_LOAD_ERROR, { error: err.message });
            }
            throw err;
        }
    }

    // ----------------------------------------------------------------
    //  Parsing mit Time-Slicing
    // ----------------------------------------------------------------

    async #parseOSMData(data) {
        eventBus.emit(EVENTS.MAP_LOAD_PROGRESS, { stage: 'parsing', progress: 0, message: 'Verarbeite Kartendaten...' });
        
        this.#nodes.clear();
        this.#ways.clear();
        this.#pubs = [];
        this.#policeStations = [];
        this.#spatialIndex.clear();
        this.#macroGraph.clear();
        this.#hairdressers = [];
        this.#bicycleParkings = [];

        const total = data.elements.length;
        let lastYield = performance.now();

        for (let i = 0; i < total; i++) {
            const el = data.elements[i];
            const safeId = String(el.id);
            const amenity  = el.tags?.amenity;
            const building = el.tags?.building;
            const police   = el.tags?.police;
            const office   = el.tags?.office;
            const gov      = el.tags?.government;

            const isPolice = (
                amenity === 'police' ||
                amenity === 'police_station' ||
                building === 'police' ||
                police !== undefined ||
                (office === 'government' && gov === 'police')
            );
            const isPub = (amenity === 'pub' || amenity === 'bar' || amenity === 'restaurant');
            const isHairdresser = (el.tags?.shop === 'hairdresser');
            const isBicycleParking = (amenity === 'bicycle_parking');

            if (el.type === 'node') {
                const nd = { ...el, id: safeId };
                this.#nodes.set(safeId, nd);
                this.#addToSpatialIndex(nd);
                if (isPub) this.#pubs.push(nd);
                if (isPolice) this.#policeStations.push({ lat: el.lat, lon: el.lon });
                if (isHairdresser) this.#hairdressers.push(nd);
                if (isBicycleParking) this.#bicycleParkings.push(nd);

            } else if (el.type === 'way') {
                this.#ways.set(safeId, el);
                const cLat = el.center?.lat ?? this.#nodes.get(String(el.nodes?.[0]))?.lat;
                const cLon = el.center?.lon ?? this.#nodes.get(String(el.nodes?.[0]))?.lon;
                if (isPub && cLat != null) {
                    this.#pubs.push({ ...el, lat: cLat, lon: cLon, id: safeId });
                }
                if (isHairdresser && cLat != null) {
                    this.#hairdressers.push({ ...el, lat: cLat, lon: cLon, id: safeId });
                }
                if (isBicycleParking && cLat != null) {
                    this.#bicycleParkings.push({ ...el, lat: cLat, lon: cLon, id: safeId });
                }
                if (isPolice && cLat != null) {
                    this.#policeStations.push({ lat: cLat, lon: cLon });
                }

            } else if (el.type === 'relation') {
                const cLat = el.center?.lat;
                const cLon = el.center?.lon;
                if (isPolice && cLat != null) {
                    this.#policeStations.push({ lat: cLat, lon: cLon });
                }
            }

            // Time-Slicing
            if (performance.now() - lastYield > this.#YIELD_THRESHOLD_MS) {
                eventBus.emit(EVENTS.MAP_LOAD_PROGRESS, { stage: 'parsing', progress: Math.round((i / total) * 100), message: 'Verarbeite Kartendaten...' });
                await this.#yieldToMain();
                lastYield = performance.now();
            }
        }


        log(`MapData: ${this.#policeStations.length} Polizeistationen erfasst.`);
    }

    // ----------------------------------------------------------------
    //  Makro-Graph mit Time-Slicing
    // ----------------------------------------------------------------

    async #buildMacroGraph() {
        eventBus.emit(EVENTS.MAP_LOAD_PROGRESS, { stage: 'graph', progress: 0, message: 'Erstelle Wegenetz...' });
        
        // 1. Zähle, wie oft jeder Knoten in allen Wegen vorkommt
        const nodeUsage = new Map();
        
        let lastYield = performance.now();
        const waysArray = Array.from(this.#ways.values());
        
        for (let i = 0; i < waysArray.length; i++) {
            const way = waysArray[i];
            if (!way.tags?.highway) continue;
            
            way.nodes.forEach(rawId => {
                const id = String(rawId);
                nodeUsage.set(id, (nodeUsage.get(id) || 0) + 1);
            });

            if (performance.now() - lastYield > this.#YIELD_THRESHOLD_MS) {
                await this.#yieldToMain();
                lastYield = performance.now();
            }
        }

        // 2. Entscheidungsknoten-Check
        const isDecision = (id, way, idx) => {
            if (nodeUsage.get(id) > 1) return true;
            if (idx === 0 || idx === way.nodes.length - 1) return true;
            return false;
        };

        // 3. Wege durchlaufen und Segmente zwischen Entscheidungsknoten bilden
        for (let i = 0; i < waysArray.length; i++) {
            const way = waysArray[i];
            if (!way.tags?.highway) continue;

            const ids = way.nodes.map(n => String(n));

            let lastDecision = ids[0];
            let pathCoords   = [];
            let segDist      = 0;

            for (let j = 1; j < ids.length; j++) {
                const prev = this.#nodes.get(ids[j - 1]);
                const curr = this.#nodes.get(ids[j]);
                if (!prev || !curr) continue;

                segDist += this.calculateDistance(prev, curr);
                pathCoords.push([curr.lat, curr.lon]);

                if (isDecision(ids[j], way, j)) {
                    this.#addMacroEdge(lastDecision, ids[j], pathCoords, segDist);
                    this.#addMacroEdge(ids[j], lastDecision, [...pathCoords].reverse(), segDist);

                    lastDecision = ids[j];
                    pathCoords   = [];
                    segDist      = 0;
                }
            }

            if (performance.now() - lastYield > this.#YIELD_THRESHOLD_MS) {
                eventBus.emit(EVENTS.MAP_LOAD_PROGRESS, { stage: 'graph', progress: Math.round((i / waysArray.length) * 100), message: 'Erstelle Wegenetz...' });
                await this.#yieldToMain();
                lastYield = performance.now();
            }
        }
    }

    #addMacroEdge(from, to, path, dist) {
        if (from === to) return;
        if (!this.#macroGraph.has(from)) this.#macroGraph.set(from, []);

        const list = this.#macroGraph.get(from);
        const existing = list.find(e => e.to === to);
        if (existing) {
            if (dist < existing.distance) {
                existing.path = path;
                existing.distance = dist;
            }
        } else {
            list.push({ to, path, distance: dist });
        }
    }

    // ----------------------------------------------------------------
    //  Haversine (Meter)
    // ----------------------------------------------------------------

    calculateDistance(a, b) {
        const R   = 6_371_000;
        const toR = Math.PI / 180;
        const dLat = (b.lat - a.lat) * toR;
        const dLon = (b.lon - a.lon) * toR;
        const s = Math.sin(dLat / 2) ** 2 +
                  Math.cos(a.lat * toR) * Math.cos(b.lat * toR) *
                  Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
    }

    // ----------------------------------------------------------------
    //  Spatial Index
    // ----------------------------------------------------------------

    #addToSpatialIndex(node) {
        const key = this.#gridKey(node.lat, node.lon);
        if (!this.#spatialIndex.has(key)) this.#spatialIndex.set(key, []);
        this.#spatialIndex.get(key).push(node.id);
    }

    #gridKey(lat, lon) {
        return `${Math.floor(lat / this.#gridSize)}_${Math.floor(lon / this.#gridSize)}`;
    }

    /**
     * Findet den nächsten Straßenknoten zur angeklickten Kartenposition.
     * Nutzt eine 3x3 Grid-Suche.
     */
    getNearestNode(lat, lon) {
        const baseRow = Math.floor(lat / this.#gridSize);
        const baseCol = Math.floor(lon / this.#gridSize);

        let best = null, bestD = Infinity;

        // Smart Spatial Query: Prüfe Zielzelle + 8 Nachbarn
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const key = `${baseRow + dr}_${baseCol + dc}`;
                const ids = this.#spatialIndex.get(key) || [];
                
                for (const id of ids) {
                    const n = this.#nodes.get(id);
                    if (!n) continue;
                    
                    const d = (n.lat - lat) ** 2 + (n.lon - lon) ** 2;
                    if (d < bestD) {
                        bestD = d;
                        best = n;
                    }
                }
            }
        }

        return best;
    }

    /**
     * Spezialisierte Suche für Missions-Ziele: Findet den nächsten Knoten,
     * der tatsächlich Teil des navigierbaren Graphen ist.
     * Inklusive kaskadierendem Fallback bei Randlagen.
     */
    findNearestGraphNode(lat, lon) {
        const baseRow = Math.floor(lat / this.#gridSize);
        const baseCol = Math.floor(lon / this.#gridSize);

        let best = null, bestD = Infinity;

        // 1. Suche in der 3x3 Umgebung
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const key = `${baseRow + dr}_${baseCol + dc}`;
                const ids = this.#spatialIndex.get(key) || [];
                
                for (const id of ids) {
                    if (!this.#macroGraph.has(id)) continue;
                    const n = this.#nodes.get(id);
                    if (!n) continue;
                    
                    const d = (n.lat - lat) ** 2 + (n.lon - lon) ** 2;
                    if (d < bestD) {
                        bestD = d;
                        best = n;
                    }
                }
            }
        }

        // 2. Fallback: Wenn in der Zelle nichts gefunden wurde, Full-Search im Graphen
        // (Da der MacroGraph nur Kreuzungen enthält, ist die Performance vertretbar)
        if (!best) {
            console.warn('MapData: Kein Graph-Knoten im Grid gefunden, starte Fallback-Suche...');
            this.#macroGraph.forEach((edges, id) => {
                const n = this.#nodes.get(id);
                if (!n) return;
                const d = (n.lat - lat) ** 2 + (n.lon - lon) ** 2;
                if (d < bestD) {
                    bestD = d;
                    best = n;
                }
            });
        }

        return best;
    }

    // ----------------------------------------------------------------
    //  Öffentliche API (Kapselung)
    // ----------------------------------------------------------------

    getPoliceStations() {
        return [...this.#policeStations];
    }

    getHairdressers() {
        return [...this.#hairdressers];
    }

    /** Gibt alle Knoten-IDs zurück, die Teil des navigierbaren Wegenetzes sind. */
    getConnectedNodeIds() {
        return Array.from(this.#macroGraph.keys());
    }

    /** Filtert Ways (Gebäude) nach Typ-Tags. */
    getBuildingsByTags(allowedTags) {
        const result = [];
        this.#ways.forEach(way => {
            const bTag = way.tags?.building;
            if (bTag && allowedTags.includes(bTag)) {
                result.push(way);
            }
        });
        return result;
    }

    getNode(id) {
        return this.#nodes.get(String(id));
    }

    getNeighbors(id, isBiking = false) {
        const startId = String(id);
        const edges1 = this.#macroGraph.get(startId);
        if (!edges1) return [];

        const results = new Map();

        // Tiefe 1
        edges1.forEach(edge1 => {
            const node = this.#nodes.get(edge1.to);
            if (node) {
                results.set(edge1.to, { 
                    ...node, 
                    edgeData: { ...edge1 } 
                });
            }
        });

        // Tiefe 2
        if (isBiking) {
            edges1.forEach(edge1 => {
                const intermediateId = edge1.to;
                const edges2 = this.#macroGraph.get(intermediateId);
                if (!edges2) return;

                edges2.forEach(edge2 => {
                    const targetId = edge2.to;
                    
                    // Strikte Filterung: 
                    // 1. Nicht zum Start zurück
                    if (targetId === startId) return;
                    
                    // 2. Wenn bereits in Tiefe 1 vorhanden, direkten Weg bevorzugen
                    if (results.has(targetId)) return;

                    const node = this.#nodes.get(targetId);
                    if (node) {
                        // Pfad-Verkettung & Distanz-Summe
                        // path1 endet beim Ziel, path2 startet beim Ziel+1 (Dank MacroGraph-Logik)
                        const combinedPath = edge1.path.concat(edge2.path);
                        
                        results.set(targetId, {
                            ...node,
                            edgeData: {
                                to: targetId,
                                distance: edge1.distance + edge2.distance,
                                path: combinedPath
                            }
                        });
                    }
                });
            });
            log("TRACE BIKING: Gefundene Nachbarn Tiefe 1 & 2 gesamt:", results.size);
        }

        return Array.from(results.values());
    }

    getEdge(fromId, toId) {
        const edges = this.#macroGraph.get(String(fromId));
        if (!edges) return null;
        return edges.find(e => e.to === String(toId)) || null;
    }

    getPubs() {
        return [...this.#pubs];
    }

    getBicycleParkings() {
        return [...this.#bicycleParkings];
    }

    getPoliceRiskModifier(poiCoords) {
        const MAX_RADIUS = CONFIG.POLICE_MAX_RADIUS;
        const MAX_MALUS_PER_STATION = CONFIG.POLICE_MAX_MALUS;
        const HARD_CAP = CONFIG.POLICE_HARD_CAP;
        const DIMINISHING = [1.0, 0.5, 0.25];

        const poi = { lat: poiCoords[0], lon: poiCoords[1] };

        const malusValues = [];
        this.#policeStations.forEach(station => {
            const dist = this.calculateDistance(poi, station);
            if (dist <= MAX_RADIUS) {
                const malus = MAX_MALUS_PER_STATION * (1 - dist / MAX_RADIUS);
                malusValues.push(malus);
            }
        });

        malusValues.sort((a, b) => b - a);

        let total = 0;
        for (let i = 0; i < Math.min(malusValues.length, DIMINISHING.length); i++) {
            total += malusValues[i] * DIMINISHING[i];
        }

        const riskMalus = Math.round(Math.min(total, HARD_CAP));
        return { riskMalus, activeStations: malusValues.length };
    }

    getNearestPOI(startNodeId) {
        const start = this.#nodes.get(String(startNodeId));
        if (!start || this.#pubs.length === 0) return null;

        const reachable = Array.from(this.#macroGraph.entries())
            .filter(([, edges]) => edges.length > 0)
            .map(([id]) => id);

        let bestPoi = null, bestDist = Infinity;

        this.#pubs.forEach(poi => {
            if (String(poi.id) === String(startNodeId)) return;
            const d = this.calculateDistance(start, poi);
            if (d > 50 && d < bestDist) {
                bestDist = d;
                bestPoi = poi;
            }
        });

        if (!bestPoi) return null;

        let snapId = null, snapDist = Infinity;
        reachable.forEach(id => {
            const nd = this.#nodes.get(id);
            if (!nd) return;
            const d = this.calculateDistance(bestPoi, nd);
            if (d < snapDist) { snapDist = d; snapId = id; }
        });

        if (!snapId) return null;

        const snapNode = this.#nodes.get(snapId);
        return {
            poiData: bestPoi,
            graphNodeId: snapId,
            snapCoords: [snapNode.lat, snapNode.lon]
        };
    }

    getRandomIntersectionNode() {
        const connected = Array.from(this.#macroGraph.entries())
            .filter(([, edges]) => edges.length > 0)
            .map(([id]) => id);
        if (connected.length === 0) return null;
        return connected[Math.floor(Math.random() * connected.length)];
    }
}

export { MapData };