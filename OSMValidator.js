/**
 * OSMValidator.js - Sicherheits-Check für externe Geodaten.
 */
export class OSMValidator {
    /**
     * Validiert das gesamte Overpass-Response-Objekt.
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

        const validElements = rawData.elements.filter(el => this.#isValidElement(el));

        return {
            ...rawData,
            elements: validElements,
            _validationTimestamp: Date.now()
        };
    }

    /**
     * Prüft ein einzelnes Element auf Mindestvoraussetzungen.
     */
    static #isValidElement(el) {
        if (!el || !el.id) return false;

        switch (el.type) {
            case 'node':
                return typeof el.lat === 'number' && typeof el.lon === 'number';

            case 'way':
                const hasNodes = Array.isArray(el.nodes) && el.nodes.length > 0;
                const hasCenter = el.center && typeof el.center.lat === 'number' && typeof el.center.lon === 'number';
                return hasNodes || hasCenter;

            case 'relation':
                return true;

            default:
                return false;
        }
    }
}
