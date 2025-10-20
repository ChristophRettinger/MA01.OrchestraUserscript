// ==UserScript==
// @name         Elastic MessageData Helper
// @namespace    http://tampermonkey.net/
// @version      2025-10-23
// @description  Adds a companion button next to Elastic's "Copy to clipboard" control to place MessageData1 directly in the clipboard.
// @author       Christoph Rettinger
// @match        https://*/app/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /**
     * Elastic MessageData helper
     *
     * Watches for the native "Copy to clipboard" control used in Elastic search result tables.
     * When the button becomes available, a companion button is inserted directly after it. Clicking
     * the helper triggers the original copy logic, reads the JSON payload from the clipboard, extracts
     * the `MessageData1` field, and writes it back to the clipboard. Console messages describe success
     * and failure scenarios to aid troubleshooting when clipboard access is blocked or the JSON payload
     * is unexpected.
     */

    const COPY_CONFIG = {
        iconSelector: 'svg[data-icon-type="copyClipboard"]',
        insertedButtonAttribute: 'data-orchestra-message-data-button',
        sourceButtonAttribute: 'data-orchestra-message-data-enhanced',
        buttonLabel: 'Copy MessageData to clipboard',
        clipboardFieldName: 'MessageData1',
        clipboardReadAttempts: 5,
        clipboardReadDelayMs: 120
    };

    const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

    function logInfo(message, ...args) {
        console.info(`[Elastic MessageData] ${message}`, ...args);
    }

    function logError(message, ...args) {
        console.error(`[Elastic MessageData] ${message}`, ...args);
    }

    function findCopyButtons() {
        return Array.from(document.querySelectorAll(COPY_CONFIG.iconSelector))
            .map((icon) => icon.closest('button'))
            .filter((button) => button instanceof HTMLButtonElement);
    }

    function ensureButtonEnhancement(button) {
        if (!button || button.getAttribute(COPY_CONFIG.sourceButtonAttribute)) {
            return;
        }

        button.setAttribute(COPY_CONFIG.sourceButtonAttribute, 'true');

        const helperButton = createHelperButton(button);
        button.insertAdjacentElement('afterend', helperButton);
    }

    function createHelperButton(sourceButton) {
        const helperButton = sourceButton.cloneNode(true);
        helperButton.setAttribute(COPY_CONFIG.insertedButtonAttribute, 'true');
        helperButton.removeAttribute('aria-pressed');
        helperButton.disabled = false;

        const textNode = helperButton.querySelector('.euiButtonEmpty__text');
        if (textNode) {
            textNode.textContent = COPY_CONFIG.buttonLabel;
        } else {
            helperButton.textContent = COPY_CONFIG.buttonLabel;
        }

        const icon = helperButton.querySelector('svg');
        if (icon) {
            icon.remove();
        }

        helperButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            handleHelperClick(sourceButton, helperButton).catch((error) => {
                logError('Unexpected error while handling helper click:', error);
            });
        });

        return helperButton;
    }

    async function handleHelperClick(sourceButton, helperButton) {
        helperButton.disabled = true;

        try {
            sourceButton.click();
            const clipboardText = await readClipboardWithRetries();
            if (!clipboardText) {
                logError('Clipboard is empty or inaccessible after triggering the source button.');
                return;
            }

            let data;
            try {
                data = JSON.parse(clipboardText);
            } catch (parseError) {
                logError('Failed to parse clipboard contents as JSON.', parseError);
                return;
            }

            const messageData = extractMessageData(data);
            if (!messageData) {
                logError(`Field "${COPY_CONFIG.clipboardFieldName}" could not be resolved in the clipboard payload.`);
                return;
            }

            await navigator.clipboard.writeText(messageData);
            logInfo(`Clipboard updated with field ${COPY_CONFIG.clipboardFieldName}.`);
        } catch (error) {
            logError('Unable to update the clipboard with MessageData contents.', error);
        } finally {
            helperButton.disabled = false;
        }
    }

    async function readClipboardWithRetries() {
        let lastError;
        for (let attempt = 0; attempt < COPY_CONFIG.clipboardReadAttempts; attempt += 1) {
            await sleep(COPY_CONFIG.clipboardReadDelayMs);
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    return text;
                }
            } catch (error) {
                lastError = error;
            }
        }

        if (lastError) {
            logError('Failed to read clipboard contents after multiple attempts.', lastError);
        }

        return '';
    }

    function extractMessageData(data) {
        const field = COPY_CONFIG.clipboardFieldName;
        const sourceValue = data?._source?.[field];
        if (typeof sourceValue === 'string' && sourceValue.trim()) {
            return sourceValue;
        }

        const fieldsArray = data?.fields?.[field];
        if (Array.isArray(fieldsArray)) {
            const first = fieldsArray.find((value) => typeof value === 'string' && value.trim());
            if (first) {
                return first;
            }
        }

        return '';
    }

    function enhanceCopyButtons() {
        findCopyButtons().forEach(ensureButtonEnhancement);
    }

    function initObservers() {
        enhanceCopyButtons();

        const observer = new MutationObserver(() => {
            enhanceCopyButtons();
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        if (!document.body) {
            window.addEventListener('DOMContentLoaded', init, { once: true });
            return;
        }

        initObservers();
    }

    init();
})();
