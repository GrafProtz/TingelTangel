/**
 * MissionService - Kapselt die Logik für Missionen, Szenarien und Ziel-Generierung.
 * Arbeitet eng mit MapData zusammen, um räumliche Analysen durchzuführen.
 */
export class MissionService {
    constructor(mapData) {
        this._mapData = mapData;
    }

    /**
     * Erzeugt ein Tutorial-Szenario: POI als Ziel, Startknoten 100-200m entfernt.
     * @returns {Object|null} { startNodeId, targetNodeId, poiName, startCoords, targetCoords }
     */
    spawnTutorialScenario() {
        const pubs = this._mapData.getPubs();
        if (pubs.length === 0) return null;

        const connected = Array.from(this._mapData._macroGraph.entries())
            .filter(([, edges]) => edges.length > 0)
            .map(([id]) => id);
        
        if (connected.length === 0) return null;

        const shuffledPubs = [...pubs].sort(() => Math.random() - 0.5);

        for (const poi of shuffledPubs) {
            let snapId = null, snapDist = Infinity;
            connected.forEach(id => {
                const nd = this._mapData.getNode(id);
                if (!nd) return;
                const d = this._mapData.calculateDistance(poi, nd);
                if (d < snapDist) { snapDist = d; snapId = id; }
            });
            if (!snapId) continue;

            const targetNode = this._mapData.getNode(snapId);

            const candidates = connected.filter(id => {
                if (id === snapId) return false;
                const nd = this._mapData.getNode(id);
                if (!nd) return false;
                const d = this._mapData.calculateDistance(targetNode, nd);
                return d >= 100 && d <= 200;
            });

            if (candidates.length === 0) continue;

            const startId = candidates[Math.floor(Math.random() * candidates.length)];
            const startNode = this._mapData.getNode(startId);
            const poiName = poi.tags?.name || 'Unbekannte Gaststätte';

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

    /**
     * Wählt 3 reale Gebäude aus den OSM-Rohdaten basierend auf Typ und Distanz aus.
     * @param {string} targetType - 'residential', 'commercial', 'public', 'allotments'
     * @param {string} centerNodeId 
     * @returns {Array} Liste der generierten Ziele
     */
    spawnTargets(targetType, centerNodeId) {
        const centerNode = this._mapData.getNode(centerNodeId);
        if (!centerNode) return [];

        const tagMap = {
            'residential': ['residential', 'apartments', 'house', 'detached', 'terrace', 'residential_complex'],
            'commercial':  ['commercial', 'office', 'retail', 'supermarket', 'bank', 'hotel', 'industrial'],
            'public':      ['public', 'civic', 'government', 'hospital', 'school', 'university', 'kindergarten', 'townhall', 'church'],
            'allotments':  ['allotment_house', 'shed', 'cabin', 'bungalow', 'garden_house', 'farm_auxiliary']
        };

        const allowedTags = tagMap[targetType] || [];
        const candidates = [];

        this._mapData._ways.forEach((way, id) => {
            const bTag = way.tags?.building;
            if (!bTag || !allowedTags.includes(bTag)) return;

            const lat = way.center?.lat || (this._mapData.getNode(way.nodes?.[0])?.lat);
            const lon = way.center?.lon || (this._mapData.getNode(way.nodes?.[0])?.lon);
            if (!lat || !lon) return;

            const dist = this._mapData.calculateDistance(centerNode, { lat, lon });
            if (dist >= 50 && dist <= 300) {
                let accessNodeId = null;
                let minDistToNode = Infinity;
                
                this._mapData._macroGraph.forEach((edges, nodeId) => {
                    const node = this._mapData.getNode(nodeId);
                    if (!node) return;
                    const d = this._mapData.calculateDistance({ lat, lon }, node);
                    if (d < minDistToNode) {
                        minDistToNode = d;
                        accessNodeId = nodeId;
                    }
                });

                if (accessNodeId) {
                    candidates.push({
                        id: String(way.id),
                        lat, lon,
                        type: targetType,
                        osmType: bTag,
                        accessNodeId,
                        distance: dist
                    });
                }
            }
        });

        // Zufällige Auswahl von bis zu 3 Zielen
        return candidates
            .sort(() => Math.random() - 0.5)
            .slice(0, 3);
    }
}
