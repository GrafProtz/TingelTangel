/**
 * GameConfig - Zentrale Verwaltung aller Balancing-Werte und Konstanten.
 * Verhindert "Magic Numbers" im Code.
 */
export const CONFIG = {
    // Finanzen
    INITIAL_BUDGET: 300,
    RADAR_COST: 50,
    INFO_COST: 10,
    COST_PER_METER: 0.1, // 1 € pro 10 Meter

    // Zeitwerte (in ms)
    PUB_COOLDOWN: 180000,    // 3 Minuten
    RADAR_COOLDOWN: 300000,  // 5 Minuten
    RADAR_DURATION: 5000,    // 5 Sekunden Sichtbarkeit
    REWARD_READ_TIME: 10000, // 10 Sekunden für Option A
    ARRIVAL_ANIM_TIME: 1200, // Zeit bis Overlay nach Ankunft erscheint

    // Polizei & Risiko
    POLICE_MAX_RADIUS: 3000,
    POLICE_MAX_MALUS: 30,
    POLICE_HARD_CAP: 40,
    
    // Gameplay
    INFO_MENU_AUTO_OPEN_TURNS: 5,
    PROXIMITY_TRIGGER_DISTANCE: 50 // Meter
};
