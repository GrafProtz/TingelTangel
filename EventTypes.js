/**
 * EventTypes.js - Zentrale Registry für alle Event-Namen im Spiel.
 * Ersetzt den monolithischen GAME_STATE_CHANGED Broadcast durch granulare Events.
 */
export const EVENTS = {
    // --- GAME DOMAIN ---
    GAME: {
        /** Payload: { isWin, reason, budget } */
        OVER: 'GAME:OVER',
        /** Payload: { isPaused } */
        PAUSED_STATE_CHANGED: 'GAME:PAUSED_STATE_CHANGED',
        /** Payload: { phase, moveCount } */
        MISSION_PHASE_CHANGED: 'GAME:MISSION_PHASE_CHANGED',
        /** Keine Payload */
        SAVE_COMPLETED: 'GAME:SAVE_COMPLETED'
    },

    // --- PLAYER DOMAIN ---
    PLAYER: {
        /** Payload: { nodeId, lat, lon, isBiking } */
        MOVED: 'PLAYER:MOVED',
        /** Payload: { lat, lon, budget } */
        POSITION_UPDATED: 'PLAYER:POSITION_UPDATED',
        /** Payload: { total, diff } */
        BUDGET_CHANGED: 'PLAYER:BUDGET_CHANGED',
        /** Payload: { hasBicycle, isBiking, isDisguised, hasBoltCutter } */
        ITEMS_CHANGED: 'PLAYER:ITEMS_CHANGED'
    },

    // --- MAP DOMAIN ---
    MAP: {
        /** Payload: { pub, crimeTargets, bicycleTargets, barber } */
        TARGETS_UPDATED: 'MAP:TARGETS_UPDATED',
        /** Payload: { coords } */
        CAMERA_FIT_BOUNDS: 'MAP:CAMERA_FIT_BOUNDS_REQUESTED'
    },

    // --- UI DOMAIN ---
    UI: {
        /** Payload: { isOpen } */
        INFO_MENU_TOGGLED: 'UI:INFO_MENU_TOGGLED',
        /** Payload: { cards } */
        HUD_INFO_UPDATED: 'UI:HUD_INFO_UPDATED',
        /** Payload: { msg, type } */
        SHOW_TOAST: 'UI:SHOW_TOAST',
        /** Payload: { title, body, buttons } */
        SHOW_DIALOG: 'UI:SHOW_DIALOG'
    }
};
