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
    const allowedAttrs = ['style', 'class', 'viewbox', 'width', 'height', 'd', 'fill', 'margin-bottom', 'font-size', 'line-height'];
    
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    const clean = (node) => {
        // 1. Attribute filtern
        if (node.attributes) {
            for (let i = node.attributes.length - 1; i >= 0; i--) {
                const attrName = node.attributes[i].name.toLowerCase();
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
                    // Tag nicht erlaubt -> In Text umwandeln
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
