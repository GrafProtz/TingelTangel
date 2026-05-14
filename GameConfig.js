const urlParams = new URLSearchParams(window.location.search);
const isDebug = urlParams.get('debug') === 'true';

/**
 * GameConfig - Zentrale Verwaltung aller Balancing-Werte und Konstanten.
 * Verhindert "Magic Numbers" im Code.
 */
export const CONFIG = {
    DEBUG_MODE: isDebug,
    
    ECONOMY: {
        INITIAL_BUDGET: 300,
        COST_PER_METER_FOOT: 0.10,
        COST_PER_METER_BIKE: 0.15,
        MIN_STEP_COST: 1.0,
        
        RADAR_COST: 50,
        INFO_COST: 10,
        BARBER_COST: 50,
        BOLT_CUTTER_COST: 75,
        INVESTMENT_CONSULTANT_COST: 75,
        
        LOAN_AMOUNT: 1500,
        LOAN_BASE_DEBT: 2000,
        LOAN_INTEREST_PER_STEP: 1.0,
        
        FINE_FACTOR_BURGLARY: 0.2, // 20% des Budgets
        FINE_FACTOR_BICYCLE: 0.1,  // 10% des Budgets
        FINE_FACTOR_PUB: 0.5,      // 50% der Beute (bei Kneipen-Misserfolg)
        
        BURGLARY_REWARDS: {
            EASY: 180,
            MEDIUM: 450,
            HARD: 1350
        }
    },
    
    TIMERS: {
        PUB_COOLDOWN: 60000,
        RADAR_COOLDOWN: 300000,
        RADAR_DURATION: 5000,
        REWARD_READ_TIME: 10000,
        ARRIVAL_ANIM_TIME: 1200,
    },
    
    RISK: {
        BASE_BICYCLE_RISK: 9.7,
        BARBER_RISK_REDUCTION: 0.5,
        POLICE_INTERFERENCE_FACTOR: 15,
        POLICE_DETECTION_RADIUS: 500,
        POLICE_DETECTION_MAX_RISK: 25,
        
        MAX_RISK_CAP: 95,
        HARD_RISK_CAP: 98,
        
        CATEGORY_STATS: {
            residential: { baseRisk: 15, abortRate: 15, minLoot: 150,  maxLoot: 5000,  label: 'Wohnhaus', mult: 1.0 },
            commercial:  { baseRisk: 30, abortRate: 28, minLoot: 500,  maxLoot: 15000, label: 'Gewerbeobjekt', mult: 1.2 },
            public:      { baseRisk: 30, abortRate: 25, minLoot: 100,  maxLoot: 8000,  label: 'Öffentliche Einrichtung', mult: 1.5 },
            allotments:  { baseRisk: 15, abortRate: 15, minLoot: 50,   maxLoot: 1950,  label: 'Kleingarten/Schuppen', mult: 0.6 },
            bicycle:     { baseRisk: 9.7, abortRate: 0, minLoot: 0,    maxLoot: 0,     label: 'Fahrradständer', mult: 1.0 }
        },
        
        PUB_VARIANTS: {
            A: { baseRisk: 10 },
            B: { baseRisk: 30 },
            C: { baseRisk: 60 },
            D: { baseRisk: 80 }
        }
    },
    
    MAP: {
        PROXIMITY_TRIGGER_DISTANCE: 50,
        MIN_DISTANCE_BIKE: 200,
        MIN_DISTANCE_POI: 150,
        MAX_DISTANCE_TUTORIAL_PUB: 150,
        POLICE_MAX_RADIUS: 3000,
        POLICE_MAX_MALUS: 30,
        POLICE_HARD_CAP: 40
    },

    PLAYER: {
        SPEED_FOOT: 120, // m/s
        SPEED_BIKE: 240,
        BIKE_COST_MULTIPLIER: 1.5
    }
};
