import { MapData } from './MapData.js';
import { Game } from './Game.js';
import { MapView } from './MapView.js';

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

    // Missions-Kontext (wird beim Start befüllt)
    let missionPOI = null;

    // ----- Frame-genaue Positions-Updates -----
    game.onPositionUpdate((lat, lon, budget) => {
        mapView.updatePlayerPosition([lat, lon]);
        mapView.updateHUD(`GUTHABEN: ${budget} €`);
    });

    // ----- Logische State-Changes -----
    game.onStateChange((state) => {
        if (state.currentPlayerNodeId === null) return;
        if (state.isMoving) {
            mapView.renderNeighbors([], () => {});
            return;
        }

        const node = mapData.getNode(state.currentPlayerNodeId);
        if (node) mapView.renderPlayer([node.lat, node.lon]);

        const neighbors = mapData.getNeighbors(state.currentPlayerNodeId);
        mapView.renderNeighbors(neighbors, (clickedId) => {
            game.moveToNode(clickedId);
        });

        let hud = `GUTHABEN: ${state.budget} €`;
        const poiName = missionPOI?.poiData?.tags?.name;
        if (poiName) hud += ` | Ziel: ${poiName}`;
        mapView.updateHUD(hud);

        if (!state.gameActive && state.budget <= 0) {
            mapView.showNotification('MISSION GESCHEITERT', 'Dein Budget ist aufgebraucht.');
        }
    });

    // ----- Ziel erreicht → Kneipen-Dialog -----
    game.onTargetReached((targetNodeId) => {
        const name = missionPOI?.poiData?.tags?.name || 'Unbekannte Gaststätte';
        mapView.showNotification('ANGEKOMMEN', `Du hast "${name}" erreicht!`);

        mapView.showInteractionOverlay((option) => {
            // Optionen-Logik
            const state = game.getState();
            let msg = '';
            if (option === 'A') {
                msg = "Der Barkeeper flüstert: 'Die Ware bewegt sich Richtung Osten.'";
            } else if (option === 'B') {
                msg = 'Niemand will mit dir reden.';
            } else if (option === 'C') {
                msg = 'Ein Informant markiert dir das nächste Versteck!';
            } else {
                msg = 'Du verlässt die Gaststätte unauffällig.';
            }
            mapView.showNotification('Info', msg);
        });
    });

    // ----- Start-Button -----
    document.querySelector('.start-btn')?.addEventListener('click', async () => {
        const idx = document.getElementById('city-dropdown-intro').value;
        if (idx === '') return;

        const city = CITIES[idx];
        mapView.showNotification('LADEN …', `Lade Daten für ${city.name} …`);
        await mapData.loadCityData(city.coords);

        const startId = mapData.getRandomIntersectionNode();
        if (!startId) {
            alert('Keine begehbaren Wege gefunden.');
            return;
        }

        // POI-System: Nächste Gaststätte finden und auf den Graphen snappen
        missionPOI = mapData.getNearestPOI(startId);
        const targetId = missionPOI
            ? missionPOI.graphNodeId
            : mapData.getRandomIntersectionNode();

        mapView.setUIState('intro-overlay', false);
        mapView.setUIState('back-to-menu', true);
        mapView.hideNotification();

        // Ziel-Icon auf den GRAPH-KNOTEN rendern (nicht auf die rohen POI-Koordinaten)
        const targetNode = mapData.getNode(targetId);
        if (targetNode) mapView.renderTarget(targetNode);

        // Kamera zum Start, Mission beginnen, und sofort Nachbarn zeigen
        const startNode = mapData.getNode(startId);
        mapView.focusLocation([startNode.lat, startNode.lon]);
        mapView.onMapReady(() => {
            game.startMission(startId, targetId);

            // Sofort Nachbarn rendern (verhindert "eingefrorenen" Start)
            const neighbors = mapData.getNeighbors(startId);
            mapView.renderNeighbors(neighbors, (clickedId) => {
                game.moveToNode(clickedId);
            });
        });
    });

    // ----- Hauptmenü -----
    document.getElementById('back-to-menu')?.addEventListener('click', () => {
        location.reload();
    });
}

document.addEventListener('DOMContentLoaded', initApp);
