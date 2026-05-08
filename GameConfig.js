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
    PUB_COOLDOWN: 60000,     // 60 Sekunden (optimiert)
    RADAR_COOLDOWN: 300000,  // 5 Minuten
    RADAR_DURATION: 5000,    // 5 Sekunden Sichtbarkeit
    REWARD_READ_TIME: 10000, // 10 Sekunden für Option A
    ARRIVAL_ANIM_TIME: 1200, // Zeit bis Overlay nach Ankunft erscheint

    // Polizei & Risiko
    POLICE_MAX_RADIUS: 3000,
    POLICE_MAX_MALUS: 30,
    POLICE_HARD_CAP: 40,
    
    // Risiko-Balancing (Basis-Prozentwerte)
    RISK_PUB_EASY: 20,
    RISK_PUB_HARD: 85,
    RISK_BURGLARY_EASY: 15,
    RISK_BURGLARY_MEDIUM: 35,
    RISK_BURGLARY_HARD: 70,

    // Gebäude-Kategorien Basis-Risiko
    RISK_ALLOTMENTS: 10,
    RISK_RESIDENTIAL: 25,
    RISK_COMMERCIAL: 50,
    RISK_PUBLIC: 70,
    
    // Gameplay
    PROXIMITY_TRIGGER_DISTANCE: 50, // Meter
    
    // Spawner-Distanzen (Mindestabstände)
    MIN_DISTANCE_BIKE: 200, // Mindestens 200 Meter vom Startpunkt
    MIN_DISTANCE_POI: 350,  // Mindestens 350 Meter vom Startpunkt
    MAX_DISTANCE_TUTORIAL_PUB: 150 // Maximal 150 Meter für die erste Kneipe
};
