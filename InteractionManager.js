import { eventBus } from './EventBus.js';

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
        eventBus.subscribe('OPEN_INTERACTION', (data) => this.#handlePubInteraction(data));
        eventBus.subscribe('OPEN_INVESTMENT', (data) => this.#handleInvestmentInteraction(data));
        eventBus.subscribe('SHOW_DIALOG', (data) => this.showDialog({
            title: data.title,
            body: data.text,
            buttons: data.buttons.map(btn => ({
                text: btn.text,
                event: btn.event,
                payload: btn.payload,
                className: 'btn-primary'
            })),
            // Radar-Unlock Spezial-Logik: Wir hängen das Event einfach an die Buttons an
            onClose: data.isRadarUnlock ? () => eventBus.emit('RADAR_SEQUENCE_START') : null
        }));

        eventBus.subscribe('CLOSE_INTERACTION', () => this.closeAllOverlays());
    }

    /**
     * Die zentrale, generische Render-Funktion für alle Dialoge.
     * @param {Object} config - { title, body, buttons: [{text, event, payload, className}], onClose }
     */
    showDialog(config) {
        this.closeAllOverlays();

        // 1. Full-Screen Overlay (Sperre)
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';
        
        // 2. Dialog-Box
        const dialogBox = document.createElement('div');
        dialogBox.className = 'dialog-box glass-panel';
        
        // 3. Inhalt (Header & Body)
        let html = `<h3 class="dialog-title">${config.title}</h3>`;
        html += `<div class="dialog-body">${config.body}</div>`;
        
        // 4. Button-Container
        const btnContainer = document.createElement('div');
        btnContainer.className = 'dialog-buttons';

        config.buttons.forEach((btnCfg, index) => {
            const btn = document.createElement('button');
            btn.className = `btn-base ${btnCfg.className || ''}`;
            btn.innerText = btnCfg.text;
            
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
                    // Wenn Bestätigung nötig, triggere Phase 2 lokal im Manager
                    onclick: opt.requiresConfirmation ? () => renderPhase2(key, opt) : null,
                    // Ansonsten feure direkt die Entscheidung oder ein Custom Event
                    event: opt.requiresConfirmation ? null : (opt.customEvent || 'INTERACTION_SELECTED'),
                    payload: opt.requiresConfirmation ? null : (opt.customPayload || { key, option: opt })
                });
            });

            this.showDialog({
                title: 'In der Kneipe',
                body: 'Ah, ein neues Gesicht in meiner Kaschemme. Was führt dich in diese Ecke der Stadt, Grünschnabel? Trinkst du was, oder willst du direkt zur Sache kommen? Lass dir eins gesagt sein: Hier in der Unterwelt gibt\'s keine Geschenke. Also, was für Geschäfte schweben dir vor?',
                buttons: buttons
            });
        };

        const renderPhase2 = (key, opt) => {
            const preview = getPreviewFn(key);
            this.showDialog({
                title: 'Bestätigung erforderlich',
                body: `<div class="warning-box">${preview.text}</div>`,
                buttons: [
                    { 
                        text: 'Risiko akzeptieren & Ausführen', 
                        className: 'btn-danger',
                        event: 'INTERACTION_SELECTED',
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

    #handleInvestmentInteraction({ cityName }) {
        const options = [
            { type: 'residential', title: 'Wohnungen', desc: 'Konservativ. Aufklärungsquote: 16%.' },
            { type: 'commercial', title: 'Gewerbe', desc: 'Tech-ETF. Aufklärungsquote: 22%.' },
            { type: 'public', title: 'Öffentlich', desc: 'Risikoreich. Aufklärungsquote: 25%.' },
            { type: 'allotments', title: 'Gärten', desc: 'Penny-Stock. Aufklärungsquote: 8-10%.' }
        ];

        this.showDialog({
            title: 'Investment Consultant',
            body: `<p><i>"Ah, ein Investor! Lass uns einen Blick auf das Portfolio für ${cityName || 'diese Stadt'} werfen."</i></p>`,
            buttons: [
                ...options.map(opt => ({
                    text: `${opt.title} (${opt.desc})`,
                    event: 'INVESTMENT_SELECTED',
                    payload: opt.type,
                    className: 'btn-investment'
                })),
                { text: 'Abbrechen', event: 'INVESTMENT_CANCELLED', className: 'btn-secondary' }
            ]
        });
    }
}
