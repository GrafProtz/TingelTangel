const urlParams = new URLSearchParams(window.location.search);
const isDebug = urlParams.get('debug') === 'true';

/**
 * GameConfig - Zentrale Verwaltung aller Balancing-Werte und Konstanten.
 * Verhindert "Magic Numbers" im Code.
 */
export const CONFIG = {
    // --- System & Debug ---
    DEBUG_MODE: isDebug,
    
    // --- Economy: Budget & Prices ---
    INITIAL_BUDGET: 300,
    COST_PER_METER: 0.1,
    
    PRICES: {
        BARBER: 50,
        BARBER_TIP: 50, // Alias für Konsistenz
        BOLT_CUTTER: 75,
        CONSULTANT: 75,
        RADAR_UNLOCK: 50,
        INFO_TIP: 10
    },
    
    LOAN: {
        AMOUNT: 1500,
        REPAYMENT_BASE: 2000,
        STEP_INTEREST: 1.0 // 1€ pro Schritt
    },

    // --- Mission & Spawning ---
    MIN_DISTANCE_POI: 150,
    MAX_DISTANCE_TUTORIAL_PUB: 150,
    MIN_DISTANCE_BIKE: 200,
    PROXIMITY_TRIGGER_DISTANCE: 50,
    
    COOLDOWNS: {
        PUB: 60000,     // 60 Sek
        RADAR: 300000   // 5 Min
    },

    TIMING: {
        RADAR_DURATION: 5000,
        REWARD_READ_TIME: 10000,
        ARRIVAL_ANIM_TIME: 1200
    },

    // --- Risk & Balancing ---
    RISK_FACTORS: {
        PUB_EASY: 20,
        PUB_HARD: 85,
        BURGLARY_EASY: 15,
        BURGLARY_MEDIUM: 35,
        BURGLARY_HARD: 70,
        BICYCLE_BASE: 9.7,
        POLICE_MAX_RADIUS: 3000,
        POLICE_MAX_MALUS: 30,
        POLICE_HARD_CAP: 40,
        INTERFERENCE_MALUS: 15,
        DISGUISE_BUFF: 0.5,
        ABORT_RESIDENTIAL: 15,
        ABORT_COMMERCIAL: 28,
        ABORT_PUBLIC: 25,
        ABORT_ALLOTMENTS: 15,
        ENCOUNTER_CHANCE: 0.05
    },

    MULTIPLIERS: {
        BIKING_SPEED: 2.0,
        BIKING_COST: 1.5,
        TYPE_RESIDENTIAL: 1.0,
        TYPE_COMMERCIAL: 1.2,
        TYPE_PUBLIC: 1.5,
        TYPE_ALLOTMENTS: 0.6
    },

    MISSION: {
        MIN_POI_DISTANCE: 50,
        MAX_POI_SPREAD: 600,
        MIN_TARGET_SPACING: 200
    },

    MOVEMENT: {
        SPEED_WALKING: 120,
        SPEED_BIKING: 240
    },

    MAP: {
        FETCH_RANGE: 0.008
    },

    REWARDS: {
        BURGLARY_EASY: 180,
        BURGLARY_MEDIUM: 450,
        BURGLARY_HARD: 1350
    }
};
