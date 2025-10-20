// ==UserScript==
// @name         Elastic MessageData Copier
// @namespace    http://tampermonkey.net/
// @version      2025-10-22
// @description  Adds a helper button that copies the MessageData1 field from the Elastic page clipboard JSON.
// @author       Christoph Rettinger
// @match        https://kb-obs.apps.zeus.wien.at/app/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /**
     * Configuration for the helper enhancements. Keeping everything in a single object
     * makes it easier to adjust selectors or texts when Elastic updates its UI.
     */
    const CONFIG = {
        selectors: {
            /** Selector that matches the SVG icon of the Elastic copy button. */
            copyIcon: 'svg[data-icon-type="copyClipboard"]',
            /** Class applied to the container span inside EUI empty buttons. */
            buttonContent: '.euiButtonEmpty__content',
            /** Class applied to the text span of the Elastic button. */
            buttonText: '.euiButtonEmpty__text'
        },
        labels: {
            /** Default label for the helper button. */
            helperIdle: 'Copy MessageData to clipboard',
            /** Busy label shown while clipboard operations run. */
            helperBusy: 'Copying MessageData…'
        },
        /** Delay (in ms) before the clipboard JSON is read. */
        clipboardReadDelayMs: 200,
        /** Maximum number of attempts to fetch and parse the clipboard JSON. */
        clipboardReadAttempts: 5
    };

    const STATE = {
        /** Caches helper buttons so we can reuse DOM references. */
        helperButtons: new WeakMap()
    };

    /** Utility helper that waits for a number of milliseconds. */
    const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

    /**
     * Finds all Elastic copy buttons on the page and ensures the helper button
     * is attached once for each original button.
     */
    function enhanceCopyButtons() {
        const icons = document.querySelectorAll(CONFIG.selectors.copyIcon);
        icons.forEach((icon) => {
            const copyButton = icon.closest('button');
            if (!copyButton || STATE.helperButtons.has(copyButton)) {
                return;
            }
            const helperButton = createHelperButton(copyButton);
            if (!helperButton) {
                return;
            }
            STATE.helperButtons.set(copyButton, helperButton);
            copyButton.insertAdjacentElement('afterend', helperButton);
        });
    }

    /**
     * Creates a helper button that mirrors the styling of Elastic buttons without
     * duplicating their copy icon SVG.
     */
    function createHelperButton(copyButton) {
        const helperButton = document.createElement('button');
        helperButton.type = 'button';
        helperButton.className = copyButton.className;
        helperButton.dataset.elasticHelper = 'messageDataCopy';

        const referenceContent = copyButton.querySelector(CONFIG.selectors.buttonContent);
        const contentWrapper = document.createElement('span');
        if (referenceContent) {
            contentWrapper.className = referenceContent.className;
        }

        const textSpan = document.createElement('span');
        const referenceText = copyButton.querySelector(CONFIG.selectors.buttonText);
        if (referenceText) {
            textSpan.className = referenceText.className;
        }
        textSpan.textContent = CONFIG.labels.helperIdle;
        helperButton.dataset.elasticHelperLabel = CONFIG.labels.helperIdle;
        contentWrapper.appendChild(textSpan);
        helperButton.appendChild(contentWrapper);

        helperButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            void handleHelperClick(copyButton, helperButton, textSpan);
        });

        return helperButton;
    }

    /**
     * Handles click events on the helper button by triggering the original copy,
     * then replacing the clipboard content with the MessageData1 value.
     */
    async function handleHelperClick(copyButton, helperButton, labelElement) {
        if (helperButton.disabled) {
            return;
        }

        setBusy(helperButton, labelElement, true);

        try {
            copyButton.click();
            const messageData = await readMessageDataFromClipboard();
            if (!messageData) {
                console.warn('[ElasticUserscript] MessageData1 not found in clipboard JSON.');
                return;
            }
            await navigator.clipboard.writeText(messageData);
            console.info('[ElasticUserscript] Clipboard updated with MessageData1.');
        } catch (error) {
            console.error('[ElasticUserscript] Failed to copy MessageData1.', error);
        } finally {
            setBusy(helperButton, labelElement, false);
        }
    }

    /**
     * Reads the clipboard and extracts the MessageData1 field.
     * Retries a couple of times to give Elastic time to populate the clipboard.
     */
    async function readMessageDataFromClipboard() {
        let lastError;
        for (let attempt = 1; attempt <= CONFIG.clipboardReadAttempts; attempt += 1) {
            await delay(CONFIG.clipboardReadDelayMs);
            try {
                const clipboardText = await navigator.clipboard.readText();
                if (!clipboardText) {
                    lastError = new Error('Clipboard is empty or inaccessible');
                    continue;
                }
                let parsed;
                try {
                    parsed = JSON.parse(clipboardText);
                } catch (parseError) {
                    lastError = new Error('Clipboard does not contain valid JSON');
                    continue;
                }
                const messageData = parsed?._source?.MessageData1 ?? parsed?.fields?.MessageData1?.[0];
                if (messageData) {
                    return messageData;
                }
                lastError = new Error('MessageData1 field missing in clipboard JSON');
            } catch (readError) {
                lastError = readError;
            }
        }
        if (lastError) {
            console.error('[ElasticUserscript] Unable to extract MessageData1 from clipboard.', lastError);
        }
        return null;
    }

    /** Updates the helper button state and label while busy. */
    function setBusy(helperButton, labelElement, busy) {
        helperButton.disabled = busy;
        helperButton.setAttribute('aria-busy', busy ? 'true' : 'false');
        if (!labelElement) {
            return;
        }
        if (busy) {
            helperButton.dataset.elasticHelperLabel = helperButton.dataset.elasticHelperLabel || labelElement.textContent;
            labelElement.textContent = CONFIG.labels.helperBusy;
        } else {
            labelElement.textContent = helperButton.dataset.elasticHelperLabel || CONFIG.labels.helperIdle;
        }
    }

    /**
     * Observes DOM changes so that dynamically loaded panels also receive the helper button.
     */
    function registerObservers() {
        const observer = new MutationObserver(() => enhanceCopyButtons());
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        enhanceCopyButtons();
        registerObservers();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
