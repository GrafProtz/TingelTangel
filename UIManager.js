import { eventBus } from './EventBus.js';

export class UIManager {
    constructor() {
        this.infoModal = document.getElementById('info-modal');
        this.infoModalTitle = document.getElementById('info-modal-title');
        this.infoModalText = document.getElementById('info-modal-text');
        this.infoModalBtn = document.getElementById('info-modal-btn');
        
        this.sidebarLog = document.getElementById('sidebar-log');
        this.sidebarLogContent = document.getElementById('sidebar-log-content');
        this.sidebarToggle = document.getElementById('sidebar-toggle');

        // Bind Events
        this.sidebarToggle.addEventListener('click', () => {
            if (this.sidebarLog.classList.contains('sidebar-open')) {
                this.sidebarLog.classList.remove('sidebar-open');
                this.sidebarLog.classList.add('sidebar-closed');
            } else {
                this.sidebarLog.classList.remove('sidebar-closed');
                this.sidebarLog.classList.add('sidebar-open');
                this.sidebarToggle.classList.remove('attention-pulse');
            }
        });

        eventBus.subscribe('SHOW_INFO_CASCADE', this.handleCascade.bind(this));
        eventBus.subscribe('INTRO_COMPLETE', this.handleIntroComplete.bind(this));
        
        this.infoModalBtn.addEventListener('click', () => {
            this.triggerCascadeAnimation();
        });
        
        this.currentCascadeData = null;
    }

    handleCascade(data) {
        this.currentCascadeData = data;
        this.infoModalTitle.innerText = data.title || "Information";
        this.infoModalText.innerHTML = data.fullText || "";
        
        // Reset classes
        this.infoModal.classList.remove('hidden');
        this.infoModal.classList.remove('fly-to-sidebar');
    }

    triggerCascadeAnimation() {
        if (!this.currentCascadeData) return;

        // 1. Flug-Animation starten
        this.infoModal.classList.add('fly-to-sidebar');

        // 2. Warten auf das Ende der Animation (600ms)
        setTimeout(() => {
            // Modal verstecken und Reset
            this.infoModal.classList.add('hidden');
            this.infoModal.classList.remove('fly-to-sidebar');

            // 3. Sidebar öffnen
            this.sidebarLog.classList.remove('sidebar-closed');
            this.sidebarLog.classList.add('sidebar-open');

            // 4. Log-Eintrag hinzufügen
            const entry = document.createElement('div');
            entry.classList.add('log-entry');
            entry.innerHTML = `<strong>${this.currentCascadeData.title}</strong><br>${this.currentCascadeData.shortText}`;
            
            // Oben anfügen
            this.sidebarLogContent.prepend(entry);
            
            this.currentCascadeData = null;

            // Trigger Map Action!
            eventBus.emit('START_MAP_INTRO');
        }, 600);
    }

    handleIntroComplete() {
        if (this.sidebarLog.classList.contains('sidebar-open')) {
            this.sidebarLog.classList.remove('sidebar-open');
            this.sidebarLog.classList.add('sidebar-closed');
            
            this.sidebarToggle.classList.add('attention-pulse');
            
            setTimeout(() => {
                this.sidebarToggle.classList.remove('attention-pulse');
            }, 1500);
        }
    }
}
