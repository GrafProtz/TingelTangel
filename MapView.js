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
        this._ghostPath       = null;    // Vorschau-Polyline bei Hover
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

    onMapReady(callback) {
        this._map.once('moveend', callback);
    }
}

export { MapView };
