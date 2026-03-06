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
     *
     * The # placeholder can be used in hostname keys and translation values:
     * - In hostname keys it matches one or more digits (captured in order).
     * - In translation values each # is replaced with the corresponding capture,
     *   preserving leading zeros.
     *
     * Examples:
     *   "slvmesborc02.wienkav.at": "ESBQ"
     *   "slvqesborcwsk#.wienkav.at": "test#-wsk"
     */
    const SERVER_TRANSLATIONS = {
        'slvdesborcwsk#.wienkav.at': 'dev#-wsk',
        'slvqesborcwsk#.wienkav.at': 'test#-wsk',
        'slvaesborcwsk#.wienkav.at': 'mig#-wsk',
        'slvpesborcwsk#.wienkav.at': 'prod#-wsk',

		'slvdesborcmag#.host.magwien.gv.at': 'dev#-mag',
        'slvqesborcmag#.host.magwien.gv.at': 'test#-mag',
        'slvaesborcmag#.host.magwien.gv.at': 'mig#-mag',
        'slvpesborcmag#.host.magwien.gv.at': 'prod#-mag',

		'slvdesborcmag#.routine.akhwien.at': 'dev#-mag',
        'slvqesborcmag#.routine.akhwien.at': 'test#-mag',
        'slvaesborcmag#.routine.akhwien.at': 'mig#-mag',
        'slvpesborcmag#.routine.akhwien.at': 'prod#-mag',
		
		'svmmgrorc001.wienkav.at': 'esbd',
        'slvqesborc#.wienkav.at': 'esbt-#',
        'slvmesborc#.wienkav.at': 'esbq-#',
        'slvpesborc#.wienkav.at': 'esbp-#'
	};

    const WILDCARD_TOKEN = '#';

    const wildcardTranslations = Object.entries(SERVER_TRANSLATIONS)
        .filter(([hostname]) => hostname.includes(WILDCARD_TOKEN))
        .map(([hostnameTemplate, translationTemplate]) => ({
            matcher: buildWildcardMatcher(hostnameTemplate),
            translationTemplate
        }));

    /** Matches fully-qualified hostnames shown in CyberArk table cells. */
    const HOSTNAME_PATTERN = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;

    /** Marker attribute to avoid repeatedly processing the same DOM node. */
    const PROCESSED_ATTRIBUTE = 'data-cyberark-translation-applied';

    function normalizeHostname(text) {
        return String(text || '').trim().toLowerCase();
    }

    function escapeRegExp(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function buildWildcardMatcher(hostnameTemplate) {
        const pattern = hostnameTemplate
            .split(WILDCARD_TOKEN)
            .map(escapeRegExp)
            .join('(\\d+)');

        return new RegExp(`^${pattern}$`, 'i');
    }

    function resolveWildcardTranslation(translationTemplate, matches) {
        let replacementIndex = 0;
        return translationTemplate.replace(/#/g, () => {
            replacementIndex += 1;
            return matches[replacementIndex] || '';
        });
    }

    function findTranslation(hostname) {
        const normalizedHostname = normalizeHostname(hostname);
        const exactMatch = SERVER_TRANSLATIONS[normalizedHostname];
        if (exactMatch) {
            return exactMatch;
        }

        for (const { matcher, translationTemplate } of wildcardTranslations) {
            const matches = normalizedHostname.match(matcher);
            if (matches) {
                return resolveWildcardTranslation(translationTemplate, matches);
            }
        }

        return null;
    }

    function appendTranslation(element, hostname, translation) {
        const expectedTranslation = translation;
        if (element.querySelector('strong')?.textContent === expectedTranslation) {
            element.setAttribute(PROCESSED_ATTRIBUTE, 'true');
            return;
        }

        element.replaceChildren();
        element.appendChild(document.createTextNode(`${hostname} (`));
        const translationElement = document.createElement('strong');
        translationElement.textContent = translation;
        element.appendChild(translationElement);
        element.appendChild(document.createTextNode(')'));
        element.setAttribute(PROCESSED_ATTRIBUTE, 'true');
        element.setAttribute('title', `${hostname} (${translation})`);
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
