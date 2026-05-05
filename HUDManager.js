import { eventBus } from './EventBus.js';

/**
 * HUDManager - Verwaltet die In-Game-UI (Budget, Info-Panels, Tutorials).
 */
export class HUDManager {
    constructor() {
        this.budgetPanel = document.getElementById('budget-panel');
        this.infoPanel = document.getElementById('info-panel');
        this.toggleBtn = document.getElementById('info-toggle-btn');
        
        // CSS-Klassen für einheitlichen Look zuweisen
        if (this.budgetPanel) this.budgetPanel.classList.add('glass-panel');
        if (this.infoPanel) this.infoPanel.classList.add('glass-panel');

        // Initialer Zustand des Toggle-Buttons
        if (this.toggleBtn) {
            this.toggleBtn.addEventListener('click', () => {
                eventBus.emit('TOGGLE_INFO');
            });
        }

        // Auf Events hören
        eventBus.subscribe('BUDGET_UPDATED', this.updateBudget.bind(this));
        eventBus.subscribe('INFO_UPDATED', this.updateInfoPanel.bind(this));
        eventBus.subscribe('INFO_MENU_STATE', this.setInfoMenuState.bind(this));
        eventBus.subscribe('SHOW_TUTORIAL', this.showTutorial.bind(this));
        eventBus.subscribe('TOGGLE_INFO', this.toggleInfoMenu.bind(this));
    }

    /**
     * Aktualisiert die Budget-Anzeige im HUD.
     * @param {Object} data - { total, diff }
     */
    updateBudget({ total, diff }) {
        if (!this.budgetPanel) return;
        
        this.budgetPanel.innerText = `Budget: ${total} €`;
        
        // Visuelles Feedback bei Änderungen
        if (diff !== 0) {
            const feedback = document.createElement('span');
            feedback.className = diff > 0 ? 'budget-gain' : 'budget-loss';
            feedback.innerText = (diff > 0 ? '+' : '') + diff;
            
            this.budgetPanel.appendChild(feedback);
            setTimeout(() => feedback.remove(), 1000);
        }

        if (this.budgetPanel.style.display === 'none') {
            this.budgetPanel.style.display = 'block';
        }
    }

    /**
     * Baut das Info-Panel mit Inhalts-Karten auf.
     */
    updateInfoPanel(cards) {
        if (!this.infoPanel) return;
        
        this.infoPanel.innerHTML = '';
        
        if (cards.length === 0) {
            this.infoPanel.style.display = 'none';
            return;
        }
        
        this.infoPanel.style.display = 'block';

        cards.forEach(card => {
            const cardEl = document.createElement('div');
            cardEl.className = 'info-card';
            cardEl.innerHTML = `
                <div class="info-header">${card.title}</div>
                <div class="info-body">${card.body}</div>
            `;
            this.infoPanel.appendChild(cardEl);
        });
    }

    /**
     * Zeigt Tutorial-Inhalte im Info-Panel an.
     * @param {Object} data - { text, clearFirst }
     */
    showTutorial({ text, clearFirst }) {
        if (!this.infoPanel) return;
        
        if (clearFirst) this.infoPanel.innerHTML = '';

        const card = document.createElement('div');
        card.className = 'info-card';
        card.innerHTML = `<div class="info-header">Mission</div><div class="info-body">${text}</div>`;
        this.infoPanel.appendChild(card);

        this.infoPanel.style.display = 'block';
        this.toggleInfoMenu(true);
    }

    /**
     * Schaltet das Info-Menü ein oder aus.
     * @param {boolean|null} forceState - Optionaler Zielzustand
     */
    toggleInfoMenu(forceState) {
        if (!this.infoPanel || !this.toggleBtn) return;

        let shouldOpen;
        if (typeof forceState === 'boolean') {
            shouldOpen = forceState;
        } else {
            shouldOpen = !this.infoPanel.classList.contains('open');
        }

        this.setInfoMenuState(shouldOpen);
    }

    /**
     * Setzt die CSS-Klassen für den Menü-Status.
     */
    setInfoMenuState(isOpen) {
        this.infoPanel?.classList.toggle('open', isOpen);
        this.toggleBtn?.classList.toggle('panel-open', isOpen);
        if (this.toggleBtn) this.toggleBtn.innerText = isOpen ? '>>' : '<<';
    }
}
