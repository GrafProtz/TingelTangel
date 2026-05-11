/**
 * GameController.js - Der zentrale Orchestrator (Refactored).
 */
import { eventBus } from './EventBus.js';
import { gameState, GamePhase } from './GameState.js';
import { overpassService } from './OverpassService.js';
import { EVENTS } from './EventTypes.js';

class GameController {
    constructor() {
        if (GameController.instance) return GameController.instance;
        GameController.instance = this;
        this.#setupEventListeners();
    }

    async init(startCoords) {
        gameState.setPhase(GamePhase.INIT);
        gameState.updatePlayer({
            lat: startCoords[0],
            lon: startCoords[1],
            budget: 300
        });

        try {
            await overpassService.fetchCityData(startCoords);
            gameState.setPhase(GamePhase.PLAYING);
        } catch (error) {
            gameState.setPhase(GamePhase.GAME_OVER);
        }
    }

    #setupEventListeners() {
        eventBus.subscribe(EVENTS.PLAYER_MOVE_INTENT, (data) => {
            if (gameState.phase !== GamePhase.PLAYING) return;
            if (gameState.player.budget >= data.cost) {
                gameState.updatePlayer({
                    nodeId: data.targetNodeId,
                    lat: data.coords[0],
                    lon: data.coords[1],
                    budget: gameState.player.budget - data.cost
                });
                gameState.incrementMoveCount();
            } else {
                eventBus.emit(EVENTS.SHOW_TOAST, { message: "Pleite!", type: 'fail' });
            }
        });
    }
}

export const gameController = new GameController();
