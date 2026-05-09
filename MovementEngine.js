import { eventBus } from './EventBus.js';
import { CONFIG } from './GameConfig.js';

/**
 * MovementEngine - Kümmert sich um die ruckelfreie Bewegung des Spielers auf der Karte.
 */
export class MovementEngine {
    #isMoving = false;
    #currentLat = 0;
    #currentLon = 0;

    /**
     * Startet eine animierte Bewegung zwischen zwei Knoten.
     * @param {Object} startNode {lat, lon}
     * @param {Object} targetNode {lat, lon}
     * @param {Function} onStep Callback pro Frame
     * @param {Function} onComplete Callback bei Ankunft
     */
    startMovement(startNode, targetNode, onStep, onComplete) {
        if (this.#isMoving) return;
        
        this.#isMoving = true;
        const duration = CONFIG.MOVE_DURATION_MS;
        const startTime = performance.now();

        const step = (now) => {
            if (!this.#isMoving) return;

            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Lineare Interpolation (Lerp)
            this.#currentLat = startNode.lat + (targetNode.lat - startNode.lat) * progress;
            this.#currentLon = startNode.lon + (targetNode.lon - startNode.lon) * progress;

            onStep(this.#currentLat, this.#currentLon);

            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                this.#isMoving = false;
                onComplete();
            }
        };

        requestAnimationFrame(step);
    }

    stop() {
        this.#isMoving = false;
    }

    get isMoving() { return this.#isMoving; }
}
