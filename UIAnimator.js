export class UIAnimator {
    static _spawnTimestamps = new Map();
    static #spawnedIds = new Set(); // Tracking bereits verarbeiteter Nodes (Etappe 6.8)

    /**
     * Leert den Cache der bereits animierten Nodes (z.B. bei Map-Clear).
     */
    static resetSpawnCache() {
        this.#spawnedIds.clear();
        this._spawnTimestamps.clear();
    }

    /**
     * Wendet den 5-Sekunden-Spawn-Effekt auf das DOM-Element des Markers an.
     * @param {string|number} poiId 
     * @param {HTMLElement} element - Das Root-Element des Markers (enthält .target-marker-inner)
     */
    static applySpawnEffect(poiId, element) {
        if (!element) return;

        const poiIdStr = String(poiId);

        // Dirty-Check: Nichts tun, wenn diese ID in dieser Session bereits animiert wurde
        if (this.#spawnedIds.has(poiIdStr)) return;
        this.#spawnedIds.add(poiIdStr);
        
        
        // 20ms Race-Condition-Fix: Warten, bis Leaflet das HTML physisch in den DOM gemalt hat
        setTimeout(() => {
            if (!element) return;
            
            const poiIdStr = String(poiId);
            const spawnTime = this._spawnTimestamps.get(poiIdStr) || Date.now();
            this._spawnTimestamps.set(poiIdStr, spawnTime);
            
            const isSpawnActive = (Date.now() - spawnTime) < 5000;
            
            if (isSpawnActive) {
                console.trace('[DEBUG] Spawn-Klasse vergeben für ID:', poiId);
                
                const inner = element.querySelector('.target-marker-inner');
                if (inner) {
                    inner.classList.add('poi-spawn-pulse');
                    
                    // Cleanup-Timer: Animation nach Ablauf zwingend entfernen
                    setTimeout(() => {
                        inner.classList.remove('poi-spawn-pulse');
                    }, 5000);
                }
            }
        }, 20);
    }

    /**
     * Führt den absoluten Clean-Slate Reset durch und setzt die Ready-Klasse nur für betretbare Nachbarn.
     * @param {Array<HTMLElement>} activeElements - Die HTMLElemente, die den Status erhalten sollen
     */
    static applyReadyPulse(activeElements = []) {
        // Absolute Clean-Slate: DOM-Level Reset gegen Zombie-Klassen
        document.querySelectorAll('.target-marker-inner').forEach(el => el.classList.remove('poi-ready-pulse'));

        // Allen validen Zielen den Effekt geben
        activeElements.forEach(el => {
            if (el) {
                const inner = el.querySelector('.target-marker-inner');
                if (inner) inner.classList.add('poi-ready-pulse');
            }
        });
    }

    /**
     * Startet die fliegende Scheren-Animation (Barber-Transform).
     */
    static startBarberAnimation() {
        const flyer = document.createElement('div');
        flyer.className = 'fly-to-sidebar';
        flyer.innerHTML = '✂️';
        
        Object.assign(flyer.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            zIndex: '100000',
            fontSize: '2rem',
            pointerEvents: 'none'
        });

        document.body.appendChild(flyer);
        setTimeout(() => flyer.remove(), 800);
    }
}

// Globaler Subscriber für UI-Effekte
import { eventBus } from './EventBus.js';
import { EVENTS } from './EventTypes.js';

eventBus.subscribe(EVENTS.START_BARBER_ANIMATION, () => {
    UIAnimator.startBarberAnimation();
});
