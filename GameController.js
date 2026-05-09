import { eventBus } from './EventBus.js';
import { CONFIG } from './GameConfig.js';
import { log } from './Utils.js';
import { DialogFactory } from './DialogFactory.js';

/**
 * GameController - Die zentrale Schaltstelle für Events und Koordination.
 * Entlastet die main.js und trennt die Spiellogik von der Initialisierung.
 */
export class GameController {
    constructor(game, mapData, mapView, interactionManager) {
        this.game = game;
        this.mapData = mapData;
        this.mapView = mapView;
        this.interactionManager = interactionManager;
    }

    /**
     * Registriert alle globalen Event-Handler.
     */
    registerSubscriptions() {
        // --- 1. Granulare State-Events (Etappe 3) ---

        // Fokus auf Bewegung und Nachbarn
        eventBus.subscribe('PLAYER_MOVED', (state) => {
            if (state.currentPlayerNodeId === null) return;
            const node = this.mapData.getNode(state.currentPlayerNodeId);
            if (node) this.mapView.renderPlayer([node.lat, node.lon]);

            const neighbors = this.mapData.getNeighbors(state.currentPlayerNodeId, state.isBiking);
            this.mapView.renderNeighbors(neighbors, state.targetPubNodeId, state.isBiking, state.lastPubVisit, (clickedId) => {
                this.game.moveToNode(clickedId);
            });
        });

        // VOLLSTÄNDIGER TARGETS_CHANGED Block (Etappe 3 Korrektur)
        eventBus.subscribe('TARGETS_CHANGED', (state) => {
            const poiList = [];
            
            // Primäres Ziel (Kneipe)
            const targetNode = this.mapData.getNode(state.targetPubNodeId);
            if (targetNode) {
                poiList.push({ ...targetNode, type: 'pub', isPrimary: true });
            }

            // Crime Targets
            if (state.activeCrimeTargets) {
                state.activeCrimeTargets.forEach(target => {
                    const accessNode = this.mapData.getNode(target.accessNodeId);
                    poiList.push({
                        ...target,
                        accessNodeCoords: accessNode ? { lat: accessNode.lat, lon: accessNode.lon } : null,
                        onClickCallback: () => {
                            const riskData = this.game.calculateTargetRisk(target);
                            eventBus.emit('OPEN_SCOUTING_REPORT', { target, riskData });
                        }
                    });
                });
            }

            // Fahrräder
            if (state.activeBicycleTargets) {
                state.activeBicycleTargets.forEach(bike => {
                    const accessNode = this.mapData.getNode(bike.accessNodeId);
                    poiList.push({
                        ...bike,
                        type: 'bicycle',
                        accessNodeCoords: accessNode ? { lat: accessNode.lat, lon: accessNode.lon } : null,
                        onClickCallback: () => {
                            this.interactionManager.showDialog(DialogFactory.getBicycleDialogConfig(bike));
                        }
                    });
                });
            }

            // Friseur
            if (state.activeBarber) {
                const accessNode = this.mapData.getNode(state.activeBarber.accessNodeId);
                poiList.push({
                    ...state.activeBarber,
                    type: 'barber',
                    accessNodeCoords: accessNode ? { lat: accessNode.lat, lon: accessNode.lon } : null,
                    onClickCallback: () => {
                        const barberName = state.activeBarber.tags?.name || "Unbekannter Salon";
                        const price = state.activeBarber.price || 50;
                        this.interactionManager.showDialog(DialogFactory.getBarberDialogConfig(barberName, price));
                    }
                });
            }
            
            this.mapView.renderPOIs(poiList);
        });

        // UI-Zustände (Biking Modus)
        eventBus.subscribe('ITEMS_CHANGED', (state) => {
            const container = document.getElementById('app-container');
            if (container) {
                container.classList.toggle('state-biking', state.isBiking);
            }
            document.body.classList.toggle('state-biking', state.isBiking);
        });

        // --- 2. Aktions- & Flow-Events ---

        eventBus.subscribe('START_BURGLARY', (data) => {
            this.game.startBurglary(data.target, data.riskData);
        });

        eventBus.subscribe('INTERACTION_SELECTED', (data) => {
            const result = this.game.handleInteractionDecision(data.key, data.option);
            if (result.type === 'success' || result.type === 'info') {
                eventBus.emit('SHOW_TOAST', { msg: result.msg, type: 'success' });
            } else if (result.type === 'failure') {
                eventBus.emit('SHOW_TOAST', { msg: result.msg, type: 'error' });
            }
            if (result.nextEvent) {
                eventBus.emit(result.nextEvent, result.nextPayload);
            }
        });

        eventBus.subscribe('RADAR_SEQUENCE_START', () => {
            this.game.triggerRadar();
            const state = this.game.getState();
            this.mapView.renderRadarReveal(state.activeCrimeTargets, CONFIG.RADAR_DURATION);
        });

        eventBus.subscribe('START_POLICE_REVEAL', () => {
            this.mapView.playPoliceRevealSequence(this.mapData.getPoliceStations());
        });

        eventBus.subscribe('START_MAP_INTRO', () => {
            const state = this.game.getState();
            const targetNode = this.mapData.getNode(state.targetPubNodeId);
            if (targetNode) {
                this.mapView.playIntroSequence([targetNode.lat, targetNode.lon]);
            }
        });

        eventBus.subscribe('START_BARBER_REVEAL', (data) => {
            this.mapView.playBarberRevealSequence(data.node);
        });

        eventBus.subscribe('GAME_OVER', (data) => {
            this.interactionManager.showDialog({
                title: data.isWin ? 'Sieg!' : 'Game Over',
                body: `<div style="text-align:center; line-height:1.6;">${data.reason}<br><br><strong style="font-size:1.2rem;">Endstand: ${data.budget.toLocaleString()} €</strong></div>`,
                buttons: [
                    { 
                        text: 'Neu starten', 
                        className: 'btn-primary', 
                        onclick: () => location.reload() 
                    }
                ]
            });
        });
    }
}
