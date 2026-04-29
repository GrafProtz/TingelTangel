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
        this._radarMarkers    = [];
    }

    // ----------------------------------------------------------------
    //  Polizei-Radar
    // ----------------------------------------------------------------

    /**
     * Zeigt rote Kreise um alle Polizeistationen für 5 Sekunden.
     * Zoomt die Kamera heraus, um alle Stationen sichtbar zu machen.
     * @param {Array} policeStations - [{ lat, lon }, ...]
     * @returns {Promise} Resolved nach 5 Sek. wenn die Kreise verschwinden
     */
    showPoliceRadar(policeStations) {
        // Alte Radar-Marker entfernen
        this._radarMarkers.forEach(c => this._map.removeLayer(c));
        this._radarMarkers = [];

        if (policeStations.length === 0) return Promise.resolve();

        // Bounds berechnen und Kamera herauszoomen
        const latLngs = policeStations.map(s => [s.lat, s.lon]);
        const bounds = L.latLngBounds(latLngs);
        this._map.flyToBounds(bounds, { duration: 1.5, padding: [20, 20] });

        // Blaulicht-Icon
        const sirenIcon = L.divIcon({
            html: '<div class="police-siren"></div>',
            className: '',
            iconSize: [8, 8],
            iconAnchor: [4, 4]
        });

        // Rote Kreise + Sirenen-Marker rendern
        policeStations.forEach(station => {
            const circle = L.circle([station.lat, station.lon], {
                radius: 150,
                color: '#ef4444',
                fillColor: '#ef4444',
                fillOpacity: 0.25,
                weight: 2,
                dashArray: '6 4'
            }).addTo(this._map);
            this._radarMarkers.push(circle);

            const siren = L.marker([station.lat, station.lon], {
                icon: sirenIcon,
                interactive: false
            }).addTo(this._map);
            this._radarMarkers.push(siren);
        });

        // Nach 5 Sekunden alles entfernen
        return new Promise(resolve => {
            setTimeout(() => {
                this._radarMarkers.forEach(c => this._map.removeLayer(c));
                this._radarMarkers = [];
                resolve();
            }, 5000);
        });
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
                zIndexOffset: 1000,
                interactive: false
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

    updateBudget(text) {
        const hud = document.getElementById('budget-panel');
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
        const c = document.getElementById('info-panel');
        if (c) {
            this.updateInfoPanel(title, [message]);
            this.toggleInfoMenu(true);
        }
    }

    hideNotification() {
        // Notifications are now part of the info-panel and handled by toggleInfoMenu
    }

    // ----------------------------------------------------------------
    //  Ziel-Marker (POI)
    // ----------------------------------------------------------------

    /** Rendert das Missions-Ziel als Bierglas-Icon auf der Karte. */
    renderTarget(poiNode, isCooldown = false) {
        if (this._targetMarker) this._map.removeLayer(this._targetMarker);

        const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='36' height='36'>`
            + `<g stroke='#333' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'>`
            + `<path fill='none' d='M16 9h2.5a2.5 2.5 0 0 1 2.5 2.5v3a2.5 2.5 0 0 1-2.5 2.5H16'/>`
            + `<path fill='#FFD700' d='M6 6h10v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6z'/>`
            + `<path fill='none' d='M9 8v9M13 8v9'/>`
            + `<path fill='#FFF' d='M5 6c0-1.5 1.5-2.5 3-2.5 1 0 1.5.5 2.5.5s1.5-.5 2.5-.5c1.5 0 3 1 3 2.5 0 1-1 1.5-1 2.5H6c0-1-1-1.5-1-2.5z'/>`
            + `</g></svg>`;

        // Wrapper: Leaflet positioniert den äußeren, Animation läuft nur auf dem inneren
        const cooldownClass = isCooldown ? 'poi-cooldown' : '';
        const html = `
            <div class="target-marker-wrapper ${cooldownClass}">
                <div class="target-marker-inner" style="display: inline-block;">
                    ${svg}
                </div>
            </div>
        `;

        this._targetMarker = L.marker([poiNode.lat, poiNode.lon], {
            icon: L.divIcon({
                className: 'target-marker',
                html: html,
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            }),
            pane: 'popupPane',
            zIndexOffset: 2000,
            interactive: false
        }).addTo(this._map);
    }

    /** Triggert die Ankunfts-Animation (Pulse) auf dem Ziel-Marker. */
    animateTargetMarker() {
        if (this._targetMarker) {
            const el = this._targetMarker.getElement();
            if (el) {
                // Icon sofort groß machen und leuchten lassen
                el.innerHTML = '<div style="font-size: 30px; transition: all 0.3s ease; transform: scale(2); filter: drop-shadow(0 0 10px yellow); display: flex; justify-content: center; align-items: center;">🍺</div>';
                
                // Nach 600ms wieder auf Normalgröße schrumpfen
                setTimeout(() => {
                    el.innerHTML = '<div style="font-size: 24px; transition: all 0.3s ease; transform: scale(1); display: flex; justify-content: center; align-items: center;">🍺</div>';
                }, 600);
            }
        }
    }

    /** Lässt das Ziel-Icon hell aufleuchten und pulsieren. */
    highlightTarget() {
        // CSS-Animation einmalig ins Dokument injizieren
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

        // Klasse auf das INNERE Element anwenden (nicht auf den Leaflet-Marker!)
        if (this._targetMarker?._icon) {
            const inner = this._targetMarker._icon.querySelector('.target-marker-inner');
            if (inner) inner.classList.add('target-pulse');
        }
    }

    // ----------------------------------------------------------------
    //  Interaktions-Overlay (Kneipen-Dialog)
    // ----------------------------------------------------------------

    /**
     * Zeigt den Kneipen-Dialog an und befüllt die Buttons dynamisch.
     * @param {Object} optionsData - { A: { text, reward|cost, risk }, ... }
     * @param {Object} riskData - { riskMalus, activeStations }
     * @param {Function} onSelectCb - Wird mit 'A','B','C','D' aufgerufen
     */
    showInteractionOverlay(optionsData, riskData, onSelectCb) {
        const container = document.getElementById('options-container');
        if (!container) return;

        // Text-Element befüllen
        const textEl = document.getElementById('options-text');
        if (textEl) {
            textEl.innerHTML = 'Du hörst dich unauffällig um. Was tust du?';
        }

        // Buttons dynamisch befüllen
        const buttons = container.querySelectorAll('.option-btn');
        const keys = ['A', 'B', 'C', 'D'];
        buttons.forEach((btn, i) => {
            const key = keys[i];
            const opt = optionsData[key];
            if (!opt) return;

            // Text EXAKT so wie er aus der Game.js kommt
            const label = `${key}: ${opt.text}`;

            // Alten Listener entfernen via cloneNode
            const fresh = btn.cloneNode(false);
            fresh.textContent = label;
            fresh.className = btn.className;
            btn.parentNode.replaceChild(fresh, btn);
            fresh.addEventListener('click', () => {
                container.style.display = 'none';
                onSelectCb(key, opt);
            });
        });

        container.style.display = 'block';
    }

    /**
     * Investment-Banker Dialog für die Auswahl von Einbruchszielen.
     */
    showInvestmentDialog(cityName, onSelectCb, onCancelCb) {
        const overlay = document.createElement('div');
        overlay.id = 'investment-dialog-overlay';
        
        Object.assign(overlay.style, {
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: '#1e293b', border: '3px solid #f59e0b', padding: '30px',
            borderRadius: '15px', color: 'white', zIndex: '4000',
            textAlign: 'left', width: '400px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            fontFamily: 'sans-serif', lineHeight: '1.4'
        });

        overlay.innerHTML = `
            <div style="font-size: 20px; font-weight: bold; margin-bottom: 15px; color: #f59e0b; text-align: center;">💼 Investment Consultant</div>
            <p style="margin-bottom: 20px;"><i>"Ah, ein Investor! Lass uns einen Blick auf das Portfolio für ${cityName || 'diese Stadt'} werfen. Meine Konditionen: 75 Euro vorab, 20% vom Brutto-Gewinn für mich. Wähle dein Risikoprofil:"</i></p>
            <div id="invest-options" style="display: flex; flex-direction: column; gap: 10px;"></div>
        `;

        const optionsContainer = overlay.querySelector('#invest-options');

        const options = [
            { type: 'residential', icon: '🏡', title: 'Wohnungen', desc: 'Der konservative Fonds. 52.000 Fälle/Jahr. 46-48% Abbruchquote (Hunde, gute Fenster). Aufklärungsquote: 16% (Verhaftung auf frischer Tat nur 2-3%).' },
            { type: 'commercial', icon: '🏢', title: 'Gewerberäume', desc: 'Der Tech-ETF. 95.000 Fälle/Jahr. 40% Abbruchquote. Aufklärungsquote: 22% (Kameras, stille Alarme). Dafür extrem liquide Kassenbestände.' },
            { type: 'public', icon: '🏛️', title: 'Öffentliche Einrichtungen', desc: 'Die riskante Staatsanleihe. 18.000 Fälle/Jahr. 35% Abbruchquote. Aufklärungsquote: 25% (Nachtwächter, Patrouillen). Sehr gut gesichert.' },
            { type: 'allotments', icon: '🏕️', title: 'Schrebergärten', desc: 'Der Penny-Stock. Über 100.000 Fälle/Jahr. 25% Abbruchquote. Aufklärungsquote: 8-10%. Fast ein sicherer Hit, aber kleine Rendite.' }
        ];

        options.forEach(opt => {
            const btn = document.createElement('button');
            Object.assign(btn.style, {
                background: '#334155', border: '1px solid #475569', borderRadius: '8px',
                padding: '10px', color: 'white', cursor: 'pointer', textAlign: 'left',
                display: 'flex', flexDirection: 'column', gap: '5px', transition: 'background 0.2s'
            });
            btn.onmouseover = () => btn.style.background = '#475569';
            btn.onmouseout = () => btn.style.background = '#334155';
            
            btn.innerHTML = `<div style="font-weight: bold; font-size: 16px;">${opt.icon} ${opt.title}</div><div style="font-size: 12px; color: #cbd5e1;">${opt.desc}</div>`;
            
            btn.onclick = () => {
                overlay.remove();
                onSelectCb(opt.type);
            };
            optionsContainer.appendChild(btn);
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Abbrechen';
        Object.assign(cancelBtn.style, {
            marginTop: '20px', width: '100%', background: '#ef4444', border: 'none',
            padding: '10px', color: 'white', cursor: 'pointer', borderRadius: '8px',
            fontWeight: 'bold'
        });
        cancelBtn.onclick = () => {
            overlay.remove();
            if (onCancelCb) onCancelCb();
        };
        overlay.appendChild(cancelBtn);

        document.body.appendChild(overlay);
    }

    /**
     * Zeigt einen eigenständigen Erklär-Dialog nach dem Kauf des Radars an.
     * Erstellt ein dynamisches Overlay, um bestehende UI-Elemente nicht zu beeinflussen.
     */
    showRadarTutorialDialog(onConfirmCb) {
        const overlay = document.createElement('div');
        overlay.id = 'radar-tutorial-overlay';
        
        // Styling direkt per JS für maximale Unabhängigkeit
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: '#1e293b',
            border: '3px solid #38bdf8',
            padding: '30px',
            borderRadius: '15px',
            color: 'white',
            zIndex: '4000',
            textAlign: 'center',
            width: '320px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            fontFamily: 'sans-serif',
            lineHeight: '1.5'
        });

        overlay.innerHTML = `
            <div style="font-size: 20px; font-weight: bold; margin-bottom: 15px; color: #38bdf8;">📡 Radar freigeschaltet</div>
            <p><i>Der Barkeeper steckt das Geld ein und flüstert:</i></p>
            <p>"Hier wimmelt es von Cops. Ich zeige dir unsere Frequenzen. 
            Du hast <b>5 Sekunden</b>, um dir die Standorte zu merken. 
            Danach dauert es 5 Minuten, bis der Empfang wieder steht."</p>
        `;

        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = 'Radar aktivieren';
        Object.assign(confirmBtn.style, {
            marginTop: '20px',
            background: '#3b82f6',
            border: 'none',
            padding: '10px 20px',
            color: 'white',
            cursor: 'pointer',
            borderRadius: '8px',
            fontWeight: 'bold',
            fontSize: '16px'
        });

        confirmBtn.addEventListener('click', () => {
            overlay.remove();
            onConfirmCb();
        });

        overlay.appendChild(confirmBtn);
        document.body.appendChild(overlay);
    }

    /**
     * Erstellt eine Info-Karte, die zur rechten Menüleiste fliegt.
     */
    animateInfoToMenu(title, text, callback) {
        const div = document.createElement('div');
        div.className = 'flying-info-card';
        
        // Initiales Styling (zentriert)
        Object.assign(div.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) scale(1)',
            width: '280px',
            background: '#1e293b',
            border: '2px solid #38bdf8',
            borderRadius: '12px',
            padding: '20px',
            color: 'white',
            zIndex: '5000',
            textAlign: 'center',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            fontFamily: 'sans-serif',
            transition: 'all 1s cubic-bezier(0.25, 1, 0.5, 1)',
            opacity: '1'
        });

        div.innerHTML = `<div style="color: #38bdf8; font-weight: bold; margin-bottom: 8px;">${title}</div><div>${text}</div>`;
        document.body.appendChild(div);

        // 1. Wartezeit zum Lesen (1.5s)
        setTimeout(() => {
            // 2. Flug-Ziel setzen
            div.style.top = '70px';
            div.style.left = 'calc(100% - 150px)';
            div.style.transform = 'translate(0, 0) scale(0.1)';
            div.style.opacity = '0';

            // 3. Nach Ende der Animation (1s) entfernen
            setTimeout(() => {
                div.remove();
                if (callback) callback();
            }, 1000);
        }, 1500);
    }

    // ----------------------------------------------------------------
    //  Tutorial-Sequenz
    // ----------------------------------------------------------------

    /**
     * Zeigt das Tutorial-Panel an und hängt Text an.
     * @param {string} text - HTML-Text
     * @param {boolean} clearFirst - Wenn true, wird der alte Inhalt gelöscht
     */
    updateTutorialPanel(text, clearFirst = false) {
        const panel = document.getElementById('info-panel');
        if (!panel) return;
        
        if (clearFirst) panel.innerHTML = '';
        
        const card = document.createElement('div');
        card.className = 'info-card';
        card.innerHTML = `<div class="info-header">Mission</div><div class="info-body">${text}</div>`;
        panel.appendChild(card);
        
        panel.style.display = 'block';
        this.toggleInfoMenu(true);
    }

    hideTutorialPanel() {
        this.toggleInfoMenu(false);
    }

    /**
     * Aktualisiert die rechte Infotafel mit permanenten Informationen.
     * @param {string} title - Überschrift
     * @param {Array} lines - Zeilen als Strings
     */
    updateInfoPanel(title, lines) {
        const panel = document.getElementById('info-panel');
        if (!panel) return;
        panel.innerHTML = ''; // Zwingend erforderlich: Löscht alte Einträge restlos

        // Wir hängen neue Infos als Karten an oder leeren es?
        // Für den permanenten Status leeren wir es und befüllen es neu.
        panel.innerHTML = '';
        
        lines.forEach(line => {
            const card = document.createElement('div');
            card.className = 'info-card';
            card.innerHTML = `<div class="info-header">${title}</div><div class="info-body">${line}</div>`;
            panel.appendChild(card);
        });

        panel.style.display = 'block';
    }

    /**
     * Schaltet das Info-Menü ein oder aus.
     * @param {boolean} forceState - Optionaler Zielzustand
     */
    toggleInfoMenu(forceState) {
        const panel = document.getElementById('info-panel');
        const btn = document.getElementById('info-toggle-btn');
        if (!panel || !btn) return;
        
        let shouldOpen;
        if (typeof forceState === 'boolean') {
            shouldOpen = forceState;
        } else {
            shouldOpen = !panel.classList.contains('open');
        }

        if (shouldOpen) {
            panel.classList.add('open');
            btn.classList.add('panel-open');
            btn.innerText = '>>';
        } else {
            panel.classList.remove('open');
            btn.classList.remove('panel-open');
            btn.innerText = '<<';
        }
    }

    /**
     * Blendet das Tutorial-Panel langsam aus.
     */
    fadeTutorialPanelOut() {
        this.toggleInfoMenu(false);
    }

    /**
     * Erstellt ein fliegendes Info-Sheet, das ins Menü gleitet.
     */
    animateRewardToMenu(text, callback) {
        const sheet = document.createElement('div');
        sheet.innerText = text;
        // Styling für die mittige Tafel
        sheet.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: rgba(30, 41, 59, 0.95); border: 2px solid #38bdf8;
            border-radius: 8px; padding: 20px; color: white; text-align: center;
            z-index: 9999; width: 300px; font-family: sans-serif;
            transition: all 0.8s cubic-bezier(0.68, -0.55, 0.27, 1.55);
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            line-height: 1.4; font-weight: bold; font-size: 16px;
        `;
        document.body.appendChild(sheet);

        // 10 Sekunden Lesezeit
        setTimeout(() => {
            // Flug in die obere rechte Ecke (Position des Info-Panels)
            sheet.style.left = 'calc(100% - 165px)'; 
            sheet.style.top = '100px';
            sheet.style.transform = 'translate(0, 0) scale(0.1)';
            sheet.style.opacity = '0';

            // Nach 800ms Flugzeit: Element löschen und Spiel fortsetzen
            setTimeout(() => {
                sheet.remove();
                if (callback) callback();
            }, 800);
        }, 10000);
    }

    /**
     * Spielt die Tutorial-Kamerafahrt ab.
     * Start → Ziel (Highlight) → zurück zum Start → onComplete
     */
    playTutorialSequence(startCoords, targetCoords, poiName, onComplete) {
        const wait = (ms) => new Promise(r => setTimeout(r, ms));

        const run = async () => {
            // 1. Tutorial-Text anzeigen (clearFirst=true löscht "Lade Daten...")
            this.updateTutorialPanel(
                `🚶 <b>Bewegung:</b> Klicke auf grüne Punkte.<br>`
                + `💰 10 Meter kosten 1 €.<br>`
                + `🍺 Finde <b>"${poiName}"</b>!`,
                true
            );

            await wait(2500);

            // 2. Zum Ziel fliegen (Zoom 16.5 für Icon-Sichtbarkeit)
            this._map.flyTo(targetCoords, 16.5, { duration: 1.5 });
            await new Promise(r => this._map.once('moveend', r));

            // 3. Ziel pulsieren lassen
            this.highlightTarget();
            this.updateTutorialPanel(`👆 Da ist <b>"${poiName}"</b>!`);
            await wait(2000);

            // 4. Zurück zum Spieler fliegen
            this._map.flyTo(startCoords, 16.5, { duration: 1.5 });
            await new Promise(r => this._map.once('moveend', r));

            // 5. Abschluss-Text anhängen
            this.updateTutorialPanel(`Los geht's! 🍺`);

            // 6. Kontrolle übergeben
            if (onComplete) onComplete();
        };

        run();
    }

    onMapReady(callback) {
        this._map.once('moveend', callback);
    }
}

export { MapView };
