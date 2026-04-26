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

    // ----- Frame-genaue Positions-Updates (während der Animation) -----
    game.onPositionUpdate((lat, lon, budget) => {
        mapView.updatePlayerPosition([lat, lon]);
        mapView.updateHUD(`GUTHABEN: ${budget} €`);
    });

    // ----- Logische State-Changes (Ankunft, Start, Game-Over) -----
    game.onStateChange((state) => {
        // Vor dem Spielstart: nichts tun
        if (state.currentPlayerNodeId === null) return;

        // Während der Bewegung: Nachbarn ausblenden, kein Re-Render
        if (state.isMoving) {
            mapView.renderNeighbors([], () => {});
            return;
        }

        // Spieler an Zielkreuzung setzen
        const node = mapData.getNode(state.currentPlayerNodeId);
        if (node) mapView.renderPlayer([node.lat, node.lon]);

        // Nachbarn laden (getNeighbors liefert jetzt Objekte mit edgeData)
        const neighbors = mapData.getNeighbors(state.currentPlayerNodeId);
        mapView.renderNeighbors(neighbors, (clickedId) => {
            game.moveToNode(clickedId);
        });

        // HUD
        let hud = `GUTHABEN: ${state.budget} €`;
        if (state.moveCounter >= 3) hud += ' | Ziel finden!';
        mapView.updateHUD(hud);

        // Game Over
        if (!state.gameActive && state.budget <= 0) {
            mapView.showNotification('MISSION GESCHEITERT', 'Dein Budget ist aufgebraucht.');
        }
    });

    // ----- Start-Button -----
    document.querySelector('.start-btn')?.addEventListener('click', async () => {
        const idx = document.getElementById('city-dropdown-intro').value;
        if (idx === '') return;

        const city = CITIES[idx];
        await mapData.loadCityData(city.coords);

        const startId  = mapData.getRandomIntersectionNode();
        const pubs     = mapData.getPubs();
        const targetId = pubs.length > 0
            ? String(pubs[Math.floor(Math.random() * pubs.length)].id)
            : mapData.getRandomIntersectionNode();

        if (!startId || !targetId) {
            alert('Keine begehbaren Wege gefunden.');
            return;
        }

        mapView.setUIState('intro-overlay', false);
        mapView.setUIState('back-to-menu', true);

        const startNode = mapData.getNode(startId);
        mapView.focusLocation([startNode.lat, startNode.lon]);
        mapView.onMapReady(() => game.startMission(startId, targetId));
    });

    // ----- Hauptmenü-Button -----
    document.getElementById('back-to-menu')?.addEventListener('click', () => {
        location.reload();
    });
}

document.addEventListener('DOMContentLoaded', initApp);
