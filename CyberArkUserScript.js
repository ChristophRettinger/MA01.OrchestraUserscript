// ==UserScript==
// @name         CyberArk Servername Translator
// @namespace    http://tampermonkey.net/
// @version      2026-03-06
// @description  Adds translated short names after known server hostnames in CyberArk tables.
// @author       Christoph Rettinger
// @match        https://cyberark.wien.gv.at/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /**
     * Translation table for known servers.
     * Extend this object as additional mappings become available.
     *
     * Example:
     *   "slvmesborc02.wienkav.at": "ESBQ"
     */
    const SERVER_TRANSLATIONS = {
        'slvmesborc02.wienkav.at': 'ESBQ'
    };

    /** Matches fully-qualified hostnames shown in CyberArk table cells. */
    const HOSTNAME_PATTERN = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;

    /** Marker attribute to avoid repeatedly processing the same DOM node. */
    const PROCESSED_ATTRIBUTE = 'data-cyberark-translation-applied';

    function normalizeHostname(text) {
        return String(text || '').trim().toLowerCase();
    }

    function findTranslation(hostname) {
        return SERVER_TRANSLATIONS[normalizeHostname(hostname)] || null;
    }

    function appendTranslation(element, hostname, translation) {
        const expectedSuffix = ` (${translation})`;
        if (element.textContent?.includes(expectedSuffix)) {
            element.setAttribute(PROCESSED_ATTRIBUTE, 'true');
            return;
        }

        element.textContent = `${hostname}${expectedSuffix}`;
        element.setAttribute(PROCESSED_ATTRIBUTE, 'true');
        element.setAttribute('title', `${hostname}${expectedSuffix}`);
    }

    /**
     * Handles one candidate table cell text span.
     * Only appends a translation when the value looks like a hostname and exists
     * in the translation table.
     */
    function processCellTextElement(element) {
        if (!element || element.getAttribute(PROCESSED_ATTRIBUTE) === 'true') {
            return;
        }

        const rawText = element.textContent?.trim();
        if (!rawText || !HOSTNAME_PATTERN.test(rawText)) {
            return;
        }

        const normalizedHostname = normalizeHostname(rawText);
        const translation = findTranslation(normalizedHostname);
        if (!translation) {
            return;
        }

        appendTranslation(element, normalizedHostname, translation);
    }

    function processRoot(root) {
        const candidates = root.matches?.('span.cyb-grid-cell__text')
            ? [root]
            : Array.from(root.querySelectorAll?.('span.cyb-grid-cell__text') || []);

        candidates.forEach(processCellTextElement);
    }

    function observeTableMutations() {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        processRoot(node);
                    }
                });
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        processRoot(document.body);
        observeTableMutations();
        console.info('[CyberArk Userscript] Servername translator initialized.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
