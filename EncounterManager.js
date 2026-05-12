import { eventBus } from './EventBus.js';
import { ENCOUNTERS } from './EncounterData.js';
import { log } from './Utils.js';
import { EVENTS } from './EventTypes.js';
import { CONFIG } from './GameConfig.js';

/**
 * EncounterManager - Die Logik-Zentrale für Zufallsereignisse.
 * Entscheidet basierend auf Wahrscheinlichkeiten, ob und welches Event eintritt.
 */
export class EncounterManager {
    /**
     * Prüft, ob ein Zufallsereignis eintreten soll.
     * @param {Object} state - Der aktuelle Game-State
     */
    static checkAndTriggerEvent(state) {
        log("TRACE ENCOUNTER: Prüfung gestartet. In Kneipe:", state.isInPub);
        
        // 1. Gatekeeper: Basierend auf Config
        const gateRoll = Math.random();
        const encounterChance = CONFIG.RISK_FACTORS.ENCOUNTER_CHANCE; 
        log("TRACE ENCOUNTER: Würfelwurf: " + gateRoll.toFixed(4) + " (Limit: " + encounterChance + ")");
        
        if (gateRoll > encounterChance) {
            log("TRACE ENCOUNTER: Kein Ereignis in diesem Zug.");
            return;
        }

        // 2. Blockade: Kein Event, wenn der Spieler in einer Kneipe ist
        if (state.isInPub) {
            log("TRACE ENCOUNTER: Wurf gelingt, aber Abbruch (In Kneipe).");
            return;
        }

        log("TRACE ENCOUNTER: TREFFER! Berechne Gewichtung...");

        // 3. Gewichtete Ziehung (Basis 550)
        const totalWeight = ENCOUNTERS.reduce((sum, e) => sum + e.weight, 0);
        let roll = Math.random() * totalWeight;
        
        let selectedEvent = null;
        for (const encounter of ENCOUNTERS) {
            if (roll < encounter.weight) {
                selectedEvent = encounter;
                break;
            }
            roll -= encounter.weight;
        }

        // 4. Trigger abfeuern
        if (selectedEvent) {
            log("TRACE ENCOUNTER: Event gewählt: " + selectedEvent.title + " (Kosten: " + selectedEvent.cost + "€)");
            eventBus.emit(EVENTS.ENCOUNTER_TRIGGERED, selectedEvent);
        }
    }
}
