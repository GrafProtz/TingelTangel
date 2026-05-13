import { eventBus } from './EventBus.js';
import { EVENTS } from './EventTypes.js';
import { sanitizeHTML, log } from './Utils.js';
import { DialogFactory } from './DialogFactory.js';
import { MapView } from './MapView.js';
import { Game } from './Game.js';
import { HUDController } from './HUDController.js';
import { StateController } from './StateController.js';
import { EventTracer } from './EventTracer.js';

/**
 * UIManager - Zentrales UI-Routing & Session-Management.
 * Übernimmt die gesamte Kopplung zwischen EventBus, DOM und View-Komponenten.
 * Eliminiert die monolithische Logik aus main.js.
 */
export class UIManager {
    // --- Core Services ---
    #mapData;
    #missionService;
    #saveManager;
    
    // --- Session Components ---
    #game = null;
    #mapView = null;
    #hudController = null;
    #stateController = null;
    #eventTracer = null;

    // --- DOM Elements ---
    #infoModal;
    #infoModalTitle;
    #infoModalText;
    #infoModalBtn;
    #sidebarLog;
    #sidebarLogContent;
    #sidebarToggle;
    #cityDropdown;
    #btnNewGame;
    #btnContinueGame;
    #btnBackToMenu;
    #devBtn;

    // --- State ---
    #appSubscriptions = [];
    #currentCascadeData = null;
    #cities = [];

    constructor(mapData, missionService, saveManager, cities) {
        this.#mapData = mapData;
        this.#missionService = missionService;
        this.#saveManager = saveManager;
        this.#cities = cities;

        this.#cacheDOM();
        this.#initGlobalListeners();
        this.#initEventRouting();
    }

    /**
     * Sammelt statische DOM-Elemente ein.
     */
    #cacheDOM() {
        this.#infoModal = document.getElementById('info-modal');
        this.#infoModalTitle = document.getElementById('info-modal-title');
        this.#infoModalText = document.getElementById('info-modal-text');
        this.#infoModalBtn = document.getElementById('info-modal-btn');
        this.#sidebarLog = document.getElementById('sidebar-log');
        this.#sidebarLogContent = document.getElementById('sidebar-log-content');
        this.#sidebarToggle = document.getElementById('sidebar-toggle');
        this.#cityDropdown = document.getElementById('city-dropdown-intro');
        this.#btnNewGame = document.getElementById('btn-new-game');
        this.#btnContinueGame = document.getElementById('btn-continue-game');
        this.#btnBackToMenu = document.getElementById('back-to-menu');
        this.#devBtn = document.getElementById('dev-toggle-encounters');
    }

    /**
     * Initialisiert session-übergreifende Listeners (Menu, Keys).
     */
    #initGlobalListeners() {
        // Dropdown füllen
        if (this.#cityDropdown) {
            this.#cityDropdown.innerHTML = '<option value="" disabled selected>Einsatzort wählen...</option>';
            this.#cities.forEach((city, index) => {
                const opt = document.createElement('option');
                opt.value = index;
                opt.textContent = city.name;
                this.#cityDropdown.appendChild(opt);
            });

            this.#cityDropdown.addEventListener('change', (e) => {
                const city = this.#cities[parseInt(e.target.value, 10)];
                const hasSave = this.#saveManager.hasSave(city.name);
                if (this.#btnContinueGame) this.#btnContinueGame.style.display = hasSave ? 'block' : 'none';
            });
        }

        // Button Click Handlers
        this.#btnNewGame?.addEventListener('click', () => this.#startSession(false));
        this.#btnContinueGame?.addEventListener('click', () => this.#startSession(true));
        this.#btnBackToMenu?.addEventListener('click', () => location.reload());
        this.#devBtn?.addEventListener('click', () => eventBus.emit(EVENTS.TOGGLE_DEV_ENCOUNTERS));

        // Sidebar Toggle
        this.#sidebarToggle?.addEventListener('click', () => this.#toggleSidebar());

        // Global Key Listener (Fahrrad & Radar)
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (key === 'f') eventBus.emit(EVENTS.TOGGLE_BICYCLE);
            if (key === 'p') eventBus.emit(EVENTS.INTENT_TRIGGER_RADAR, { force: false });
        });

        // Info-Modal Button
        this.#infoModalBtn?.addEventListener('click', () => this.#triggerCascadeAnimation());
    }

    /**
     * Zentrales Event-Routing (Ehemals main.js registerSessionListeners).
     */
    #initEventRouting() {
        const sub = (ev, fn) => this.#appSubscriptions.push(eventBus.subscribe(ev, fn));

        // --- Info Cascade & Modals ---
        sub(EVENTS.SHOW_INFO_CASCADE, (data) => this.#handleCascade(data));
        sub(EVENTS.SHOW_ENCOUNTER, (data) => this.#showEncounterModal(data));
        sub(EVENTS.SHOW_LOAN_MODAL, () => this.#showLoanModal());

        // --- Logbook Updates ---
        sub(EVENTS.ADD_LOG_ENTRY, (data) => {
            this.#handleAddLogEntry(data);
            if (data.notify) this.#notifyLogEntry();
        });
        sub(EVENTS.REMOVE_LOG_ENTRY, (data) => document.getElementById(data.logId)?.remove());
        sub(EVENTS.COMPLETE_LOG_ENTRY, (data) => {
            const el = document.getElementById(data.logId);
            if (el) {
                el.classList.add('log-entry-completed');
                el.style.opacity = '0.5';
                el.style.textDecoration = 'line-through';
            }
        });

        // --- Map & Navigation (View Bridge) ---
        sub(EVENTS.PLAYER_POSITION_UPDATED, ({ lat, lon }) => this.#mapView?.updatePlayerPosition([lat, lon]));
        sub(EVENTS.CAMERA_FIT_BOUNDS_REQUESTED, (coords) => this.#mapView?.fitBounds(coords));
        sub(EVENTS.FIRST_MOVE_COMPLETED, () => eventBus.emit(EVENTS.TOGGLE_INFO, false));
        sub(EVENTS.INTRO_COMPLETE, () => this.#handleIntroComplete());

        // --- Gameplay Result Bridges ---
        sub(EVENTS.BURGLARY_RESOLVED, (p) => {
            const dialog = (p.outcome === 'aborted') ? DialogFactory.getBurglaryAbort() :
                           (p.outcome === 'caught') ? DialogFactory.getBurglaryCaught(p.fine) :
                           DialogFactory.getBurglarySuccess(p.loot, p.debtAmount);
            eventBus.emit(EVENTS.SHOW_DIALOG, dialog);
        });

        sub(EVENTS.BICYCLE_THEFT_RESOLVED, (p) => {
            const dialog = (p.outcome === 'success') ? DialogFactory.getBicycleTheftSuccess() :
                           DialogFactory.getBicycleTheftFailure(p.fine);
            eventBus.emit(EVENTS.SHOW_DIALOG, dialog);
        });

        sub(EVENTS.BICYCLE_THEFT_SUCCESS_DONE, () => {
            eventBus.emit(EVENTS.SHOW_INFO_CASCADE, {
                title: "Fahrrad-Modus",
                shortText: "Hotkey F: Auf/Absteigen. Vorsicht: 15 Cent/Meter (1,5x Preise)!",
                fullText: "Hör zu, Freundchen. Das Rad gehört jetzt dir. Damit bist du doppelt so schnell unterwegs, aber du fällst auch mehr auf. Das kostet dich natürlich auch mehr. Logo, versteht sich. Mit 'F' kannst du jederzeit auf- oder absteigen, um unauffällig zu bleiben.",
                nextEvent: EVENTS.RESUME_GAME
            });
        });

        // --- Interaction & Spawning ---
        sub(EVENTS.SPAWN_TARGETS, (payload) => this.#handleSpawnTargets(payload));
        sub(EVENTS.TARGETS_UPDATED, (state) => this.#handleTargetsUpdated(state));
        sub(EVENTS.GAME_STATE_CHANGED, (state) => {
            if (this.#devBtn) this.#devBtn.title = state.devEncountersDisabled ? "Ereignisse: DEAKTIVIERT" : "Ereignisse: AKTIV";
            if (state.currentPlayerNodeId && !state.isMoving) {
                this.#handlePlayerMoved(state);
                this.#handleTargetsUpdated(state);
            }
        });

        // --- Cinema & Sequences ---
        sub(EVENTS.PUB_TARGET_REACHED, () => {
            this.#game?.pause();
            this.#mapView?.playCinematicSequence('door', 1500, () => {});
        });

        sub(EVENTS.START_POLICE_REVEAL, async () => {
            const stations = this.#mapData.getPoliceStations();
            const playerNode = this.#mapData.getNode(this.#game.getState().currentPlayerNodeId);
            await this.#mapView?.playPoliceRevealSequence(stations, playerNode ? [playerNode.lat, playerNode.lon] : null);
            this.#game?.resume();
        });

        sub(EVENTS.RADAR_SEQUENCE_START, () => eventBus.emit(EVENTS.INTENT_TRIGGER_RADAR, { force: true }));
        sub(EVENTS.RADAR_RESULT_READY, async (res) => {
            await this.#mapView?.playPoliceRevealSequence(res.stations, res.playerCoords);
            this.#game?.resume();
        });

        // --- Specific Interactions ---
        sub(EVENTS.BARBER_INFO_READY, ({ barber }) => {
            const name = sanitizeHTML(barber?.tags?.name) || "Schnittwunde";
            eventBus.emit(EVENTS.SHOW_DIALOG, {
                title: 'Ein zwielichtiger Tipp',
                text: `Ich kenne da jemanden. Geh zu '<strong>${name}</strong>'. Lass dir die Haare färben, setz eine Brille auf. Wenn du nicht aussiehst wie ein typischer Einbrecher, fällst du weniger auf. Das halbiert dein Risiko und die Hausbesitzer schöpfen nicht so schnell Verdacht.`,
                buttons: [
                    { text: 'Einverstanden (50 Euro)', event: EVENTS.BUY_BARBER_TICKET, payload: { barber, barberName: name } },
                    { text: 'Ablehnen', event: EVENTS.RESUME_GAME }
                ]
            });
        });

        sub(EVENTS.BICYCLE_INTERACTION_READY, (data) => eventBus.emit(EVENTS.SHOW_DIALOG, DialogFactory.getBicycleInteractionDialog(data.riskData, data.target)));
        sub(EVENTS.BARBER_INTERACTION_READY, (data) => eventBus.emit(EVENTS.SHOW_DIALOG, DialogFactory.getBarberDialog(data)));
        sub(EVENTS.RADAR_TUTORIAL_TRIGGERED, (p) => eventBus.emit(EVENTS.SHOW_INFO_CASCADE, DialogFactory.getRadarTutorial(p.stationCount)));
        sub(EVENTS.OPTION_C_CLICKED, () => eventBus.emit(EVENTS.INTENT_REQUEST_BARBER_INFO));
        sub(EVENTS.OPTION_D_CLICKED, () => eventBus.emit(EVENTS.SHOW_DIALOG, DialogFactory.getBoltCutterDialog(75)));

        // --- Visual States ---
        sub(EVENTS.BIKING_STATE_CHANGED, (isBiking) => {
            document.getElementById('app-container')?.classList.toggle('state-biking', isBiking);
            document.body.classList.toggle('state-biking', isBiking);
        });
    }

    /**
     * Startet eine Spielsession (Neu oder Laden).
     */
    async #startSession(isContinue) {
        const cityIdx = parseInt(this.#cityDropdown.value, 10);
        if (isNaN(cityIdx)) return;
        const city = this.#cities[cityIdx];

        log(`[UIManager] Starte Session für ${city.name} (Continue: ${isContinue})`);

        // 1. Cleanup alte Session
        if (this.#game) this.#game.destroy();
        if (this.#stateController) this.#stateController.destroy();
        if (this.#hudController) this.#hudController.destroy();
        if (this.#eventTracer) this.#eventTracer.destroy();

        // 2. Core Controller instanziieren
        this.#stateController = new StateController();
        this.#eventTracer = new EventTracer(true);
        this.#eventTracer.init();
        
        const initialState = this.#stateController.getStateInstance ? this.#stateController.getStateInstance() : this.#stateController.getState();
        this.#game = new Game(this.#mapData, this.#missionService, initialState);
        this.#hudController = new HUDController();

        // 3. Map laden & View initialisieren
        this.#mapData.cityName = city.name;
        this.#saveManager.setCurrentCity(city.name);
        
        const coords = [city.lat, city.lng];
        this.#mapView = new MapView('map', coords, city.zoom || 13);
        
        try {
            await this.#mapData.loadCityData(coords);
        } catch (err) {
            eventBus.emit(EVENTS.SHOW_DIALOG, DialogFactory.getNetworkErrorDialog());
            return;
        }

        // UI Prep
        this.#mapView.setUIState('intro-overlay', false);
        this.#mapView.setUIState('back-to-menu', true);
        this.#mapView.setUIState('info-toggle-btn', true);
        this.#mapView.setUIState('budget-panel', true);

        // 4. State Wiederherstellung
        if (isContinue) {
            const saved = this.#saveManager.loadSave(city.name);
            if (saved) {
                this.#game.hydrateState(saved);
                const node = this.#mapData.getNode(saved.currentPlayerNodeId);
                if (node) {
                    this.#mapView.renderPlayer([node.lat, node.lon]);
                    this.#mapView.focusLocation([node.lat, node.lon]);
                }
            } else {
                eventBus.emit(EVENTS.SHOW_TOAST, { message: "Fehler beim Laden des Spielstands.", type: 'fail' });
            }
        } else {
            this.#saveManager.deleteSave(city.name);
            const scenario = this.#missionService.spawnTutorialScenario();
            if (scenario) {
                this.#game.startMission(scenario.startNodeId, scenario.targetNodeId, scenario.poiName);
                
                // Intro-Sequenz Bridge
                const unsubIntro = eventBus.subscribe(EVENTS.START_MAP_INTRO, () => {
                    this.#mapView.renderPlayer(scenario.startCoords);
                    const nb = this.#mapData.getNeighbors(scenario.startNodeId);
                    this.#mapView.focusScenarioBounds(scenario.startCoords, scenario.targetCoords, nb.map(n => [n.lat, n.lon]));
                    this.#game.triggerIntroRender();
                    unsubIntro();
                });
            }
        }
    }

    // --- Private UI Logic Methods (Internal Routing) ---

    #handleCascade(data) {
        this.#currentCascadeData = data;
        this.#infoModalTitle.innerText = data.title || "Information";
        this.#infoModalText.innerHTML = sanitizeHTML(data.fullText || "");
        this.#infoModal.classList.remove('hidden', 'fly-to-sidebar');
        setTimeout(() => this.#infoModalBtn.focus(), 10);
    }

    #triggerCascadeAnimation() {
        if (!this.#currentCascadeData) return;
        this.#infoModal.classList.add('fly-to-sidebar');
        setTimeout(() => {
            this.#infoModal.classList.add('hidden');
            this.#infoModal.classList.remove('fly-to-sidebar');
            this.#handleAddLogEntry(this.#currentCascadeData);
            this.#notifyLogEntry();
            const next = this.#currentCascadeData.nextEvent;
            this.#currentCascadeData = null;
            eventBus.emit(next || EVENTS.START_MAP_INTRO);
        }, 600);
    }

    #handleAddLogEntry(data) {
        if (data.logId) document.getElementById(data.logId)?.remove();
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        if (data.logId) entry.id = data.logId;
        const title = data.title ? `<strong>${sanitizeHTML(data.title)}</strong><br>` : "";
        entry.innerHTML = `${title}${sanitizeHTML(data.shortText)}`;
        this.#sidebarLogContent.prepend(entry);
    }

    #notifyLogEntry() {
        this.#sidebarLog.classList.remove('sidebar-closed');
        this.#sidebarLog.classList.add('sidebar-open');
        setTimeout(() => {
            if (this.#sidebarLog.classList.contains('sidebar-open')) {
                this.#sidebarLog.classList.replace('sidebar-open', 'sidebar-closed');
                this.#sidebarToggle.classList.add('attention-pulse');
                setTimeout(() => this.#sidebarToggle.classList.remove('attention-pulse'), 1500);
            }
        }, 10000);
    }

    #toggleSidebar() {
        const isOpen = this.#sidebarLog.classList.contains('sidebar-open');
        this.#sidebarLog.classList.toggle('sidebar-open', !isOpen);
        this.#sidebarLog.classList.toggle('sidebar-closed', isOpen);
        if (!isOpen) this.#sidebarToggle.classList.remove('attention-pulse');
    }

    #handleIntroComplete() {
        if (this.#sidebarLog.classList.contains('sidebar-open')) {
            this.#sidebarLog.classList.replace('sidebar-open', 'sidebar-closed');
            this.#sidebarToggle.classList.add('attention-pulse');
            setTimeout(() => this.#sidebarToggle.classList.remove('attention-pulse'), 1500);
        }
    }

    #handlePlayerMoved(state) {
        const node = this.#mapData.getNode(state.currentPlayerNodeId);
        if (node) this.#mapView?.renderPlayer([node.lat, node.lon], state.currentPlayerNodeId);
        const neighbors = this.#mapData.getNeighbors(state.currentPlayerNodeId, state.isBiking);
        this.#mapView?.renderNeighbors(neighbors, state.targetPubNodeId, state.isBiking, state.lastPubVisit, (id) => {
            eventBus.emit(EVENTS.INTENT_MOVE_PLAYER, { targetId: id });
        });
    }

    #handleTargetsUpdated(state) {
        const poiList = [];
        const pub = this.#mapData.getNode(state.targetPubNodeId);
        if (pub) poiList.push({ ...pub, type: 'pub', isPrimary: true });
        
        const addPois = (list, intentName, payloadKey, defaultType = null) => {
            list?.forEach(t => {
                const node = this.#mapData.getNode(t.accessNodeId);
                const actualType = defaultType ? defaultType : t.type;
                poiList.push({
                    ...t, 
                    type: actualType,
                    accessNodeCoords: node ? { lat: node.lat, lon: node.lon } : null,
                    onClickCallback: () => eventBus.emit(EVENTS[intentName], { [payloadKey]: t })
                });
            });
        };

        addPois(state.activeCrimeTargets, 'INTENT_SCOUT_TARGET', 'target');
        if (state.activeBarber) {
            const b = state.activeBarber;
            const node = this.#mapData.getNode(b.accessNodeId);
            poiList.push({ ...b, type: 'barber', accessNodeCoords: node ? { lat: node.lat, lon: node.lon } : null,
                onClickCallback: () => eventBus.emit(EVENTS.INTENT_BARBER_TARGET, { barber: b }) });
        }
        addPois(state.activeBicycleTargets, 'INTENT_BICYCLE_TARGET', 'target', 'bicycle');

        this.#mapView?.renderPOIs(poiList);
    }

    #handleSpawnTargets({ targetType, centerNodeId }) {
        const targets = this.#missionService.spawnTargets(targetType, centerNodeId);
        if (targets.length > 0) {
            eventBus.emit(EVENTS.INTENT_SET_CRIME_TARGETS, { targets });
            const coords = [[this.#mapData.getNode(centerNodeId).lat, this.#mapData.getNode(centerNodeId).lon]];
            targets.forEach(t => coords.push([this.#mapData.getNode(t.accessNodeId).lat, this.#mapData.getNode(t.accessNodeId).lon]));
            eventBus.emit(EVENTS.CAMERA_FIT_BOUNDS_REQUESTED, coords);
            eventBus.emit(EVENTS.SHOW_TOAST, { message: `${targets.length} Ziele markiert!`, type: 'success' });
        } else {
            eventBus.emit(EVENTS.SHOW_TOAST, { message: "Keine Gebäude gefunden.", type: 'fail' });
        }
    }

    #showEncounterModal(event) {
        this.#handleCascade({
            title: event.title,
            fullText: `<div style="line-height: 1.6;"><p>${event.text}</p><div style="color: var(--color-danger); font-weight: bold; margin-top: 15px;">Verlust: -${event.cost} €</div></div>`,
            shortText: `Ereignis: ${event.title} (-${event.cost} €)`,
            logId: 'last-encounter',
            nextEvent: EVENTS.RESUME_GAME
        });
    }

    #showLoanModal() {
        eventBus.emit(EVENTS.SHOW_DIALOG, {
            title: 'Zweite Chance?',
            text: `<div style="line-height: 1.6;"><p>"Du bist pleite. Die Innnung bietet dir einen Kredit an..."</p><p style="color:var(--color-warning); font-weight:bold; margin-top:15px;">⚠️ 1 € Zinsen pro Schritt!</p></div>`,
            buttons: [
                { text: 'Annehmen', event: EVENTS.ACCEPT_LOAN_OFFER, className: 'btn-danger' },
                { text: 'Ablehnen', event: EVENTS.REJECT_LOAN, className: 'btn-secondary' }
            ]
        });
    }

    destroy() {
        this.#appSubscriptions.forEach(unsub => unsub());
        this.#appSubscriptions = [];
    }
}
