/**
 * MapView - Die visuelle Schicht (View).
 * Kapselt Leaflet, Marker-Rendering und Ghost-Path-Preview.
 */
class MapView {
    /**
     * @param {string} mapElementId
     */
    constructor(mapElementId) {
        this._map = L.map(mapElementId, { zoomControl: false }).setView([51.5139, 7.4653], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
        }).addTo(this._map);

        this._playerMarker    = null;
        this._neighborMarkers = [];
        this._ghostPath       = null;
        this._targetMarker    = null;
    }

    // ----------------------------------------------------------------
    //  Kamera
    // ----------------------------------------------------------------

    focusLocation(coords, zoom = 18) {
        this._map.flyTo(coords, zoom, { duration: 2 });
    }

    // ----------------------------------------------------------------
    //  Spieler
    // ----------------------------------------------------------------

    /** Erstellt oder setzt den Spieler-Marker (für Ankunft / Start). */
    renderPlayer(coords) {
        if (!this._playerMarker) {
            this._playerMarker = L.marker(coords, {
                icon: L.divIcon({
                    className: 'player-marker',
                    html: '<div class="player-dot"></div>',
                    iconSize: [20, 20]
                }),
                zIndexOffset: 1000
            }).addTo(this._map);
        } else {
            this._playerMarker.setLatLng(coords);
        }
        this._map.panTo(coords);
    }

    /** Frame-genaues Positions-Update während der Animation (kein panTo). */
    updatePlayerPosition(coords) {
        if (!this._playerMarker) {
            this.renderPlayer(coords);
            return;
        }
        this._playerMarker.setLatLng(coords);
        // Sanftes Kamera-Mitziehen ohne "harte" Sprünge
        this._map.panTo(coords, { animate: false });
    }

    // ----------------------------------------------------------------
    //  Nachbarn
    // ----------------------------------------------------------------

    /**
     * Rendert Nachbar-Kreuzungen als klickbare Marker.
     * @param {Array} neighbors - Objekte mit { id, lat, lon, edgeData }
     * @param {Function} onClickCb - Wird mit der nodeId aufgerufen
     */
    renderNeighbors(neighbors, onClickCb) {
        this._clearNeighbors();

        neighbors.forEach(nb => {
            const targetId = String(nb.id);

            const marker = L.marker([nb.lat, nb.lon], {
                icon: L.divIcon({
                    className: 'neighbor-marker',
                    iconSize: [12, 12]
                })
            }).addTo(this._map);

            // Klick → Bewegung auslösen
            marker.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                this._clearGhostPath();
                onClickCb(targetId);
            });

            // Hover → Ghost-Path zeichnen
            marker.on('mouseover', () => {
                if (nb.edgeData?.path) {
                    this._drawGhostPath(nb.edgeData.path);
                }
            });
            marker.on('mouseout', () => {
                this._clearGhostPath();
            });

            this._neighborMarkers.push(marker);
        });
    }

    _clearNeighbors() {
        this._neighborMarkers.forEach(m => this._map.removeLayer(m));
        this._neighborMarkers = [];
        this._clearGhostPath();
    }

    // ----------------------------------------------------------------
    //  Ghost-Path (Vorschau-Linie)
    // ----------------------------------------------------------------

    _drawGhostPath(pathCoords) {
        this._clearGhostPath();
        this._ghostPath = L.polyline(pathCoords, {
            color: '#22c55e',
            weight: 3,
            opacity: 0.45,
            dashArray: '8 6'
        }).addTo(this._map);
    }

    _clearGhostPath() {
        if (this._ghostPath) {
            this._map.removeLayer(this._ghostPath);
            this._ghostPath = null;
        }
    }

    // ----------------------------------------------------------------
    //  HUD & UI
    // ----------------------------------------------------------------

    updateHUD(text) {
        const hud = document.getElementById('hud-container');
        if (hud) {
            hud.innerText = text;
            hud.style.display = 'block';
        }
    }

    setUIState(elementId, isVisible) {
        const el = document.getElementById(elementId);
        if (el) el.style.display = isVisible ? 'flex' : 'none';
    }

    showNotification(title, message) {
        const c = document.getElementById('tutorial-container');
        if (c) {
            c.innerHTML = `<h2>${title}</h2><p>${message}</p>`;
            c.style.display = 'block';
        }
    }

    hideNotification() {
        const c = document.getElementById('tutorial-container');
        if (c) c.style.display = 'none';
    }

    // ----------------------------------------------------------------
    //  Ziel-Marker (POI)
    // ----------------------------------------------------------------

    /** Rendert das Missions-Ziel als Bierglas-Icon auf der Karte. */
    renderTarget(poiNode) {
        if (this._targetMarker) this._map.removeLayer(this._targetMarker);

        const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='36' height='36'>`
            + `<g stroke='#333' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'>`
            + `<path fill='none' d='M16 9h2.5a2.5 2.5 0 0 1 2.5 2.5v3a2.5 2.5 0 0 1-2.5 2.5H16'/>`
            + `<path fill='#FFD700' d='M6 6h10v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6z'/>`
            + `<path fill='none' d='M9 8v9M13 8v9'/>`
            + `<path fill='#FFF' d='M5 6c0-1.5 1.5-2.5 3-2.5 1 0 1.5.5 2.5.5s1.5-.5 2.5-.5c1.5 0 3 1 3 2.5 0 1-1 1.5-1 2.5H6c0-1-1-1.5-1-2.5z'/>`
            + `</g></svg>`;

        this._targetMarker = L.marker([poiNode.lat, poiNode.lon], {
            icon: L.divIcon({
                className: 'target-marker',
                html: svg,
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            }),
            zIndexOffset: 900
        }).addTo(this._map);
    }

    // ----------------------------------------------------------------
    //  Interaktions-Overlay (Kneipen-Dialog)
    // ----------------------------------------------------------------

    /**
     * Zeigt den Kneipen-Dialog an und bindet die Optionen.
     * @param {Function} onSelectCb - Wird mit 'A','B','C','D' aufgerufen
     */
    showInteractionOverlay(onSelectCb) {
        const container = document.getElementById('options-container');
        if (!container) return;
        container.style.display = 'block';

        const buttons = container.querySelectorAll('.option-btn');
        const options = ['A', 'B', 'C', 'D'];
        buttons.forEach((btn, i) => {
            // Alte Listener entfernen via cloneNode
            const fresh = btn.cloneNode(true);
            btn.parentNode.replaceChild(fresh, btn);
            fresh.addEventListener('click', () => {
                container.style.display = 'none';
                onSelectCb(options[i]);
            });
        });
    }

    onMapReady(callback) {
        this._map.once('moveend', callback);
    }
}

export { MapView };
