import { MapData } from './MapData.js';
import { log } from './Utils.js';
import { CONFIG } from './GameConfig.js';
import { STRINGS } from './GameStrings.js';
import { eventBus } from './EventBus.js';
import { DialogFactory } from './DialogFactory.js';
import { EVENTS } from './EventTypes.js';
import { BudgetManager } from './BudgetManager.js';
import { MovementEngine } from './MovementEngine.js';
import { RiskCalculator } from './RiskCalculator.js';
import { GameState } from './GameState.js';
import { MovementController } from './MovementController.js';
import { CrimeController } from './CrimeController.js';
import { EconomyController } from './EconomyController.js';

/**
 * Game - Bootstrap und Lifecycle-Manager.
 *
 * ARCHITEKTUR (nach Refactoring Etappe 2-4):
 * - Instanziiert und verdrahtet alle Controller per Dependency Injection.
 * - Verwaltet den Missions-Lifecycle (Start, Hydrate, Pause, Resume).
 * - Alle Geschaeftslogik ist in spezialisierte Controller ausgelagert:
 *   - MovementController: Bewegung, Proximity, Fahrrad-Toggle
 *   - CrimeController: Einbruch, Fahrraddiebstahl, Kategorien
 *   - EconomyController: Pub, Barber, Kredit, Radar, Encounter, Purchases
 */
class Game {
    // Private Fields
    #mapData;
    #missionService;
    #budgetManager;
    #movementEngine;
    #movementController;
    #crimeController;
    #economyController;
    #riskCalculator;
    #gameState;

    /** @type {Function[]} */
    #subscriptions = [];

    /**
     * @param {MapData} mapData
     * @param {MissionService} missionService
     * @param {GameState} gameState
     */
    constructor(mapData, missionService, gameState) {
        this.#mapData = mapData;
        this.#missionService = missionService;
        this.#gameState = gameState;
        this.#budgetManager = new BudgetManager();
        this.#movementEngine = new MovementEngine(this.#mapData);
        this.#riskCalculator = new RiskCalculator(this.#mapData);

        // Etappe 2: Bewegungslogik
        this.#movementController = new MovementController({
            gameState:      this.#gameState,
            movementEngine: this.#movementEngine,
            mapData:        this.#mapData,
            budgetManager:  this.#budgetManager
        });

        // Etappe 3: Crime-Logik
        this.#crimeController = new CrimeController({
            gameState:      this.#gameState,
            riskCalculator: this.#riskCalculator,
            budgetManager:  this.#budgetManager,
            mapData:        this.#mapData
        });

        // Etappe 4: Wirtschaft, Pub, Barber, Kredit
        this.#economyController = new EconomyController({
            gameState:      this.#gameState,
            budgetManager:  this.#budgetManager,
            riskCalculator: this.#riskCalculator,
            mapData:        this.#mapData,
            missionService: this.#missionService
        });

        this.#registerGameControlFlows();
    }

    // ================================================================
    //  Verbleibende Game-Control Flows (RESUME, DEV-TOOLS)
    // ================================================================

    #registerGameControlFlows() {
        this.#subscriptions.push(
            eventBus.subscribe(EVENTS.CMD_RESUME_GAME, () => {
                eventBus.emit(EVENTS.CMD_REMOVE_LOG_ENTRY, { logId: 'goal-find-target' });
                this.resume();
            })
        );

        this.#subscriptions.push(
            eventBus.subscribe(EVENTS.ACTION_TOGGLE_DEV_ENCOUNTERS, () => {
                const newState = !this.#gameState.devEncountersDisabled;
                const msg = newState
                    ? 'Dev-Mode: Zufallsereignisse deaktiviert.'
                    : 'Dev-Mode: Zufallsereignisse wieder aktiv.';
                eventBus.emit(EVENTS.UI_SHOW_TOAST, { message: msg, type: 'info' });
                eventBus.emit(EVENTS.CMD_MUTATE_STATE, { devEncountersDisabled: newState });
            })
        );
    }

    // ================================================================
    //  State & Getters
    // ================================================================

    getState() {
        return {
            ...this.#gameState.getState(),
            ...this.#budgetManager.getFinanceState(),
            isMoving: this.#movementEngine.isMoving
        };
    }

    // ================================================================
    //  Notifications (Internal)
    // ================================================================

    #emitMissionUpdate() {
        eventBus.emit(EVENTS.STATE_MISSION_CHANGED, {
            phase: this.#gameState.missionPhase,
            moveCount: this.#gameState.moveCount
        });
    }

    // ================================================================
    //  Mission & Lifecycle
    // ================================================================

    startMission(startNodeId, targetNodeId, pubName) {
        this.#budgetManager.init();
        
        eventBus.emit(EVENTS.CMD_MUTATE_STATE, {
            budget: CONFIG.ECONOMY.INITIAL_BUDGET,
            currentPlayerNodeId: String(startNodeId),
            gameActive: false,
            targetPubNodeId: String(targetNodeId),
            targetPubName: pubName || 'Kneipe',
            radarUnlocked: false,
            lastRadarTime: 0,
            lastPubVisit: 0,
            showPubCooldownText: false,
            moveCount: 0,
            missionPhase: 1,
            infoMenuOpenUntilMove: -1,
            isInfoMenuOpen: false,
            activeCrimeTargets: [],
            logbook: [],
            isInPub: false,
            firstMoveFired: false
        });

        log('Mission gestartet. Ziel-ID:', targetNodeId);

        const cityName = this.#mapData.cityName || 'der Stadt';
        eventBus.emit(EVENTS.UI_SHOW_CASCADE, DialogFactory.getWelcomeDialog(cityName, pubName || 'Kneipe'));
    }

    triggerIntroRender() {
        eventBus.emit(EVENTS.CMD_MUTATE_STATE, {}); // Trigger broadcast

        setTimeout(() => {
            eventBus.emit(EVENTS.CMD_MUTATE_STATE, { gameActive: true });
            eventBus.emit(EVENTS.SYS_INTRO_COMPLETE);
        }, 6000);
    }

    hydrateState(savedState) {
        if (!savedState) return;

        this.#budgetManager.hydrate(savedState);
        // Hydrierung des States erfolgt nun im StateController via main.js oder hier
        eventBus.emit(EVENTS.CMD_MUTATE_STATE, savedState); 

        this.#movementEngine.stop();
        eventBus.emit(EVENTS.CMD_MUTATE_STATE, { firstMoveFired: true });

        log('Spielstand geladen. Knoten:', savedState.currentPlayerNodeId);

        this.#emitMissionUpdate();
    }

    pause() {
        this.#movementEngine.stop();
        eventBus.emit(EVENTS.SYS_GAME_PAUSED);
        eventBus.emit(EVENTS.CMD_MUTATE_STATE, { gameActive: false });
    }

    resume() {
        const delta = { gameActive: true };
        if (this.#gameState.isInPub) {
            delta.lastPubVisit = Date.now();
            delta.isInPub = false;
        }
        eventBus.emit(EVENTS.CMD_MUTATE_STATE, delta);
        eventBus.emit(EVENTS.SYS_GAME_RESUMED);
    }

    isGameActive() {
        return this.#gameState.gameActive;
    }

    /**
     * Kaskadierender Teardown: Zerstört alle Controller und meldet eigene Listener ab.
     */
    destroy() {
        log('[GAME] Kaskadierender Teardown wird ausgefuehrt...');
        
        // 1. Controller zerstoeren
        if (this.#movementController) this.#movementController.destroy();
        if (this.#crimeController)    this.#crimeController.destroy();
        if (this.#economyController)  this.#economyController.destroy();

        // 2. Eigene Subscriptions abmelden
        this.#subscriptions.forEach(unsub => unsub());
        this.#subscriptions = [];

        log('[GAME] Teardown abgeschlossen.');
    }
}

export { Game };
