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
        const statsMap = {
            'residential': { baseRisk: 15, abortRate: 15, minLoot: 150,  maxLoot: 5000,  label: 'Wohnhaus' },
            'commercial':  { baseRisk: 30, abortRate: 28, minLoot: 500,  maxLoot: 15000, label: 'Gewerbeobjekt' },
            'public':      { baseRisk: 30, abortRate: 25, minLoot: 100,  maxLoot: 8000,  label: 'Öffentliche Einrichtung' },
            'allotments':  { baseRisk: 15, abortRate: 15, minLoot: 50,   maxLoot: 1950,  label: 'Kleingarten/Schuppen' },
            'bicycle':     { baseRisk: 9.7, abortRate: 0, minLoot: 0,    maxLoot: 0,     label: 'Fahrradständer' }
        };

        const category = targetNode.type || 'residential';
        const config = statsMap[category] || statsMap.residential;

        // Polizei-Risiko berechnen (ersetzt fehlerhaften mapData-Aufruf)
        const { proximityRisk, nearbyCount } = this.getPoliceRiskModifier([targetNode.lat, targetNode.lon]);
        
        // Interferenz-Malus (wenn mehrere Wachen in der Nähe sind)
        const interferenceRisk = nearbyCount > 1 ? (nearbyCount - 1) * 15 : 0;
        
        let totalRisk = config.baseRisk + proximityRisk + interferenceRisk;
        let abortRate = config.abortRate;

        // Tarnung-Buff anwenden (Halbierung)
        if (isDisguised) {
            totalRisk *= 0.5;
            abortRate *= 0.5;
        }

        // Deckelung bei 95%
        totalRisk = Math.min(95, totalRisk);
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

            // Innerhalb von 500m steigt das Risiko linear an
            if (dist < 500) {
                nearbyCount++;
                riskMalus += (500 - dist) / 500 * 25;
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
        const previews = {
            'A': { text: "Ein schneller Job. Geringes Risiko.", risk: 10 + riskMalus },
            'B': { text: "Anspruchsvoll, aber lukrativ.", risk: 30 + riskMalus },
            'C': { text: "Extremer Hochrisiko-Einsatz!", risk: 60 + riskMalus },
            'D': { text: "Nur für Profis.", risk: 80 + riskMalus }
        };
        return previews[key] || { text: "Unbekanntes Risiko", risk: 50 };
    }
}
