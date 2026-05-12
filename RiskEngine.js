import { eventBus } from './EventBus.js';
import { EVENTS } from './EventTypes.js';

/**
 * RiskEngine - Die mathematische Instanz für alle Wahrscheinlichkeiten.
 * Reines Logik-Modul (Pure Engine), das keine State-Mutationen durchführt,
 * sondern Ergebnisse berechnet und via EventBus zurückgibt.
 */
export class RiskEngine {
    #mapData;

    constructor(mapData) {
        this.#mapData = mapData;
        this.#setupListeners();
    }

    #setupListeners() {
        // Request/Response Pattern via EventBus
        eventBus.subscribe(EVENTS.REQUEST_RISK_CALCULATION, (payload) => {
            const result = this.calculateTargetRisk(payload.target, payload.isDisguised);
            eventBus.emit(EVENTS.RISK_CALCULATION_READY, result);
        });

        eventBus.subscribe(EVENTS.EXECUTE_PROBABILITY_CHECK, (payload) => {
            const { risk, callbackEvent } = payload;
            const roll = Math.random() * 100;
            const success = roll > risk;
            eventBus.emit(callbackEvent, { success, roll, risk });
        });
    }

    /**
     * Kern-Logik: Berechnet das Gesamtrisiko basierend auf Kategorie, 
     * Polizeipräsenz und Tarnung.
     */
    calculateTargetRisk(targetNode, isDisguised) {
        const statsMap = {
            'residential': { baseRisk: 15, abortRate: 15, label: 'Wohnhaus' },
            'commercial':  { baseRisk: 30, abortRate: 28, label: 'Gewerbeobjekt' },
            'public':      { baseRisk: 30, abortRate: 25, label: 'Öffentliche Einrichtung' },
            'allotments':  { baseRisk: 15, abortRate: 15, label: 'Kleingarten/Schuppen' },
            'bicycle':     { baseRisk: 10, abortRate: 0,  label: 'Fahrradständer' }
        };

        const category = targetNode.type || 'residential';
        const config = statsMap[category] || statsMap.residential;

        // 1. Räumliches Polizei-Risiko
        const { proximityRisk, nearbyCount } = this.getPoliceRiskModifier([targetNode.lat, targetNode.lon]);
        
        // 2. Interferenz-Malus (Mehrere Wachen summieren sich)
        const interferenceRisk = nearbyCount > 1 ? (nearbyCount - 1) * 15 : 0;
        
        // 3. Berechnung
        let totalRisk = config.baseRisk + proximityRisk + interferenceRisk;
        let abortRate = config.abortRate;

        // 4. Tarnung-Buff (Halbiert Entdeckungsrisiko und Abbruchrate)
        if (isDisguised) {
            totalRisk *= 0.5;
            abortRate *= 0.5;
        }

        // 5. Deckelung & Finalisierung
        totalRisk = Math.min(95, totalRisk);
        
        return {
            label: config.label,
            baseRisk: config.baseRisk,
            proximityRisk: Number(proximityRisk.toFixed(1)),
            interferenceRisk,
            nearbyCount,
            totalRisk: Number(totalRisk.toFixed(1)),
            successProbability: Number((100 - totalRisk).toFixed(1)),
            abortRate: Number(abortRate.toFixed(1))
        };
    }

    /**
     * Räumliches Modell: Berechnet Malus basierend auf 500m Radius um Polizeistationen.
     */
    getPoliceRiskModifier(coords) {
        if (!coords) return { proximityRisk: 0, nearbyCount: 0 };

        const stations = this.#mapData.getPoliceStations();
        let riskSum = 0;
        let nearbyCount = 0;

        stations.forEach(station => {
            const dist = this.#mapData.calculateDistance(
                { lat: coords[0], lon: coords[1] },
                { lat: station.lat, lon: station.lon }
            );

            if (dist < 500) {
                nearbyCount++;
                // Linearer Abfall: 25% Malus bei 0m, 0% bei 500m
                riskSum += (500 - dist) / 500 * 25;
            }
        });

        return { proximityRisk: riskSum, nearbyCount };
    }
}
