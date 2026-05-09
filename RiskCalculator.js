import { CONFIG } from './GameConfig.js';

/**
 * RiskCalculator - Domain-Experte für Wahrscheinlichkeiten und Risiken.
 * Isoliert die Mathematik von der Spielsteuerung.
 */
export class RiskCalculator {
    /**
     * Berechnet das detaillierte Risiko für einen Einbruch.
     */
    static calculateTargetRisk(target, mapData, playerNodeId, hasBoltCutter, isDisguised) {
        // Basis-Werte je nach Gebäudetyp
        const typeRisks = {
            'residential': 15,
            'commercial': 25,
            'public': 30,
            'allotments': 10,
            'bicycle': 5
        };

        const baseRisk = typeRisks[target.type] || 20;
        const proximityRisk = mapData.getPoliceProximityRisk(target.lat, target.lon);
        
        // Spezial-Logik für Equipment
        let equipmentPenalty = 0;
        if (target.osmType === 'bank' && !hasBoltCutter) equipmentPenalty += 40;
        
        // Boni
        const disguiseBonus = isDisguised ? 15 : 0;

        const totalRisk = Math.max(5, (baseRisk + proximityRisk + equipmentPenalty) - disguiseBonus);

        return {
            totalRisk: Math.min(100, totalRisk),
            baseRisk,
            proximityRisk,
            equipmentPenalty,
            disguiseBonus,
            label: target.osmType || target.type || 'Gebäude'
        };
    }

    /**
     * Erzeugt eine Risiko-Vorschau für Kneipen-Optionen.
     */
    static getInteractionPreview(key, riskMalus = 0) {
        const previews = {
            'A': { text: "Ein schneller Job. Geringes Risiko.", risk: 10 + riskMalus },
            'B': { text: "Anspruchsvoll, aber lukrativ.", risk: 30 + riskMalus },
            'C': { text: "Extremer Hochrisiko-Einsatz!", risk: 60 + riskMalus },
            'D': { text: "Nur für Profis.", risk: 80 + riskMalus }
        };
        return previews[key] || { text: "Unbekanntes Risiko", risk: 50 };
    }
}
