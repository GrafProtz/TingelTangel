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
        mapView.updateBudget(`Budget: ${budget} €`);
    });

    // ----- Tutorial-Panel ausblenden nach erstem Zug -----
    game.onFirstMove(() => {
        mapView.fadeTutorialPanelOut();
    });
    // ----- Info-Toggle-Button -----
    document.getElementById('info-toggle-btn')?.addEventListener('click', () => {
        game._state.isInfoMenuOpen = !game._state.isInfoMenuOpen;
        game._notify();
    });
    // ----- Logische State-Changes -----
    game.onStateChange((state) => {
        if (state.currentPlayerNodeId === null) return;
        
        // Menü-Status synchronisieren
        mapView.toggleInfoMenu(state.isInfoMenuOpen);

        if (state.isMoving) {
            mapView.renderNeighbors([], () => {});
            return;
        }

        const node = mapData.getNode(state.currentPlayerNodeId);
        if (node) mapView.renderPlayer([node.lat, node.lon]);

        const targetNode = mapData.getNode(state.targetPubNodeId);
        if (targetNode) {
            const isCooldown = (Date.now() - state.lastPubVisitTime < 180000);
            mapView.renderTarget(targetNode, isCooldown);
        }

        const neighbors = mapData.getNeighbors(state.currentPlayerNodeId);
        mapView.renderNeighbors(neighbors, (clickedId) => {
            game.moveToNode(clickedId);
        });

        // ----- Rechte Infotafel aktualisieren -----
        const targetName = missionPOI?.poiData?.tags?.name || 'Unbekannte Gaststätte';
        
        // 1. Permanente Karten
        const infoCards = [
            { title: 'AKTUELLES ZIEL', body: targetName },
            { title: 'AUFGABE', body: 'Erreiche die Kneipe, um Informationen zu sammeln.' },
            { title: 'STEUERUNG', body: 'Klicke auf die grünen Punkte, um dich durch die Stadt zu bewegen.' }
        ];

        // 2. Event-basierte Karten (unten anhängen)
        if (state.radarUnlocked) {
            infoCards.push({ 
                title: 'RADAR AKTIV', 
                body: 'Du kannst dir den Standort der Polizeistationen für 5 Sek. anschauen (Taste "P").' 
            });
        }
        if (state.showPubCooldownText) {
            infoCards.push({ 
                title: 'HINWEIS', 
                body: 'Du kannst erst wieder in drei Minuten die Kneipe besuchen.' 
            });
        }

        // Karten rendern
        const panel = document.getElementById('info-panel');
        if (panel) {
            panel.innerHTML = '';
            infoCards.forEach(card => {
                const cardEl = document.createElement('div');
                cardEl.className = 'info-card';
                cardEl.innerHTML = `<div class="info-header">${card.title}</div><div class="info-body">${card.body}</div>`;
                panel.appendChild(cardEl);
            });
        }

        mapView.updateBudget(`Budget: ${state.budget} €`);

        if (!state.gameActive && state.budget <= 0) {
            mapView.showNotification('MISSION GESCHEITERT', 'Dein Budget ist aufgebraucht.');
        }
    });

    // ----- Ziel erreicht → Kneipen-Dialog -----
    game.onTargetReached((targetNodeId, optionsData, riskData) => {
        const name = missionPOI?.poiData?.tags?.name || 'Unbekannte Gaststätte';

        // 1. Visuelles Feedback: Icon pulsiert
        mapView.highlightTarget();
        mapView.showNotification('ANGEKOMMEN', `Du hast "${name}" erreicht!`);

        // 2. Verzögerung, dann Dialog mit dynamischen Risikodaten
        setTimeout(() => {
            mapView.showInteractionOverlay(optionsData, riskData, (key, opt) => {
                const msg = game.handleInteractionDecision(key, opt);
                mapView.hideInteractionOverlay();
                mapView.showNotification('Ergebnis', msg);
            });
        }, 1200);
    });

    // ----- Hotkey: Polizei-Radar (P) -----
    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() !== 'p') return;

        const result = game.triggerRadar();

        if (result === null) {
            // Noch nicht freigeschaltet → keine Meldung
            return;
        }
        if (result === 'cooldown') {
            const remaining = Math.ceil((300_000 - (Date.now() - game.getState().lastRadarTime)) / 1000);
            mapView.showNotification('COOLDOWN', `📡 Radar lädt noch auf! (${remaining} Sek.)`);
            return;
        }

        // Aktuelle Spielerposition merken für Rückflug
        const playerNode = mapData.getNode(game.getState().currentPlayerNodeId);
        const playerCoords = playerNode ? [playerNode.lat, playerNode.lon] : null;

        mapView.showNotification('RADAR', `📡 ${result.length} Polizeiwache(n) aufgespürt!`);
        mapView.showPoliceRadar(result).then(() => {
            // Nach 5 Sek.: Kamera zurück zum Spieler
            if (playerCoords) {
                mapView.focusLocation(playerCoords);
            }
        });
    });

    // ----- Start-Button -----
    document.querySelector('.start-btn')?.addEventListener('click', async () => {
        const idx = document.getElementById('city-dropdown-intro').value;
        if (idx === '') return;

        const city = CITIES[idx];
        mapView.showNotification('LADEN …', `Lade Daten für ${city.name} …`);
        mapData.cityName = city.name;
        await mapData.loadCityData(city.coords);

        // Tutorial-Szenario erzeugen (100-200m Abstand)
        const scenario = mapData.spawnTutorialScenario();
        if (!scenario) {
            // Fallback auf altes Verfahren
            const startId = mapData.getRandomIntersectionNode();
            missionPOI = mapData.getNearestPOI(startId);
            const targetId = missionPOI ? missionPOI.graphNodeId : mapData.getRandomIntersectionNode();
            if (!startId || !targetId) { alert('Keine begehbaren Wege gefunden.'); return; }

            mapView.setUIState('intro-overlay', false);
            mapView.setUIState('back-to-menu', true);
            mapView.setUIState('info-toggle-btn', true);
            mapView.setUIState('budget-panel', true);
            
            mapView.hideNotification();
            const tn = mapData.getNode(targetId); if (tn) mapView.renderTarget(tn);
            const sn = mapData.getNode(startId);
            mapView.focusLocation([sn.lat, sn.lon]);
            mapView.onMapReady(() => {
                game.startMission(startId, targetId);
                const nb = mapData.getNeighbors(startId);
                mapView.renderNeighbors(nb, id => game.moveToNode(id));
            });
            return;
        }

        // Tutorial-Szenario verwenden
        missionPOI = { poiData: { tags: { name: scenario.poiName } }, graphNodeId: scenario.targetNodeId };

        mapView.setUIState('intro-overlay', false);
        mapView.setUIState('back-to-menu', true);
        mapView.setUIState('info-toggle-btn', true);
        mapView.setUIState('budget-panel', true);
        
        mapView.hideNotification();

        // Spieler und Ziel rendern
        mapView.renderPlayer(scenario.startCoords);
        const targetNode = mapData.getNode(scenario.targetNodeId);
        if (targetNode) mapView.renderTarget(targetNode);

        // Kamera zum Start
        mapView.focusLocation(scenario.startCoords);

        // Tutorial-Kamerafahrt starten (Spieler kann noch nicht klicken)
        mapView.onMapReady(() => {
            mapView.playTutorialSequence(
                scenario.startCoords,
                scenario.targetCoords,
                scenario.poiName,
                () => {
                    // Nach Tutorial: Mission starten und Nachbarn zeigen
                    game.startMission(scenario.startNodeId, scenario.targetNodeId);
                    const neighbors = mapData.getNeighbors(scenario.startNodeId);
                    mapView.renderNeighbors(neighbors, (clickedId) => {
                        game.moveToNode(clickedId);
                    });
                }
            );
        });
    });

    // ----- Hauptmenü -----
    document.getElementById('back-to-menu')?.addEventListener('click', () => {
        location.reload();
    });
}

document.addEventListener('DOMContentLoaded', initApp);
