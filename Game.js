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

    /**
     * @param {MapData} mapData
     * @param {MissionService} missionService
     */
    constructor(mapData, missionService) {
        this.#mapData = mapData;
        this.#missionService = missionService;
        this.#gameState = new GameState();
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
        eventBus.subscribe(EVENTS.RESUME_GAME, () => {
            eventBus.emit(EVENTS.REMOVE_LOG_ENTRY, { logId: 'goal-find-target' });
            this.resume();
        });

        eventBus.subscribe(EVENTS.TOGGLE_DEV_ENCOUNTERS, () => {
            this.#gameState.devEncountersDisabled = !this.#gameState.devEncountersDisabled;
            const msg = this.#gameState.devEncountersDisabled
                ? 'Dev-Mode: Zufallsereignisse deaktiviert.'
                : 'Dev-Mode: Zufallsereignisse wieder aktiv.';
            eventBus.emit(EVENTS.SHOW_TOAST, { message: msg, type: 'info' });
            this.#notifyStateChange();
        });
    }

    // ================================================================
    //  State & Getters
    // ================================================================

    getState() {
        return this.#gameState.collectState(
            this.#budgetManager.getFinanceState(),
            { isMoving: this.#movementEngine.isMoving }
        );
    }

    checkProximity(targetNodeId) {
        return this.#movementController.checkProximity(targetNodeId);
    }

    // ================================================================
    //  Notifications (Internal)
    // ================================================================

    #notifyStateChange() {
        eventBus.emit(EVENTS.GAME_STATE_CHANGED, this.getState());
        this.#updateHUDInfo();
    }

    #emitMissionUpdate() {
        eventBus.emit(EVENTS.MISSION_STATE_CHANGED, {
            phase: this.#gameState.missionPhase,
            moveCount: this.#gameState.moveCount
        });
    }

    // ================================================================
    //  Mission & Lifecycle
    // ================================================================

    startMission(startNodeId, targetNodeId, pubName) {
        this.#budgetManager.init();
        this.#gameState.currentPlayerNodeId = String(startNodeId);
        this.#gameState.gameActive = false;
        this.#movementEngine.stop();
        this.#gameState.targetPubNodeId = String(targetNodeId);
        this.#gameState.targetPubName = pubName || 'Kneipe';
        this.#gameState.radarUnlocked = false;
        this.#gameState.lastRadarTime = 0;
        this.#gameState.lastPubVisit = 0;
        this.#gameState.showPubCooldownText = false;
        this.#gameState.moveCount = 0;
        this.#gameState.missionPhase = 1;
        this.#gameState.infoMenuOpenUntilMove = -1;
        this.#gameState.isInfoMenuOpen = false;
        this.#gameState.activeCrimeTargets = [];
        this.#gameState.logbook = [];
        this.#gameState.isInPub = false;
        this.#gameState.firstMoveFired = false;

        log('Mission gestartet. Ziel-ID:', this.#gameState.targetPubNodeId);

        const cityName = this.#mapData.cityName || 'der Stadt';
        eventBus.emit(EVENTS.SHOW_INFO_CASCADE, DialogFactory.getWelcomeDialog(cityName, this.#gameState.targetPubName));
    }

    triggerIntroRender() {
        this.#notifyStateChange();

        setTimeout(() => {
            this.#gameState.gameActive = true;
            eventBus.emit(EVENTS.INTRO_COMPLETE);
        }, 6000);
    }

    hydrateState(savedState) {
        if (!savedState) return;

        this.#budgetManager.hydrate(savedState);
        this.#gameState.hydrate(savedState);

        this.#movementEngine.stop();
        this.#gameState.firstMoveFired = true;

        log('Spielstand geladen. Knoten:', this.#gameState.currentPlayerNodeId);

        this.#notifyStateChange();
        this.#emitMissionUpdate();
    }

    pause() {
        this.#gameState.gameActive = false;
        this.#movementEngine.stop();
        eventBus.emit(EVENTS.GAME_PAUSED);
        this.#notifyStateChange();
    }

    resume() {
        if (this.#gameState.isInPub) {
            this.#gameState.lastPubVisit = Date.now();
            this.#gameState.isInPub = false;
        }
        this.#gameState.gameActive = true;
        eventBus.emit(EVENTS.GAME_RESUMED);
        this.#notifyStateChange();
    }

    isGameActive() {
        return this.#gameState.gameActive;
    }

    // ================================================================
    //  Legacy-Bridges (werden schrittweise entfernt)
    // ================================================================

    /** @deprecated Nutze eventBus.emit(EVENTS.PLAYER_MOVE_INTENT, { targetId }) */
    moveToNode(targetId) {
        eventBus.emit(EVENTS.PLAYER_MOVE_INTENT, { targetId });
    }

    /** Delegiert an CrimeController */
    calculateTargetRisk(targetNode) {
        return this.#crimeController.calculateTargetRisk(targetNode);
    }

    /** Delegiert an CrimeController */
    calculateLoot(riskData) {
        return this.#crimeController.calculateLoot(riskData);
    }

    /** Delegiert an CrimeController */
    setCrimeTargets(targets) {
        this.#crimeController.setCrimeTargets(targets);
    }

    /** Delegiert an EconomyController */
    canAfford(amount) {
        return this.#economyController.canAfford(amount);
    }

    /** Delegiert an EconomyController */
    deductBudget(amount) {
        this.#economyController.deductBudget(amount);
    }

    /** Delegiert an EconomyController */
    addReward(amount) {
        this.#economyController.addReward(amount);
    }

    /** Delegiert an EconomyController */
    triggerRadar(force) {
        return this.#economyController.triggerRadar(force);
    }

    /** Delegiert an EconomyController */
    findNearestHairdresser() {
        return this.#economyController.findNearestHairdresser();
    }

    /** Delegiert an EconomyController */
    setActiveBarber(barber) {
        this.#economyController.setActiveBarber(barber);
    }

    getActiveBicycleTargets() {
        return this.#gameState.activeBicycleTargets;
    }

    toggleInfoMenu() {
        this.#gameState.isInfoMenuOpen = !this.#gameState.isInfoMenuOpen;
        eventBus.emit(EVENTS.INFO_MENU_STATE, this.#gameState.isInfoMenuOpen);
        this.#notifyStateChange();
    }

    // ================================================================
    //  HUD
    // ================================================================

    #updateHUDInfo() {
        if (!this.#gameState.gameActive && this.#gameState.currentPlayerNodeId === null) {
            eventBus.emit(EVENTS.INFO_UPDATED, []);
            return;
        }

        const infoCards = [];
        const targetNode = this.#mapData.getNode(this.#gameState.targetPubNodeId);
        const targetName = targetNode && targetNode.tags ? targetNode.tags.name : 'Unbekannte Gaststaette';

        if (this.#gameState.gameActive) {
            if (this.#gameState.missionPhase === 1) {
                infoCards.push(
                    { title: 'AKTUELLES ZIEL', body: targetName },
                    { title: 'AUFGABE', body: 'Erreiche die Kneipe, um Informationen zu sammeln.' },
                    { title: 'STEUERUNG', body: 'Klicke auf die gruenen Punkte, um dich durch die Stadt zu bewegen.' }
                );
            } else if (this.#gameState.missionPhase === 2) {
                infoCards.push({
                    title: 'RADAR-SYSTEM',
                    body: 'Druecke "P", um Standorte der Polizei fuer 5 Sek. aufzudecken. (5 Min. Cooldown)'
                });
            }
        }

        if (this.#gameState.showPubCooldownText) {
            infoCards.push({
                title: 'HINWEIS',
                body: 'Du kannst erst wieder in drei Minuten die Kneipe besuchen.'
            });
        }

        eventBus.emit(EVENTS.INFO_UPDATED, infoCards);
    }

    /**
     * getBurglaryData bleibt vorerst hier als Legacy-Bridge.
     * Wird in Etappe 5 in den CrimeController/DialogFactory verschoben.
     */
    getBurglaryData(targetId) {
        const target = this.#gameState.activeCrimeTargets
            ? this.#gameState.activeCrimeTargets.find(t => t.id === targetId)
            : null;
        if (!target) return null;

        const riskData = this.#riskCalculator.getPoliceRiskModifier([target.lat, target.lon]);

        let mult = 1.0;
        if (target.type === 'commercial') mult = 1.2;
        if (target.type === 'public') mult = 1.5;
        if (target.type === 'allotments') mult = 0.6;

        const disguiseBonus = this.#gameState.isDisguised ? 0.5 : 1.0;
        const disguiseText = this.#gameState.isDisguised
            ? '<div style="color: #4ade80; font-weight: bold; margin-bottom: 4px;">Tarnung aktiv (-50% Risiko)</div>'
            : '';

        const warning = riskData.riskMalus > 0 ? 'WARNUNG ' : '';
        const warningSuffix = riskData.riskMalus > 0 ? ' (Hohe Polizeipraesenz!)' : '';

        return {
            title: STRINGS.interactions.burglary.title(target.type),
            options: {
                A: {
                    text: warning + STRINGS.interactions.burglary.optionA + warningSuffix,
                    risk: Math.min(95, Math.round((CONFIG.RISK_BURGLARY_EASY + riskData.riskMalus) * mult * disguiseBonus)),
                    reward: 180,
                    preview: disguiseText + (warning ? '<div style="color: #ef4444; font-weight: bold;">WARNUNG: Hohes Risiko durch Polizei!</div>' : '') + STRINGS.interactions.burglary.previewA,
                    successMsg: STRINGS.interactions.burglary.success,
                    caughtMsg: STRINGS.interactions.burglary.caught
                },
                B: {
                    text: warning + STRINGS.interactions.burglary.optionB + warningSuffix,
                    risk: Math.min(95, Math.round((CONFIG.RISK_BURGLARY_MEDIUM + riskData.riskMalus) * mult * disguiseBonus)),
                    reward: 450,
                    preview: disguiseText + (warning ? '<div style="color: #ef4444; font-weight: bold;">WARNUNG: Hohes Risiko durch Polizei!</div>' : '') + STRINGS.interactions.burglary.previewB,
                    successMsg: STRINGS.interactions.burglary.success,
                    caughtMsg: STRINGS.interactions.burglary.caught
                },
                C: {
                    text: warning + STRINGS.interactions.burglary.optionC + warningSuffix,
                    risk: Math.min(98, Math.round((CONFIG.RISK_BURGLARY_HARD + riskData.riskMalus) * mult * disguiseBonus)),
                    reward: 1350,
                    preview: disguiseText + (warning ? '<div style="color: #ef4444; font-weight: bold;">WARNUNG: Hohes Risiko durch Polizei!</div>' : '') + STRINGS.interactions.burglary.previewC,
                    successMsg: STRINGS.interactions.burglary.success,
                    caughtMsg: STRINGS.interactions.burglary.caught
                }
            }
        };
    }
}

export { Game };
