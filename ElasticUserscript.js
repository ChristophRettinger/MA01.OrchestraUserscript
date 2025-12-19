// ==UserScript==
// @name         Elastic Helper Functions
// @namespace    http://tampermonkey.net/
// @version      2025-10-22
// @description  Adds a helper overlay for copying MessageData fields from the Elastic page clipboard JSON.
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
            /** Default label for the helper overlay toggle. */
            panelHeader: 'Elastic Tools',
            /** Label for the MessageData1 action. */
            messageData1: 'Get MessageData1',
            /** Label for the MessageData2 action. */
            messageData2: 'Get MessageData2',
            /** Label for the formatted option. */
            formatted: 'formatted',
            /** Label for the raw option. */
            raw: 'raw',
            /** Busy label shown while clipboard operations run. */
            helperBusy: 'Copying MessageData…'
        },
        layout: {
            /** Width of the helper overlay panel. */
            panelWidth: 280,
            /** Icon displayed when the overlay is collapsed. */
            collapsedIcon: '🛠',
            /** Size (in px) of the collapsed toggle. */
            collapsedSize: 26,
            /** Z-index applied to the helper overlay to stay above Elastic modals. */
            zIndex: 2147483647
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
        /** Reference to the helper overlay so we create it only once. */
        helperPanel: null
    };

    /** Utility helper that waits for a number of milliseconds. */
    const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

    /**
     * Waits until an element matching the selector appears in the DOM.
     * Resolves with the element so callers can ensure Elastic finished rendering
     * its shell before wiring up the helper overlay.
     */
    function waitForElement(selector, { timeoutMs = 20000 } = {}) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(selector);
            if (existing) {
                resolve(existing);
                return;
            }

            const observer = new MutationObserver(() => {
                const found = document.querySelector(selector);
                if (found) {
                    observer.disconnect();
                    if (timeoutId !== null) {
                        window.clearTimeout(timeoutId);
                    }
                    resolve(found);
                }
            });

            observer.observe(document.documentElement, { childList: true, subtree: true });

            const timeoutId =
                Number.isFinite(timeoutMs) && timeoutMs > 0
                    ? window.setTimeout(() => {
                          observer.disconnect();
                          reject(new Error(`Timed out waiting for selector: ${selector}`));
                      }, timeoutMs)
                    : null;
        });
    }

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
     * Reads the clipboard and extracts the requested MessageData field.
     * Retries a couple of times to give Elastic time to populate the clipboard.
     */
    async function readMessageDataFromClipboard(fieldName = 'MessageData1') {
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
                const messageData = parsed?._source?.[fieldName] ?? parsed?.fields?.[fieldName]?.[0];
                if (messageData) {
                    return messageData;
                }
                lastError = new Error(`${fieldName} field missing in clipboard JSON`);
            } catch (readError) {
                lastError = readError;
            }
        }
        if (lastError) {
            console.error(`[ElasticUserscript] Unable to extract ${fieldName} from clipboard.`, lastError);
        }
        return null;
    }

    /** Formats XML content with consistent indentation. */
    function formatXml(xmlString) {
        if (typeof xmlString !== 'string') {
            throw new TypeError('MessageData must be a string to format XML.');
        }

        const trimmed = xmlString.trim();
        if (!trimmed) {
            throw new Error('MessageData is empty.');
        }

        const parser = new DOMParser();
        const parsed = parser.parseFromString(trimmed, 'application/xml');
        const parseError = parsed.querySelector('parsererror');
        if (parseError) {
            throw new Error('MessageData is not valid XML.');
        }

        const serializer = new XMLSerializer();
        const serialized = serializer.serializeToString(parsed);
        const tokens = serialized.replace(/(>)(<)(\/?)/g, '$1\n$2$3').split(/\n+/);
        const indentUnit = '  ';
        let indent = 0;
        const lines = tokens
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                if (/^<\//.test(line)) {
                    indent = Math.max(indent - 1, 0);
                }
                const currentIndent = indentUnit.repeat(indent);
                if (/^<[^!?][^>/]*[^/]?>$/.test(line)) {
                    indent += 1;
                }
                return `${currentIndent}${line}`;
            });

        return lines.join('\n');
    }

    /**
     * Formats MessageData content by detecting JSON or XML payloads.
     * Prefers JSON when valid, otherwise falls back to XML pretty-printing.
     */
    function formatMessageData(messageData) {
        if (typeof messageData !== 'string') {
            throw new TypeError('MessageData must be a string.');
        }

        const trimmed = messageData.trim();
        if (!trimmed) {
            throw new Error('MessageData is empty.');
        }

        try {
            const parsedJson = JSON.parse(trimmed);
            return JSON.stringify(parsedJson, null, 2);
        } catch {
            // Not JSON, fall back to XML.
        }

        try {
            return formatXml(trimmed);
        } catch (xmlError) {
            const reason = xmlError instanceof Error ? xmlError.message : 'Unknown error';
            throw new Error(`MessageData is neither valid JSON nor XML. (${reason})`);
        }
    }

    /**
     * Helper panel copied from the Orchestra script to keep controls visible in Elastic.
     */
    class HelperPanel {
        constructor(parent) {
            this.parent = parent;
            this.collapsed = true;

            this.wrapper = createElement('div');
            applyStyles(this.wrapper, {
                position: 'fixed',
                top: '8px',
                right: '125px',
                zIndex: String(CONFIG.layout.zIndex),
                fontFamily: 'inherit',
                fontSize: '12px'
            });

            this.toggleButton = createElement('button', {
                attributes: { type: 'button' }
            });
            applyStyles(this.toggleButton, {
                width: '100%',
                cursor: 'pointer',
                fontWeight: 'bold',
                transition: 'background 0.2s ease'
            });
            this.toggleButton.addEventListener('click', () => {
                this.collapsed = !this.collapsed;
                this.applyState();
            });

            this.content = createElement('div', {
                attributes: { role: 'group' }
            });
            applyStyles(this.content, {
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                marginTop: '6px'
            });

            this.wrapper.appendChild(this.toggleButton);
            this.wrapper.appendChild(this.content);
            this.parent.appendChild(this.wrapper);

            this.applyState();
        }

        applyState() {
            const expanded = !this.collapsed;
            const collapsedSizePx = `${CONFIG.layout.collapsedSize}px`;

            this.toggleButton.setAttribute('aria-expanded', expanded.toString());
            this.toggleButton.setAttribute(
                'aria-label',
                expanded ? `Collapse ${CONFIG.labels.panelHeader}` : `Expand ${CONFIG.labels.panelHeader}`
            );
            this.toggleButton.title = expanded ? `Collapse ${CONFIG.labels.panelHeader}` : `Expand ${CONFIG.labels.panelHeader}`;

            this.content.style.display = expanded ? 'flex' : 'none';

            if (expanded) {
                applyStyles(this.wrapper, {
                    width: `${CONFIG.layout.panelWidth}px`,
                    background: '#f5f5f5',
                    border: '1px solid black',
                    padding: '6px',
                    height: 'auto',
                    borderRadius: '0',
                    boxShadow: 'none'
                });
                applyStyles(this.toggleButton, {
                    background: '#1565c0',
                    color: '#ffffff',
                    border: '1px solid black',
                    padding: '2px 4px',
                    fontSize: '12px',
                    display: 'block',
                    width: '100%',
                    height: 'auto',
                    borderRadius: '0',
                    margin: '0'
                });
                this.toggleButton.textContent = CONFIG.layout.collapsedIcon;
            } else {
                applyStyles(this.wrapper, {
                    width: collapsedSizePx,
                    background: '#ffffff',
                    border: '1px solid black',
                    padding: '4px',
                    height: collapsedSizePx,
                    borderRadius: '3px',
                    boxShadow: 'none'
                });
                applyStyles(this.toggleButton, {
                    background: '#eceff1',
                    color: '#111111',
                    border: 'none',
                    padding: '0',
                    margin: '-2px 0 0 0',
                    fontSize: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    height: '100%'
                });
                this.toggleButton.textContent = CONFIG.layout.collapsedIcon;
            }
        }

        addActionGroup({ label, icon, options, defaultOptionId }) {
            if (!Array.isArray(options) || options.length === 0) {
                throw new Error('Action groups require at least one option.');
            }

            const host = createElement('div');
            applyStyles(host, {
                display: 'grid',
                gridTemplateColumns: '1fr 32px',
                gap: '4px'
            });

            const mainButton = createElement('button', { attributes: { type: 'button' } });
            const dropdownToggle = createElement('button', { attributes: { type: 'button', 'aria-label': `${label} options` } });
            const dropdown = createElement('div', { attributes: { role: 'menu' } });

            [mainButton, dropdownToggle].forEach((button) => {
                applyStyles(button, {
                    border: '1px solid black',
                    padding: '4px 6px',
                    borderRadius: '2px',
                    fontFamily: 'inherit',
                    fontSize: '12px',
                    cursor: 'pointer',
                    background: '#cbe5ff'
                });
            });

            applyStyles(mainButton, {
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                justifyContent: 'flex-start'
            });

            applyStyles(dropdownToggle, {
                padding: '4px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            });
            dropdownToggle.textContent = '⋯';

            applyStyles(dropdown, {
                display: 'none',
                position: 'absolute',
                background: '#ffffff',
                border: '1px solid black',
                borderRadius: '2px',
                padding: '4px 0',
                marginTop: '2px',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
                minWidth: '180px',
                zIndex: String(CONFIG.layout.zIndex)
            });

            const labelSpan = createElement('span', { textContent: label });
            applyStyles(labelSpan, {
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
            });
            if (icon) {
                const iconSpan = createElement('span', { textContent: icon });
                iconSpan.setAttribute('aria-hidden', 'true');
                applyStyles(iconSpan, {
                    width: '16px',
                    display: 'inline-flex',
                    justifyContent: 'center'
                });
                mainButton.appendChild(iconSpan);
            }
            mainButton.appendChild(labelSpan);

            const optionMap = new Map();
            options.forEach((option) => optionMap.set(option.id, option));

            let currentDefault = optionMap.get(defaultOptionId) || options[0];
            const setDefaultOption = (option) => {
                currentDefault = option;
                mainButton.title = `${option.label} (default)`;
                mainButton.setAttribute('aria-label', `${option.label} (default)`);
            };
            setDefaultOption(currentDefault);

            let dropdownOpen = false;
            const toggleDropdown = () => {
                dropdownOpen = !dropdownOpen;
                dropdown.style.display = dropdownOpen ? 'block' : 'none';
            };
            const closeDropdown = () => {
                dropdownOpen = false;
                dropdown.style.display = 'none';
            };

            document.addEventListener('click', (event) => {
                if (!dropdownOpen) {
                    return;
                }
                if (!host.contains(event.target)) {
                    closeDropdown();
                }
            });

            const runOption = (option) => {
                if (option?.onSelect) {
                    option.onSelect();
                }
                closeDropdown();
            };

            options.forEach((option) => {
                const optionButton = createElement('button', {
                    attributes: { type: 'button', role: 'menuitem' },
                    textContent: option.label
                });
                applyStyles(optionButton, {
                    width: '100%',
                    textAlign: 'left',
                    padding: '6px 10px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer'
                });
                optionButton.addEventListener('click', () => runOption(option));
                optionButton.addEventListener('mouseenter', () => optionButton.style.background = '#f5f5f5');
                optionButton.addEventListener('mouseleave', () => optionButton.style.background = 'transparent');
                dropdown.appendChild(optionButton);
            });

            mainButton.addEventListener('click', () => runOption(currentDefault));
            dropdownToggle.addEventListener('click', (event) => {
                event.stopPropagation();
                toggleDropdown();
            });

            host.appendChild(mainButton);
            host.appendChild(dropdownToggle);
            host.appendChild(dropdown);
            this.content.appendChild(host);

            let enabled = false;
            const controller = {
                element: host,
                setEnabled(value) {
                    enabled = Boolean(value);
                    const baseStyles = {
                        background: enabled ? '#cbe5ff' : '#d6d6d6',
                        cursor: enabled ? 'pointer' : 'not-allowed',
                        opacity: enabled ? '1' : '0.5'
                    };
                    applyStyles(mainButton, baseStyles);
                    applyStyles(dropdownToggle, baseStyles);
                    mainButton.disabled = !enabled;
                    dropdownToggle.disabled = !enabled;
                    dropdown.querySelectorAll('button').forEach((button) => {
                        button.disabled = !enabled;
                        applyStyles(button, {
                            cursor: enabled ? 'pointer' : 'not-allowed',
                            opacity: enabled ? '1' : '0.7'
                        });
                    });
                    if (!enabled) {
                        closeDropdown();
                    }
                }
            };

            controller.setEnabled(true);
            return controller;
        }
    }

    function createHelperPanel(parent) {
        if (STATE.helperPanel || !parent) {
            return STATE.helperPanel;
        }
        STATE.helperPanel = new HelperPanel(parent);
        return STATE.helperPanel;
    }

    const isVisible = (element) => Boolean(element && element.getClientRects().length > 0);

    function findCopyButton() {
        const icons = document.querySelectorAll(CONFIG.selectors.copyIcon);
        for (const icon of icons) {
            const button = icon.closest('button');
            if (button && isVisible(button)) {
                return button;
            }
        }
        return null;
    }

    async function copyMessageData({ fieldName = 'MessageData1', formatContent = true } = {}) {
        const copyButton = findCopyButton();
        if (!copyButton) {
            showToast('Open a MessageData detail first. Copy button not found.', { type: 'error' });
            return;
        }

        copyButton.click();
        const messageData = await readMessageDataFromClipboard(fieldName);
        if (!messageData) {
            showToast(`${fieldName} not available in the clipboard payload.`, { type: 'warning' });
            return;
        }

        try {
            const content = formatContent ? formatMessageData(messageData) : messageData;
            await navigator.clipboard.writeText(content);
            const formattedLabel = `${fieldName} copied (${CONFIG.labels.formatted}).`;
            const rawLabel = `${fieldName} copied (${CONFIG.labels.raw}).`;
            const label = formatContent ? formattedLabel : rawLabel;
            showToast(label, { type: 'success' });
        } catch (error) {
            console.error(`[ElasticUserscript] Failed to process ${fieldName}.`, error);
            showToast(error?.message || `Unable to copy ${fieldName}.`, { type: 'error' });
        }
    }

    function initializeOverlay() {
        const panel = createHelperPanel(document.body || document.documentElement);
        if (!panel) {
            return;
        }

        const messageDataGroup = panel.addActionGroup({
            label: CONFIG.labels.messageData1,
            icon: '📋',
            defaultOptionId: 'formatted',
            options: [
                { id: 'formatted', label: CONFIG.labels.formatted, onSelect: () => copyMessageData({ fieldName: 'MessageData1', formatContent: true }) },
                { id: 'raw', label: CONFIG.labels.raw, onSelect: () => copyMessageData({ fieldName: 'MessageData1', formatContent: false }) }
            ]
        });

        const messageData2Group = panel.addActionGroup({
            label: CONFIG.labels.messageData2,
            icon: '📋',
            defaultOptionId: 'formatted',
            options: [
                { id: 'formatted', label: CONFIG.labels.formatted, onSelect: () => copyMessageData({ fieldName: 'MessageData2', formatContent: true }) },
                { id: 'raw', label: CONFIG.labels.raw, onSelect: () => copyMessageData({ fieldName: 'MessageData2', formatContent: false }) }
            ]
        });

        // The MessageData helpers remain enabled at all times. If Elastic's copy button
        // is not present the handler will surface a toast that explains the missing
        // prerequisites without hiding the controls.
        messageDataGroup.setEnabled(true);
        messageData2Group.setEnabled(true);
    }

    function init() {
        waitForElement('#kibana-body')
            .then(() => initializeOverlay())
            .catch((error) => {
                console.warn(
                    '[ElasticUserscript] kibana-body container not detected; helper overlay not created.',
                    error
                );
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            () => {
                init();
            },
            { once: true }
        );
    } else {
        init();
    }
})();
