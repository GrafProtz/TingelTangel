/**
 * MapLayerManager.js - Performantes Batch-Rendering von Leaflet-Layern.
 */
import { eventBus } from './EventBus.js';
import { EVENTS } from './EventTypes.js';

export class MapLayerManager {
    #map = null;
    #activeLayerGroup = null;

    constructor(leafletMap) {
        if (!leafletMap) throw new Error('[MapLayerManager] Leaflet Map erforderlich.');
        this.#map = leafletMap;
        this.#setupListeners();
    }

    #setupListeners() {
        eventBus.subscribe(EVENTS.DATA_LOADED, (osmData) => this.renderBatch(osmData));
    }

    renderBatch(osmData) {
        this.clearLayers();
        const newGroup = L.layerGroup();
        
        osmData.elements.forEach(el => {
            const layer = this.#createLayer(el);
            if (layer) layer.addTo(newGroup);
        });

        this.#activeLayerGroup = newGroup.addTo(this.#map);
    }

    clearLayers() {
        if (this.#activeLayerGroup) {
            this.#map.removeLayer(this.#activeLayerGroup);
            this.#activeLayerGroup.clearLayers();
            this.#activeLayerGroup = null;
        }
    }

    #createLayer(el) {
        // Basis-Implementierung für Marker/Polygone
        if (el.type === 'node' && el.lat) {
            return L.circleMarker([el.lat, el.lon], { radius: 3, color: '#3388ff' });
        }
        return null;
    }
}
