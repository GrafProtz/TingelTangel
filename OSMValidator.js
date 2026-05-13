import { sanitizeHTML } from './Utils.js';

/**
 * OSMValidator.js - Sicherheits-Check und Sanitizing für externe Geodaten.
 */
export class OSMValidator {
    /**
     * Validiert und bereinigt das gesamte Overpass-Response-Objekt.
     * @param {Object} rawData - Die rohen Daten vom fetch.
     * @returns {Object} Bereinigtes Objekt mit validen Elementen.
     */
    static validate(rawData) {
        if (!rawData || typeof rawData !== 'object') {
            throw new Error('[OSMValidator] API-Antwort ist kein gültiges JSON-Objekt.');
        }

        if (!Array.isArray(rawData.elements)) {
            throw new Error('[OSMValidator] API-Antwort enthält kein "elements"-Array.');
        }

        // Filterung und Sanitizing in einem Rutsch
        const validElements = rawData.elements
            .filter(el => this.#isValidElement(el))
            .map(el => this.#sanitizeElement(el));

        return {
            ...rawData,
            elements: validElements,
            _validationTimestamp: Date.now()
        };
    }

    /**
     * Prüft ein einzelnes Element auf Mindestvoraussetzungen (Struktur-Check).
     */
    static #isValidElement(el) {
        if (!el || !el.id) return false;

        switch (el.type) {
            case 'node':
                return typeof el.lat === 'number' && typeof el.lon === 'number';

            case 'way':
                // Entweder Nodes vorhanden oder Center (Overpass 'out center' liefert center)
                const hasNodes = Array.isArray(el.nodes) && el.nodes.length > 0;
                const hasCenter = el.center && typeof el.center.lat === 'number' && typeof el.center.lon === 'number';
                return hasNodes || hasCenter;

            case 'relation':
                // Relationen brauchen für uns mindestens ein Center-Property
                return !!el.center;

            default:
                return false;
        }
    }

    /**
     * Bereinigt alle Tags eines Elements gegen XSS.
     */
    static #sanitizeElement(el) {
        if (!el.tags) return el;

        const cleanTags = {};
        for (const [key, value] of Object.entries(el.tags)) {
            // Wir bereinigen sowohl Key als auch Value, um absolute Sicherheit zu garantieren
            const safeKey = this.#escape(key);
            const safeValue = typeof value === 'string' ? sanitizeHTML(value) : value;
            cleanTags[safeKey] = safeValue;
        }

        return {
            ...el,
            tags: cleanTags
        };
    }

    /**
     * Simpler Escape für Keys (da sanitizeHTML für komplexe Strukturen gedacht ist).
     */
    static #escape(str) {
        return str.replace(/[&<>"']/g, (m) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[m]);
    }
}
