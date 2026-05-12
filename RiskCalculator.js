import { CONFIG } from './GameConfig.js';

/**
 * RiskCalculator - Domain-Experte für Wahrscheinlichkeiten und Risiken.
 * Isoliert die Mathematik von der Spielsteuerung.
 */
export class RiskCalculator {
    #mapData;

    constructor(mapData) {
        this.#mapData = mapData;
    }

    /**
     * Berechnet das detaillierte Risiko für einen Einbruch oder eine Mission.
     */
    calculateTargetRisk(targetNode, isDisguised) {
        const statsMap = {
            'residential': { baseRisk: CONFIG.RISK_FACTORS.BURGLARY_EASY,   abortRate: CONFIG.RISK_FACTORS.ABORT_RESIDENTIAL, minLoot: CONFIG.REWARDS.BURGLARY_EASY,   maxLoot: 5000,  label: 'Wohnhaus' },
            'commercial':  { baseRisk: CONFIG.RISK_FACTORS.BURGLARY_MEDIUM, abortRate: CONFIG.RISK_FACTORS.ABORT_COMMERCIAL,  minLoot: CONFIG.REWARDS.BURGLARY_MEDIUM, maxLoot: 15000, label: 'Gewerbeobjekt' },
            'public':      { baseRisk: CONFIG.RISK_FACTORS.BURGLARY_MEDIUM, abortRate: CONFIG.RISK_FACTORS.ABORT_PUBLIC,      minLoot: 100,                           maxLoot: 8000,  label: 'Öffentliche Einrichtung' },
            'allotments':  { baseRisk: CONFIG.RISK_FACTORS.BURGLARY_EASY,   abortRate: CONFIG.RISK_FACTORS.ABORT_ALLOTMENTS,  minLoot: 50,                            maxLoot: 1950,  label: 'Kleingarten/Schuppen' },
            'bicycle':     { baseRisk: CONFIG.RISK_FACTORS.BICYCLE_BASE,    abortRate: 0,  minLoot: 0,                             maxLoot: 0,     label: 'Fahrradständer' }
        };

        const category = targetNode.type || 'residential';
        const config = statsMap[category] || statsMap.residential;

        const { proximityRisk, nearbyCount } = this.getPoliceRiskModifier([targetNode.lat, targetNode.lon]);
        
        const interferenceRisk = nearbyCount > 1 ? (nearbyCount - 1) * CONFIG.RISK_FACTORS.INTERFERENCE_MALUS : 0;
        
        let totalRisk = config.baseRisk + proximityRisk + interferenceRisk;
        let abortRate = config.abortRate;

        if (isDisguised) {
            totalRisk *= CONFIG.RISK_FACTORS.DISGUISE_BUFF;
            abortRate *= CONFIG.RISK_FACTORS.DISGUISE_BUFF;
        }

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

            if (dist < CONFIG.RISK_FACTORS.POLICE_MAX_RADIUS) {
                nearbyCount++;
                riskMalus += (CONFIG.RISK_FACTORS.POLICE_MAX_RADIUS - dist) / CONFIG.RISK_FACTORS.POLICE_MAX_RADIUS * CONFIG.RISK_FACTORS.POLICE_MAX_MALUS;
            }
        });

        const result = Math.min(CONFIG.RISK_FACTORS.POLICE_HARD_CAP, Number(riskMalus.toFixed(1)));
        return { 
            riskMalus: result, 
            proximityRisk: result,
            nearbyCount 
        };
    }

    /**
     * Erzeugt eine Risiko-Vorschau für Kneipen-Optionen.
     */
    getInteractionPreview(key, riskMalus = 0) {
        const previews = {
            'A': { text: "Ein schneller Job. Geringes Risiko.", risk: CONFIG.RISK_FACTORS.PUB_EASY + riskMalus },
            'B': { text: "Anspruchsvoll, aber lukrativ.", risk: CONFIG.RISK_FACTORS.BURGLARY_MEDIUM + riskMalus },
            'C': { text: "Extremer Hochrisiko-Einsatz!", risk: CONFIG.RISK_FACTORS.BURGLARY_HARD + riskMalus },
            'D': { text: "Nur für Profis.", risk: CONFIG.RISK_FACTORS.BURGLARY_HARD + 10 + riskMalus }
        };
        return previews[key] || { text: "Unbekanntes Risiko", risk: 50 };
    }

    /**
     * Liefert die Einbruchs-Optionen für ein Gebäude (migriert aus Game.js).
     */
    getBurglaryOptions(target) {
        const riskData = this.getPoliceRiskModifier([target.lat, target.lon]);
        
        const typeMultMap = {
            'residential': CONFIG.MULTIPLIERS.TYPE_RESIDENTIAL,
            'commercial': CONFIG.MULTIPLIERS.TYPE_COMMERCIAL,
            'public': CONFIG.MULTIPLIERS.TYPE_PUBLIC,
            'allotments': CONFIG.MULTIPLIERS.TYPE_ALLOTMENTS
        };
        const mult = typeMultMap[target.type] || 1.0;

        const warning = riskData.riskMalus > 0 ? '🚨 ' : '';
        const warningSuffix = riskData.riskMalus > 0 ? ' (Hohe Polizeipräsenz!)' : '';

        return {
            A: { 
                risk: Math.min(95, Math.round((CONFIG.RISK_FACTORS.BURGLARY_EASY + riskData.riskMalus) * mult)), 
                reward: CONFIG.REWARDS.BURGLARY_EASY 
            },
            B: { 
                risk: Math.min(95, Math.round((CONFIG.RISK_FACTORS.BURGLARY_MEDIUM + riskData.riskMalus) * mult)), 
                reward: CONFIG.REWARDS.BURGLARY_MEDIUM 
            },
            C: { 
                risk: Math.min(98, Math.round((CONFIG.RISK_FACTORS.BURGLARY_HARD + riskData.riskMalus) * mult)), 
                reward: CONFIG.REWARDS.BURGLARY_HARD 
            },
            warning: warning,
            warningSuffix: warningSuffix
        };
    }

    /**
     * Führt eine Wahrscheinlichkeitsprüfung durch.
     */
    checkSuccess(totalRisk) {
        const roll = Math.random() * 100;
        return roll > totalRisk;
    }
}


