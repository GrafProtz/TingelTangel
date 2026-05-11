import { eventBus } from './EventBus.js';
import { sanitizeHTML } from './Utils.js';
import { EVENTS } from './EventTypes.js';

/**
 * HUDManager - Verwaltet die In-Game-UI (Budget, Info-Panels, Tutorials).
 * Architektur: Strikt Event-Driven mit DOM Caching.
 */
export class HUDManager {
    // Private Fields für DOM Caching
    #budgetPanel;
    #infoPanel;
    #infoCardsContainer;
    #toggleBtn;

    constructor() {
        // Einmaliges DOM Caching
        this.#budgetPanel = document.getElementById('budget-panel');
        this.#infoPanel = document.getElementById('info-panel');
        this.#infoCardsContainer = document.getElementById('info-cards-container');
        this.#toggleBtn = document.getElementById('info-toggle-btn');
        
        // CSS-Klassen für einheitlichen Look zuweisen
        if (this.#budgetPanel) this.#budgetPanel.classList.add('glass-panel');
        if (this.#infoPanel) this.#infoPanel.classList.add('glass-panel');

        // Initialer Zustand des Toggle-Buttons
        if (this.#toggleBtn) {
            this.#toggleBtn.addEventListener('click', () => {
                eventBus.emit(EVENTS.TOGGLE_INFO);
            });
        }

        this.#setupListeners();
    }

    #setupListeners() {
        // Ausschließlich auf Events hören, kein aktives Pulling
        eventBus.subscribe(EVENTS.BUDGET_UPDATED, (data) => this.#updateBudget(data));
        eventBus.subscribe(EVENTS.BUDGET_TICK, (data) => this.#updateBudget(data));
        eventBus.subscribe(EVENTS.INFO_UPDATED, (data) => this.#updateInfoPanel(data));
        eventBus.subscribe(EVENTS.INFO_MENU_STATE, (data) => this.#setInfoMenuState(data));
        eventBus.subscribe(EVENTS.SHOW_TUTORIAL, (data) => this.#showTutorial(data));
        eventBus.subscribe(EVENTS.TOGGLE_INFO, (data) => this.#toggleInfoMenu(data));
        eventBus.subscribe(EVENTS.SAVE_COMPLETED, () => this.#showSaveIndicator());
    }

    /**
     * Zeigt kurzzeitig das "Speichert..." Feedback an.
     */
    #showSaveIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'save-indicator';
        indicator.innerText = '💾 Speichert...';
        
        document.body.appendChild(indicator);
        
        indicator.addEventListener('animationend', () => {
            indicator.remove();
        }, { once: true });
    }

    /**
     * Aktualisiert die Budget-Anzeige im HUD und spielt Animationen ab.
     * @param {Object} data - { total, diff }
     */
    #updateBudget({ total, diff }) {
        if (!this.#budgetPanel) return;
        
        // Minimal invasives Update des reinen Textes
        // Wir verwenden einen dedizierten Text-Span, um laufende Animationen nicht durch .innerText zu löschen
        let textSpan = this.#budgetPanel.querySelector('.budget-text');
        if (!textSpan) {
            this.#budgetPanel.innerHTML = '<span class="budget-text"></span>';
            textSpan = this.#budgetPanel.querySelector('.budget-text');
        }
        textSpan.innerText = `Budget: ${total} €`;
        
        // Visuelles Feedback bei Änderungen
        if (diff !== 0) {
            const feedback = document.createElement('span');
            feedback.className = diff > 0 ? 'budget-gain' : 'budget-loss';
            feedback.innerText = (diff > 0 ? '+' : '') + diff;
            
            // Cleanup via nativem animationend Event statt setTimeout (Memory Leak Prevention)
            feedback.addEventListener('animationend', () => {
                feedback.remove();
            }, { once: true });
            
            this.#budgetPanel.appendChild(feedback);
        }

        if (this.#budgetPanel.style.display === 'none') {
            this.#budgetPanel.style.display = 'block';
        }
    }

    /**
     * Baut das Info-Panel mit Inhalts-Karten auf.
     */
    #updateInfoPanel(cards) {
        if (!this.#infoCardsContainer) return;
        
        this.#infoCardsContainer.innerHTML = '';
        
        if (!cards || cards.length === 0) {
            this.#infoPanel.style.display = 'none';
            return;
        }
        
        this.#infoPanel.style.display = 'block';

        cards.forEach(card => {
            const cardEl = document.createElement('div');
            cardEl.className = 'info-card';
            cardEl.innerHTML = `
                <div class="info-header">${sanitizeHTML(card.title)}</div>
                <div class="info-body">${sanitizeHTML(card.body)}</div>
            `;
            this.#infoCardsContainer.appendChild(cardEl);
        });
    }

    /**
     * Zeigt Tutorial-Inhalte im Info-Panel an.
     * @param {Object} data - { text, clearFirst }
     */
    #showTutorial({ text, clearFirst }) {
        if (!this.#infoCardsContainer) return;
        
        if (clearFirst) this.#infoCardsContainer.innerHTML = '';

        const card = document.createElement('div');
        card.className = 'info-card';
        card.innerHTML = `<div class="info-header">Mission</div><div class="info-body">${sanitizeHTML(text)}</div>`;
        this.#infoCardsContainer.appendChild(card);

        this.#infoPanel.style.display = 'block';
        this.#toggleInfoMenu(true);
    }

    /**
     * Schaltet das Info-Menü ein oder aus.
     * @param {boolean|null} forceState - Optionaler Zielzustand
     */
    #toggleInfoMenu(forceState) {
        if (!this.#infoPanel || !this.#toggleBtn) return;

        let shouldOpen;
        if (typeof forceState === 'boolean') {
            shouldOpen = forceState;
        } else {
            shouldOpen = !this.#infoPanel.classList.contains('open');
        }

        this.#setInfoMenuState(shouldOpen);
    }

    /**
     * Setzt die CSS-Klassen für den Menü-Status.
     */
    #setInfoMenuState(isOpen) {
        this.#infoPanel?.classList.toggle('open', isOpen);
        this.#toggleBtn?.classList.toggle('panel-open', isOpen);
        if (this.#toggleBtn) this.#toggleBtn.innerText = isOpen ? '>>' : '<<';
    }
}
