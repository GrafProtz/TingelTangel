import { MapData } from './MapData.js';
import { CONFIG } from './GameConfig.js';
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

        // Task: Alle POIs (Kneipe + Einbruchsziele) über die universelle Methode rendern
        const poiList = [];
        
        const targetNode = mapData.getNode(state.targetPubNodeId);
        if (targetNode) {
            poiList.push({
                ...targetNode,
                type: 'pub',
                isPrimary: true
            });
        }

        if (state.activeCrimeTargets) {
            state.activeCrimeTargets.forEach(target => {
                const accessNode = mapData.getNode(target.accessNodeId);
                poiList.push({
                    ...target,
                    accessNodeCoords: accessNode ? { lat: accessNode.lat, lon: accessNode.lon } : null,
                    onClickCallback: () => {
                        // 1. Hybrid-Distanzprüfung (ID-Match oder physische Nähe zum Zugangsknoten)
                        const playerNode = mapData.getNode(state.currentPlayerNodeId);
                        if (!playerNode || !accessNode) return;

                        const isExactNode = String(state.currentPlayerNodeId) === String(target.accessNodeId);
                        const dist = mapData.calculateDistance(playerNode, accessNode);
                        const isCloseEnough = dist <= 20; // 20 Meter Toleranz-Radius zum Zugangsknoten

                        console.log("[DEBUG KOLLISION] Distanz Spieler -> Zugangsknoten: " + Math.round(dist) + "m. Erlaubt: 20m");

                        if (!isExactNode && !isCloseEnough) {
                            mapView.showNotification("ZU WEIT WEG", "Du musst näher an das Gebäude heran. Bewege dich zum Zugangsknoten (roter Strich).");
                            return;
                        }

                        // 2. Risiko-Daten ermitteln
                        const riskData = game.calculateTargetRisk(target);
                        const text = "Die Aufklärungsquote für diesen Gebäudetyp liegt bei " + riskData.baseQuote + " %. Durch die Polizeipräsenz in der Nähe steigt das Risiko um " + riskData.policePenalty + " %. Deine Chance auf einen erfolgreichen Einbruch liegt bei " + riskData.successProbability + " %.";

                        // 3. Risiko-Dialog aufrufen
                        game.pause();
                        mapView.showInteractionDialog(
                            "Einbruch planen",
                            text,
                            [
                                { 
                                    text: "Einbruch durchführen", 
                                    callback: () => {
                                        // 1. Feedback: Einbruch läuft
                                        mapView.showNotification("AKTION", "Einbruch läuft... bleib wachsam!");

                                        // 2. Timer (2000ms)
                                        setTimeout(() => {
                                            // 3. Würfel-Logik (1-100)
                                            const roll = Math.floor(Math.random() * 100) + 1;
                                            const isSuccess = roll <= riskData.successProbability;

                                            // 4. Ergebnis-Dialoge
                                            if (isSuccess) {
                                                game.addReward(100);
                                                mapView.showInteractionDialog(
                                                    "Erfolg!", 
                                                    "Du hast gewonnen! Die Beute wurde deinem Budget gutgeschrieben.", 
                                                    [{ text: "Hervorragend", callback: () => {} }]
                                                );
                                            } else {
                                                mapView.showInteractionDialog(
                                                    "Fehlschlag!", 
                                                    "Du hast verloren! Die Polizei war schneller und du konntest gerade noch entkommen.", 
                                                    [{ text: "Verdammt", callback: () => {} }]
                                                );
                                            }

                                            // 5. State aufräumen
                                            game.resetBurglaryState();
                                        }, 2000);
                                    } 
                                },
                                { text: "Abbrechen", callback: () => { game.resume(); } }
                            ]
                        );
                    }
                });
            });
        }

        mapView.renderPOIs(poiList);

        const neighbors = mapData.getNeighbors(state.currentPlayerNodeId);
        mapView.renderNeighbors(neighbors, state.targetPubNodeId, (clickedId) => {
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

        // Task: Automatischer Eintritt (kein extra Klick mehr nötig)
        game.pause();

        // Cinematic-Loop: Zoom + Sperre (Tür-Symbol)
        mapView.playCinematicSequence('door', 1500, () => {
            // Erst JETZT das Overlay öffnen
            mapView.showInteractionOverlay(optionsData, riskData, (key, opt) => {
                // Spezialfall: Option B (Berater)
                if (key === 'B') {
                    if (game.canAfford(75)) {
                        game.deductBudget(75);

                        // SOFORT den Folge-Dialog laden!
                        mapView.showInvestmentDialog("diesem Viertel", (targetType) => {
                            console.log("[DEBUG] Spieler wählte Zieltyp:", targetType);
                            // Task: Ziele im Umkreis generieren
                            game.spawnTargets(targetType, game.getState().targetPubNodeId);
                            game.resume();
                        }, () => {
                            // Abbrechen geklickt
                            game.resume();
                        });
                    } else {
                        alert("Nicht genug Geld für den Berater!");
                        game.resume();
                    }
                    return; // Beendet den Callback für B
                }

                // Standard-Abwicklung für alle anderen Optionen (A, C, D)
                const msg = game.handleInteractionDecision(key, opt);
                mapView.showInteractionResult(msg, msg.includes('✅') ? 'success' : 'fail');

                // Option A (Radar)
                if (key === 'A' && game.getState().radarUnlocked) {
                    game.pause(); 
                    mapView.showRadarTutorialDialog(() => {
                        mapView.showPoliceRadar(mapData._policeStations).then(() => {
                            mapView.animateInfoToMenu('NEUE FUNKTION', 'Radar-Frequenzen gespeichert!', () => {
                                const s = game.getState();
                                s.missionPhase = 2;
                                s.lastRadarTime = Date.now();
                                game.resume();
                                game.triggerNewInfo(); 
                            });
                        });
                    });
                } else {
                    game.resume();
                }
            }, (key) => game.getInteractionPreview(key));
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
            const remaining = Math.ceil((CONFIG.RADAR_COOLDOWN - (Date.now() - game.getState().lastRadarTime)) / 1000);
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
        if (targetNode) {
            mapView.renderPOIs([{ ...targetNode, type: 'pub', isPrimary: true }]);
        }

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
                    mapView.renderNeighbors(neighbors, scenario.targetNodeId, (clickedId) => {
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
