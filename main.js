import { MapData } from './MapData.js';
import { Game } from './Game.js';
import { MapView } from './MapView.js';
import { HUDController } from './HUDController.js';
import { InteractionManager } from './InteractionManager.js';
import { NotificationManager } from './NotificationManager.js';
import { MissionService } from './MissionService.js';
import { SaveManager } from './SaveManager.js';
import { UIManager } from './UIManager.js';
import { log } from './Utils.js';
import { eventBus } from './EventBus.js';
import { sanitizeHTML } from './Utils.js';
import { DialogFactory } from './DialogFactory.js';
import { EVENTS } from './EventTypes.js';
import { StateController } from './StateController.js';
import './UIAnimator.js';

const CITIES = [
    { id: "berlin", name: "Berlin", lat: 52.5200, lng: 13.4050, zoom: 15 },
    { id: "hamburg", name: "Hamburg", lat: 53.5511, lng: 9.9937, zoom: 15 },
    { id: "muenchen", name: "München", lat: 48.1371, lng: 11.5755, zoom: 15 },
    { id: "dortmund", name: "Dortmund", lat: 51.5139, lng: 7.4653, zoom: 15 },
    { id: "koeln", name: "Köln", lat: 50.9375, lng: 6.9603, zoom: 15 },
    { id: "aachen", name: "Aachen", lat: 50.7753, lng: 6.0839, zoom: 15 },
    { id: "fuerth", name: "Fürth", lat: 49.4783, lng: 10.9902, zoom: 15 },
    { id: "siegburg", name: "Siegburg", lat: 50.7998, lng: 7.2075, zoom: 15 },
    { id: "lueneburg", name: "Lüneburg", lat: 53.2464, lng: 10.4115, zoom: 15 },
    { id: "dormagen", name: "Dormagen", lat: 51.0964, lng: 6.8400, zoom: 15 },
    { id: "monheim", name: "Monheim am Rhein", lat: 51.0899, lng: 6.8906, zoom: 15 },
    { id: "freiburg", name: "Freiburg", lat: 47.9990, lng: 7.8421, zoom: 15 },
    { id: "bruehl", name: "Brühl", lat: 50.8295, lng: 6.9025, zoom: 15 }
];

async function initApp() {
    const mapData = new MapData();
    let mapView;
    const missionService = new MissionService(mapData);
    let game    = null; // Wird in setupGameSession (re)instanziiert
    let hudController = null;
    let stateController = null;
    const interaction = new InteractionManager();
    const notification = new NotificationManager();
    const saveManager = new SaveManager();
    const uiManager = new UIManager();
    const devBtn = document.getElementById('dev-toggle-encounters');

    /** @type {Function[]} Array für anonyme Subscriptions in main.js */
    let appSubscriptions = [];

    /** Hilfsfunktion zum sauberen Abmelden aller main.js Listener */
    const clearAppSubscriptions = () => {
        if (appSubscriptions.length > 0) {
            log(`[MAIN] Bereinige ${appSubscriptions.length} App-Subscriptions...`);
            appSubscriptions.forEach(unsub => unsub());
            appSubscriptions = [];
        }
    };

    /** Hilfs-Wrapper für EventBus-Sub in main.js */
    const appSub = (event, handler) => {
        appSubscriptions.push(eventBus.subscribe(event, handler));
    };

    // Dropdown dynamisch füllen
    const dropdown = document.getElementById('city-dropdown-intro');
    if (dropdown) {
        dropdown.innerHTML = '<option value="" disabled selected>Einsatzort wählen...</option>';
        CITIES.forEach((city, index) => {
            const opt = document.createElement('option');
            opt.value = index;
            opt.textContent = city.name;
            dropdown.appendChild(opt);
        });
    }

    /**
     * Registriert alle session-spezifischen Listener für die UI-Bridge.
     * Wird bei jedem Session-Start aufgerufen, nachdem alte Listener entfernt wurden.
     */
    const registerSessionListeners = () => {
        clearAppSubscriptions();
        log("[MAIN] Registriere Session-Listener neu...");

        // ----- Core Game Events -----
        appSub(EVENTS.PLAYER_POSITION_UPDATED, ({ lat, lon }) => {
            mapView?.updatePlayerPosition([lat, lon]);
        });

        appSub(EVENTS.FIRST_MOVE_COMPLETED, () => {
            eventBus.emit(EVENTS.TOGGLE_INFO, false);
        });

        // ----- UI-Bridge: Crime-Events (Etappe 3) -----
        appSub(EVENTS.BURGLARY_RESOLVED, (payload) => {
            if (payload.outcome === 'aborted') {
                eventBus.emit(EVENTS.SHOW_DIALOG, DialogFactory.getBurglaryAbort());
            } else if (payload.outcome === 'caught') {
                eventBus.emit(EVENTS.SHOW_DIALOG, DialogFactory.getBurglaryCaught(payload.fine));
            } else if (payload.outcome === 'success') {
                eventBus.emit(EVENTS.SHOW_DIALOG, DialogFactory.getBurglarySuccess(payload.loot, payload.debtAmount));
            }
        });

        appSub(EVENTS.BICYCLE_THEFT_RESOLVED, (payload) => {
            if (payload.outcome === 'success') {
                eventBus.emit(EVENTS.SHOW_DIALOG, DialogFactory.getBicycleTheftSuccess());
            } else {
                eventBus.emit(EVENTS.SHOW_DIALOG, DialogFactory.getBicycleTheftFailure(payload.fine));
            }
        });

        // ----- UI-Bridge: Economy-Events (Etappe 4) -----
        appSub(EVENTS.RADAR_TUTORIAL_TRIGGERED, (payload) => {
            eventBus.emit(EVENTS.SHOW_INFO_CASCADE, DialogFactory.getRadarTutorial(payload.stationCount));
        });

        // ----- Mission & Target Spawning -----
        appSub(EVENTS.SPAWN_TARGETS, ({ targetType, centerNodeId }) => {
            const targets = missionService.spawnTargets(targetType, centerNodeId);
            if (targets.length > 0) {
                eventBus.emit(EVENTS.INTENT_SET_CRIME_TARGETS, { targets });
                const coordsToFit = [];
                const playerNode = mapData.getNode(centerNodeId);
                if (playerNode && playerNode.lat != null) {
                    coordsToFit.push([parseFloat(playerNode.lat), parseFloat(playerNode.lon)]);
                }
                targets.forEach(t => {
                    const node = mapData.getNode(t.accessNodeId);
                    if (node && node.lat != null) {
                        coordsToFit.push([parseFloat(node.lat), parseFloat(node.lon)]);
                    }
                });
                eventBus.emit(EVENTS.CAMERA_FIT_BOUNDS_REQUESTED, coordsToFit);
                eventBus.emit(EVENTS.SHOW_TOAST, { message: `${targets.length} Ziele in der Naehe markiert!`, type: 'success' });
            } else {
                eventBus.emit(EVENTS.SHOW_TOAST, { message: "Keine passenden Gebaeude gefunden.", type: 'fail' });
            }
        });

        // ----- State Handling & UI-Updates -----
        appSub(EVENTS.PLAYER_MOVED, (state) => {
            if (state.currentPlayerNodeId === null) return;
            if (state.isMoving) {
                mapView?.renderNeighbors([], () => {});
                return;
            }
            const node = mapData.getNode(state.currentPlayerNodeId);
            if (node) mapView?.renderPlayer([node.lat, node.lon]);
            const neighbors = mapData.getNeighbors(state.currentPlayerNodeId, state.isBiking);
            mapView?.renderNeighbors(neighbors, state.targetPubNodeId, state.isBiking, state.lastPubVisit, (clickedId) => {
                eventBus.emit(EVENTS.INTENT_MOVE_PLAYER, { targetId: clickedId });
            });
        });

        appSub(EVENTS.TARGETS_UPDATED, (state) => {
            const poiList = [];
            const targetNode = mapData.getNode(state.targetPubNodeId);
            if (targetNode) {
                poiList.push({ ...targetNode, type: 'pub', isPrimary: true });
            }
            if (state.activeCrimeTargets) {
                state.activeCrimeTargets.forEach(target => {
                    const accessNode = mapData.getNode(target.accessNodeId);
                    poiList.push({
                        ...target,
                        accessNodeCoords: accessNode ? { lat: accessNode.lat, lon: accessNode.lon } : null,
                        onClickCallback: () => {
                            eventBus.emit(EVENTS.INTENT_SCOUT_TARGET, { target });
                        }
                    });
                });
            }
            if (state.activeBarber) {
                const b = state.activeBarber;
                const accessNode = mapData.getNode(b.accessNodeId);
                poiList.push({
                    ...b,
                    type: 'barber',
                    accessNodeCoords: accessNode ? { lat: accessNode.lat, lon: accessNode.lon } : null,
                    onClickCallback: () => {
                        eventBus.emit(EVENTS.INTENT_BARBER_TARGET, { barber: b });
                    }
                });
            }
            if (state.activeBicycleTargets) {
                state.activeBicycleTargets.forEach(target => {
                    const accessNode = mapData.getNode(target.accessNodeId);
                    poiList.push({
                        ...target,
                        type: 'bicycle',
                        accessNodeCoords: accessNode ? { lat: accessNode.lat, lon: accessNode.lon } : null,
                        onClickCallback: () => {
                            eventBus.emit(EVENTS.INTENT_BICYCLE_TARGET, { target });
                        }
                    });
                });
            }
            mapView?.renderPOIs(poiList);
        });

        appSub(EVENTS.GAME_STATE_CHANGED, (state) => {
            if (state.currentPlayerNodeId && !state.isMoving) {
                eventBus.emit(EVENTS.PLAYER_MOVED, state);
                eventBus.emit(EVENTS.TARGETS_UPDATED, state);
            }
        });

        appSub(EVENTS.BICYCLE_THEFT_SUCCESS_DONE, () => {
            eventBus.emit(EVENTS.SHOW_INFO_CASCADE, {
                title: "Fahrrad-Modus",
                shortText: "Hotkey F: Auf/Absteigen. Vorsicht: 15 Cent/Meter (1,5x Preise)!",
                fullText: "Hoer zu, Freundchen. Das Rad gehoert jetzt dir. Damit bist du doppelt so schnell unterwegs, aber du faellst auch mehr auf. Das kostet dich natuerlich auch mehr. Logo, versteht sich. Mit 'F' kannst du jederzeit auf- oder absteigen, um unauffaellig zu bleiben.",
                nextEvent: EVENTS.RESUME_GAME
            });
        });

        appSub(EVENTS.OPTION_C_CLICKED, () => {
            eventBus.emit(EVENTS.INTENT_REQUEST_BARBER_INFO);
        });

        appSub(EVENTS.BARBER_INFO_READY, ({ barber }) => {
            const barberName = sanitizeHTML(barber?.tags?.name) || "Schnittwunde";
            eventBus.emit(EVENTS.SHOW_DIALOG, {
                title: 'Ein zwielichtiger Tipp',
                text: `Ich kenne da jemanden. Geh zu '<strong>${barberName}</strong>'. Lass dir die Haare faerben, setz eine Brille auf. Wenn du nicht aussiehst wie ein typischer Einbrecher, faellst du weniger auf. Das halbiert dein Risiko und die Hausbesitzer schoepfen nicht so schnell Verdacht, was deine Abbruchquote drastisch senkt.`,
                buttons: [
                    { text: 'Einverstanden (50 Euro)', event: EVENTS.BUY_BARBER_TICKET, payload: { barber, barberName } },
                    { text: 'Ablehnen', event: EVENTS.RESUME_GAME }
                ]
            });
        });

        appSub(EVENTS.OPTION_D_CLICKED, () => {
            eventBus.emit(EVENTS.SHOW_DIALOG, DialogFactory.getBoltCutterDialog(75));
        });

        appSub(EVENTS.PUB_TARGET_REACHED, () => {
            game?.pause();
            mapView?.playCinematicSequence('door', 1500, () => {});
        });

        appSub(EVENTS.START_POLICE_REVEAL, async () => {
            const policeStations = mapData.getPoliceStations();
            const playerNode = mapData.getNode(game.getState().currentPlayerNodeId);
            const playerCoords = playerNode ? [playerNode.lat, playerNode.lon] : null;
            await mapView?.playPoliceRevealSequence(policeStations, playerCoords);
            game?.resume();
        });

        appSub(EVENTS.RADAR_SEQUENCE_START, async () => {
            eventBus.emit(EVENTS.INTENT_TRIGGER_RADAR, { force: true });
        });

        appSub(EVENTS.RADAR_RESULT_READY, async (result) => {
            await mapView?.playPoliceRevealSequence(result.stations, result.playerCoords);
            game?.resume();
        });

        appSub(EVENTS.BICYCLE_INTERACTION_READY, ({ target, riskData }) => {
            eventBus.emit(EVENTS.SHOW_DIALOG, DialogFactory.getBicycleInteractionDialog(riskData, target));
        });

        appSub(EVENTS.BARBER_INTERACTION_READY, (data) => {
            eventBus.emit(EVENTS.SHOW_DIALOG, DialogFactory.getBarberDialog(data));
        });

        // Dev-Tool UI Sync (Wird nun durch HUDController oder spezialisierte Listener abgedeckt)
        appSub(EVENTS.GAME_STATE_CHANGED, (state) => {
            if (devBtn) {
                devBtn.title = state.devEncountersDisabled ? "Ereignisse: DEAKTIVIERT" : "Ereignisse: AKTIV";
            }
        });
    };

    // ----- Globale UI Handlers (Session-uebergreifend) -----
    
    // Globaler Key-Listener für Fahrrad-Toggle (Taste F)
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'f') {
            eventBus.emit(EVENTS.TOGGLE_BICYCLE);
        }
    });

    // Dropdown-Logik: Pruefe auf Savegame
    document.getElementById('city-dropdown-intro')?.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === '') return;
        const city = CITIES[parseInt(val, 10)];
        const hasSave = saveManager.hasSave(city.name);
        document.getElementById('btn-continue-game').style.display = hasSave ? 'block' : 'none';
    });

    // Hilfsfunktion zum Starten/Fortsetzen
    const setupGameSession = async (city, isContinue) => {
        // --- 1. Kaskadierender Teardown ---
        if (game) {
            game.destroy();
        }
        registerSessionListeners();

        // --- 2. Neue Instanz erzeugen ---
        if (stateController) stateController.destroy();
        stateController = new StateController();

        game = new Game(mapData, missionService, stateController.getStateInstance ? stateController.getStateInstance() : stateController.getState());
        
        if (hudController) hudController.destroy();
        hudController = new HUDController();

        mapData.cityName = city.name;
        saveManager.setCurrentCity(city.name);
        
        const coords = [city.lat, city.lng];
        mapView = new MapView('map', coords, city.zoom || 13);
        
        try {
            await mapData.loadCityData(coords);
        } catch (err) {
            console.error("Critical Load Error:", err);
            eventBus.emit(EVENTS.SHOW_DIALOG, DialogFactory.getNetworkErrorDialog());
            return;
        }
        
        mapView.setUIState('intro-overlay', false);
        mapView.setUIState('back-to-menu', true);
        mapView.setUIState('info-toggle-btn', true);
        mapView.setUIState('budget-panel', true);

        if (isContinue) {
            const savedState = saveManager.loadSave(city.name);
            if (savedState) {
                game.hydrateState(savedState);
                const playerNode = mapData.getNode(savedState.currentPlayerNodeId);
                if (playerNode) {
                    mapView.renderPlayer([playerNode.lat, playerNode.lon]);
                    mapView.focusLocation([playerNode.lat, playerNode.lon]);
                }
            } else {
                eventBus.emit(EVENTS.SHOW_TOAST, { message: "Fehler beim Laden des Spielstands.", type: 'fail' });
            }
        } else {
            // Bei neuem Spiel evtl. altes Savegame löschen
            saveManager.deleteSave(city.name);
            
            const scenario = missionService.spawnTutorialScenario();
            if (!scenario) {
                eventBus.emit(EVENTS.SHOW_TOAST, { message: "Fehler bei der Szenario-Generierung.", type: 'fail' });
                return;
            }

            // Modal ploppt sofort auf, die Engine pausiert das Map-Rendering
            game.startMission(scenario.startNodeId, scenario.targetNodeId, scenario.poiName);

            // Wenn das Modal weggeklickt wird, erwacht die Karte zum Leben
            appSub(EVENTS.START_MAP_INTRO, () => {
                log("DEBUG 1: Event START_MAP_INTRO ist in main.js angekommen!");
                mapView.renderPlayer(scenario.startCoords);
                
                // Nachbarn für die Bounding Box ermitteln
                const neighbors = mapData.getNeighbors(scenario.startNodeId);
                const neighborCoords = neighbors.map(n => [n.lat, n.lon]);
                
                // Cinematic Zoom aktivieren
                mapView.focusScenarioBounds(scenario.startCoords, scenario.targetCoords, neighborCoords);
                
                // Zwingt die Engine, jetzt POIs und grüne Nodes zu rendern
                game.triggerIntroRender();
            });
        }
    };

    document.getElementById('btn-new-game')?.addEventListener('click', () => {
        const val = document.getElementById('city-dropdown-intro').value;
        if (val === '') return;
        setupGameSession(CITIES[parseInt(val, 10)], false);
    });

    document.getElementById('btn-continue-game')?.addEventListener('click', () => {
        const val = document.getElementById('city-dropdown-intro').value;
        if (val === '') return;
        setupGameSession(CITIES[parseInt(val, 10)], true);
    });

    document.getElementById('back-to-menu')?.addEventListener('click', () => location.reload());

    // --- Dev Tools ---
    devBtn?.addEventListener('click', () => {
        eventBus.emit(EVENTS.TOGGLE_DEV_ENCOUNTERS);
    });
}

document.addEventListener('DOMContentLoaded', initApp);
