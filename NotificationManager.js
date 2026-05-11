import { eventBus } from './EventBus.js';
import { sanitizeHTML } from './Utils.js';
import { EVENTS } from './EventTypes.js';

/**
 * NotificationManager - Kümmert sich um Toasts, Popups und fliegende Animationen.
 */
export class NotificationManager {
    constructor() {
        this.setupListeners();
    }

    setupListeners() {
        eventBus.subscribe(EVENTS.SHOW_TOAST, (data) => {
            console.log('TRACE 4: NotificationManager hat Event empfangen:', data);
            this.showToast(data);
        });
        eventBus.subscribe(EVENTS.FLYING_REWARD, (data) => this.animateRewardToMenu(data));
        eventBus.subscribe(EVENTS.FLYING_INFO, (data) => this.animateInfoToMenu(data));
    }

    /**
     * Zeigt eine kurze Benachrichtigung (Toast) an.
     * @param {Object} data - { msg, type }
     */
    showToast(data) {
        if (!data || !data.msg) return;
        const { msg, type } = data;

        let container = document.getElementById('toast-container');
        
        // Robuste Initialisierung: Falls Container fehlt, sofort erstellen und anhängen
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            Object.assign(container.style, {
                position: 'fixed',
                bottom: '40px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                zIndex: '100000',
                pointerEvents: 'none'
            });
            (document.body || document.documentElement).appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = 'glass-panel toast-notification';
        
        const borderColor = type === 'success' ? 'var(--color-primary)' : 'var(--color-danger)';
        
        Object.assign(toast.style, {
            padding: '15px 25px',
            borderRadius: '10px',
            color: 'white',
            background: 'rgba(15, 23, 42, 0.9)',
            border: `2px solid ${borderColor}`,
            boxShadow: 'var(--panel-shadow)',
            animation: 'fadeInUp 0.3s ease-out',
            pointerEvents: 'auto'
        });

        toast.textContent = msg;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'fadeOutDown 0.3s ease-in';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Erstellt eine Info-Karte, die zur rechten Menüleiste fliegt.
     */
    animateInfoToMenu({ title, text, callback }) {
        const div = document.createElement('div');
        div.className = 'glass-panel flying-info-card';

        Object.assign(div.style, {
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%) scale(1)',
            width: '280px', padding: '20px', color: 'white', zIndex: '9999',
            border: '2px solid var(--color-secondary)', textAlign: 'center',
            transition: 'all 1s cubic-bezier(0.68, -0.55, 0.27, 1.55)'
        });

        div.innerHTML = `<div style="font-weight: bold; color: var(--color-secondary);">${sanitizeHTML(title)}</div><p>${sanitizeHTML(text)}</p>`;
        document.body.appendChild(div);

        setTimeout(() => {
            div.style.left = 'calc(100% - 150px)';
            div.style.top = '100px';
            div.style.transform = 'translate(0, 0) scale(0.1)';
            div.style.opacity = '0';

            setTimeout(() => {
                div.remove();
                if (callback) callback();
            }, 1000);
        }, 2000);
    }

    /**
     * Erstellt ein fliegendes Info-Sheet, das ins Menü gleitet.
     */
    animateRewardToMenu({ text, callback }) {
        const sheet = document.createElement('div');
        sheet.className = 'glass-panel flying-reward';
        sheet.innerText = text;

        Object.assign(sheet.style, {
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            padding: '20px', color: 'white', textAlign: 'center', zIndex: '9999', width: '300px',
            border: '2px solid var(--color-primary)',
            transition: 'all 0.8s cubic-bezier(0.68, -0.55, 0.27, 1.55)'
        });

        document.body.appendChild(sheet);

        setTimeout(() => {
            sheet.style.left = 'calc(100% - 165px)';
            sheet.style.top = '100px';
            sheet.style.transform = 'translate(0, 0) scale(0.1)';
            sheet.style.opacity = '0';

            setTimeout(() => {
                sheet.remove();
                if (callback) callback();
            }, 800);
        }, 4000);
    }
}
