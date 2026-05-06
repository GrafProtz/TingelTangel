import { MapData } from './MapData.js';
import { Game } from './Game.js';
import { MapView } from './MapView.js';
import { HUDManager } from './HUDManager.js';
import { InteractionManager } from './InteractionManager.js';
import { NotificationManager } from './NotificationManager.js';
import { MissionService } from './MissionService.js';
import { SaveManager } from './SaveManager.js';
import { UIManager } from './UIManager.js';
import { eventBus } from './EventBus.js';

const CITIES = [
    { name: "Berlin", coords: [52.5200, 13.4050] },
    { name: "Hamburg", coords: [53.5511, 9.9937] },
    { name: "München", coords: [48.1371, 11.5755] },
    { name: "Dortmund", coords: [51.5139, 7.4653] },
    { name: "Köln", coords: [50.9375, 6.9603] }
];

async function initApp() {
    const mapData = new MapData();
    const mapView = new MapView('map');
    const game    = new Game(mapData);
    const hud     = new HUDManager();
    const interaction = new InteractionManager();
    const notification = new NotificationManager();
    const missionService = new MissionService(mapData);
    const saveManager = new SaveManager();
    const uiManager = new UIManager();

    let missionPOI = null;

    // ----- Core Game Events -----
    eventBus.subscribe('PLAYER_POSITION_UPDATED', ({ lat, lon }) => {
        mapView.updatePlayerPosition([lat, lon]);
    });

    eventBus.subscribe('FIRST_MOVE_COMPLETED', () => {
        eventBus.emit('TOGGLE_INFO', false);
    });

    // ----- Mission & Target Spawning -----
    eventBus.subscribe('SPAWN_TARGETS', ({ targetType, centerNodeId }) => {
        const targets = missionService.spawnTargets(targetType, centerNodeId);
        if (targets.length > 0) {
            game.setCrimeTargets(targets);
            
            // Kamera-Totale (Übersicht) anfordern
            const coordsToFit = [];
            
            // 1. Spieler-Position einbeziehen (Erzeuge saubere Floats für Leaflet)
            const playerNode = mapData.getNode(centerNodeId);
            if (playerNode && playerNode.lat != null) {
                coordsToFit.push([parseFloat(playerNode.lat), parseFloat(playerNode.lon)]);
            }
            
            // 2. Alle Ziel-Positionen einbeziehen
            targets.forEach(t => {
                const node = mapData.getNode(t.accessNodeId);
                if (node && node.lat != null) {
                    coordsToFit.push([parseFloat(node.lat), parseFloat(node.lon)]);
                }
            });

            // Event für MapView abfeuern
            eventBus.emit('CAMERA_FIT_BOUNDS_REQUESTED', coordsToFit);
            
            eventBus.emit('SHOW_TOAST', { msg: `${targets.length} Ziele in der Nähe markiert!`, type: 'success' });
        } else {
            eventBus.emit('SHOW_TOAST', { msg: "Keine passenden Gebäude gefunden.", type: 'fail' });
        }
    });

    // ----- State Handling -----
    eventBus.subscribe('GAME_STATE_CHANGED', (state) => {
        if (state.currentPlayerNodeId === null) return;
        
        if (state.isMoving) {
            mapView.renderNeighbors([], () => {});
            return;
        }

        const node = mapData.getNode(state.currentPlayerNodeId);
        if (node) mapView.renderPlayer([node.lat, node.lon]);

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
                        const markerEl = document.querySelector(`.target-marker[data-node-id="${target.accessNodeId}"]`);
                        const innerEl = markerEl?.querySelector('.target-marker-inner');
                        const isAtAccessNode = innerEl?.classList.contains('poi-ready-pulse');

                        if (!isAtAccessNode) {
                            eventBus.emit('SHOW_TOAST', { msg: "Du musst exakt am Icon stehen!", type: 'fail' });
                            return;
                        }

                        const riskData = game.calculateTargetRisk(target);
                        game.pause();
                        
                        eventBus.emit('OPEN_SCOUTING_REPORT', { target, riskData });
                    }
                });
            });
        }

        mapView.renderPOIs(poiList);

        const neighbors = mapData.getNeighbors(state.currentPlayerNodeId);
        mapView.renderNeighbors(neighbors, state.targetPubNodeId, (clickedId) => {
            game.moveToNode(clickedId);
        });
    });

    eventBus.subscribe('RELOAD_GAME', () => location.reload());
    
    eventBus.subscribe('OPTION_C_CLICKED', () => {
        console.log('Option C geklickt: Risiko-Tipp gekauft (Platzhalter).');
        eventBus.emit('SHOW_TOAST', { msg: "Risiko-Tipp gekauft (Feature in Entwicklung)", type: 'success' });
        eventBus.emit('REMOVE_LOG_ENTRY', { logId: 'goal-visit-pub' });
        eventBus.emit('CLOSE_INTERACTION');
        game.resume();
    });

    eventBus.subscribe('OPTION_D_CLICKED', () => {
        console.log('Option D geklickt: Bolzenschneider & Fahrrad-Quest (Platzhalter).');
        eventBus.emit('SHOW_TOAST', { msg: "Bolzenschneider gekauft (Feature in Entwicklung)", type: 'success' });
        eventBus.emit('REMOVE_LOG_ENTRY', { logId: 'goal-visit-pub' });
        eventBus.emit('CLOSE_INTERACTION');
        game.resume();
    });

    eventBus.subscribe('PUB_TARGET_REACHED', () => {
        game.pause();
        mapView.playCinematicSequence('door', 1500, () => {
            // OPEN_INTERACTION via Game.js #notifyTargetReached
        });
    });

    // ----- Police Reveal Sequence (Kamerafahrt nach Intro Dialog) -----
    eventBus.subscribe('START_POLICE_REVEAL', async () => {
        const policeStations = mapData.getPoliceStations();
        const playerNode = mapData.getNode(game.getState().currentPlayerNodeId);
        const playerCoords = playerNode ? [playerNode.lat, playerNode.lon] : null;

        await mapView.playPoliceRevealSequence(policeStations, playerCoords);
        
        console.log('[MAIN] Police-Reveal beendet, Spiel wird freigegeben.');
        game.resume();
    });

    // ----- Radar Sequence (Kamerafahrt nach Kauf durch Hotkey P) -----
    eventBus.subscribe('RADAR_SEQUENCE_START', async () => {
        const result = game.triggerRadar(true); // force=true um Cooldown zu ignorieren
        if (result && result !== 'cooldown') {
            // Warten bis die gesamte Choreografie (Zoom raus -> 5s Display -> Zoom rein) fertig ist
            await mapView.playPoliceRevealSequence(result.stations, result.playerCoords);
            
            // Erst jetzt das Spiel wieder freigeben
            console.log('[MAIN] Radar-Sequenz beendet, Spiel wird fortgesetzt.');
            game.resume();
        }
    });

    // ----- UI Handlers -----
    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() !== 'p') return;
        const result = game.triggerRadar();
        if (result === null || result === 'cooldown') return;
        mapView.playPoliceRevealSequence(result.stations, result.playerCoords);
    });

    // Dropdown-Logik: Prüfe auf Savegame
    document.getElementById('city-dropdown-intro')?.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === '') return;
        const city = CITIES[parseInt(val, 10)];
        
        const hasSave = saveManager.hasSave(city.name);
        document.getElementById('btn-continue-game').style.display = hasSave ? 'block' : 'none';
    });

    // Hilfsfunktion zum Starten/Fortsetzen
    const setupGameSession = async (city, isContinue) => {
        mapData.cityName = city.name;
        saveManager.setCurrentCity(city.name);
        
        await mapData.loadCityData(city.coords);
        
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
                eventBus.emit('SHOW_TOAST', { msg: "Fehler beim Laden des Spielstands.", type: 'fail' });
            }
        } else {
            // Bei neuem Spiel evtl. altes Savegame löschen
            saveManager.deleteSave(city.name);
            
            const scenario = missionService.spawnTutorialScenario();
            if (!scenario) {
                eventBus.emit('SHOW_TOAST', { msg: "Fehler bei der Szenario-Generierung.", type: 'fail' });
                return;
            }

            // Modal ploppt sofort auf, die Engine pausiert das Map-Rendering
            game.startMission(scenario.startNodeId, scenario.targetNodeId, scenario.poiName);

            // Wenn das Modal weggeklickt wird, erwacht die Karte zum Leben
            eventBus.subscribe('START_MAP_INTRO', () => {
                console.log("DEBUG 1: Event START_MAP_INTRO ist in main.js angekommen!");
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
}

document.addEventListener('DOMContentLoaded', initApp);
