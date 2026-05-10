/**
 * OSMValidator.test.js - Unit Tests für die Daten-Sanitization.
 * Framework: Jest
 */
import { OSMValidator } from './OSMValidator.js';

describe('OSMValidator', () => {
    
    test('sollte ein korrektes Overpass-JSON unverändert passieren lassen', () => {
        const validJSON = {
            elements: [
                { type: 'node', id: 1, lat: 52.5, lon: 13.4 },
                { type: 'way', id: 2, nodes: [1], tags: { highway: 'residential' } }
            ]
        };
        const result = OSMValidator.validate(validJSON);
        expect(result.elements.length).toBe(2);
        expect(result._validationTimestamp).toBeDefined();
    });

    test('sollte einen Fehler werfen, wenn die Antwort kein Objekt ist', () => {
        expect(() => OSMValidator.validate(null)).toThrow('gültiges JSON-Objekt');
    });

    test('sollte einen Fehler werfen, wenn das elements-Array fehlt', () => {
        expect(() => OSMValidator.validate({})).toThrow('kein "elements"-Array');
    });

    test('sollte fehlerhafte Elemente rigoros ausfiltern (Drop-Strategie)', () => {
        const mixedJSON = {
            elements: [
                { type: 'node', id: 101, lat: 52.5, lon: 13.4 }, // Valid
                { type: 'node', id: 102, lon: 13.5 },           // Invalid (lat fehlt)
                { type: 'way', id: 201, tags: { building: 'yes' } }, // Invalid (keine nodes/center)
                { type: 'way', id: 202, center: { lat: 52.6, lon: 13.6 } }, // Valid (via center)
                { type: 'garbage', id: 999 }                    // Invalid type
            ]
        };

        const result = OSMValidator.validate(mixedJSON);
        expect(result.elements.length).toBe(2);
        const ids = result.elements.map(el => el.id);
        expect(ids).toContain(101);
        expect(ids).toContain(202);
    });
});
