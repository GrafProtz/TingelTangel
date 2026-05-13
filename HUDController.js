import { eventBus } from './EventBus.js';
import { sanitizeHTML } from './Utils.js';
import { EVENTS } from './EventTypes.js';

/**
 * HUDController - View-Controller fuer die HUD-Elemente.
 * Kapselt DOM-Zugriffe und steuert die Anzeige von Budget und Info-Karten.
 */
export class HUDController {
    // DOM-Referenzen
    #budgetPanel;
    #infoPanel;
    #infoCardsContainer;
    #infoToggleBtn;

    // Lokaler State fuer Teardown
    #subscriptions = [];

    constructor() {
        this.#cacheDOM();
        this.#registerListeners();
        
        if (this.#budgetPanel) this.#budgetPanel.classList.add('glass-panel');
        if (this.#infoPanel)   this.#infoPanel.classList.add('glass-panel');
    }

    /**
     * Sammelt alle benoetigten DOM-Elemente einmalig ein.
     */
    #cacheDOM() {
        this.#budgetPanel = document.getElementById('budget-panel');
        this.#infoPanel = document.getElementById('info-panel');
        this.#infoCardsContainer = document.getElementById('info-cards-container');
        this.#infoToggleBtn = document.getElementById('info-toggle-btn');
    }

    #registerListeners() {
        this.#subscriptions.push(
            eventBus.subscribe(EVENTS.GAME_STATE_CHANGED, (state) => this.#onStateChanged(state))
        );

        if (this.#infoToggleBtn) {
            const toggleHandler = () => eventBus.emit(EVENTS.TOGGLE_INFO);
            this.#infoToggleBtn.addEventListener('click', toggleHandler);
            this.#subscriptions.push(() => this.#infoToggleBtn.removeEventListener('click', toggleHandler));
        }

        this.#subscriptions.push(
            eventBus.subscribe(EVENTS.TOGGLE_INFO, (forceState) => this.#toggleInfoMenu(forceState))
        );

        this.#subscriptions.push(
            eventBus.subscribe(EVENTS.BUDGET_TICK, (data) => this.#showBudgetFeedback(data.diff))
        );

        this.#subscriptions.push(
            eventBus.subscribe(EVENTS.SHOW_TUTORIAL, (data) => this.#showTutorial(data))
        );
        
        this.#subscriptions.push(
            eventBus.subscribe(EVENTS.SAVE_COMPLETED, () => this.#showSaveIndicator())
        );
    }

    /**
     * Haupt-Update-Loop bei Zustandsaenderung.
     */
    #onStateChanged(state) {
        this.#updateBudgetDisplay(state);
        this.#updateInfoPanel(state);
    }

    /**
     * Aktualisiert die Budget-Anzeige.
     */
    #updateBudgetDisplay(state) {
        if (!this.#budgetPanel) return;

        this.#budgetPanel.innerText = `Budget: ${state.budget} €`;

        if (this.#budgetPanel.style.display === 'none' && state.gameActive) {
            this.#budgetPanel.style.display = 'block';
        }
    }

    /**
     * Logik der Info-Karten (extrahiert aus Game.js).
     */
    #updateInfoPanel(state) {
        if (!this.#infoCardsContainer) return;

        if (!state.gameActive && state.currentPlayerNodeId === null) {
            this.#infoPanel.style.display = 'none';
            return;
        }

        const infoCards = [];

        if (state.gameActive) {
            if (state.missionPhase === 1) {
                infoCards.push(
                    { title: 'AKTUELLES ZIEL', body: state.targetPubName || 'Kneipe finden' },
                    { title: 'AUFGABE', body: 'Erreiche die Kneipe, um Informationen zu sammeln.' },
                    { title: 'STEUERUNG', body: 'Klicke auf die gruenen Punkte, um dich durch die Stadt zu bewegen.' }
                );
            } else if (state.missionPhase === 2) {
                infoCards.push({
                    title: 'RADAR-SYSTEM',
                    body: 'Druecke "P", um Standorte der Polizei fuer 5 Sek. aufzudecken. (5 Min. Cooldown)'
                });
            }
        }

        if (state.showPubCooldownText) {
            infoCards.push({
                title: 'HINWEIS',
                body: 'Du kannst erst wieder in drei Minuten die Kneipe besuchen.'
            });
        }

        this.#infoCardsContainer.innerHTML = '';
        
        if (infoCards.length === 0) {
            this.#infoPanel.style.display = 'none';
            return;
        }
        
        this.#infoPanel.style.display = 'block';

        infoCards.forEach(card => {
            const cardEl = document.createElement('div');
            cardEl.className = 'info-card';
            cardEl.innerHTML = `
                <div class="info-header">${sanitizeHTML(card.title)}</div>
                <div class="info-body">${sanitizeHTML(card.body)}</div>
            `;
            this.#infoCardsContainer.appendChild(cardEl);
        });
        
        this.#setInfoMenuState(state.isInfoMenuOpen);
    }

    /**
     * Zeigt Tutorial-Inhalte im Info-Panel an.
     */
    #showTutorial({ text, clearFirst }) {
        if (!this.#infoCardsContainer) return;
        
        if (clearFirst) this.#infoCardsContainer.innerHTML = '';

        const card = document.createElement('div');
        card.className = 'info-card';
        card.innerHTML = `<div class="info-header">Mission</div><div class="info-body">${sanitizeHTML(text)}</div>`;
        this.#infoCardsContainer.appendChild(card);

        if (this.#infoPanel) this.#infoPanel.style.display = 'block';
        this.#toggleInfoMenu(true);
    }

    /**
     * Visuelles Feedback bei Budget-Aenderung.
     */
    #showBudgetFeedback(diff) {
        if (!this.#budgetPanel || diff === 0) return;
        
        const feedback = document.createElement('span');
        feedback.className = diff > 0 ? 'budget-gain' : 'budget-loss';
        feedback.innerText = (diff > 0 ? '+' : '') + diff;
        
        feedback.addEventListener('animationend', () => {
            feedback.remove();
        }, { once: true });
        
        this.#budgetPanel.appendChild(feedback);
    }

    #showSaveIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'save-indicator';
        indicator.innerText = '💾 Speichert...';
        document.body.appendChild(indicator);
        indicator.addEventListener('animationend', () => indicator.remove(), { once: true });
    }

    #toggleInfoMenu(forceState) {
        if (!this.#infoPanel) return;
        const isOpen = (typeof forceState === 'boolean') ? forceState : !this.#infoPanel.classList.contains('open');
        this.#setInfoMenuState(isOpen);
    }

    #setInfoMenuState(isOpen) {
        this.#infoPanel?.classList.toggle('open', isOpen);
        this.#infoToggleBtn?.classList.toggle('panel-open', isOpen);
        if (this.#infoToggleBtn) this.#infoToggleBtn.innerText = isOpen ? '>>' : '<<';
    }

    /**
     * Teardown.
     */
    destroy() {
        this.#subscriptions.forEach(unsub => unsub());
        this.#subscriptions = [];
        console.log('[HUD] Controller bereinigt.');
    }
}
