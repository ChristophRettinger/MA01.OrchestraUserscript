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
            /** Class applied to the icon span of the Elastic button. */
            buttonIcon: '.euiButtonEmpty__icon',
            /** Class applied to the text span of the Elastic button. */
            buttonText: '.euiButtonEmpty__text'
        },
        labels: {
            /** Default label for the helper button. */
            helperIdle: 'Copy MessageData to clipboard',
            /** Busy label shown while clipboard operations run. */
            helperBusy: 'Copying MessageData…'
        },
        layout: {
            /** Additional gap (in px) inserted between the original and helper button. */
            helperSpacingPx: 20
        },
        toast: {
            /** Default duration (in ms) before non-persistent toasts fade out. */
            defaultDurationMs: 3000,
            /** Colour mapping for toast variants copied from the Orchestra helper. */
            themes: {
                info: '#1976d2',
                success: '#2e7d32',
                warning: '#ed6c02',
                error: '#d32f2f'
            }
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

    /** Applies multiple style definitions to the provided element. */
    function applyStyles(element, ...styles) {
        styles.filter(Boolean).forEach((style) => Object.assign(element.style, style));
    }

    /**
     * Creates a DOM element while allowing attributes, text content, and children to be defined.
     * Mirrors the helper from the Orchestra userscript so toast markup can be composed concisely.
     */
    function createElement(tagName, { attributes = {}, textContent, children = [] } = {}) {
        const element = document.createElement(tagName);
        Object.entries(attributes).forEach(([key, value]) => {
            if (value === undefined || value === null) {
                return;
            }
            element.setAttribute(key, value);
        });
        if (textContent !== undefined) {
            element.textContent = textContent;
        }
        children.forEach((child) => {
            if (child) {
                element.appendChild(child);
            }
        });
        return element;
    }

    /**
     * Toast helper adapted from the Orchestra userscript to surface feedback after clipboard writes.
     */
    function createToastService() {
        const STYLES = {
            container: {
                position: 'fixed',
                top: '16px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                zIndex: '10000',
                fontFamily: 'inherit',
                fontSize: '12px'
            },
            toast: {
                color: '#fff',
                padding: '8px 12px',
                borderRadius: '4px',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)',
                opacity: '0',
                transform: 'translateY(-10px)',
                transition: 'opacity 0.2s ease, transform 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                minWidth: '220px'
            },
            message: {
                display: 'block'
            }
        };

        let container = null;

        const ensureContainer = () => {
            if (!container) {
                container = createElement('div');
                applyStyles(container, STYLES.container);
                (document.body || document.documentElement).appendChild(container);
            }
            return container;
        };

        const cleanupContainer = () => {
            if (container && container.childElementCount === 0) {
                container.remove();
                container = null;
            }
        };

        const show = (message, options = {}) => {
            const {
                type = 'info',
                durationMs = CONFIG.toast.defaultDurationMs,
                persistent = false
            } = options;

            const host = ensureContainer();
            const toast = createElement('div');
            const background = CONFIG.toast.themes[type] || '#333';
            applyStyles(toast, STYLES.toast, { background });

            const messageSpan = createElement('span');
            applyStyles(messageSpan, STYLES.message);
            messageSpan.textContent = typeof message === 'string' ? message : String(message ?? '');
            toast.appendChild(messageSpan);

            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');

            host.appendChild(toast);

            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateY(0)';
            });

            let timeoutId = null;
            let dismissed = false;

            const startDismiss = () => {
                if (dismissed) {
                    return;
                }
                dismissed = true;
                if (timeoutId !== null) {
                    window.clearTimeout(timeoutId);
                }
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-10px)';
                toast.addEventListener(
                    'transitionend',
                    () => {
                        toast.remove();
                        cleanupContainer();
                    },
                    { once: true }
                );
            };

            if (!persistent) {
                const safeDuration = Math.max(1000, durationMs);
                timeoutId = window.setTimeout(startDismiss, safeDuration);
            }

            return {
                element: toast,
                dismiss: startDismiss
            };
        };

        return { show };
    }

    const toastService = createToastService();
    const showToast = (...args) => toastService.show(...args);

    /**
     * Finds all Elastic copy buttons on the page and ensures the helper button
     * is attached once for each original button.
     */
    function enhanceCopyButtons() {
        const icons = document.querySelectorAll(CONFIG.selectors.copyIcon);
        icons.forEach((icon) => {
            const copyButton = icon.closest('button');
            if (
                !copyButton ||
                copyButton.dataset.elasticHelper === 'messageDataCopy' ||
                STATE.helperButtons.has(copyButton)
            ) {
                return;
            }
            const helperButton = createHelperButton(copyButton, icon);
            if (!helperButton) {
                return;
            }
            STATE.helperButtons.set(copyButton, helperButton);
            copyButton.insertAdjacentElement('afterend', helperButton);
        });
    }

    /**
     * Creates a helper button that mirrors the styling of Elastic buttons and
     * clones the original copy icon so the UI remains consistent.
     */
    function createHelperButton(copyButton, referenceIcon) {
        const helperButton = document.createElement('button');
        helperButton.type = 'button';
        helperButton.className = copyButton.className;
        helperButton.dataset.elasticHelper = 'messageDataCopy';
        helperButton.style.marginLeft = `${CONFIG.layout.helperSpacingPx}px`;

        const referenceContent = copyButton.querySelector(CONFIG.selectors.buttonContent);
        const contentWrapper = document.createElement('span');
        if (referenceContent) {
            contentWrapper.className = referenceContent.className;
        }

        const iconContainer = document.createElement('span');
        const referenceIconWrapper = copyButton.querySelector(CONFIG.selectors.buttonIcon);
        if (referenceIconWrapper) {
            iconContainer.className = referenceIconWrapper.className;
        }
        const iconToClone = referenceIcon || copyButton.querySelector(CONFIG.selectors.copyIcon);
        if (iconToClone) {
            iconContainer.appendChild(iconToClone.cloneNode(true));
        }
        if (iconContainer.childElementCount > 0) {
            contentWrapper.appendChild(iconContainer);
        }

        const textSpan = document.createElement('span');
        const referenceText = copyButton.querySelector(CONFIG.selectors.buttonText);
        if (referenceText) {
            textSpan.className = referenceText.className;
        }
        textSpan.textContent = CONFIG.labels.helperIdle;
        helperButton.dataset.elasticHelperLabel = CONFIG.labels.helperIdle;
        helperButton.setAttribute('aria-label', CONFIG.labels.helperIdle);
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
            showToast('MessageData copied to clipboard.', { type: 'success' });
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
