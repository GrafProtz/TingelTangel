import { eventBus } from './EventBus.js';
import { EVENTS } from './EventTypes.js';
import { sanitizeHTML } from './Utils.js';
import { CONFIG } from './GameConfig.js';
import { DialogFactory } from './DialogFactory.js';

/**
 * InteractionManager - Verwaltet dynamische Modals und Dialoge.
 * Architektur: Dumb-UI, gesteuert durch Konfigurationsobjekte via EventBus.
 */
export class InteractionManager {
    #activeOverlay = null;

    constructor() {
        this.#setupListeners();
    }

    #setupListeners() {
        // Mapping von Fach-Events auf das generische Dialog-System
        eventBus.subscribe(EVENTS.OPEN_INTERACTION, (data) => this.#handlePubInteraction(data));
        eventBus.subscribe(EVENTS.OPEN_INVESTMENT, (data) => this.#handleInvestmentInteraction(data));
        eventBus.subscribe(EVENTS.OPEN_SCOUTING_REPORT, (data) => this.#handleScoutingReport(data));
        eventBus.subscribe(EVENTS.SHOW_DIALOG, (data) => this.showDialog({
            title: data.title,
            body: data.body || data.text || "",
            buttons: data.buttons,
            onClose: data.isRadarUnlock ? () => eventBus.emit(EVENTS.RADAR_SEQUENCE_START) : null
        }));

        eventBus.subscribe(EVENTS.CLOSE_INTERACTION, () => this.closeAllOverlays());
    }

    /**
     * Die zentrale, generische Render-Funktion für alle Dialoge.
     * @param {Object} config - { title, body, buttons: [{text, event, payload, className}], onClose }
     */
    showDialog(config) {
        import('./Utils.js').then(({ log }) => log('DEBUG_INTERACTION_STATE', config));
        this.closeAllOverlays();

        // 1. Full-Screen Overlay (Sperre)
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';
        
        // 2. Dialog-Box
        const dialogBox = document.createElement('div');
        dialogBox.className = `dialog-box glass-panel ${config.isWide ? 'modal-wide' : ''}`;
        dialogBox.setAttribute('role', 'dialog');
        dialogBox.setAttribute('aria-modal', 'true');
        
        const titleId = `dialog-title-${Date.now()}`;
        dialogBox.setAttribute('aria-labelledby', titleId);
        
        // 3. Inhalt (Header & Body)
        let html = `<h3 id="${titleId}" class="dialog-title">${sanitizeHTML(config.title)}</h3>`;
        html += `<div class="dialog-body">${sanitizeHTML(config.body)}</div>`;
        
        // 4. Button-Container
        const btnContainer = document.createElement('div');
        btnContainer.className = 'dialog-buttons';

        config.buttons.forEach((btnCfg, index) => {
            const btn = document.createElement('button');
            btn.className = `btn-base ${btnCfg.className || ''}`;
            btn.innerHTML = sanitizeHTML(btnCfg.text);
            
            btn.onclick = () => {
                this.closeAllOverlays();
                if (btnCfg.event) {
                    eventBus.emit(btnCfg.event, btnCfg.payload);
                }
                if (config.onClose) config.onClose();
                // Falls ein lokaler Callback existiert (z.B. für "Zurück")
                if (btnCfg.onclick) btnCfg.onclick();
            };

            btnContainer.appendChild(btn);

            // UX: Fokus auf den ersten Button setzen
            if (index === 0) {
                setTimeout(() => btn.focus(), 10);
            }
        });

        dialogBox.innerHTML = html;
        dialogBox.appendChild(btnContainer);
        overlay.appendChild(dialogBox);
        document.body.appendChild(overlay);

        this.#activeOverlay = overlay;
    }

    /**
     * Schließt alle aktiven Overlays rückstandsfrei.
     */
    closeAllOverlays() {
        if (this.#activeOverlay) {
            this.#activeOverlay.remove();
            this.#activeOverlay = null;
        }
    }

    // ----- Spezielle Transformer (Transformieren Fachdaten in UI-Config) -----

    #handlePubInteraction(data) {
        const { optionsData, getPreviewFn } = data;

        const renderPhase1 = () => {
            const buttons = [];
            ['A', 'B', 'C', 'D'].forEach(key => {
                const opt = optionsData[key];
                if (!opt) return;

                buttons.push({
                    text: `${key}: ${opt.text}`,
                    className: 'btn-option',
                    onclick: opt.requiresConfirmation ? () => renderPhase2(key, opt) : null,
                    event: opt.requiresConfirmation ? null : (opt.customEvent || EVENTS.INTERACTION_SELECTED),
                    payload: opt.requiresConfirmation ? null : (opt.customPayload || { key, option: opt })
                });
            });

            const dialogConfig = DialogFactory.getPubDialog();
            this.showDialog({
                ...dialogConfig,
                buttons: buttons
            });
        };

        const renderPhase2 = (key, opt) => {
            const preview = getPreviewFn(key);
            this.showDialog({
                title: 'Bestätigung erforderlich',
                body: `<div class="warning-box">${sanitizeHTML(preview.text)}</div>`,
                buttons: [
                    { 
                        text: 'Risiko akzeptieren & Ausführen', 
                        className: 'btn-danger',
                        event: EVENTS.INTERACTION_SELECTED,
                        payload: { key, option: { ...opt, risk: preview.risk } }
                    },
                    { 
                        text: 'Zurück', 
                        className: 'btn-secondary',
                        onclick: () => renderPhase1()
                    }
                ]
            });
        };

        renderPhase1();
    }

    #handleInvestmentInteraction() {
        const dialogConfig = DialogFactory.getInvestmentDialog();
        this.showDialog(dialogConfig);
    }

    #handleScoutingReport({ target, riskData }) {
        const dialogConfig = DialogFactory.getScoutingReportDialog(riskData);
        this.showDialog({
            ...dialogConfig,
            buttons: [
                { 
                    text: 'Einbruch durchziehen', 
                    className: 'btn-danger',
                    event: EVENTS.START_BURGLARY,
                    payload: { target, riskData }
                },
                { 
                    text: 'Rückzug', 
                    className: 'btn-secondary',
                    event: EVENTS.RESUME_GAME
                }
            ]
        });
    }
}
