import { eventBus } from './EventBus.js';
import { UIAnimator } from './UIAnimator.js';
import { CONFIG } from './GameConfig.js';

/**
 * MapView - Die visuelle Schicht (View).
 * Kapselt Leaflet, Marker-Rendering und Ghost-Path-Preview.
 *
 * BUGFIX: renderPOIs greift nicht mehr auf this._mapData zu (existierte nie).
 * Polygon-Koordinaten für Flächen-Ziele (z.B. Schrebergärten) werden jetzt
 * vom Controller (main.js) vorab aufgelöst und als `poi.resolvedCoords`
 * übergeben. Die View bleibt damit sauber vom Model getrennt (MVC).
 */
class MapView {
    /**
     * @param {string} mapElementId
     */
    constructor(mapElementId) {
        this._map = L.map(mapElementId, { zoomControl: true }).setView([51.5139, 7.4653], 13);
        this._map.zoomControl.setPosition('bottomright');

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
        }).addTo(this._map);

        this._playerMarker    = null;
        this._neighborMarkers = [];
        this._ghostPath       = null;
        this._activePOIMarkers = [];
        this._radarMarkers    = [];
        this._debugLines      = [];

        this.#isLockCamera = false;
        this._isIntroFlying = false;

        // Globaler Kamera-Listener für entkoppelte Steuerung
        eventBus.subscribe('CAMERA_FIT_BOUNDS_REQUESTED', (coords) => this.fitBounds(coords));
        
        // Entsperre die Kamera, wenn das Intro vorbei ist
        eventBus.subscribe('INTRO_COMPLETE', () => {
            this._isIntroFlying = false;
        });
    }

    #isLockCamera;
    #lockTimer;

    // ----------------------------------------------------------------
    //  Polizei-Radar
    // ----------------------------------------------------------------

    /**
     * Dramatische Kaskade für die Polizei-Aufdeckung (Totale -> Pulsierende Marker -> Zurück)
     * Nutzt den Camera Lock, um das Spiel währenddessen komplett einzufrieren.
     */
    async playPoliceRevealSequence(policeStations, playerCoords) {
        if (policeStations.length === 0) return;
        
        // 1. Camera Lock anlegen
        this._isIntroFlying = true;

        // Alte Marker sofort löschen
        this._radarMarkers.forEach(c => this._map.removeLayer(c));
        this._radarMarkers = [];

        // 2. Bounding Box (Totale) berechnen und anfliegen
        const bounds = L.latLngBounds();
        if (playerCoords) bounds.extend(playerCoords);
        policeStations.forEach(s => bounds.extend([s.lat, s.lon]));

        this._map.invalidateSize();
        this._map.flyToBounds(bounds, { padding: [50, 50], duration: 1.5 });

        // Warten, bis die Kamera oben in der Totale angekommen ist
        await new Promise(r => setTimeout(r, 1600));

        // 3. Polizei-Marker mit UIAnimator Puls-Klasse ins DOM rendern
        const sirenIcon = L.divIcon({
            html: '<div class="target-marker-inner poi-spawn-pulse" style="background-color: #3b82f6; border: 2px solid white; border-radius: 50%; width: 100%; height: 100%; box-shadow: 0 0 15px #3b82f6;"></div>',
            className: 'police-siren-marker',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        const RADII_METERS = [450, 300, 150]; 
        const OPACITIES    = [0.05, 0.2, 0.4];

        policeStations.forEach(station => {
            const pos = [station.lat, station.lon];

            RADII_METERS.forEach((radius, idx) => {
                const circle = L.circle(pos, {
                    radius: radius,
                    color: '#ef4444',
                    stroke: false,
                    fillColor: '#ef4444',
                    fillOpacity: OPACITIES[idx],
                    interactive: false
                }).addTo(this._map);
                this._radarMarkers.push(circle);
            });

            const siren = L.marker(pos, {
                icon: sirenIcon,
                interactive: false
            }).addTo(this._map);
            this._radarMarkers.push(siren);
        });

        // 4. Dramatische Pause (5000ms), während die Stationen pulsieren
        await new Promise(r => setTimeout(r, 5000));

        // 5. Polizei-Marker wieder vernichten
        this._radarMarkers.forEach(c => this._map.removeLayer(c));
        this._radarMarkers = [];

        // 6. Rückflug zum Spieler berechnen und ausführen
        if (playerCoords) {
            const tightBounds = L.latLngBounds([playerCoords]);
            this._map.flyToBounds(tightBounds, { maxZoom: 16.5, duration: 1.5 });
            await new Promise(r => setTimeout(r, 1600));
        }

        // 7. Camera Lock wieder aufheben
        this._isIntroFlying = false;
    }

    // ----------------------------------------------------------------
    //  Kamera
    // ----------------------------------------------------------------

    focusLocation(coords, zoom = 18) {
        this._map.flyTo(coords, zoom, { duration: 2 });
    }

    /**
     * Animiert die Kamera so, dass alle übergebenen Koordinaten sichtbar sind.
     * @param {Array} coords - [[lat, lon], ...] oder [L.latLng, ...]
     */
    fitBounds(coords) {
        if (!coords || !Array.isArray(coords) || coords.length === 0) {
            console.warn('MapView.fitBounds: Leerer oder ungültiger Payload.');
            return;
        }
        
        try {
            // Alte Timer bereinigen
            if (this.#lockTimer) clearTimeout(this.#lockTimer);

            // Kamera sperren, um automatische Verfolgung zu blockieren
            this.#isLockCamera = true;

            // Fail-Safe: Lock nach 2.5s auf jeden Fall lösen
            this.#lockTimer = setTimeout(() => {
                this.#isLockCamera = false;
                this.#lockTimer = null;
            }, 2500);

            // Explizite Konvertierung in native Leaflet-Objekte zur Fehlervermeidung
            const latLngs = coords.map(c => {
                // Unterstützung für [lat, lon] Arrays
                if (Array.isArray(c)) {
                    const lat = parseFloat(c[0]);
                    const lon = parseFloat(c[1]);
                    return (!isNaN(lat) && !isNaN(lon)) ? L.latLng(lat, lon) : null;
                }
                // Unterstützung für bereits existierende Leaflet-Objekte oder {lat, lon} Objekte
                if (c && typeof c === 'object') {
                    const lat = parseFloat(c.lat);
                    const lon = parseFloat(c.lon || c.lng);
                    return (!isNaN(lat) && !isNaN(lon)) ? L.latLng(lat, lon) : null;
                }
                return null;
            }).filter(Boolean);

            if (latLngs.length === 0) {
                this.#isLockCamera = false;
                console.warn('MapView.fitBounds: Keine validen Koordinaten nach Parsing gefunden.');
                return;
            }

            const bounds = L.latLngBounds(latLngs);
            
            // Lock lösen, sobald die Animation beendet ist
            this._map.once('moveend', () => {
                if (this.#lockTimer) {
                    clearTimeout(this.#lockTimer);
                    this.#lockTimer = null;
                }
                this.#isLockCamera = false;
            });

            this._map.flyToBounds(bounds, { 
                padding: [80, 80], 
                duration: 1.5,
                maxZoom: 18 
            });
            
        } catch (err) {
            if (this.#lockTimer) clearTimeout(this.#lockTimer);
            this.#isLockCamera = false;
            console.error('Kritischer Fehler in MapView.fitBounds:', err);
        }
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
                zIndexOffset: 1000,
                interactive: false
            }).addTo(this._map);
        } else {
            this._playerMarker.setLatLng(coords);
        }
        
        if (!this.#isLockCamera && !this._isIntroFlying) {
            this._map.panTo(coords);
        }
    }

    /** Frame-genaues Positions-Update während der Animation (kein panTo). */
    updatePlayerPosition(coords) {
        if (!this._playerMarker) {
            this.renderPlayer(coords);
            return;
        }
        this._playerMarker.setLatLng(coords);
        
        if (!this.#isLockCamera && !this._isIntroFlying) {
            this._map.panTo(coords, { animate: false });
        }
    }

    // ----------------------------------------------------------------
    //  Nachbarn
    // ----------------------------------------------------------------

    /**
     * Rendert Nachbar-Kreuzungen als klickbare Marker.
     * @param {Array} neighbors - Objekte mit { id, lat, lon, edgeData }
     * @param {string} targetNodeId - ID des aktuellen Hauptziels (Pub)
     * @param {Function} onClickCb - Wird mit der nodeId aufgerufen
     */
    renderNeighbors(neighbors, targetNodeId, onClickCb) {
        this._clearNeighbors();
        if (this._neighborTimeout) clearTimeout(this._neighborTimeout);

        if (this._targetMarker) {
            const el = this._targetMarker.getElement();
            if (el) {
                el.style.pointerEvents = 'none';
                el.style.zIndex = '2000';
            }
        }

        const activeElements = [];
        const neighborIds = neighbors.map(nb => String(nb.id));
        
        this._activePOIMarkers.forEach(poiMarker => {
            if (neighborIds.includes(String(poiMarker.accessNodeId))) {
                const el = poiMarker.getElement();
                if (el) activeElements.push(el);
            }
        });

        if (neighborIds.includes(String(targetNodeId)) && this._targetMarker) {
            const el = this._targetMarker.getElement();
            if (el) activeElements.push(el);
        }

        UIAnimator.applyReadyPulse(activeElements);

        let currentIndex = 0;
        const total = neighbors.length;

        const drawNext = () => {
            if (currentIndex >= total) return;

            const nb = neighbors[currentIndex];
            const nbId = String(nb.id);

            if (nbId === String(targetNodeId) && this._targetMarker) {
                const el = this._targetMarker.getElement();
                if (el) {
                    el.style.pointerEvents = 'auto';
                    el.style.zIndex = '10000';
                    el.addEventListener('pointerdown', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this._clearGhostPath();
                        onClickCb(nbId);
                    }, { once: true });
                }
            } else {
                const marker = L.marker([nb.lat, nb.lon], {
                    icon: L.divIcon({
                        className: 'neighbor-marker',
                        iconSize: [12, 12]
                    })
                }).addTo(this._map);

                marker.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    this._clearGhostPath();
                    onClickCb(nbId);
                });

                marker.on('mouseover', () => {
                    if (nb.edgeData?.path) {
                        this._drawGhostPath(nb.edgeData.path);
                    }
                });
                marker.on('mouseout', () => {
                    this._clearGhostPath();
                });

                this._neighborMarkers.push(marker);
            }

            currentIndex++;
            this._neighborTimeout = setTimeout(drawNext, 40);
        };

        drawNext();
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

    setUIState(elementId, isVisible) {
        const el = document.getElementById(elementId);
        if (el) el.style.display = isVisible ? 'flex' : 'none';
    }

    // ----------------------------------------------------------------
    //  Ziel-Marker (POI)
    // ----------------------------------------------------------------

    /**
     * Universelle Methode zum Rendern aller interaktiven Ziele auf der Karte.
     *
     * BUGFIX: Diese Methode greift NICHT mehr auf this._mapData zu.
     * Für Flächen-Ziele (type === 'allotments') erwartet sie stattdessen
     * fertig aufgelöste Koordinaten in `poi.resolvedCoords` ([lat, lon][]).
     * Der Controller (main.js) ist dafür zuständig, diese vorab aus
     * mapData.getNode() zu befüllen.
     *
     * @param {Array} poiArray - [{
     *   id, lat, lon, type, onClickCallback, isPrimary,
     *   accessNodeId, accessNodeCoords?,
     *   resolvedCoords?   // Pflichtfeld für type === 'allotments'
     * }]
     */
    renderPOIs(poiArray) {
        // Zwingende Initialisierung falls noch nicht geschehen (Defensive Programming)
        if (!this._activePOIMarkers) this._activePOIMarkers = [];

        // 1. Alle alten Marker und Debug-Linien entfernen
        this._activePOIMarkers.forEach(m => this._map.removeLayer(m));
        this._activePOIMarkers = [];
        this._debugLines.forEach(l => this._map.removeLayer(l));
        this._debugLines = [];

        // 2. Neue Marker zeichnen
        poiArray.forEach(poi => {
            // Debug-Linie zum Zugangsknoten zeichnen
            if (poi.accessNodeCoords) {
                const line = L.polyline([
                    [poi.lat, poi.lon],
                    [poi.accessNodeCoords.lat, poi.accessNodeCoords.lon]
                ], {
                    color: 'red',
                    weight: 1,
                    opacity: 0.8,
                    dashArray: '5, 5'
                }).addTo(this._map);
                this._debugLines.push(line);
            }

            const svg = this._getPOISVG(poi.type || 'pub');

            const html = `
                <div class="target-marker-wrapper">
                    <div class="target-marker-inner" style="display: inline-block; transform-origin: center center;">
                        ${svg}
                    </div>
                </div>
            `;

            let marker, polygon;

            if (poi.type === 'allotments') {
                // BUGFIX: Koordinaten kommen jetzt als poi.resolvedCoords vom Controller,
                // nicht mehr über this._mapData._nodes (das hier nie existiert hat).
                const coords = poi.resolvedCoords ?? [];

                if (coords.length === 0) {
                    // Kein Polygon-Rendering möglich – Fallback auf Standard-Marker
                    console.warn(`MapView.renderPOIs: Keine resolvedCoords für allotments-POI ${poi.id}. Fallback auf Punkt-Marker.`);
                    marker = L.marker([poi.lat, poi.lon], {
                        icon: L.divIcon({
                            className: 'target-marker',
                            html: html,
                            iconSize: [36, 36],
                            iconAnchor: [18, 18]
                        }),
                        pane: 'popupPane',
                        zIndexOffset: 2000,
                        interactive: !!poi.onClickCallback
                    }).addTo(this._map);
                    
                    if (marker.getElement()) {
                        marker.getElement().setAttribute('data-node-id', poi.accessNodeId);
                        UIAnimator.applySpawnEffect(poi.id, marker.getElement());
                    }
                } else {
                    polygon = L.polygon(coords, {
                        color: '#fbbf24',
                        fillColor: '#fbbf24',
                        fillOpacity: 0.5,
                        weight: 2,
                        interactive: !!poi.onClickCallback,
                        className: 'target-marker'
                    }).addTo(this._map);
                    if (polygon.getElement()) polygon.getElement().setAttribute('data-node-id', poi.accessNodeId);
                }
            } else {
                // Standard-Marker für alle anderen Ziele
                marker = L.marker([poi.lat, poi.lon], {
                    icon: L.divIcon({
                        className: 'target-marker',
                        html: html,
                        iconSize: [36, 36],
                        iconAnchor: [18, 18]
                    }),
                    pane: 'popupPane',
                    zIndexOffset: 2000,
                    interactive: !!poi.onClickCallback
                }).addTo(this._map);
                
                if (marker.getElement()) {
                    marker.getElement().setAttribute('data-node-id', poi.accessNodeId);
                    UIAnimator.applySpawnEffect(poi.id, marker.getElement());
                }
            }

            if (poi.onClickCallback) {
                const layer = typeof marker !== 'undefined' ? marker : polygon;
                const el = layer?.getElement();
                if (el) {
                    el.style.pointerEvents = 'auto';
                    el.addEventListener('pointerdown', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        poi.onClickCallback();
                    });
                }
            }

            const activeLayer = typeof marker !== 'undefined' ? marker : (typeof polygon !== 'undefined' ? polygon : null);
            if (activeLayer) {
                activeLayer.accessNodeId = poi.accessNodeId;
                this._activePOIMarkers.push(activeLayer);
            }

            if (poi.type === 'pub' || poi.isPrimary) {
                this._targetMarker = activeLayer;
            }
        });
    }

    /** Zentrales Icon-Mapping für alle POI-Typen. */
    _getPOISVG(type) {
        let color = '#FFD700';
        let pathData = '';

        switch (type) {
            case 'residential':
                color = '#4ade80';
                pathData = 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z';
                break;
            case 'commercial':
                color = '#38bdf8';
                pathData = 'M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8V9h8v10zm-2-8h-4v2h4v-2zm0 4h-4v2h4v-2z';
                break;
            case 'public':
                color = '#f87171';
                pathData = 'M4 10h3v7H4zM10.5 10h3v7h-3zM2 19h20v3H2zM17 10h3v7h-3zM12 1L2 6v2h20V6L12 1z';
                break;
            case 'allotments':
                color = '#fbbf24';
                pathData = 'M10 6.73L14.71 14H5.29L10 6.73M10 3L2 15h3v7h10v-7h3L10 3z';
                break;
            default:
                return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='36' height='36'>`
                    + `<g stroke='#333' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'>`
                    + `<path fill='none' d='M16 9h2.5a2.5 2.5 0 0 1 2.5 2.5v3a2.5 2.5 0 0 1-2.5 2.5H16'/>`
                    + `<path fill='#FFD700' d='M6 6h10v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6z'/>`
                    + `<path fill='none' d='M9 8v9M13 8v9'/>`
                    + `<path fill='#FFF' d='M5 6c0-1.5 1.5-2.5 3-2.5 1 0 1.5.5 2.5.5s1.5-.5 2.5-.5c1.5 0 3 1 3 2.5 0 1-1 1.5-1 2.5H6c0-1-1-1.5-1-2.5z'/>`
                    + `</g></svg>`;
        }

        return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='36' height='36'>`
            + `<g stroke='#1e293b' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'>`
            + `<circle cx="12" cy="12" r="11" fill="white" opacity="0.2" />`
            + `<path fill='${color}' d='${pathData}'/>`
            + `</g></svg>`;
    }

    /** Lässt das Ziel-Icon hell aufleuchten und pulsieren. */
    highlightTarget() {
        if (!document.getElementById('pulse-glow-style')) {
            const style = document.createElement('style');
            style.id = 'pulse-glow-style';
            style.textContent = `
                @keyframes pulseGlow {
                    0%   { transform: scale(1);   filter: drop-shadow(0 0  8px #FFD700) brightness(1.2); }
                    50%  { transform: scale(1.5); filter: drop-shadow(0 0 30px #FFEA00) brightness(2.0); }
                    100% { transform: scale(1);   filter: drop-shadow(0 0  8px #FFD700) brightness(1.2); }
                }
                .target-marker-inner.target-pulse {
                    animation: pulseGlow 1s infinite ease-in-out;
                }
            `;
            document.head.appendChild(style);
        }

        if (this._targetMarker?._icon) {
            const inner = this._targetMarker._icon.querySelector('.target-marker-inner');
            if (inner) inner.classList.add('target-pulse');
        }
    }

    /**
     * Erzeugt eine zentrierte Ergebnismeldung (Toast), die nach 10s ins Menü "segelt".
     * @param {string} msg - Der anzuzeigende Text
     * @param {string} type - 'success' oder 'fail'
     */
    showInteractionResult(msg, type) {
        let toast = document.getElementById('result-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'result-toast';
            document.body.appendChild(toast);
        }

        toast.textContent = msg;
        toast.className = `toast-center ${type}`;
        toast.style.display = 'block';

        setTimeout(() => {
            toast.classList.add('toast-sail-right');
            this.returnCameraToOverview();
        }, 10000);
    }

    /**
     * Cinematic Loop mit Kamera-Zoom und Sperre.
     */
    playCinematicSequence(seqType, durationMs, callback) {
        const overlay = document.getElementById('cinema-overlay');
        if (!overlay) return;

        overlay.style.display = 'block';
        overlay.className = '';
        if (seqType === 'lockpick') overlay.classList.add('lockpick-animation');
        if (seqType === 'door') overlay.classList.add('door-animation');

        if (this._targetMarker) {
            this._map.flyTo(this._targetMarker.getLatLng(), 18, {
                animate: true,
                duration: durationMs / 1000
            });
        }

        setTimeout(() => {
            overlay.style.display = 'none';
            if (callback) callback();
        }, durationMs);
    }

    /**
     * Zoomt zurück zur Spiel-Übersicht.
     */
    returnCameraToOverview() {
        if (this._playerMarker) {
            this._map.flyTo(this._playerMarker.getLatLng(), 16.5, {
                animate: true,
                duration: 1.5
            });
        }
    }

    // ----------------------------------------------------------------
    //  Tutorial-Sequenz
    // ----------------------------------------------------------------





    /**
     * Cinematic Zoom für das Start-Intro: Berechnet die Bounding Box
     * über Start, Ziel und Nachbarn und taucht tief in die Szene ein.
     */
    focusScenarioBounds(startCoords, targetCoords, neighborCoordsArray) {
        this._isIntroFlying = true;
        
        const coords = [startCoords, targetCoords];
        if (neighborCoordsArray && Array.isArray(neighborCoordsArray)) {
            coords.push(...neighborCoordsArray);
        }
        
        try {
            const bounds = L.latLngBounds(coords);
            this._map.invalidateSize();
            
            // Dynamischer Cinematic Zoom mit Padding
            this._map.flyToBounds(bounds, { 
                padding: [50, 50], 
                maxZoom: 17.5, 
                duration: 2.5,
                easeLinearity: 0.25
            });
        } catch (error) {
            console.error("DEBUG FEHLER: Crash beim Kameraflug:", error);
            this._isIntroFlying = false;
        }
    }
}

export { MapView };