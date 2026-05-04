import { MapData } from './MapData.js';
import { Game } from './Game.js';
import { MapView } from './MapView.js';
import { HUDManager } from './HUDManager.js';
import { InteractionManager } from './InteractionManager.js';
import { NotificationManager } from './NotificationManager.js';
import { MissionService } from './MissionService.js';
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

    let missionPOI = null;

    // ----- Core Game Events -----
    game.onPositionUpdate((lat, lon) => {
        mapView.updatePlayerPosition([lat, lon]);
    });

    game.onFirstMove(() => {
        eventBus.emit('TOGGLE_INFO', false);
    });

    // ----- Mission & Target Spawning -----
    eventBus.subscribe('SPAWN_TARGETS', ({ targetType, centerNodeId }) => {
        const targets = missionService.spawnTargets(targetType, centerNodeId);
        if (targets.length > 0) {
            game.setCrimeTargets(targets);
            eventBus.emit('SHOW_TOAST', { msg: `${targets.length} Ziele in der Nähe markiert!`, type: 'success' });
        } else {
            eventBus.emit('SHOW_TOAST', { msg: "Keine passenden Gebäude gefunden.", type: 'fail' });
        }
    });

    // ----- State Handling -----
    game.onStateChange((state) => {
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
                        const isAtAccessNode = markerEl?.classList.contains('marker-active');

                        if (!isAtAccessNode) {
                            eventBus.emit('SHOW_TOAST', { msg: "Du musst exakt am Icon stehen!", type: 'fail' });
                            return;
                        }

                        const riskData = game.calculateTargetRisk(target);
                        game.pause();
                        eventBus.emit('SHOW_DIALOG', {
                            title: 'Einbruch planen',
                            text: `Erfolgswahrscheinlichkeit: ${riskData.successProbability}%`,
                            buttons: [
                                { text: 'Durchführen', event: 'START_BURGLARY', payload: { target, riskData } },
                                { text: 'Abbrechen', event: 'RESUME_GAME' }
                            ]
                        });
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

    game.onTargetReached((targetNodeId) => {
        game.pause();
        mapView.playCinematicSequence('door', 1500, () => {
            // OPEN_INTERACTION via Game.js _notifyTargetReached
        });
    });

    // ----- UI Handlers -----
    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() !== 'p') return;
        const result = game.triggerRadar();
        if (result === null || result === 'cooldown') return;
        mapView.showPoliceRadar(result);
    });

    document.querySelector('.start-btn')?.addEventListener('click', async () => {
        const val = document.getElementById('city-dropdown-intro').value;
        if (val === '') return;
        const city = CITIES[parseInt(val, 10)];
        mapData.cityName = city.name;
        
        await mapData.loadCityData(city.coords);
        
        // Nutze den MissionService für das Tutorial
        const scenario = missionService.spawnTutorialScenario();
        if (!scenario) return;

        missionPOI = { poiData: { tags: { name: scenario.poiName } }, graphNodeId: scenario.targetNodeId };

        mapView.setUIState('intro-overlay', false);
        mapView.setUIState('back-to-menu', true);
        mapView.setUIState('info-toggle-btn', true);
        mapView.setUIState('budget-panel', true);
        
        mapView.renderPlayer(scenario.startCoords);
        mapView.focusLocation(scenario.startCoords);

        mapView.playTutorialSequence(scenario.startCoords, scenario.targetCoords, scenario.poiName, () => {
            game.startMission(scenario.startNodeId, scenario.targetNodeId);
        });
    });

    document.getElementById('back-to-menu')?.addEventListener('click', () => location.reload());
}

document.addEventListener('DOMContentLoaded', initApp);
