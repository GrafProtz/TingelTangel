/**
 * MapData - Der Data-Layer der Engine.
 * Zuständig für das Laden, Speichern und Indizieren von geografischen Daten.
 */
class MapData {
    constructor() {
        // Interne Datenspeicher (Kapselung)
        this._nodes = new Map();
        this._ways = new Map();
        this._pubs = [];
        
        // Der Graph: Map<nodeId, Set<neighborNodeId>>
        this._graph = new Map();

        // Spatial Index (Grid-basiertes Hashing)
        // Wir teilen die Welt in Zellen auf (ca. 100m bei 0.001 Grad)
        this._spatialIndex = new Map();
        this._gridSize = 0.001; 
    }

    /**
     * Lädt Stadtdaten von einer URL (JSON im OSM-Format).
     * @param {string} url 
     */
    async loadCityData(url) {
        try {
            // In einer echten Umgebung: const response = await fetch(url);
            // Hier nutzen wir Mock-Daten für die Demonstration:
            const data = this._getMockData();
            this._parseOSMData(data);
            console.log(`MapData: ${this._nodes.size} Nodes und ${this._pubs.length} Pubs geladen.`);
        } catch (error) {
            console.error("MapData: Fehler beim Laden der Daten", error);
        }
    }

    /**
     * Interner Parser für das Overpass-JSON Format.
     */
    _parseOSMData(data) {
        this._nodes.clear();
        this._ways.clear();
        this._graph.clear();
        this._pubs = [];
        this._spatialIndex.clear();

        // 1. Pass: Nodes extrahieren und räumlich indizieren
        data.elements.forEach(el => {
            if (el.type === 'node') {
                this._nodes.set(el.id, el);
                this._addToSpatialIndex(el);

                if (el.tags && (el.tags.amenity === 'pub' || el.tags.amenity === 'bar')) {
                    this._pubs.push(el);
                }
            }
        });

        // 2. Pass: Ways verarbeiten und Graphen aufbauen
        data.elements.forEach(el => {
            if (el.type === 'way') {
                this._ways.set(el.id, el);
                
                // Wir bauen die Adjazenzliste bidirektional auf
                for (let i = 0; i < el.nodes.length - 1; i++) {
                    const u = el.nodes[i];
                    const v = el.nodes[i + 1];
                    this._addEdge(u, v);
                    this._addEdge(v, u);
                }

                // Check, ob der Way selbst als Pub getaggt ist (z.B. Gebäude-Umriss)
                if (el.tags && (el.tags.amenity === 'pub' || el.tags.amenity === 'bar')) {
                    // Wir nehmen den ersten Node des Gebäudes als Repräsentanten
                    const firstNode = this._nodes.get(el.nodes[0]);
                    if (firstNode) this._pubs.push({...el, lat: firstNode.lat, lon: firstNode.lon});
                }
            }
        });
    }

    _addEdge(u, v) {
        if (!this._graph.has(u)) this._graph.set(u, new Set());
        this._graph.get(u).add(v);
    }

    _addToSpatialIndex(node) {
        const key = this._getGridKey(node.lat, node.lon);
        if (!this._spatialIndex.has(key)) this._spatialIndex.set(key, []);
        this._spatialIndex.get(key).push(node.id);
    }

    _getGridKey(lat, lon) {
        const x = Math.floor(lat / this._gridSize);
        const y = Math.floor(lon / this._gridSize);
        return `${x}_${y}`;
    }

    /**
     * Findet den nächstgelegenen Knotenpunkt effizient über den Spatial Index.
     */
    getNearestNode(lat, lon) {
        const key = this._getGridKey(lat, lon);
        const candidateIds = this._spatialIndex.get(key) || [];
        
        let minPlayerDist = Infinity;
        let nearestNode = null;

        candidateIds.forEach(id => {
            const node = this._nodes.get(id);
            const d = Math.sqrt(Math.pow(node.lat - lat, 2) + Math.pow(node.lon - lon, 2));
            if (d < minPlayerDist) {
                minPlayerDist = d;
                nearestNode = node;
            }
        });

        return nearestNode;
    }

    // --- GETTER ---

    getNode(id) {
        return this._nodes.get(id);
    }

    getNeighbors(id) {
        const neighbors = this._graph.get(id);
        return neighbors ? Array.from(neighbors) : [];
    }

    getPubs() {
        return [...this._pubs];
    }

    _getMockData() {
        return {
            elements: [
                { type: "node", id: 1, lat: 51.513, lon: 7.465 },
                { type: "node", id: 2, lat: 51.514, lon: 7.466 },
                { type: "node", id: 3, lat: 51.515, lon: 7.467, tags: { amenity: "pub", name: "The Mock Tavern" } },
                { type: "way", id: 10, nodes: [1, 2, 3], tags: { highway: "residential" } }
            ]
        };
    }
}

export { MapData };
