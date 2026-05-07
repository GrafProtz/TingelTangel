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
        
        eventBus.subscribe('REMOVE_LOG_ENTRY', (data) => {
            if (data && data.logId) {
                const el = document.getElementById(data.logId);
                if (el) el.remove();
            }
        });

        eventBus.subscribe('COMPLETE_LOG_ENTRY', (data) => {
            const el = document.getElementById(data.logId);
            if (el) {
                el.classList.add('log-entry-completed');
                el.style.opacity = '0.5';
                el.style.textDecoration = 'line-through';
            }
        });

        eventBus.subscribe('ADD_LOG_ENTRY', (data) => {
            this.handleAddLogEntry(data);
            if (data.notify) {
                this._notifyLogEntry();
            }
        });
        
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

    handleAddLogEntry(data) {
        const entry = this._createLogEntry(data);
        this.sidebarLogContent.prepend(entry);
    }

    _createLogEntry(data) {
        const entry = document.createElement('div');
        entry.classList.add('log-entry');
        if (data.logId) {
            entry.id = data.logId;
        }
        const title = data.title ? `<strong>${data.title}</strong><br>` : "";
        entry.innerHTML = `${title}${data.shortText}`;
        return entry;
    }

    _notifyLogEntry() {
        // 3. Sidebar öffnen
        this.sidebarLog.classList.remove('sidebar-closed');
        this.sidebarLog.classList.add('sidebar-open');

        // 5. Auto-Close nach 10 Sekunden
        setTimeout(() => {
            if (this.sidebarLog.classList.contains('sidebar-open')) {
                this.sidebarLog.classList.remove('sidebar-open');
                this.sidebarLog.classList.add('sidebar-closed');
                
                this.sidebarToggle.classList.add('attention-pulse');
                
                setTimeout(() => {
                    this.sidebarToggle.classList.remove('attention-pulse');
                }, 1500);
            }
        }, 10000);
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

            // 4. Log-Eintrag hinzufügen
            this.handleAddLogEntry(this.currentCascadeData);
            
            // Sidebar öffnen und schließen
            this._notifyLogEntry();
            
            const nextEvent = this.currentCascadeData.nextEvent;
            this.currentCascadeData = null;

            // Trigger Map Action oder benutzerdefiniertes Folge-Event
            if (nextEvent) {
                eventBus.emit(nextEvent);
            } else {
                eventBus.emit('START_MAP_INTRO');
            }
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
