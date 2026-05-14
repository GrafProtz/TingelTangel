import { CONFIG } from './GameConfig.js';

/**
 * RiskCalculator - Domain-Experte für Wahrscheinlichkeiten und Risiken.
 * Isoliert die Mathematik von der Spielsteuerung und behebt Fehler in der Risiko-Metrik.
 */
export class RiskCalculator {
    #mapData;

    constructor(mapData) {
        this.#mapData = mapData;
    }

    /**
     * Berechnet das detaillierte Risiko für einen Einbruch oder eine Mission.
     * @param {Object} targetNode - Das Zielobjekt
     * @param {boolean} isDisguised - Ob der Spieler aktuell getarnt ist
     * @returns {Object} Detaillierte Risiko-Daten
     */
    calculateTargetRisk(targetNode, isDisguised) {
        const statsMap = CONFIG.RISK.CATEGORY_STATS;

        const category = targetNode.type || 'residential';
        const config = statsMap[category] || statsMap.residential;

        // Polizei-Risiko berechnen (ersetzt fehlerhaften mapData-Aufruf)
        const { proximityRisk, nearbyCount } = this.getPoliceRiskModifier([targetNode.lat, targetNode.lon]);
        
        // Interferenz-Malus (wenn mehrere Wachen in der Nähe sind)
        const interferenceRisk = nearbyCount > 1 ? (nearbyCount - 1) * CONFIG.RISK.POLICE_INTERFERENCE_FACTOR : 0;
        
        let totalRisk = config.baseRisk + proximityRisk + interferenceRisk;
        let abortRate = config.abortRate;

        // Tarnung-Buff anwenden (Halbierung)
        if (isDisguised) {
            totalRisk *= CONFIG.RISK.BARBER_RISK_REDUCTION;
            abortRate *= CONFIG.RISK.BARBER_RISK_REDUCTION;
        }

        // Deckelung
        totalRisk = Math.min(CONFIG.RISK.MAX_RISK_CAP, totalRisk);
        const successProbability = 100 - totalRisk;

        return {
            label: config.label,
            minLoot: config.minLoot,
            maxLoot: config.maxLoot,
            baseRisk: config.baseRisk,
            abortRate: Number(abortRate.toFixed(1)),
            proximityRisk: Number(proximityRisk.toFixed(1)),
            interferenceRisk: interferenceRisk,
            nearbyCount: nearbyCount,
            totalRisk: Number(totalRisk.toFixed(1)),
            successProbability: Number(successProbability.toFixed(1)),
            isDisguised: isDisguised
        };
    }

    /**
     * Berechnet den Risiko-Malus basierend auf Polizei-Nähe.
     * Ersetzt die in MapData fehlende Methode getPoliceProximityRisk.
     * @param {Array} coords - [lat, lon]
     * @returns {Object} { riskMalus, nearbyCount }
     */
    getPoliceRiskModifier(coords) {
        if (!coords || coords.length < 2) return { riskMalus: 0, proximityRisk: 0, nearbyCount: 0 };

        const stations = this.#mapData.getPoliceStations();
        let riskMalus = 0;
        let nearbyCount = 0;

        stations.forEach(station => {
            const dist = this.#mapData.calculateDistance(
                { lat: coords[0], lon: coords[1] },
                { lat: station.lat, lon: station.lon }
            );

            // Innerhalb des Radius steigt das Risiko linear an
            if (dist < CONFIG.RISK.POLICE_DETECTION_RADIUS) {
                nearbyCount++;
                riskMalus += (CONFIG.RISK.POLICE_DETECTION_RADIUS - dist) / CONFIG.RISK.POLICE_DETECTION_RADIUS * CONFIG.RISK.POLICE_DETECTION_MAX_RISK;
            }
        });

        const result = Number(riskMalus.toFixed(1));
        return { 
            riskMalus: result, 
            proximityRisk: result, // Alias für Kompatibilität
            nearbyCount 
        };
    }

    /**
     * Erzeugt eine Risiko-Vorschau für Kneipen-Optionen.
     */
    getInteractionPreview(key, riskMalus = 0) {
        const variants = CONFIG.RISK.PUB_VARIANTS;
        const previews = {
            'A': { text: "Ein schneller Job. Geringes Risiko.", risk: variants.A.baseRisk + riskMalus },
            'B': { text: "Anspruchsvoll, aber lukrativ.", risk: variants.B.baseRisk + riskMalus },
            'C': { text: "Extremer Hochrisiko-Einsatz!", risk: variants.C.baseRisk + riskMalus },
            'D': { text: "Nur für Profis.", risk: variants.D.baseRisk + riskMalus }
        };
        return previews[key] || { text: "Unbekanntes Risiko", risk: 50 };
    }
}
