import { CONFIG } from './GameConfig.js';

/**
 * MissionService - Kapselt die Logik für Missionen, Szenarien und Ziel-Generierung.
 * Arbeitet eng mit MapData zusammen, um räumliche Analysen durchzuführen.
 * Architektur: Private Fields, Kapselung und Event-driven (via main.js).
 */
export class MissionService {
    #mapData;

    constructor(mapData) {
        this.#mapData = mapData;
    }

    /**
     * Erzeugt ein Tutorial-Szenario: POI als Ziel, Startknoten mind. MIN_DISTANCE_POI entfernt.
     * @returns {Object|null} { startNodeId, targetNodeId, poiName, startCoords, targetCoords }
     */
    spawnTutorialScenario() {
        const pubs = this.#mapData.getPubs();
        if (pubs.length === 0) return null;

        const connectedIds = this.#mapData.getConnectedNodeIds();
        if (connectedIds.length === 0) return null;

        // Zufällige Auswahl eines Pubs für das Tutorial
        const shuffledPubs = [...pubs].sort(() => Math.random() - 0.5);

        for (const poi of shuffledPubs) {
            // Finde den nächsten Graph-Knoten zum Pub (das Ziel)
            const targetNode = this.#mapData.findNearestGraphNode(poi.lat, poi.lon);
            if (!targetNode) continue;

            const targetId = String(targetNode.id);

            // Finde Startkandidaten in einer einsteigerfreundlichen Distanz
            const candidates = connectedIds.filter(id => {
                if (id === targetId) return false;
                const nd = this.#mapData.getNode(id);
                if (!nd) return false;
                const d = this.#mapData.calculateDistance(targetNode, nd);
                // Zwischen 50m und 150m für den schnellen Einstieg
                return d >= 50 && d <= CONFIG.MAX_DISTANCE_TUTORIAL_PUB;
            });

            if (candidates.length === 0) continue;

            const startId = candidates[Math.floor(Math.random() * candidates.length)];
            const startNode = this.#mapData.getNode(startId);
            const poiName = poi.tags?.name || 'Unbekannte Gaststätte';

            return {
                startNodeId: startId,
                targetNodeId: targetId,
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
        const centerNode = this.#mapData.getNode(centerNodeId);
        if (!centerNode) return [];

        const tagMap = {
            'residential': ['residential', 'apartments', 'house', 'detached', 'terrace', 'residential_complex'],
            'commercial':  ['commercial', 'office', 'retail', 'supermarket', 'bank', 'hotel', 'industrial'],
            'public':      ['public', 'civic', 'government', 'hospital', 'school', 'university', 'kindergarten', 'townhall', 'church'],
            'allotments':  ['allotment_house', 'shed', 'cabin', 'bungalow', 'garden_house', 'farm_auxiliary']
        };

        const allowedTags = tagMap[targetType] || [];
        const buildings = this.#mapData.getBuildingsByTags(allowedTags);
        const candidates = [];

        buildings.forEach(way => {
            const lat = way.center?.lat || (this.#mapData.getNode(way.nodes?.[0])?.lat);
            const lon = way.center?.lon || (this.#mapData.getNode(way.nodes?.[0])?.lon);
            if (!lat || !lon) return;

            const dist = this.#mapData.calculateDistance(centerNode, { lat, lon });
            
            // Suche Ziele in anspruchsvollerer Distanz (mind. 600m)
            if (dist >= CONFIG.MIN_DISTANCE_POI && dist <= (CONFIG.MIN_DISTANCE_POI + 600)) {
                // Finde den nächstgelegenen Straßenzugang für dieses Gebäude
                const accessNode = this.#mapData.findNearestGraphNode(lat, lon);
                
                if (accessNode) {
                    candidates.push({
                        id: String(way.id),
                        lat, lon,
                        type: targetType,
                        osmType: way.tags?.building,
                        accessNodeId: String(accessNode.id),
                        distance: dist
                    });
                }
            }
        });

        // Zufällige Auswahl von bis zu 3 Zielen aus den Kandidaten
        // Bonus: Mindestabstand der Ziele untereinander (200m)
        const selected = [];
        const shuffled = candidates.sort(() => Math.random() - 0.5);

        for (const cand of shuffled) {
            if (selected.length >= 3) break;
            const tooClose = selected.some(s => this.#mapData.calculateDistance(s, cand) < 200);
            if (!tooClose) {
                selected.push(cand);
            }
        }

        return selected;
    }

    /**
     * Erzeugt 3 Fahrrad-Ziele (bicycle_parking) in der Nähe des Spielers.
     * @param {MapData} mapData 
     * @param {Object} playerCoords {lat, lon}
     * @returns {Array} Liste der Fahrrad-Ziele
     */
    spawnBicycleTargets(mapData, playerCoords) {
        const allParkings = mapData.getBicycleParkings();
        console.log("TRACE BIKES: Rohdaten Stellplätze gefunden:", allParkings.length);
        
        if (!allParkings || allParkings.length === 0) return [];

        const candidates = allParkings
            .map(p => {
                const dist = mapData.calculateDistance(playerCoords, p);
                const accessNode = mapData.findNearestGraphNode(p.lat, p.lon);
                console.log("TRACE BIKES: Prüfe Stellplatz", p.id, "Distance:", dist, "Hat AccessNode:", !!accessNode);
                return { ...p, distance: dist, accessNode };
            })
            .filter(p => p.distance >= CONFIG.MIN_DISTANCE_BIKE && p.distance <= (CONFIG.MIN_DISTANCE_BIKE + 600) && p.accessNode !== null) 
            .sort((a, b) => a.distance - b.distance);

        console.log("TRACE BIKES: Kandidaten nach Filterung:", candidates.length);

        // Die 3 nächsten Stellplätze auswählen
        const selected = candidates.slice(0, 3);

        return selected.map(p => {
            return {
                id: p.id,
                lat: p.lat,
                lon: p.lon,
                type: 'bicycle',
                accessNodeId: String(p.accessNode.id),
                name: p.tags?.name || 'Fahrradständer'
            };
        });
    }
}
