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
import { sanitizeHTML } from './Utils.js';

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
    const game    = new Game(mapData, missionService);
    const hud     = new HUDManager();
    const interaction = new InteractionManager();
    const notification = new NotificationManager();
    const saveManager = new SaveManager();
    const uiManager = new UIManager();

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

        if (state.activeBarber) {
            const b = state.activeBarber;
            const accessNode = mapData.getNode(b.accessNodeId);
            poiList.push({
                ...b,
                type: 'barber',
                accessNodeCoords: accessNode ? { lat: accessNode.lat, lon: accessNode.lon } : null,
                onClickCallback: () => {
                    const markerEl = document.querySelector(`.target-marker[data-node-id="${b.accessNodeId}"]`);
                    const innerEl = markerEl?.querySelector('.target-marker-inner');
                    const isAtAccessNode = innerEl?.classList.contains('poi-ready-pulse');

                    if (!isAtAccessNode) {
                        eventBus.emit('SHOW_TOAST', { msg: "Geh näher ran an den Salon!", type: 'fail' });
                        return;
                    }

                    game.pause();
                    eventBus.emit('SHOW_DIALOG', {
                        title: 'Ein neues Gesicht?',
                        text: `"Brauchst du ein neues Gesicht, Kumpel? Die Schmiere ist dir dicht auf den Fersen. Setz dich auf den Stuhl, lass mich die Konturen nachziehen und die Matte färben. Wenn du hier rausgehst, erkennt dich nicht mal deine eigene Mutter wieder. Dein Entdeckungsrisiko für den nächsten Bruch schmilzt auf die Hälfte zusammen, und deine Nerven bleiben wie Drahtseile – die Abbruchquote halbiert sich gleich mit. Was sagst du? Ein paar Kröten für ein Ticket in die Unsichtbarkeit?"`,
                        buttons: [
                            { text: 'Umstyling starten (50 €)', event: 'BARBER_TRANSFORM_START' },
                            { text: 'Später vielleicht', event: 'RESUME_GAME' }
                        ]
                    });
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
                        const markerEl = document.querySelector(`.target-marker[data-node-id="${target.accessNodeId}"]`);
                        const innerEl = markerEl?.querySelector('.target-marker-inner');
                        const isAtAccessNode = innerEl?.classList.contains('poi-ready-pulse');

                        if (!isAtAccessNode) {
                            eventBus.emit('SHOW_TOAST', { msg: "Steh direkt am Rad, um es zu knacken!", type: 'fail' });
                            return;
                        }

                        // Risiko berechnen
                        const riskData = game.calculateTargetRisk(target);

                        // Risiko-Breakdown (Gauner-Jargon)
                        const policeMalus = riskData.proximityRisk + riskData.interferenceRisk;
                        const dialogText = `
                                <p style="color: var(--color-warning); font-size: 0.9rem; margin-bottom: 12px; border-left: 3px solid var(--color-warning); padding-left: 8px;">
                                    Achtung: Auf dem Rad bist du schneller, aber auffälliger. Deine Informanten verlangen einen Risikoaufschlag. Die Fortbewegung kostet dich auf dem Bike 15 Cent pro Meter statt der üblichen 10 Cent.
                                </p>
                                <div class="scouting-report" style="line-height: 1.6;">
                                    <p style="margin-bottom: 16px;">"Die Rechnung ist einfach, Kumpel. Schau dir die Zahlen an, bevor du den Schneider ansetzt..."</p>
                                    
                                    <div style="background: rgba(0,0,0,0.05); padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 0.95rem;">
                                        <div style="display:flex; justify-content:space-between; margin-bottom: 4px;">
                                            <span>Grund-Chance (Statistik):</span>
                                            <span>9,7%</span>
                                        </div>
                                        <div style="display:flex; justify-content:space-between; margin-bottom: 4px; color: ${policeMalus > 0 ? 'var(--color-danger)' : 'inherit'};">
                                            <span>Bullen-Präsenz vor Ort:</span>
                                            <span>+${policeMalus}%</span>
                                        </div>
                                        ${riskData.isDisguised ? `
                                        <div style="display:flex; justify-content:space-between; margin-bottom: 4px; color: var(--color-secondary);">
                                            <span>Friseur-Tarnung:</span>
                                            <span>-50%</span>
                                        </div>` : ''}
                                    </div>

                                    <div style="border-top: 2px solid var(--color-text); padding-top: 12px; display:flex; justify-content:space-between; font-weight:bold; font-size:1.2rem; color:var(--color-danger);">
                                        <span>GESAMTRISIKO:</span>
                                        <span>${riskData.totalRisk}%</span>
                                    </div>
                                </div>
                            `;

                        // Diebstahl-Dialog (Blueprint Immobilien)
                        eventBus.emit('SHOW_DIALOG', {
                            title: 'Drahtesel im Visier',
                            text: dialogText,
                            buttons: [
                                { text: 'Einverstanden (Knacken)', event: 'START_BICYCLE_THEFT_RNG', payload: { target, riskData }, className: 'btn-danger' },
                                { text: 'Lieber nicht', event: 'RESUME_GAME', className: 'btn-secondary' }
                            ]
                        });
                    }
                });
            });
        }

        mapView.renderPOIs(poiList);

        const neighbors = mapData.getNeighbors(state.currentPlayerNodeId, state.isBiking);
        mapView.renderNeighbors(neighbors, state.targetPubNodeId, state.isBiking, state.lastPubVisit, (clickedId) => {
            game.moveToNode(clickedId);
        });
    });

    // Globaler Key-Listener für Fahrrad-Toggle (Taste F)
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'f') {
            eventBus.emit('TOGGLE_BICYCLE');
        }
    });

    eventBus.subscribe('BICYCLE_THEFT_SUCCESS_DONE', () => {
        eventBus.emit('SHOW_INFO_CASCADE', {
            title: "Fahrrad-Modus",
            shortText: "Hotkey F: Auf/Absteigen. Vorsicht: 15 Cent/Meter (1,5x Preise)!",
            fullText: "Hör zu, Freundchen. Das Rad gehört jetzt dir. Damit bist du doppelt so schnell unterwegs, aber du fällst auch mehr auf. Das kostet dich natürlich auch mehr. Logo, versteht sich. Mit 'F' kannst du jederzeit auf- oder absteigen, um unauffällig zu bleiben.",
            nextEvent: "RESUME_GAME"
        });
    });

    eventBus.subscribe('RELOAD_GAME', () => location.reload());
    
    eventBus.subscribe('OPTION_C_CLICKED', () => {
        const barber = game.findNearestHairdresser();
        const barberName = sanitizeHTML(barber?.tags?.name) || "Schnittwunde";
        
        eventBus.emit('SHOW_DIALOG', {
            title: 'Ein zwielichtiger Tipp',
            text: `Ich kenne da jemanden. Geh zu '<strong>${barberName}</strong>'. Lass dir die Haare färben, setz eine Brille auf. Wenn du nicht aussiehst wie ein typischer Einbrecher, fällst du weniger auf. Das halbiert dein Risiko und die Hausbesitzer schöpfen nicht so schnell Verdacht, was deine Abbruchquote drastisch senkt.`,
            buttons: [
                { 
                    text: 'Einverstanden (50 €)', 
                    event: 'BUY_BARBER_TICKET', 
                    payload: { barber, barberName } 
                },
                { text: 'Ablehnen', event: 'RESUME_GAME' }
            ]
        });
    });

    eventBus.subscribe('BUY_BARBER_TICKET', ({ barber, barberName }) => {
        if (game.canAfford(50)) {
            game.deductBudget(50);
            eventBus.emit('REMOVE_LOG_ENTRY', { logId: 'goal-visit-pub' });
            eventBus.emit('CLOSE_INTERACTION');
            
            eventBus.emit('ADD_LOG_ENTRY', { 
                shortText: "Ziel: Besuche " + barberName + " für eine Tarnung.", 
                logId: 'goal-visit-barber', 
                notify: true 
            });

            if (barber) {
                eventBus.emit('START_BARBER_REVEAL', { node: barber });
                game.setActiveBarber(barber);
            }
            
            game.resume();
        } else {
            eventBus.emit('SHOW_TOAST', { msg: "Nicht genug Kohle für den Friseur!", type: 'fail' });
        }
    });

    eventBus.subscribe('BARBER_TRANSFORM_START', () => {
        // 1. Visuelles Feedback: Segel-Animation zum Logbuch
        const flyer = document.createElement('div');
        flyer.className = 'fly-to-sidebar';
        flyer.innerHTML = '✂️';
        flyer.style.position = 'fixed';
        flyer.style.top = '50%';
        flyer.style.left = '50%';
        flyer.style.zIndex = '100000';
        flyer.style.fontSize = '2rem';
        flyer.style.pointerEvents = 'none';
        document.body.appendChild(flyer);

        setTimeout(() => flyer.remove(), 800);

        // 2. Mechanik aktivieren
        game.applyBarberBuff();
        
        // 3. Logbuch bereinigen (Eintrag entfernen statt nur markieren)
        eventBus.emit('REMOVE_LOG_ENTRY', { logId: 'goal-visit-barber' });
        
        eventBus.emit('SHOW_TOAST', { msg: "Tarnung aktiv! Du bist jetzt ein Geist.", type: 'success' });
        eventBus.emit('CLOSE_INTERACTION');
        game.resume();
    });

    eventBus.subscribe('OPTION_D_CLICKED', () => {
        eventBus.emit('SHOW_DIALOG', {
            title: 'Ein geschmeidiges Angebot',
            text: `"Hör zu, Freundchen. Für 75 Kröten überlasse ich dir diesen Bolzenschneider. Damit knackst du die Drahtesel an den Stellplätzen da draußen. Die Bullen juckt das kaum – nicht mal 10 Prozent Aufklärungsquote, ein absoluter Witz! Wenn du auf so einem Bock sitzt, machst du gleich zwei Blocks auf einmal. Du bist ein verdammter Geist auf zwei Rädern. Haben wir einen Deal?"`,
            buttons: [
                { 
                    text: 'Einverstanden (75 €)', 
                    event: 'BUY_BOLT_CUTTER', 
                    payload: { cost: 75 } 
                },
                { text: 'Vielleicht später', event: 'RESUME_GAME' }
            ]
        });
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
        
        const coords = [city.lat, city.lng];
        mapView = new MapView('map', coords, city.zoom || 13);
        
        try {
            await mapData.loadCityData(coords);
        } catch (err) {
            console.error("Critical Load Error:", err);
            eventBus.emit('SHOW_DIALOG', {
                title: 'Verbindungsfehler',
                text: "Die Satelliten-Verbindung zum städtischen Bauamt ist aktuell gestört (Server Timeout). Bitte versuche es in ein paar Sekunden noch einmal oder wähle eine andere Stadt.",
                buttons: [{ text: 'Zurück zum Hauptmenü', event: 'RELOAD_GAME' }]
            });
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
