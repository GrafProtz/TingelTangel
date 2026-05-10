/**
 * GameState.js - Die "Single Source of Truth" für GridCrime.
 */
import { eventBus } from './EventBus.js';

export const GamePhase = {
    INIT: 'INIT',
    LOADING_MAP: 'LOADING_MAP',
    READY: 'READY',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    GAME_OVER: 'GAME_OVER'
};

class GameState {
    #phase = GamePhase.INIT;
    #player = {
        nodeId: null,
        lat: 0,
        lon: 0,
        budget: 0,
        isBiking: false,
        isDisguised: false
    };
    #world = {
        cityName: '',
        activeCrimeTargets: [],
        moveCount: 0
    };

    constructor() {
        if (GameState.instance) return GameState.instance;
        GameState.instance = this;
    }

    get phase() { return this.#phase; }
    get player() { return { ...this.#player }; }
    get world() { return structuredClone(this.#world); }

    getState() {
        return structuredClone({
            phase: this.#phase,
            player: this.#player,
            world: this.#world
        });
    }

    setPhase(newPhase) {
        if (!Object.values(GamePhase).includes(newPhase)) return;
        if (this.#phase === newPhase) return;
        const oldPhase = this.#phase;
        this.#phase = newPhase;
        eventBus.emit('PHASE_CHANGED', { newPhase, oldPhase, state: this.getState() });
        this.#notifyChange();
    }

    updatePlayer(update) {
        this.#player = { ...this.#player, ...update };
        this.#notifyChange();
    }

    setCrimeTargets(targets) {
        this.#world.activeCrimeTargets = Array.isArray(targets) ? [...targets] : [];
        this.#notifyChange();
    }

    incrementMoveCount() {
        this.#world.moveCount++;
        this.#emitGlobalUpdate();
    }

    #notifyChange() {
        eventBus.emit('STATE_CHANGED', this.getState());
    }

    #emitGlobalUpdate() {
        eventBus.emit('STATE_CHANGED', this.getState());
    }
}

const gameState = new GameState();
Object.freeze(gameState);
export { gameState };
