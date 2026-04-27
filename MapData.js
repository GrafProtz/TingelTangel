/**
 * MapData - Der Data-Layer der Engine.
 * Baut einen Makro-Graphen aus OSM-Daten: Nur echte Kreuzungen und
 * Sackgassen werden zu begehbaren Knoten; die Kurvenpunkte dazwischen
 * werden als "Geometrie-Pfad" in den Kanten gespeichert.
 */
class MapData {
    constructor() {
        this._nodes = new Map();      // Alle OSM-Nodes (auch Geometrie)
        this._ways  = new Map();
        this._pubs  = [];
        this._policeStations = [];    // [{ lat, lon }, ...]
        this.cityName = '';

        // Makro-Graph: Map<nodeId, Array<Edge>>
        // Edge = { to, path: [[lat,lon],...], distance }
        this._macroGraph = new Map();

        // Spatial Index
        this._spatialIndex = new Map();
        this._gridSize = 0.001;
    }

    // ----------------------------------------------------------------
    //  Laden
    // ----------------------------------------------------------------

    async loadCityData(coords) {
        const range = 0.008;
        const s = coords[0] - range, w = coords[1] - range;
        const n = coords[0] + range, e = coords[1] + range;

        // Erweiterte Suche nach Polizei (Stationen, Präsidien, Verwaltung, Kasernen)
        const query = `[out:json][timeout:25];(
            way["highway"](${s},${w},${n},${e});
            node["amenity"~"pub|bar|restaurant"](${s},${w},${n},${e});
            way["amenity"~"pub|bar|restaurant"](${s},${w},${n},${e});
            node["amenity"~"police|police_station"](${s},${w},${n},${e});
            way["amenity"~"police|police_station"](${s},${w},${n},${e});
            relation["amenity"~"police|police_station"](${s},${w},${n},${e});
            way["building"="police"](${s},${w},${n},${e});
            relation["building"="police"](${s},${w},${n},${e});
            node["police"](${s},${w},${n},${e});
            way["police"](${s},${w},${n},${e});
            relation["police"](${s},${w},${n},${e});
            node["office"="government"]["government"="police"](${s},${w},${n},${e});
            way["office"="government"]["government"="police"](${s},${w},${n},${e});
            relation["office"="government"]["government"="police"](${s},${w},${n},${e});
        );(._;>;);out body center;`;

        try {
            console.log('MapData: Starte Overpass-Abfrage …');
            const resp = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                body: 'data=' + encodeURIComponent(query)
            });
            if (!resp.ok) throw new Error(`HTTP-Fehler: ${resp.status}`);
            
            const data = await resp.json();
            if (!data.elements || data.elements.length === 0) {
                throw new Error('Keine Daten von OpenStreetMap erhalten (Overpass-Abfrage leer).');
            }

            this._parseOSMData(data);
            this._buildMacroGraph();

            if (this._macroGraph.size === 0) {
                throw new Error('Es konnten keine befahrbaren Straßen im gewählten Bereich gefunden werden.');
            }

            console.log(`MapData: Makro-Graph mit ${this._macroGraph.size} Kreuzungen erstellt.`);
        } catch (err) {
            console.error('MapData: Overpass-Fehler', err);
            throw err; // Fehler nach oben weiterreichen
        }
    }

    // ----------------------------------------------------------------
    //  Parsing
    // ----------------------------------------------------------------

    _parseOSMData(data) {
        this._nodes.clear();
        this._ways.clear();
        this._pubs = [];
        this._policeStations = [];
        this._spatialIndex.clear();
        this._macroGraph.clear();

        data.elements.forEach(el => {
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

            if (el.type === 'node') {
                const nd = { ...el, id: safeId };
                this._nodes.set(safeId, nd);
                this._addToSpatialIndex(nd);
                if (isPub) this._pubs.push(nd);
                if (isPolice) this._policeStations.push({ lat: el.lat, lon: el.lon });

            } else if (el.type === 'way') {
                this._ways.set(safeId, el);
                // Center-Koordinaten aus "out center" oder Fallback auf ersten Knoten
                const cLat = el.center?.lat ?? this._nodes.get(String(el.nodes?.[0]))?.lat;
                const cLon = el.center?.lon ?? this._nodes.get(String(el.nodes?.[0]))?.lon;
                if (isPub && cLat != null) {
                    this._pubs.push({ ...el, lat: cLat, lon: cLon, id: safeId });
                }
                if (isPolice && cLat != null) {
                    this._policeStations.push({ lat: cLat, lon: cLon });
                }

            } else if (el.type === 'relation') {
                // Relations: Nur Center-Koordinaten nutzen
                const cLat = el.center?.lat;
                const cLon = el.center?.lon;
                if (isPolice && cLat != null) {
                    this._policeStations.push({ lat: cLat, lon: cLon });
                }
            }
        });

        console.log(`MapData: ${this._policeStations.length} Polizeistationen erfasst.`);
    }

    // ----------------------------------------------------------------
    //  Makro-Graph
    // ----------------------------------------------------------------

    _buildMacroGraph() {
        // 1. Zähle, wie oft jeder Knoten in allen Wegen vorkommt
        const nodeUsage = new Map();
        this._ways.forEach(way => {
            if (!way.tags?.highway) return;           // Nur Straßen
            way.nodes.forEach(rawId => {
                const id = String(rawId);
                nodeUsage.set(id, (nodeUsage.get(id) || 0) + 1);
            });
        });

        // 2. Entscheidungsknoten-Check
        const isDecision = (id, way, idx) => {
            if (nodeUsage.get(id) > 1) return true;              // Kreuzung
            if (idx === 0 || idx === way.nodes.length - 1) return true;  // Endpunkt
            return false;
        };

        // 3. Wege durchlaufen und Segmente zwischen Entscheidungsknoten bilden
        this._ways.forEach(way => {
            if (!way.tags?.highway) return;

            const ids = way.nodes.map(n => String(n));

            let lastDecision = ids[0];
            let pathCoords   = [];   // Zwischen-Koordinaten (ohne Start-Kreuzung)
            let segDist      = 0;

            for (let i = 1; i < ids.length; i++) {
                const prev = this._nodes.get(ids[i - 1]);
                const curr = this._nodes.get(ids[i]);
                if (!prev || !curr) continue;

                segDist += this._haversine(prev, curr);
                pathCoords.push([curr.lat, curr.lon]);

                if (isDecision(ids[i], way, i)) {
                    // Vorwärts-Kante
                    this._addMacroEdge(lastDecision, ids[i], pathCoords, segDist);
                    // Rückwärts-Kante (Pfad umkehren)
                    this._addMacroEdge(ids[i], lastDecision, [...pathCoords].reverse(), segDist);

                    // Reset
                    lastDecision = ids[i];
                    pathCoords   = [];
                    segDist      = 0;
                }
            }
        });
    }

    _addMacroEdge(from, to, path, dist) {
        if (from === to) return;                                 // Selbst-Schleifen ignorieren
        if (!this._macroGraph.has(from)) this._macroGraph.set(from, []);

        // Duplikat-Vermeidung: kürzere Kante gewinnt
        const list = this._macroGraph.get(from);
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

    _haversine(a, b) {
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

    _addToSpatialIndex(node) {
        const key = this._gridKey(node.lat, node.lon);
        if (!this._spatialIndex.has(key)) this._spatialIndex.set(key, []);
        this._spatialIndex.get(key).push(node.id);
    }

    _gridKey(lat, lon) {
        return `${Math.floor(lat / this._gridSize)}_${Math.floor(lon / this._gridSize)}`;
    }

    getNearestNode(lat, lon) {
        const ids = this._spatialIndex.get(this._gridKey(lat, lon)) || [];
        let best = null, bestD = Infinity;
        ids.forEach(id => {
            const n = this._nodes.get(id);
            if (!n) return;
            const d = (n.lat - lat) ** 2 + (n.lon - lon) ** 2;
            if (d < bestD) { bestD = d; best = n; }
        });
        return best;
    }

    // ----------------------------------------------------------------
    //  Öffentliche Getter
    // ----------------------------------------------------------------

    getNode(id) {
        return this._nodes.get(String(id));
    }

    /**
     * Gibt die Nachbar-Kreuzungen mit edgeData zurück.
     * Format: [{ id, lat, lon, edgeData: { to, path, distance } }, …]
     */
    getNeighbors(id) {
        const edges = this._macroGraph.get(String(id));
        if (!edges) return [];
        return edges
            .map(edge => {
                const node = this._nodes.get(edge.to);
                if (!node) return null;
                return { ...node, edgeData: edge };
            })
            .filter(Boolean);
    }

    /**
     * Gibt die Kanten-Daten einer bestimmten Verbindung zurück.
     */
    getEdge(fromId, toId) {
        const edges = this._macroGraph.get(String(fromId));
        if (!edges) return null;
        return edges.find(e => e.to === String(toId)) || null;
    }

    getPubs() {
        return [...this._pubs];
    }

    /**
     * Berechnet den Risiko-Aufschlag basierend auf der Nähe zu Polizeistationen.
     * @param {Array} poiCoords - [lat, lon]
     * @returns {{ riskMalus: number, activeStations: number }}
     */
    getPoliceRiskModifier(poiCoords) {
        const MAX_RADIUS = 3000;             // Meter (3km für Großstädte)
        const MAX_MALUS_PER_STATION = 30;    // Prozentpunkte bei 0m Distanz
        const HARD_CAP = 40;                 // Maximaler Gesamt-Aufschlag
        const DIMINISHING = [1.0, 0.5, 0.25]; // Gewichtung pro Station

        const poi = { lat: poiCoords[0], lon: poiCoords[1] };

        // Malus-Werte aller Stationen im Radius sammeln
        const malusValues = [];
        this._policeStations.forEach(station => {
            const dist = this._haversine(poi, station);
            if (dist <= MAX_RADIUS) {
                const malus = MAX_MALUS_PER_STATION * (1 - dist / MAX_RADIUS);
                malusValues.push(malus);
            }
        });

        // Absteigend sortieren (nächste Wache = höchster Malus zuerst)
        malusValues.sort((a, b) => b - a);

        // Diminishing Returns anwenden (max. 3 Wachen berücksichtigt)
        let total = 0;
        for (let i = 0; i < Math.min(malusValues.length, DIMINISHING.length); i++) {
            total += malusValues[i] * DIMINISHING[i];
        }

        const riskMalus = Math.round(Math.min(total, HARD_CAP));
        return { riskMalus, activeStations: malusValues.length };
    }

    /**
     * Findet den nächsten POI relativ zu einem Startknoten und snappt
     * ihn auf die nächste erreichbare Kreuzung im Makro-Graphen.
     * Gibt { poiData, graphNodeId, snapCoords } zurück oder null.
     */
    getNearestPOI(startNodeId) {
        const start = this._nodes.get(String(startNodeId));
        if (!start || this._pubs.length === 0) return null;

        // Nur Kreuzungen mit echten Nachbarn kommen als Snap-Ziele in Frage
        const reachable = Array.from(this._macroGraph.entries())
            .filter(([, edges]) => edges.length > 0)
            .map(([id]) => id);

        let bestPoi = null, bestDist = Infinity;

        this._pubs.forEach(poi => {
            if (String(poi.id) === String(startNodeId)) return;
            const d = this._haversine(start, poi);
            if (d > 50 && d < bestDist) {
                bestDist = d;
                bestPoi = poi;
            }
        });

        if (!bestPoi) return null;

        // Snap auf die nächste erreichbare Kreuzung
        let snapId = null, snapDist = Infinity;
        reachable.forEach(id => {
            const nd = this._nodes.get(id);
            if (!nd) return;
            const d = this._haversine(bestPoi, nd);
            if (d < snapDist) { snapDist = d; snapId = id; }
        });

        if (!snapId) return null;

        const snapNode = this._nodes.get(snapId);
        return {
            poiData: bestPoi,
            graphNodeId: snapId,
            snapCoords: [snapNode.lat, snapNode.lon]   // Exakte Graph-Koordinaten
        };
    }

    /**
     * Gibt einen zufälligen Knoten zurück, der mindestens einen Nachbarn hat.
     */
    getRandomIntersectionNode() {
        const connected = Array.from(this._macroGraph.entries())
            .filter(([, edges]) => edges.length > 0)
            .map(([id]) => id);
        if (connected.length === 0) return null;
        return connected[Math.floor(Math.random() * connected.length)];
    }

    /**
     * Erzeugt ein Tutorial-Szenario: POI als Ziel, Startknoten 100-200m entfernt.
     * @returns {{ startNodeId, targetNodeId, poiName, startCoords, targetCoords }|null}
     */
    spawnTutorialScenario() {
        if (this._pubs.length === 0) return null;

        // Erreichbare Kreuzungen
        const connected = Array.from(this._macroGraph.entries())
            .filter(([, edges]) => edges.length > 0)
            .map(([id]) => id);
        if (connected.length === 0) return null;

        // Zufälligen POI wählen und auf nächste Kreuzung snappen
        const shuffledPubs = [...this._pubs].sort(() => Math.random() - 0.5);

        for (const poi of shuffledPubs) {
            // Snap POI auf nächste erreichbare Kreuzung
            let snapId = null, snapDist = Infinity;
            connected.forEach(id => {
                const nd = this._nodes.get(id);
                if (!nd) return;
                const d = this._haversine(poi, nd);
                if (d < snapDist) { snapDist = d; snapId = id; }
            });
            if (!snapId) continue;

            const targetNode = this._nodes.get(snapId);

            // Kandidaten für den Start: Kreuzungen im Umkreis 100-200m vom Ziel
            const candidates = connected.filter(id => {
                if (id === snapId) return false;
                const nd = this._nodes.get(id);
                if (!nd) return false;
                const d = this._haversine(targetNode, nd);
                return d >= 100 && d <= 200;
            });

            if (candidates.length === 0) continue;

            const startId = candidates[Math.floor(Math.random() * candidates.length)];
            const startNode = this._nodes.get(startId);
            const poiName = poi.tags?.name || 'Unbekannte Gaststätte';

            console.log(`MapData: Tutorial-Szenario → Start ${startId}, Ziel ${snapId} ("${poiName}")`);

            return {
                startNodeId: startId,
                targetNodeId: snapId,
                poiName,
                startCoords: [startNode.lat, startNode.lon],
                targetCoords: [targetNode.lat, targetNode.lon]
            };
        }

        return null;
    }
}

export { MapData };
