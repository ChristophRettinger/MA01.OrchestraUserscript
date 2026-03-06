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
        'slvdesborcwsk01.wienkav.at': 'dev01-wsk',
        'slvqesborcwsk01.wienkav.at': 'test01-wsk',
        'slvqesborcwsk02.wienkav.at': 'test02-wsk',
        'slvqesborcwsk03.wienkav.at': 'test03-wsk',
        'slvqesborcwsk04.wienkav.at': 'test04-wsk',
        'slvaesborcwsk01.wienkav.at': 'mig01-wsk',
		'slvaesborcwsk02.wienkav.at': 'mig02-wsk',
		'slvaesborcwsk03.wienkav.at': 'mig03-wsk',
		'slvaesborcwsk04.wienkav.at': 'mig04-wsk',		
        'slvpesborcwsk01.wienkav.at': 'prod01-wsk',
		'slvpesborcwsk02.wienkav.at': 'prod02-wsk',
		'slvpesborcwsk03.wienkav.at': 'prod03-wsk',
		'slvpesborcwsk04.wienkav.at': 'prod04-wsk',
		
		'slvdesborcmag01.host.magwien.gv.at': 'dev01-mag',
        'slvqesborcmag01.host.magwien.gv.at': 'test01-mag',
        'slvqesborcmag02.host.magwien.gv.at': 'test02-mag',
        'slvqesborcmag03.host.magwien.gv.at': 'test03-mag',
        'slvqesborcmag04.host.magwien.gv.at': 'test04-mag',
        'slvaesborcmag01.host.magwien.gv.at': 'mig01-mag',
		'slvaesborcmag02.host.magwien.gv.at': 'mig02-mag',
		'slvaesborcmag03.host.magwien.gv.at': 'mig03-mag',
		'slvaesborcmag04.host.magwien.gv.at': 'mig04-mag',		
        'slvpesborcmag01.host.magwien.gv.at': 'prod01-mag',
		'slvpesborcmag02.host.magwien.gv.at': 'prod02-mag',
		'slvpesborcmag03.host.magwien.gv.at': 'prod03-mag',
		'slvpesborcmag04.host.magwien.gv.at': 'prod04-mag',
		
		'slvdesborcmag01.routine.akhwien.at': 'dev01-mag',
        'slvqesborcmag01.routine.akhwien.at': 'test01-mag',
        'slvqesborcmag02.routine.akhwien.at': 'test02-mag',
        'slvqesborcmag03.routine.akhwien.at': 'test03-mag',
        'slvqesborcmag04.routine.akhwien.at': 'test04-mag',
        'slvaesborcmag01.routine.akhwien.at': 'mig01-mag',
		'slvaesborcmag02.routine.akhwien.at': 'mig02-mag',
		'slvaesborcmag03.routine.akhwien.at': 'mig03-mag',
		'slvaesborcmag04.routine.akhwien.at': 'mig04-mag',		
        'slvpesborcmag01.routine.akhwien.at': 'prod01-mag',
		'slvpesborcmag02.routine.akhwien.at': 'prod02-mag',
		'slvpesborcmag03.routine.akhwien.at': 'prod03-mag',
		'slvpesborcmag04.routine.akhwien.at': 'prod04-mag',
		
        'slvmesborc01.wienkav.at': 'ESBQ-1',
        'slvmesborc02.wienkav.at': 'ESBQ-2',
        'slvqesborc01.wienkav.at': 'ESBT-1',
        'slvqesborc02.wienkav.at': 'ESBT-2',
        'slvpesborc01.wienkav.at': 'ESBP-1',
        'slvpesborc02.wienkav.at': 'ESBP-2'
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
