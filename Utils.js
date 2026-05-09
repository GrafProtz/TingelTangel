import { CONFIG } from './GameConfig.js';

/**
 * Sicherer Logger: Gibt nur Ausgaben aus, wenn DEBUG_MODE in der Config aktiv ist.
 */
export const log = (...args) => {
    if (CONFIG.DEBUG_MODE) {
        console.log(...args);
    }
};

/**
 * XSS-Schutz: Maskiert gefährliche HTML-Zeichen in Strings.
 * Sollte für alle Daten aus externen Quellen (wie OSM-Tags) genutzt werden.
 */
export const sanitizeHTML = (str) => {
    if (typeof str !== 'string') return str;
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
};
