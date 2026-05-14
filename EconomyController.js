import { eventBus } from './EventBus.js';
import { EVENTS } from './EventTypes.js';
import { CONFIG } from './GameConfig.js';
import { STRINGS } from './GameStrings.js';
import { log } from './Utils.js';

/**
 * EconomyController - Verwaltet Pub-Interaktionen, Kaufabwicklungen,
 * Barber-Flow, Kredit-System und Radar.
 *
 * ARCHITEKTUR:
 * - 100% UI-agnostisch: Kein HTML, kein DOM, keine DialogFactory.
 * - Feuert nach Berechnungen reine Daten-Events.
 * - Die UI-Schicht (main.js / UIBridge) lauscht und rendert Dialoge.
 *
 * @param {GameState}      gameState
 * @param {BudgetManager}  budgetManager
 * @param {RiskCalculator} riskCalculator
 * @param {MapData}        mapData
 * @param {MissionService} missionService
 */
export class EconomyController {
    #gameState;
    #budgetManager;
    #riskCalculator;
    #mapData;
    #missionService;

    /** @type {Function[]} */
    #subscriptions = [];

    #sub(eventName, callback) {
        this.#subscriptions.push(eventBus.subscribe(eventName, callback));
    }

    #resume() {
        eventBus.emit(EVENTS.CMD_MUTATE_STATE, { gameActive: true });
    }

    #pause() {
        eventBus.emit(EVENTS.CMD_MUTATE_STATE, { gameActive: false });
    }

    constructor({ gameState, budgetManager, riskCalculator, mapData, missionService }) {
        this.#gameState      = gameState;
        this.#budgetManager  = budgetManager;
        this.#riskCalculator = riskCalculator;
        this.#mapData        = mapData;
        this.#missionService = missionService;

        this.#registerListeners();
    }

    // ================================================================
    //  Event-Registrierung
    // ================================================================

    #registerListeners() {
        this.#registerPubInteraction();
        this.#registerPurchaseFlows();
        this.#registerBarberFlow();
        this.#registerLoanFlow();
        this.#registerEncounterHooks();
    }

    // ================================================================
    //  Pub-Interaktion
    // ================================================================

    #registerPubInteraction() {
        // Pub-Ankunft
        this.#sub(EVENTS.CMD_PUB_INTERACTION, () => {
            this.#checkPubArrival();
        });

        // Barber-Interaktion (Etappe 5)
        this.#sub(EVENTS.CMD_BARBER_TARGET, ({ barber }) => {
            const playerIdStr = String(this.#gameState.currentPlayerNodeId);
            const targetIdStr = String(barber.accessNodeId || barber.id);
            
            // Umkreisprüfung inkl. Nachbarn (analog CrimeController)
            const neighbors = this.#mapData.getNeighbors(playerIdStr);
            const isNear = (playerIdStr === targetIdStr) || 
                           neighbors.some(n => String(n.id) === targetIdStr);
            
            if (!isNear) {
                eventBus.emit(EVENTS.UI_SHOW_TOAST, { message: "Geh naeher ran an den Salon!", type: 'fail' });
                return;
            }
            
            this.#pause();
            eventBus.emit(EVENTS.SYS_GAME_PAUSED);
            eventBus.emit(EVENTS.NOTIFY_BARBER_INTERACTION, { barber, price: CONFIG.ECONOMY.BARBER_COST });
        });

        // Barber-Info (Tipp vom Kneipier)
        this.#sub(EVENTS.CMD_REQUEST_BARBER_INFO, () => {
            const barber = this.findNearestHairdresser();
            eventBus.emit(EVENTS.NOTIFY_BARBER_INFO, { barber });
        });

        // Spieler waehlt eine Pub-Option (A/B/C/D)
        this.#sub(EVENTS.ACTION_INTERACTION_SELECTED, (payload) => {
            this.#handleInteractionSelected(payload);
        });
    }

    #checkPubArrival() {
        const diff = (Date.now() - this.#gameState.lastPubVisit) / 1000;
        const cooldownSec = CONFIG.TIMERS.PUB_COOLDOWN / 1000;

        if (diff < cooldownSec) {
            const remaining = Math.ceil(cooldownSec - diff);
            eventBus.emit(EVENTS.UI_SHOW_TOAST, {
                message: 'Der Kneipier ist mal kurz mit einem Gast in den Hinterraum gegangen und hat fuer ' + remaining + ' Sekunden keine Zeit.',
                type: 'fail'
            });
            return;
        }

        eventBus.emit(EVENTS.CMD_MUTATE_STATE, { gameActive: false, isInPub: true });
        eventBus.emit(EVENTS.SYS_PUB_REACHED, { nodeId: this.#gameState.currentPlayerNodeId });
        this.#notifyTargetReached();
    }

    /**
     * Baut das Optionsmenue fuer die Pub-Interaktion auf und feuert es als Daten-Event.
     */
    #notifyTargetReached() {
        const cityName = this.#mapData.cityName || 'dieser Stadt';

        const optionsData = {
            A: { text: STRINGS.interactions.pub.optionA(cityName), cost: CONFIG.ECONOMY.RADAR_COST, risk: 0 },
            B: { text: STRINGS.interactions.pub.optionB(0), requiresConfirmation: false, cost: CONFIG.ECONOMY.INVESTMENT_CONSULTANT_COST },
            C: { text: STRINGS.interactions.pub.optionC(), requiresConfirmation: false, customEvent: EVENTS.ACTION_OPTION_C },
            D: { text: STRINGS.interactions.pub.optionD, requiresConfirmation: false, customEvent: EVENTS.ACTION_OPTION_D }
        };

        const currentNode = this.#mapData.getNode(this.#gameState.currentPlayerNodeId);
        const riskData = this.#riskCalculator.getPoliceRiskModifier([currentNode.lat, currentNode.lon]);

        if (riskData.riskMalus > 0) {
            ['B', 'C'].forEach(k => {
                if (optionsData[k]) {
                    optionsData[k].text = '\uD83D\uDEA8 ' + optionsData[k].text + ' (Erhoehtes Risiko!)';
                }
            });
        }

        eventBus.emit(EVENTS.UI_OPEN_INTERACTION, {
            optionsData,
            riskData,
            getPreviewFn: (key) => this.getInteractionPreview(key)
        });
    }

    // ================================================================
    //  Pub-Optionsauswahl (A/B/C/D)
    // ================================================================

    #handleInteractionSelected({ key, option }) {
        // B = Investitionsberater (eigener Dialog-Flow)
        if (key === 'B') {
            this.#handleInvestmentConsultant();
            return;
        }

        const result = this.#processInteractionDecision(key, option);

        eventBus.emit(EVENTS.CMD_REMOVE_LOG_ENTRY, { logId: 'goal-visit-pub' });
        eventBus.emit(EVENTS.UI_CLOSE_INTERACTION);

        // Radar-Tutorial bei Erstkauf (Option A)
        if (key === 'A' && this.#gameState.radarUnlocked && this.#gameState.missionPhase < 2) {
            this.#triggerRadarTutorial();
        } else {
            this.#resume();
        }
    }

    #processInteractionDecision(key, opt) {
        const targetNode = this.#mapData.getNode(this.#gameState.targetPubNodeId);
        const riskData = targetNode
            ? this.#riskCalculator.getPoliceRiskModifier([targetNode.lat, targetNode.lon])
            : { riskMalus: 0 };

        const finalRisk = opt.risk !== undefined
            ? opt.risk
            : Math.min(100, (opt.risk || 0) + riskData.riskMalus);
        const roll = Math.random() * 100;

        // 1. Radar-Kauf (Key A)
        if (key === 'A') return this.#handleRadarPurchase();

        // 2. Info-Kauf (Key D)
        if (key === 'D') return this.#handleInfoPurchase();

        // 3. Risiko-Check
        if (roll < finalRisk) {
            return this.#handleInteractionFailure(opt);
        }

        // 4. Erfolg
        return this.#handleInteractionSuccess(opt);
    }

    #handleRadarPurchase() {
        if (this.#gameState.radarUnlocked) {
            return STRINGS.interactions.pub.alreadyHaveRadar;
        }

        if (!this.#budgetManager.canAfford(CONFIG.ECONOMY.RADAR_COST)) {
            return STRINGS.interactions.pub.noMoney(CONFIG.ECONOMY.RADAR_COST);
        }

        this.#budgetManager.deductBudget(CONFIG.ECONOMY.RADAR_COST);
        const currentNode = this.#mapData.getNode(this.#gameState.currentPlayerNodeId);
        const risk = this.#riskCalculator.getPoliceRiskModifier([currentNode.lat, currentNode.lon]);
        const msg = STRINGS.interactions.pub.barkeeperInfo(risk.activeStations);

        eventBus.emit(EVENTS.CMD_MUTATE_STATE, { 
            radarUnlocked: true,
            newLogEntry: { time: Date.now(), text: msg, type: 'success' },
            lastPubVisit: Date.now()
        });
        this.#resume();
        return msg;
    }

    #handleInfoPurchase() {
        if (!this.#budgetManager.canAfford(CONFIG.ECONOMY.INFO_COST)) {
            return 'Nicht genug Geld fuer Informationen.';
        }

        this.#budgetManager.deductBudget(CONFIG.ECONOMY.INFO_COST);
        const msg = 'Du kaufst Infos fuer ' + CONFIG.ECONOMY.INFO_COST + ' Euro. Ein Tipp: "Halte dich vom Osten fern."';
        eventBus.emit(EVENTS.CMD_MUTATE_STATE, { 
            newLogEntry: { time: Date.now(), text: msg, type: 'success' },
            lastPubVisit: Date.now()
        });
        this.#resume();
        return msg;
    }

    #handleInteractionFailure(opt) {
        const fine = Math.ceil(opt.reward * CONFIG.ECONOMY.FINE_FACTOR_PUB);
        this.#budgetManager.deductBudget(fine);
        const msg = opt.caughtMsg ? opt.caughtMsg(fine) : 'ERWISCHT! Strafe: ' + fine + ' Euro.';
        eventBus.emit(EVENTS.CMD_MUTATE_STATE, { 
            newLogEntry: { time: Date.now(), text: msg, type: 'fail' },
            lastPubVisit: Date.now()
        });
        this.#resume();
        return msg;
    }

    #handleInteractionSuccess(opt) {
        this.#budgetManager.addReward(opt.reward);
        const msg = opt.successMsg
            ? opt.successMsg(opt.reward)
            : 'Erfolg! Du kassierst ' + opt.reward + ' Euro fuer "' + opt.text + '".';
        eventBus.emit(EVENTS.CMD_MUTATE_STATE, { 
            newLogEntry: { time: Date.now(), text: msg, type: 'success' },
            lastPubVisit: Date.now()
        });
        this.#resume();
        return msg;
    }

    #recordDecision(msg, type) {
        this.#gameState.addLogEntry({ time: Date.now(), text: msg, type: type });
        eventBus.emit(EVENTS.CMD_MUTATE_STATE, { lastPubVisit: Date.now() });
        this.#resume();
    }

    #handleInvestmentConsultant() {
        const cost = CONFIG.ECONOMY.INVESTMENT_CONSULTANT_COST;
        if (!this.#budgetManager.canAfford(cost)) {
            eventBus.emit(EVENTS.SHOW_TOAST, { message: 'Nicht genug Geld fuer den Berater!', type: 'fail' });
            this.#resume();
            return;
        }

        this.#budgetManager.deductBudget(cost);
        eventBus.emit(EVENTS.CMD_REMOVE_LOG_ENTRY, { logId: 'goal-visit-pub' });
        eventBus.emit(EVENTS.CMD_ADD_LOG_ENTRY, {
            shortText: 'Ziel: Halte an den gruenen Knotenpunkten Ausschau nach lukrativen Objekten fuer deinen ersten Bruch.',
            logId: 'goal-find-target',
            notify: true
        });
        eventBus.emit(EVENTS.UI_OPEN_INVESTMENT, { cityName: this.#mapData.cityName });
    }

    #triggerRadarTutorial() {
        const newPhase = 2;
        eventBus.emit(EVENTS.CMD_MUTATE_STATE, { missionPhase: newPhase });
        eventBus.emit(EVENTS.STATE_MISSION_CHANGED, {
            phase: newPhase,
            moveCount: this.#gameState.moveCount
        });

        const count = this.#mapData.getPoliceStations().length;

        // Daten-Event: UI rendert das Tutorial-Modal
        eventBus.emit(EVENTS.NOTIFY_RADAR_TUTORIAL, { stationCount: count });
    }

    /**
     * Vorschau-Daten fuer eine Pub-Option (wird als Callback uebergeben).
     */
    getInteractionPreview(key) {
        const targetNode = this.#mapData.getNode(this.#gameState.targetPubNodeId);
        if (!targetNode) return null;

        const riskData = this.#riskCalculator.getPoliceRiskModifier([targetNode.lat, targetNode.lon]);
        const baseRisk = (key === 'B') ? CONFIG.RISK.PUB_VARIANTS.B.baseRisk : CONFIG.RISK.PUB_VARIANTS.C.baseRisk; // Vereinfacht für Preview
        const finalRisk = Math.min(100, baseRisk + riskData.riskMalus);

        return {
            key: key,
            risk: finalRisk,
            riskMalus: riskData.riskMalus,
            hasPoliceWarning: riskData.riskMalus > 0
        };
    }

    // ================================================================
    //  Kaufabwicklungen (Bolt Cutter, Barber Ticket)
    // ================================================================

    #registerPurchaseFlows() {
        // Bolzenschneider
        this.#sub(EVENTS.CMD_BUY_BOLT_CUTTER, (payload) => {
            const cost = payload.cost || CONFIG.ECONOMY.BOLT_CUTTER_COST;
            if (!this.#budgetManager.canAfford(cost)) {
                eventBus.emit(EVENTS.UI_SHOW_TOAST, { message: 'Nicht genug Geld fuer den Bolzenschneider!', type: 'fail' });
                this.#resume();
                return;
            }

            this.#budgetManager.deductBudget(cost);
            
            const playerNode = this.#mapData.getNode(this.#gameState.currentPlayerNodeId);
            const targets = this.#missionService.spawnBicycleTargets(this.#mapData, playerNode);

            eventBus.emit(EVENTS.CMD_MUTATE_STATE, { 
                hasBoltCutter: true,
                activeBicycleTargets: targets 
            });

            eventBus.emit(EVENTS.CMD_REMOVE_LOG_ENTRY, { logId: 'goal-visit-pub' });

            eventBus.emit(EVENTS.CMD_MUTATE_STATE, {
                newLogEntry: {
                    time: Date.now(),
                    text: 'Ziel: Knacke ein Fahrrad an einem der markierten Stellplaetze.',
                    type: 'info'
                }
            });

            const coordsToFit = [];
            if (playerNode) coordsToFit.push([playerNode.lat, playerNode.lon]);
            targets.forEach(t => coordsToFit.push([t.lat, t.lon]));
            eventBus.emit(EVENTS.CMD_CAMERA_FIT_BOUNDS, coordsToFit);

            eventBus.emit(EVENTS.UI_CLOSE_INTERACTION);
            this.#resume();
        });

        // Friseur-Ticket
        this.#sub(EVENTS.CMD_BUY_BARBER_TICKET, ({ barber, barberName }) => {
            const cost = CONFIG.ECONOMY.BARBER_COST;
            if (!this.#budgetManager.canAfford(cost)) {
                eventBus.emit(EVENTS.UI_SHOW_TOAST, { message: 'Nicht genug Kohle fuer den Friseur!', type: 'fail' });
                return;
            }

            this.#budgetManager.deductBudget(cost);
            eventBus.emit(EVENTS.CMD_REMOVE_LOG_ENTRY, { logId: 'goal-visit-pub' });
            eventBus.emit(EVENTS.UI_CLOSE_INTERACTION);

            eventBus.emit(EVENTS.CMD_MUTATE_STATE, {
                newLogEntry: {
                    time: Date.now(),
                    text: 'Ziel: Besuche ' + barberName + ' fuer eine Tarnung.',
                    type: 'info'
                }
            });

            if (barber) {
                eventBus.emit(EVENTS.CMD_START_BARBER_REVEAL, { node: barber });
                this.setActiveBarber(barber);
            }

            this.#resume();
        });

        // Investment abgebrochen
        this.#sub(EVENTS.ACTION_INVESTMENT_CANCELLED, () => {
            this.#resume();
        });
    }

    // ================================================================
    //  Barber-Flow
    // ================================================================

    #registerBarberFlow() {
        this.#sub(EVENTS.CMD_BARBER_TRANSFORM, () => {
            // 1. Visuelles Feedback (UI-Layer hoert hierauf)
            eventBus.emit(EVENTS.UI_START_BARBER_ANIMATION);

            // 2. Mechanik
            this.applyBarberBuff();

            // 3. Events
            eventBus.emit(EVENTS.UI_SHOW_TOAST, { message: 'Tarnung aktiv! Du bist jetzt ein Geist.', type: 'success' });
            eventBus.emit(EVENTS.UI_CLOSE_INTERACTION);
            eventBus.emit(EVENTS.CMD_REMOVE_LOG_ENTRY, { logId: 'goal-visit-barber' });

            // 4. Fortsetzen
            this.#resume();
        });
    }

    applyBarberBuff() {
        eventBus.emit(EVENTS.CMD_MUTATE_STATE, { 
            isDisguised: true,
            activeBarber: null 
        });

        const entry = {
            time: Date.now(),
            shortText: 'Neues Gesicht erhalten. Risiko um 50% gesenkt.',
            type: 'success'
        };
        eventBus.emit(EVENTS.CMD_MUTATE_STATE, { 
            newLogEntry: entry 
        });
        eventBus.emit(EVENTS.CMD_ADD_LOG_ENTRY, { shortText: entry.shortText, type: entry.type, notify: true });
    }

    /**
     * Findet den naechsten Friseur auf der Karte.
     */
    findNearestHairdresser() {
        const playerNode = this.#mapData.getNode(this.#gameState.currentPlayerNodeId);
        if (!playerNode) return null;

        const hairdressers = this.#mapData.getHairdressers();
        if (!hairdressers || hairdressers.length === 0) {
            const fallback = {
                id: 'barber-fallback',
                tags: { name: 'Schnittwunde (Schwarzmarkt)' },
                lat: playerNode.lat + 0.002,
                lon: playerNode.lon + 0.002
            };
            const access = this.#mapData.findNearestGraphNode(fallback.lat, fallback.lon);
            return { ...fallback, accessNodeId: access ? String(access.id) : null };
        }

        let nearest = null;
        let minDist = Infinity;

        hairdressers.forEach(h => {
            const d = this.#mapData.calculateDistance(playerNode, h);
            if (d < minDist) {
                minDist = d;
                nearest = h;
            }
        });

        if (nearest) {
            const access = this.#mapData.findNearestGraphNode(nearest.lat, nearest.lon);
            return { ...nearest, accessNodeId: access ? String(access.id) : null };
        }

        return nearest;
    }

    setActiveBarber(barber) {
        eventBus.emit(EVENTS.CMD_MUTATE_STATE, { activeBarber: barber });
        eventBus.emit(EVENTS.STATE_TARGETS_UPDATED, this.#gameState.getState());
    }

    // ================================================================
    //  Kredit-System
    // ================================================================

    #registerLoanFlow() {
        this.#sub(EVENTS.ACTION_ACCEPT_LOAN, () => {
            this.#budgetManager.handleAcceptLoan();
            eventBus.emit(EVENTS.CMD_ADD_LOG_ENTRY, {
                shortText: 'Not-Kredit erhalten: 1500 Euro (Zinsen laufen...)',
                logId: 'loan-entry',
                notify: true
            });
            this.#resume();
        });

        this.#sub(EVENTS.CMD_RELOAD_GAME, () => location.reload());
        this.#sub(EVENTS.ACTION_REJECT_LOAN, () => location.reload());

        // --- Überbrückungskredit der Verbrecher-Innung ---

        // Bankruptcy-Wächter: feuert einmalig bei Kontostand <= 0
        const checkSyndicateLoanTrigger = () => {
            if (this.#gameState.budget <= 0 && !this.#gameState.syndicateLoanOffered) {
                // Sofort als "angeboten" markieren – verhindert Endlosschleifen
                eventBus.emit(EVENTS.CMD_MUTATE_STATE, { syndicateLoanOffered: true });
                eventBus.emit(EVENTS.UI_PROMPT_SYNDICATE_LOAN);
            }
        };

        this.#sub(EVENTS.STATE_BUDGET_CHANGED, checkSyndicateLoanTrigger);
        this.#sub(EVENTS.STATE_BUDGET_TICK,    checkSyndicateLoanTrigger);

        // Spieler nimmt den Überbrückungskredit an
        this.#sub(EVENTS.ACTION_ACCEPT_SYNDICATE_LOAN, () => {
            const LOAN_AMOUNT = 500;
            eventBus.emit(EVENTS.CMD_MUTATE_STATE, {
                budgetDelta: LOAN_AMOUNT,
                syndicateLoanActive: true
            });
            // STATE_LOAN_ACTIVE als dediziertes Bestätigungs-Event feuern
            eventBus.emit(EVENTS.STATE_LOAN_ACTIVE, { amount: LOAN_AMOUNT });
            eventBus.emit(EVENTS.CMD_ADD_LOG_ENTRY, {
                shortText: `Überbrückungskredit der Innung erhalten: +${LOAN_AMOUNT} € (Rückzahlung beim nächsten Bruch).`,
                logId: 'syndicate-loan-entry',
                notify: true
            });
            log('[EconomyController] Überbrückungskredit angenommen.');
        });

        // Spieler lehnt den Überbrückungskredit ab
        this.#sub(EVENTS.ACTION_DECLINE_SYNDICATE_LOAN, () => {
            log('[EconomyController] Überbrückungskredit abgelehnt. Game Over.');
            eventBus.emit(EVENTS.SYS_GAME_OVER, { 
                reason: 'BANKRUPTCY', 
                message: 'Du hast den Kredit abgelehnt und bist pleite.' 
            });
        });
    }

    // ================================================================
    //  Encounter-Hooks
    // ================================================================

    #registerEncounterHooks() {
        this.#sub(EVENTS.SYS_ENCOUNTER_TRIGGERED, (encounter) => {
            this.#pause();
            eventBus.emit(EVENTS.SYS_GAME_PAUSED);
            this.#budgetManager.deductBudget(encounter.cost);
            eventBus.emit(EVENTS.UI_SHOW_ENCOUNTER, encounter);
        });

        this.#sub(EVENTS.ACTION_RADAR_ACKNOWLEDGED, () => {});

        // --- Intent Event (Etappe 5) ---
        this.#sub(EVENTS.CMD_TRIGGER_RADAR, ({ force }) => {
            const result = this.triggerRadar(force);
            if (result !== null && result !== 'cooldown') {
                eventBus.emit(EVENTS.NOTIFY_RADAR_RESULT, result);
            }
        });
    }

    // ================================================================
    //  Radar
    // ================================================================

    triggerRadar(force) {
        if (!this.#gameState.radarUnlocked) return null;

        if (!force && (Date.now() - this.#gameState.lastRadarTime < CONFIG.TIMERS.RADAR_COOLDOWN)) {
            const diffMs = CONFIG.TIMERS.RADAR_COOLDOWN - (Date.now() - this.#gameState.lastRadarTime);
            const mins = Math.floor(diffMs / 60000);
            const secs = Math.ceil((diffMs % 60000) / 1000);
            const timeStr = mins > 0 ? `${mins} Min. ${secs} Sek.` : `${secs} Sek.`;

            const entry = {
                logId: 'RADAR_STATUS',
                time: Date.now(),
                shortText: `Polizeiradar im Cooldown. Nächster Scan in: ${timeStr}`,
                type: 'info'
            };

            // Deduplizierung im State-Array
            const logbook = this.#gameState.logbook.filter(e => e.logId !== 'RADAR_STATUS');
            logbook.unshift(entry);

            eventBus.emit(EVENTS.CMD_MUTATE_STATE, { logbook });
            eventBus.emit(EVENTS.CMD_ADD_LOG_ENTRY, entry);
            return 'cooldown';
        }

        if (!force) {
            const now = Date.now();
            const entry = {
                logId: 'RADAR_STATUS',
                time: now,
                shortText: 'Polizeiradar aktiviert. Scan läuft...',
                type: 'info'
            };

            // Deduplizierung im State-Array
            const logbook = this.#gameState.logbook.filter(e => e.logId !== 'RADAR_STATUS');
            logbook.unshift(entry);

            eventBus.emit(EVENTS.CMD_MUTATE_STATE, {
                lastRadarTime: now,
                logbook
            });
            eventBus.emit(EVENTS.CMD_ADD_LOG_ENTRY, entry);
        }

        const playerNode = this.#mapData.getNode(this.#gameState.currentPlayerNodeId);
        const playerCoords = playerNode ? [playerNode.lat, playerNode.lon] : [0, 0];

        return {
            stations: this.#mapData.getPoliceStations(),
            playerCoords: playerCoords
        };
    }

    // ================================================================
    //  Public Budget API (fuer Game.js Legacy-Bridge)
    // ================================================================

    canAfford(amount) {
        return this.#budgetManager.canAfford(amount);
    }

    deductBudget(amount) {
        this.#budgetManager.deductBudget(amount);
    }

    addReward(amount) {
        this.#budgetManager.addReward(amount);
    }

    // ================================================================
    //  Helpers
    // ================================================================

    destroy() {
        this.#subscriptions.forEach(unsub => unsub());
        this.#subscriptions = [];
    }
}
