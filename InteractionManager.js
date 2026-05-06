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
        eventBus.subscribe('OPEN_SCOUTING_REPORT', (data) => this.#handleScoutingReport(data));
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
        dialogBox.className = `dialog-box glass-panel ${config.isWide ? 'modal-wide' : ''}`;
        
        // 3. Inhalt (Header & Body)
        let html = `<h3 class="dialog-title">${config.title}</h3>`;
        html += `<div class="dialog-body">${config.body}</div>`;
        
        // 4. Button-Container
        const btnContainer = document.createElement('div');
        btnContainer.className = 'dialog-buttons';

        config.buttons.forEach((btnCfg, index) => {
            const btn = document.createElement('button');
            btn.className = `btn-base ${btnCfg.className || ''}`;
            btn.innerHTML = btnCfg.text;
            
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
            { 
                type: 'residential', 
                event: 'SELECT_CATEGORY_WOHNUNG',
                title: 'Wohnungen', 
                subtitle: '(Residential Assets)',
                desc: 'Der Blue-Chip. 78.000 Fälle/Jahr. Bullen-Quote: nur 15%. Dividende: Ø 3.800€. Sicher und profitabel.',
                icon: '<svg viewBox="0 0 24 24" width="32" height="32" style="margin-bottom:8px;"><path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>'
            },
            { 
                type: 'commercial', 
                event: 'SELECT_CATEGORY_GEWERBE',
                title: 'Gewerbe', 
                subtitle: '(High-Risk Derivate)',
                desc: 'Lager und Büros. Extrem heiß! Alarmanlagen treiben die Bullen-Quote auf 20-40%. Payoff: Stark variabel bis >10.000€. Nur für starke Nerven.',
                icon: '<svg viewBox="0 0 24 24" width="32" height="32" style="margin-bottom:8px;"><path fill="currentColor" d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/></svg>'
            },
            { 
                type: 'public', 
                event: 'SELECT_CATEGORY_OEFFENTLICH',
                title: 'Behörden', 
                subtitle: '(Public Bonds)',
                desc: 'Schulen und Ämter. Risiko ebenfalls bei 20-40%. Beute unberechenbar – von der Kaffeekasse bis zum Tresor. Ein volatiler Markt.',
                icon: '<svg viewBox="0 0 24 24" width="32" height="32" style="margin-bottom:8px;"><path fill="currentColor" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>'
            },
            { 
                type: 'allotments', 
                event: 'SELECT_CATEGORY_LAUBE',
                title: 'Schrebergärten', 
                subtitle: '(Penny Stocks)',
                desc: 'Lauben und Schuppen. Riesiger Markt (108.000 Fälle), Bullen-Quote unter 15%. Rendite mau (< 2.000€), aber dafür quasi stressfrei.',
                icon: '<svg viewBox="0 0 24 24" width="32" height="32" style="margin-bottom:8px;"><path fill="currentColor" d="M17 15.58V21H7v-5.42L12 13l5 2.58zM12 3L4 9v1h16V9l-8-6zM5 11v2h14v-2H5z"/></svg>'
            }
        ];

        this.showDialog({
            title: 'Crime Consultant',
            isWide: true,
            body: `<p style="margin-bottom: 20px;"><i>"Setz dich. Ich bin dein Crime Consultant. Jedes Gebäude hier ist ein Investmentfonds mit eigenem Risiko-Rendite-Profil. Schauen wir uns die Marktwerte an..."</i></p>`,
            buttons: [
                ...options.map(opt => ({
                    text: `
                        <div style="display:flex; flex-direction:column; align-items:center; text-align:center;">
                            <div class="investment-icon" style="color:var(--color-primary);">${opt.icon}</div>
                            <strong style="font-size:1.1rem; color:var(--color-primary);">${opt.title}</strong>
                            <span style="font-size:0.8rem; opacity:0.7; margin-bottom:8px;">${opt.subtitle}</span>
                            <small style="font-size:0.85rem; line-height:1.4;">${opt.desc}</small>
                        </div>
                    `,
                    event: opt.event,
                    className: 'btn-investment'
                })),
                { text: 'Portfolio schließen', event: 'INVESTMENT_CANCELLED', className: 'btn-secondary' }
            ]
        });
    }

    #handleScoutingReport({ target, riskData }) {
        this.showDialog({
            title: 'Scouting-Report',
            body: `
                <div class="scouting-report" style="line-height: 1.6;">
                    <p style="margin-bottom: 8px;"><strong>Ziel:</strong> ${riskData.label}</p>
                    <p style="margin-bottom: 16px;"><strong>Erwartete Beute:</strong> ${riskData.minLoot.toLocaleString()} € - ${riskData.maxLoot.toLocaleString()} €</p>
                    <div style="border-top: 1px solid rgba(0,0,0,0.1); padding-top: 12px; margin-bottom: 12px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom: 4px;">
                            <span>Basis-Risiko:</span>
                            <span>${riskData.baseRisk}%</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom: 4px;">
                            <span>Mechanischer Widerstand (Abbruch):</span>
                            <span>${riskData.abortRate}%</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom: 4px;">
                            <span>Polizeipräsenz (${riskData.nearbyCount} Wache${riskData.nearbyCount === 1 ? '' : 'n'} nah):</span>
                            <span style="color: var(--color-danger);">+ ${riskData.proximityRisk}%</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom: 4px;">
                            <span>Interferenz-Warnung:</span>
                            <span style="color: var(--color-danger);">+ ${riskData.interferenceRisk}%</span>
                        </div>
                    </div>
                    <div style="border-top: 2px solid var(--color-text); padding-top: 12px; display:flex; justify-content:space-between; font-weight:bold; font-size:1.2rem; color:var(--color-danger);">
                        <span>GESAMTRISIKO:</span>
                        <span>${riskData.totalRisk}%</span>
                    </div>
                </div>
            `,
            buttons: [
                { 
                    text: 'Einbruch durchziehen', 
                    className: 'btn-danger',
                    event: 'START_BURGLARY',
                    payload: { target, riskData }
                },
                { 
                    text: 'Rückzug', 
                    className: 'btn-secondary',
                    event: 'RESUME_GAME'
                }
            ]
        });
    }
}
