import { eventBus } from './EventBus.js';

/**
 * InteractionManager - Verwaltet Modals, Dialoge und Spieler-Entscheidungen.
 */
export class InteractionManager {
    constructor() {
        this.overlayContainer = document.getElementById('options-container');
        this.setupListeners();
    }

    setupListeners() {
        // Auf Events zum Öffnen von Dialogen hören
        eventBus.subscribe('OPEN_INTERACTION', (data) => this.showInteractionOverlay(data));
        eventBus.subscribe('OPEN_INVESTMENT', (data) => this.showInvestmentDialog(data));
        eventBus.subscribe('SHOW_DIALOG', (data) => this.showGenericDialog(data));
        eventBus.subscribe('CLOSE_INTERACTION', () => this.closeAllOverlays());
    }

    /**
     * Schließt alle aktiven Overlays und Dialoge.
     */
    closeAllOverlays() {
        if (this.overlayContainer) {
            this.overlayContainer.style.display = 'none';
        }
        // Alle dynamisch erstellten Dialog-Overlays entfernen
        document.querySelectorAll('.dialog-overlay, .glass-panel-overlay').forEach(el => el.remove());
    }

    /**
     * Zeigt den Kneipen-Dialog an (Optionen A-D).
     * @param {Object} data - { optionsData, riskData, getPreviewFn }
     */
    showInteractionOverlay({ optionsData, riskData, getPreviewFn }) {
        const container = this.overlayContainer;
        if (!container) return;

        const renderPhase1 = () => {
            const textEl = document.getElementById('options-text');
            if (textEl) textEl.innerHTML = 'Du hörst dich unauffällig um. Was tust du?';

            const buttonsContainer = document.getElementById('options-buttons');
            const buttons = buttonsContainer.querySelectorAll('.option-btn');
            const keys = ['A', 'B', 'C', 'D'];

            buttons.forEach((btn, i) => {
                const key = keys[i];
                const opt = optionsData[key];

                if (!opt) {
                    btn.style.display = 'none';
                    return;
                }

                btn.style.display = 'block';
                const fresh = btn.cloneNode(false);
                fresh.textContent = `${key}: ${opt.text}`;
                fresh.className = btn.className;
                btn.parentNode.replaceChild(fresh, btn);

                fresh.addEventListener('click', () => {
                    if (opt.requiresConfirmation) {
                        renderPhase2(key, opt);
                    } else {
                        container.style.display = 'none';
                        eventBus.emit('INTERACTION_SELECTED', { key, option: opt });
                    }
                });
            });
        };

        const renderPhase2 = (key, opt) => {
            const preview = getPreviewFn(key);
            if (!preview) return;

            const textEl = document.getElementById('options-text');
            if (textEl) {
                textEl.innerHTML = `<div style="color: var(--color-accent); font-weight: bold; margin-bottom: 10px; text-transform: uppercase; font-size: 0.9rem;">⚠️ Bestätigung erforderlich</div>${preview.text}`;
            }

            const buttonsContainer = document.getElementById('options-buttons');
            const buttons = buttonsContainer.querySelectorAll('.option-btn');

            buttons.forEach(b => b.style.display = 'none');

            const backBtn = buttons[0];
            backBtn.style.display = 'block';
            const freshBack = backBtn.cloneNode(false);
            freshBack.textContent = 'Zurück / Abbrechen';
            freshBack.className = backBtn.className;
            backBtn.parentNode.replaceChild(freshBack, backBtn);
            freshBack.addEventListener('click', () => renderPhase1());

            const confirmBtn = buttons[1];
            confirmBtn.style.display = 'block';
            const freshConfirm = confirmBtn.cloneNode(false);
            freshConfirm.textContent = 'Risiko akzeptieren & Ausführen';
            freshConfirm.className = confirmBtn.className;
            freshConfirm.style.borderColor = 'var(--color-accent)';
            confirmBtn.parentNode.replaceChild(freshConfirm, confirmBtn);
            freshConfirm.addEventListener('click', () => {
                container.style.display = 'none';
                eventBus.emit('INTERACTION_SELECTED', { key, option: { ...opt, risk: preview.risk } });
            });
        };

        renderPhase1();
        container.style.display = 'block';
        container.classList.add('glass-panel');
    }

    /**
     * Zeigt den Investment-Berater Dialog.
     */
    showInvestmentDialog({ cityName }) {
        const overlay = document.createElement('div');
        overlay.className = 'glass-panel';
        Object.assign(overlay.style, {
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            padding: '30px', borderRadius: '15px', color: 'white', zIndex: '4000',
            textAlign: 'left', width: '400px', boxShadow: 'var(--panel-shadow)',
            fontFamily: 'sans-serif', lineHeight: '1.4'
        });

        overlay.innerHTML = `
            <div style="font-size: 20px; font-weight: bold; margin-bottom: 15px; color: var(--color-accent); text-align: center;">💼 Investment Consultant</div>
            <p style="margin-bottom: 20px;"><i>"Ah, ein Investor! Lass uns einen Blick auf das Portfolio für ${cityName || 'diese Stadt'} werfen. Meine Konditionen: 75 Euro vorab, 20% vom Brutto-Gewinn für mich. Wähle dein Risikoprofil:"</i></p>
            <div id="invest-options" style="display: flex; flex-direction: column; gap: 10px;"></div>
        `;

        const optionsContainer = overlay.querySelector('#invest-options');
        const options = [
            { type: 'residential', icon: '🏡', title: 'Wohnungen', desc: 'Konservativ. Aufklärungsquote: 16%.' },
            { type: 'commercial', icon: '🏢', title: 'Gewerbe', desc: 'Tech-ETF. Aufklärungsquote: 22%.' },
            { type: 'public', icon: '🏛️', title: 'Öffentlich', desc: 'Risikoreich. Aufklärungsquote: 25%.' },
            { type: 'allotments', icon: '🏕️', title: 'Gärten', desc: 'Penny-Stock. Aufklärungsquote: 8-10%.' }
        ];

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'btn-base';
            Object.assign(btn.style, {
                background: 'var(--color-bg-alt)', border: '1px solid var(--glass-border)',
                textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '5px'
            });

            btn.innerHTML = `<div style="font-weight: bold;">${opt.icon} ${opt.title}</div><div style="font-size: 11px; color: var(--color-text-muted);">${opt.desc}</div>`;
            btn.onclick = () => {
                overlay.remove();
                eventBus.emit('INVESTMENT_SELECTED', opt.type);
            };
            optionsContainer.appendChild(btn);
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn-base';
        cancelBtn.textContent = 'Abbrechen';
        Object.assign(cancelBtn.style, { marginTop: '20px', width: '100%', background: 'var(--color-danger)' });
        cancelBtn.onclick = () => {
            overlay.remove();
            eventBus.emit('INVESTMENT_CANCELLED');
        };
        overlay.appendChild(cancelBtn);

        document.body.appendChild(overlay);
    }

    /**
     * Zeigt einen generischen Dialog (z.B. Einbruch planen).
     */
    showGenericDialog({ title, text, buttons }) {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            background: 'rgba(0, 0, 0, 0.8)', display: 'flex', justifyContent: 'center',
            alignItems: 'center', zIndex: '99999', backdropFilter: 'blur(4px)'
        });

        const dialog = document.createElement('div');
        dialog.className = 'glass-panel';
        Object.assign(dialog.style, { padding: '25px', width: '350px', textAlign: 'center' });

        const h3 = document.createElement('h3');
        h3.innerText = title;
        h3.style.color = 'var(--color-secondary)';
        h3.style.marginTop = '0';
        dialog.appendChild(h3);

        const p = document.createElement('p');
        p.innerText = text;
        p.style.fontSize = '14px';
        p.style.marginBottom = '25px';
        dialog.appendChild(p);

        const btnContainer = document.createElement('div');
        btnContainer.style.display = 'flex';
        btnContainer.style.flexDirection = 'column';
        btnContainer.style.gap = '10px';

        buttons.forEach(btnData => {
            const btn = document.createElement('button');
            btn.className = 'btn-base';
            btn.innerText = btnData.text;
            btn.style.background = 'var(--color-bg-alt)';
            btn.onclick = () => {
                overlay.remove();
                if (btnData.event) eventBus.emit(btnData.event, btnData.payload);
            };
            btnContainer.appendChild(btn);
        });

        dialog.appendChild(btnContainer);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
    }

}
