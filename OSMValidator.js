/**
 * OSMValidator.js - Sicherheits-Check für externe Geodaten.
 */
export class OSMValidator {
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

    static #isValidElement(el) {
        if (!el || !el.id) return false;
        if (el.type === 'node') {
            return typeof el.lat === 'number' && typeof el.lon === 'number';
        }
        if (el.type === 'way') {
            return (Array.isArray(el.nodes) && el.nodes.length > 0) || 
                   (el.center && typeof el.center.lat === 'number');
        }
        return el.type === 'relation';
    }
}
