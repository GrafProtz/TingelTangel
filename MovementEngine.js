import { eventBus } from './EventBus.js';
import { CONFIG } from './GameConfig.js';
import { EVENTS } from './EventTypes.js';
import { throttle } from './Utils.js';

/**
 * MovementEngine - Kapselt die Bewegungs-Mechanik und Animation.
 * Entlastet Game.js von der rAF-Schleife und Interpolation.
 */
export class MovementEngine {
    #gameState;
    #mapData;
    #animFrameId = null;
    
    constructor(mapData, gameState) {
        this.#mapData = mapData;
        this.#gameState = gameState;
    }



    get isMoving() { return this.#gameState.isMoving; }

    /**
     * Startet die Bewegung zu einem Zielknoten.
     * @param {string} targetId - Ziel-Knoten-ID
     * @param {string} startNodeId - Aktueller Knoten
     * @param {boolean} isBiking - Bewegungsmodus
     * @param {Object} options - Callbacks (onTick, onComplete) und Context
     */
    moveTo(targetId, startNodeId, isBiking, options) {
        if (this.#gameState.isMoving) return;

        const neighbors = this.#mapData.getNeighbors(startNodeId, isBiking);
        const neighbor = neighbors.find(nb => String(nb.id) === String(targetId));
        
        if (!neighbor) return;

        this.#gameState.isMoving = true;
        
        const ctx = this.#prepareMovement(neighbor, targetId, startNodeId, isBiking, options);
        
        // Initialer Broadcast für den Start der Bewegung
        if (options.onStart) options.onStart();

        this.#animFrameId = requestAnimationFrame((now) => this.#animateMovement(now, ctx, options));
    }

    /**
     * Bricht laufende Animationen ab (Fix für rAF Memory Leak).
     */
    stop() {
        this.#gameState.isMoving = false;
        if (this.#animFrameId) {
            cancelAnimationFrame(this.#animFrameId);
            this.#animFrameId = null;
        }
    }

    #prepareMovement(neighbor, targetId, startNodeId, isBiking, options) {
        const edge = neighbor.edgeData;
        const startNode = this.#mapData.getNode(startNodeId);
        const fullPath = [[startNode.lat, startNode.lon], ...edge.path];

        const costMultiplier = isBiking ? CONFIG.MULTIPLIERS.BIKING_COST : 1.0;
        const totalCost = Math.max(1, Math.ceil(edge.distance * CONFIG.COST_PER_METER * costMultiplier));
        const budgetAtStart = options.currentBudget;

        // Geschwindigkeit: m/s laut Config
        const speed = isBiking ? CONFIG.MOVEMENT.SPEED_BIKING : CONFIG.MOVEMENT.SPEED_WALKING;
        const durationMs = (edge.distance / speed) * 1000;
        const startTime = performance.now();

        return {
            fullPath,
            totalCost,
            budgetAtStart,
            durationMs,
            startTime,
            targetId
        };
    }

    #animateMovement(now, ctx, options) {
        if (!this.#gameState.isMoving) return;

        const elapsed = now - ctx.startTime;
        const t = Math.min(elapsed / ctx.durationMs, 1);

        const pos = this.#interpolatePath(ctx.fullPath, t);
        
        const costSoFar = Math.ceil(ctx.totalCost * t);
        const newBudget = Math.max(0, ctx.budgetAtStart - costSoFar);
        
        // Budget-Update via Callback an Game -> BudgetManager
        if (options.onBudgetTick) {
            options.onBudgetTick(newBudget);
        }

        // Granulares Positions-Event für die Map (MapView hört hierauf)
        eventBus.emit(EVENTS.PLAYER_POSITION_UPDATED, { 
            lat: pos[0], 
            lon: pos[1], 
            budget: newBudget 
        });

        if (t < 1) {
            this.#animFrameId = requestAnimationFrame((nextNow) => this.#animateMovement(nextNow, ctx, options));
        } else {
            this.#finishMovement(ctx.targetId, options);
        }
    }

    #finishMovement(targetId, options) {
        this.#gameState.isMoving = false;
        this.#animFrameId = null;

        if (options.onComplete) {
            options.onComplete(targetId);
        }
    }

    #interpolatePath(path, t) {
        if (path.length < 2) return path[0] || [0, 0];
        if (t <= 0) return path[0];
        if (t >= 1) return path[path.length - 1];

        const totalSegments = path.length - 1;
        const exactIndex = t * totalSegments;
        const segIndex = Math.floor(exactIndex);
        const segT = exactIndex - segIndex;

        const a = path[segIndex];
        const b = path[Math.min(segIndex + 1, path.length - 1)];

        return [
            a[0] + (b[0] - a[0]) * segT,
            a[1] + (b[1] - a[1]) * segT
        ];
    }
}
