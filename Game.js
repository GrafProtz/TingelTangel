import { MapData } from './MapData.js';

/**
 * Game - Die Logik-Schicht (Controller/State-Management).
 * Verwaltet den Spielzustand und validiert Aktionen.
 */
class Game {
    /**
     * @param {MapData} mapData - Instanz der Daten-Schicht.
     */
    constructor(mapData) {
        this._mapData = mapData;
        
        // Zentrales State Management
        this._state = {
            budget: 300,
            currentPlayerNodeId: null,
            gameActive: false,
            moveCounter: 0,
            targetPubNodeId: null
        };

        this._stateChangeCallbacks = [];
    }

    /**
     * Registriert einen Callback für Zustandsänderungen.
     */
    onStateChange(callback) {
        if (typeof callback === 'function') {
            this._stateChangeCallbacks.push(callback);
            callback({ ...this._state });
        }
    }

    _notify() {
        const stateCopy = { ...this._state };
        this._stateChangeCallbacks.forEach(callback => callback(stateCopy));
    }

    /**
     * Initialisiert eine neue Mission.
     */
    startMission(startNodeId, targetNodeId) {
        this._state = {
            budget: 300,
            currentPlayerNodeId: startNodeId,
            gameActive: true,
            moveCounter: 0,
            targetPubNodeId: targetNodeId
        };
        this._notify();
    }

    /**
     * Führt eine Bewegung aus, falls valide.
     */
    moveToNode(nodeId) {
        if (!this._state.gameActive) return;

        const neighbors = this._mapData.getNeighbors(this._state.currentPlayerNodeId);
        const isNeighbor = neighbors.some(nId => String(nId) === String(nodeId));

        if (isNeighbor) {
            this._state.currentPlayerNodeId = nodeId;
            this._state.budget -= 10;
            this._state.moveCounter++;

            if (this._state.budget <= 0) {
                this._state.budget = 0;
                this._state.gameActive = false;
            }

            this._notify();
        } else {
            console.warn(`Game: Node ${nodeId} ist kein gültiger Nachbar.`);
        }
    }

    getState() {
        return { ...this._state };
    }
}

export { Game };
