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
        game.toggleInfoMenu();
    });
    // ----- Logische State-Changes -----
    game.onStateChange((state) => {
        if (state.currentPlayerNodeId === null) return;
        
        // Menü-Status synchronisieren
        mapView.toggleInfoMenu(state.isInfoMenuOpen);

        // Wenn das Spiel pausiert ist (z.B. Kneipe betreten), zeige KEINE Basisinfos und leere das Panel sofort:
        if (!state.gameActive) {
            mapView.updateInfoPanel('', []); 
            return; 
        }

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
        let infoCards = [];
        if (state.gameActive) {
            if (state.missionPhase === 1) {
                infoCards = [
                    { title: 'AKTUELLES ZIEL', body: targetName },
                    { title: 'AUFGABE', body: 'Erreiche die Kneipe, um Informationen zu sammeln.' },
                    { title: 'STEUERUNG', body: 'Klicke auf die grünen Punkte, um dich durch die Stadt zu bewegen.' }
                ];
            } else if (state.missionPhase === 2) {
                infoCards = [
                    { title: 'RADAR-SYSTEM', body: 'Drücke "P", um Standorte der Polizei für 5 Sek. aufzudecken. (5 Min. Cooldown)' }
                ];
            }
        }

        // 2. Event-basierte Karten (unten anhängen)
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
        mapView.showNotification('ANGEKOMMEN', `Du hast "${name}" erreicht!`);

        // Cinematic-Vorbereitung (Task 8): Marker aktiv setzen und auf Klick warten
        mapView.onTargetReached(targetNodeId, () => {
            game._state.gameActive = false;
            // KEIN game._notify() hier!

            // Cinematic-Loop: Zoom + Sperre (Tür-Symbol)
            mapView.playCinematicSequence('door', 1500, () => {
                // Erst JETZT das Overlay öffnen (Task 9 mit Callback-Brücke)
                mapView.showInteractionOverlay(optionsData, riskData, (key, opt) => {
                    const msg = game.handleInteractionDecision(key, opt);
                    
                    // Ergebnis anzeigen (Task 10)
                    mapView.showInteractionResult(msg, msg.includes('✅') ? 'success' : 'fail');

                    // Spezielle Logik für Option B (Consultant)
                    if (key === 'B' && msg.includes('✅')) {
                        mapView.showInvestmentDialog(mapData.cityName, (type) => {
                            game._state.budget -= 75;
                            game._state.consultantActive = true;
                            const pNode = mapData.getNode(game.getState().currentPlayerNodeId);
                            const playerCoords = pNode ? [pNode.lat, pNode.lon] : null;
                            const targetIds = mapData.getCrimeTargets(type, 3, playerCoords);
                            game._state.activeCrimeTargets = targetIds;
                            game._state.missionPhase = 3;
                            game._notify();
                        }, () => {
                            game._state.gameActive = true;
                            game._notify();
                        });
                    } 
                    // Spezielle Logik für Option A (Radar)
                    else if (key === 'A' && game.getState().radarUnlocked) {
                        game._state.gameActive = false; 
                        mapView.showRadarTutorialDialog(() => {
                            mapView.showPoliceRadar(mapData._policeStations).then(() => {
                                mapView.animateInfoToMenu('NEUE FUNKTION', 'Radar-Frequenzen gespeichert!', () => {
                                    game._state.missionPhase = 2;
                                    game._state.lastRadarTime = Date.now();
                                    game._state.gameActive = true;
                                    game.triggerNewInfo(); 
                                    game._notify();
                                });
                            });
                        });
                    } 
                    // Standard-Fallback für C, D oder wenn A wegen Geldmangel fehlschlägt
                    else {
                        game._state.gameActive = true;
                        game._notify();
                    }
                }, (key) => game.getInteractionPreview(key));
            });
        });
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
        const val = document.getElementById('city-dropdown-intro').value;
        if (val === '') return;
        const idx = parseInt(val, 10);

        const city = CITIES[idx];
        mapView.showNotification('LADEN …', `Lade Daten für ${city.name} …`);
        mapData.cityName = city.name;
        
        try {
            await mapData.loadCityData(city.coords);
        } catch (err) {
            mapView.hideNotification();
            alert(`Fehler beim Laden der Karte: ${err.message}\n\nBitte prüfe deine Internetverbindung oder versuche es später erneut.`);
            return;
        }

        // Tutorial-Szenario erzeugen (100-200m Abstand)
        const scenario = mapData.spawnTutorialScenario();
        if (!scenario) {
            mapView.hideNotification();
            alert('Konnte kein gültiges Start-Szenario mit Kneipe generieren.');
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
