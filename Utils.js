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
 * XSS-Schutz: Bereinigt HTML-Strings und erlaubt nur sichere Formatierungs-Tags.
 * @param {string} html - Der zu bereinigende String
 * @returns {string} - Bereinigtes HTML
 */
export const sanitizeHTML = (html) => {
    if (typeof html !== 'string') return html;
    
    const allowedTags = ['br', 'b', 'i', 'strong', 'em', 'p', 'div', 'span', 'small', 'svg', 'path', 'h3'];
    const allowedAttrs = ['class', 'viewbox', 'width', 'height', 'd', 'fill'];
    
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    const clean = (node) => {
        // 1. Attribute filtern
        if (node.attributes) {
            for (let i = node.attributes.length - 1; i >= 0; i--) {
                const attrName = node.attributes[i].name.toLowerCase();
                const attrValue = node.attributes[i].value.toLowerCase();
                
                // Event-Handler (on...) rigoros blockieren
                if (attrName.startsWith('on')) {
                    node.removeAttribute(attrName);
                    continue;
                }

                // Style-Härtung: Nur Injections blockieren (wie vom USER gefordert)
                if (attrName === 'style') {
                    const dangerous = /position|fixed|absolute|url|javascript|expression|behavior|-moz-binding/i;
                    if (dangerous.test(attrValue)) {
                        node.removeAttribute(attrName);
                    }
                    continue;
                }

                // Whitelist-Check für restliche Attribute
                if (!allowedAttrs.includes(attrName) && !attrName.startsWith('data-')) {
                    node.removeAttribute(attrName);
                }
            }
        }
        
        // 2. Kindknoten rekursiv prüfen
        for (let i = node.childNodes.length - 1; i >= 0; i--) {
            const child = node.childNodes[i];
            if (child.nodeType === 1) { // Element
                const tag = child.tagName.toLowerCase();
                if (!allowedTags.includes(tag)) {
                    // Tag nicht erlaubt -> In Text umwandeln (Escape)
                    const textNode = document.createTextNode(child.outerHTML);
                    node.replaceChild(textNode, child);
                } else {
                    clean(child);
                }
            }
        }
    };

    clean(doc.body);
    return doc.body.innerHTML;
};

/**
 * Drosselt die Ausführung einer Funktion auf ein bestimmtes Zeitintervall.
 * @param {Function} func - Die zu drosselnde Funktion.
 * @param {number} limit - Das Zeitintervall in Millisekunden.
 */
export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Robuster Fetch-Helper mit exponentiellem Back-off.
 * @param {string} url - Die Ziel-URL.
 * @param {Object} options - Fetch-Optionen.
 * @param {number} retries - Anzahl der Versuche (Default: 3).
 * @param {number} delay - Initiale Verzögerung in ms (Default: 1000).
 */
export async function fetchWithRetry(url, options = {}, retries = 3, delay = 1000) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        if (retries > 0) {
            log(`Fetch failed, retrying in ${delay}ms... (${retries} left)`, error);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithRetry(url, options, retries - 1, delay * 2);
        }
        throw error;
    }
}
