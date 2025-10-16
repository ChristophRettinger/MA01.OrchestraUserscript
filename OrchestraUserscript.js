// ==UserScript==
// @name         Orchestra Helper Functions
// @namespace    http://tampermonkey.net/
// @version      2025-10-15
// @description  try to take over the world!
// @author       Christoph Rettinger
// @match        https://*.esb.wienkav.at:*/orchestra/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=wien.at
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        selectors: {
            buttonParent: '.header-holder',
            rows: '.scenarioChooser-content .mTable-data > tbody > tr:not(:first-child)',
            msgIdCells: '.mTable-row-hover .mTable-data-cell, .mTable-row-selected .mTable-data-cell',
            processNameCell: 'td:nth-child(6)',
            contextMenuItems: '.contextMenuPopup td.menuItem',
            popup: '.gwt-DecoratedPopupPanel',
            popupKeyCell: '.gwt-TabPanelBottom td.dialogTable-key',
            popupCancelCell: '.mButtonBar td.middleCenter',
            selectedTabLabel: '.mTabCaption-selected .mTabCaption-label'
        },
        routes: {
            processOverviewHash: '#scenario/processOverview/',
            processesHash: /#scenario\/.*\/processes\//
        },
        panel: {
            width: 200,
            headerText: 'Orchestra Tools',
            collapsedIcon: '🛠',
            collapsedSize: 26
        },
        colors: {
            buttonEnabled: '#A9D0F5',
            buttonDisabled: '#d6d6d6'
        },
        toast: {
            defaultDurationMs: 3500,
            themes: {
                info: '#1976d2',
                success: '#2e7d32',
                warning: '#ed6c02',
                error: '#d32f2f'
            }
        },
        labels: {
            changeVariables: 'Change variables',
            cancel: 'Cancel',
            buKeys: 'BuKeys'
        },
        elastic: {
            defaultFields: ['_CASENO_ISH', 'SUBFL_category', 'SUBFL_changedate', '_PID_ISH', '_HCMMSGEVENT', '_UNIT'],
            scenarioName: 'ITI_SUBFL_SAP_HCM_empfangen_129',
            environment: 'production'
        }
    };

    const state = {
        helperPanel: null
    };

    function applyStyles(element, ...styles) {
        styles.filter(Boolean).forEach((style) => Object.assign(element.style, style));
    }

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

    function waitForElement(selector) {
        return new Promise((resolve) => {
            const existing = document.querySelector(selector);
            if (existing) {
                resolve(existing);
                return;
            }

            const observer = new MutationObserver(() => {
                const element = document.querySelector(selector);
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });

            if (document.body) {
                observer.observe(document.body, { childList: true, subtree: true });
            } else {
                observer.observe(document.documentElement, { childList: true, subtree: true });
            }
        });
    }

    function waitForElementRemoval(element) {
        return new Promise((resolve) => {
            if (!element || !element.isConnected) {
                resolve();
                return;
            }

            const observer = new MutationObserver(() => {
                if (!element.isConnected) {
                    observer.disconnect();
                    resolve();
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

    function createToastService() {
        const STYLES = {
            container: {
                position: 'fixed',
                top: '16px',
                right: '16px',
                display: 'flex',
                flexDirection: 'column',
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
            },
            actionsWrapper: {
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px'
            },
            actionButton: {
                background: 'rgba(255, 255, 255, 0.15)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.4)',
                borderRadius: '3px',
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: '11px'
            }
        };

        let container = null;

        function ensureContainer() {
            if (!container) {
                container = createElement('div');
                applyStyles(container, STYLES.container);
                document.body.appendChild(container);
            }
            return container;
        }

        function cleanupContainer() {
            if (container && container.childElementCount === 0) {
                container.remove();
                container = null;
            }
        }

        function show(message, options = {}) {
            const {
                type = 'info',
                durationMs = CONFIG.toast.defaultDurationMs,
                persistent = false,
                actions = []
            } = options;

            const host = ensureContainer();
            const toast = createElement('div');
            const background = CONFIG.toast.themes[type] || '#333';
            applyStyles(toast, STYLES.toast, { background });

            const messageSpan = createElement('span', { textContent: '', children: [] });
            applyStyles(messageSpan, STYLES.message);

            const setMessageContent = (content) => {
                if (content instanceof Node) {
                    messageSpan.replaceChildren(content);
                } else {
                    messageSpan.textContent = typeof content === 'string' ? content : String(content ?? '');
                }
            };

            setMessageContent(message);
            toast.appendChild(messageSpan);

            if (Array.isArray(actions) && actions.length > 0) {
                const actionsWrapper = createElement('div');
                applyStyles(actionsWrapper, STYLES.actionsWrapper);

                actions.forEach((action) => {
                    if (!action || typeof action.label !== 'string') {
                        return;
                    }
                    const actionButton = createElement('button', {
                        attributes: { type: 'button' },
                        textContent: action.label
                    });
                    if (action.ariaLabel) {
                        actionButton.setAttribute('aria-label', action.ariaLabel);
                    }
                    applyStyles(actionButton, STYLES.actionButton);
                    actionButton.addEventListener('click', (event) => {
                        event.preventDefault();
                        if (typeof action.onClick === 'function') {
                            action.onClick(event);
                        }
                    });
                    actionsWrapper.appendChild(actionButton);
                });

                if (actionsWrapper.childElementCount > 0) {
                    toast.appendChild(actionsWrapper);
                }
            }

            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');

            host.appendChild(toast);

            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateY(0)';
            });

            let timeoutId = null;
            let dismissed = false;

            const teardown = () => {
                toast.remove();
                cleanupContainer();
            };

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
                toast.addEventListener('transitionend', teardown, { once: true });
            };

            if (!persistent) {
                const safeDuration = Math.max(1000, durationMs);
                timeoutId = window.setTimeout(startDismiss, safeDuration);
            }

            return {
                element: toast,
                update(newMessage) {
                    if (!dismissed) {
                        setMessageContent(newMessage);
                    }
                },
                dismiss() {
                    startDismiss();
                }
            };
        }

        return { show };
    }

    const toastService = createToastService();
    const showToast = (...args) => toastService.show(...args);

    class HelperPanel {
        constructor(parent) {
            this.parent = parent;
            this.collapsed = true;

            this.wrapper = createElement('div');
            applyStyles(this.wrapper, {
                position: 'absolute',
                top: '5px',
                right: '5px',
                zIndex: '9999',
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
            const collapsedSizePx = `${CONFIG.panel.collapsedSize}px`;

            this.toggleButton.setAttribute('aria-expanded', expanded.toString());
            this.toggleButton.setAttribute(
                'aria-label',
                expanded ? `Collapse ${CONFIG.panel.headerText}` : `Expand ${CONFIG.panel.headerText}`
            );
            this.toggleButton.title = expanded ? `Collapse ${CONFIG.panel.headerText}` : `Expand ${CONFIG.panel.headerText}`;

            this.content.style.display = expanded ? 'flex' : 'none';

            if (expanded) {
                applyStyles(this.wrapper, {
                    width: `${CONFIG.panel.width}px`,
                    background: '#f5f5f5',
                    border: '1px solid black',
                    padding: '6px',
                    height: 'auto',
                    borderRadius: '0',
                    boxShadow: 'none'
                });
                applyStyles(this.toggleButton, {
                    background: '#bdbdbd',
                    border: '1px solid black',
                    padding: '2px 4px',
                    fontSize: '12px',
                    display: 'block',
                    width: '100%',
                    height: 'auto',
                    borderRadius: '0',
                    margin: '0'
                });
                this.toggleButton.textContent = `[-] ${CONFIG.panel.headerText}`;
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
                    background: '#ffffff',
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
                this.toggleButton.textContent = CONFIG.panel.collapsedIcon;
            }
        }

        addButton({ label, icon, onClick, isActionAvailable }) {
            if (typeof onClick !== 'function') {
                throw new TypeError('onClick handler must be a function.');
            }

            const button = createElement('button', {
                attributes: { type: 'button' }
            });
            applyStyles(button, {
                border: '1px solid black',
                padding: '4px 6px',
                textAlign: 'left',
                borderRadius: '2px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                justifyContent: 'flex-start',
                fontFamily: 'inherit',
                fontSize: '12px'
            });

            if (icon) {
                const iconSpan = createElement('span', { textContent: icon });
                iconSpan.setAttribute('aria-hidden', 'true');
                applyStyles(iconSpan, {
                    width: '16px',
                    display: 'inline-flex',
                    justifyContent: 'center'
                });
                button.appendChild(iconSpan);
            }

            const labelSpan = createElement('span', { textContent: label });
            button.appendChild(labelSpan);

            let enabled = false;
            const controller = {
                element: button,
                isActionAvailable: typeof isActionAvailable === 'function' ? isActionAvailable : null,
                setEnabled(value) {
                    enabled = Boolean(value);
                    button.disabled = !enabled;
                    applyStyles(button, {
                        background: enabled ? CONFIG.colors.buttonEnabled : CONFIG.colors.buttonDisabled,
                        cursor: enabled ? 'pointer' : 'not-allowed',
                        opacity: enabled ? '1' : '0.5'
                    });
                }
            };

            const handleClick = (event) => {
                const actionAvailable = controller.isActionAvailable ? controller.isActionAvailable() : true;
                if (!enabled || !actionAvailable) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
                onClick(event);
            };

            button.addEventListener('click', handleClick);
            this.content.appendChild(button);

            controller.setEnabled(false);
            return controller;
        }
    }

    function createHelperPanel(parent) {
        if (state.helperPanel || !parent) {
            return state.helperPanel;
        }
        state.helperPanel = new HelperPanel(parent);
        return state.helperPanel;
    }

    const isProcessesContext = () => CONFIG.routes.processesHash.test(window.location.hash);

    const hasReadableRows = () => document.querySelectorAll(CONFIG.selectors.rows).length > 0;

    function isDetailsOrBusinessViewTab() {
        const labelElement = document.querySelector(CONFIG.selectors.selectedTabLabel);
        if (!labelElement || typeof labelElement.textContent !== 'string') {
            return false;
        }
        const text = labelElement.textContent.toLowerCase();
        return text.includes('details') || text.includes('business view');
    }

    const parseSubflRow = (row) => {
        return row.split('|').reduce((accumulator, part) => {
            const separatorIndex = part.indexOf(':');
            if (separatorIndex > -1) {
                const key = part.slice(0, separatorIndex).trim();
                const value = part.slice(separatorIndex + 1).trim();
                if (key) {
                    accumulator[key] = value;
                }
            }
            return accumulator;
        }, Object.create(null));
    };

    function buildElasticQuery(rows, fields = CONFIG.elastic.defaultFields) {
        const clauses = rows
            .map(parseSubflRow)
            .map((kv) => {
                const parts = fields
                    .map((field) => {
                        const value = kv[field];
                        if (!value) {
                            return null;
                        }
                        const normalizedField = field === '_UNIT' ? '_INSTITUTION' : field;
                        const normalizedValue = /:/.test(value) ? `"${value}"` : value;
                        return `BK.${normalizedField}:${normalizedValue}`;
                    })
                    .filter(Boolean);
                return parts.length > 0 ? `(${parts.join(' and ')})` : null;
            })
            .filter(Boolean);

        const baseQuery = `ScenarioName:${CONFIG.elastic.scenarioName} and Environment:${CONFIG.elastic.environment}`;
        if (clauses.length === 0) {
            return baseQuery;
        }
        return `${baseQuery} and ( ${clauses.join(' or ')} )`;
    }

    function collectSelectedMsgIds() {
        return Array.from(document.querySelectorAll(CONFIG.selectors.msgIdCells))
            .map((cell) => {
                const matches = Array.from(cell.innerText.matchAll(/_MSGID:\s*([^,]*)/g));
                if (!matches.length) {
                    return null;
                }
                return matches.map((match) => match[1].trim()).join('');
            })
            .filter(Boolean);
    }

    const hasSelectedMsgIds = () => collectSelectedMsgIds().length > 0;

    function normalizeList(value) {
        if (Array.isArray(value)) {
            return value.filter(Boolean);
        }
        if (typeof value === 'string') {
            return value.split(/\s*,\s*/).filter(Boolean);
        }
        return [];
    }

    async function openChangeVariablesPopup(row) {
        const processNameCell = row.querySelector(CONFIG.selectors.processNameCell);
        if (!processNameCell) {
            return null;
        }

        const contextMenuEvent = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 2
        });
        processNameCell.dispatchEvent(contextMenuEvent);

        const menuItem = Array.from(document.querySelectorAll(CONFIG.selectors.contextMenuItems))
            .find((element) => element.textContent.includes(CONFIG.labels.changeVariables));
        if (!menuItem) {
            return null;
        }

        menuItem.click();
        await waitForElement(CONFIG.selectors.popup);
        return document.querySelector(CONFIG.selectors.popup);
    }

    function extractBuKeysFromPopup(popup) {
        if (!popup) {
            return null;
        }
        const buKeyCell = Array.from(popup.querySelectorAll(CONFIG.selectors.popupKeyCell))
            .find((element) => element.textContent.includes(CONFIG.labels.buKeys));
        if (!buKeyCell) {
            return null;
        }
        const input = buKeyCell.nextElementSibling?.querySelector('input');
        return input?.value?.trim() || null;
    }

    async function closePopup(popup) {
        if (!popup) {
            return;
        }
        const cancelButton = Array.from(popup.querySelectorAll(CONFIG.selectors.popupCancelCell))
            .find((element) => element.textContent.includes(CONFIG.labels.cancel));
        if (!cancelButton) {
            return;
        }
        const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
        });
        cancelButton.dispatchEvent(clickEvent);
        await waitForElementRemoval(popup);
    }

    async function processRowForBuKeys(row) {
        const popup = await openChangeVariablesPopup(row);
        if (!popup) {
            return null;
        }
        const value = extractBuKeysFromPopup(popup);
        await closePopup(popup);
        return value;
    }

    async function getBuKeysArray() {
        const rows = Array.from(document.querySelectorAll(CONFIG.selectors.rows));
        const totalRows = rows.length;
        if (!totalRows) {
            return [];
        }

        let cancelled = false;
        let processedCount = 0;
        let progressToast = null;

        const cancelAction = {
            label: 'Cancel',
            ariaLabel: 'Cancel BuKey processing',
            onClick: () => {
                cancelled = true;
                if (progressToast) {
                    progressToast.update('Cancelling…');
                    progressToast.dismiss();
                }
            }
        };

        progressToast = showToast(`Processing row 1 of ${totalRows}…`, {
            type: 'info',
            persistent: true,
            actions: [cancelAction]
        });

        const buKeys = [];
        for (const [index, row] of rows.entries()) {
            if (cancelled) {
                break;
            }

            processedCount = index + 1;
            if (progressToast) {
                progressToast.update(`Processing row ${processedCount} of ${totalRows}…`);
            }

            const value = await processRowForBuKeys(row);
            if (cancelled) {
                break;
            }
            if (value) {
                buKeys.push(value);
            }
        }

        if (progressToast) {
            progressToast.dismiss();
        }

        if (cancelled) {
            showToast(`Cancelled after processing ${processedCount} of ${totalRows} rows.`, { type: 'warning' });
            return null;
        }

        return buKeys;
    }

    const pluralize = (word, count) => (count === 1 ? word : `${word}s`);

    async function copyBuKeys() {
        try {
            const buKeys = await getBuKeysArray();
            if (buKeys === null) {
                return;
            }
            const normalizedKeys = normalizeList(buKeys);
            if (!normalizedKeys.length) {
                showToast('No BuKeys found for the current rows.', { type: 'warning' });
                return;
            }
            await navigator.clipboard.writeText(normalizedKeys.join(','));
            const label = pluralize('BuKey', normalizedKeys.length);
            showToast(`Copied ${normalizedKeys.length} ${label} to the clipboard.`, { type: 'success' });
        } catch (error) {
            console.error('Failed to copy BuKeys', error);
            showToast('Failed to copy BuKeys. Check console for details.', { type: 'error' });
        }
    }

    async function copyElastic() {
        try {
            const buKeys = await getBuKeysArray();
            if (buKeys === null) {
                return;
            }
            const normalizedKeys = normalizeList(buKeys);
            if (!normalizedKeys.length) {
                showToast('No BuKeys available to build an Elastic query.', { type: 'warning' });
                return;
            }
            const query = buildElasticQuery(normalizedKeys);
            await navigator.clipboard.writeText(query);
            const label = pluralize('BuKey', normalizedKeys.length);
            showToast(`Copied Elastic query for ${normalizedKeys.length} ${label}.`, { type: 'success' });
        } catch (error) {
            console.error('Failed to copy Elastic query', error);
            showToast('Failed to copy the Elastic query. Check console for details.', { type: 'error' });
        }
    }

    async function copySelectedMsgIds() {
        const msgIds = collectSelectedMsgIds();
        if (!msgIds.length) {
            showToast('No MSGIDs selected. Hover or select rows first.', { type: 'warning' });
            return;
        }

        try {
            await navigator.clipboard.writeText(msgIds.join(', '));
            const label = pluralize('MSGID', msgIds.length);
            showToast(`Copied ${msgIds.length} ${label} to the clipboard.`, { type: 'success' });
        } catch (error) {
            console.error('Failed to copy MSGIDs', error);
            showToast('Failed to copy MSGIDs. Check console for details.', { type: 'error' });
        }
    }

    function addButton(parent, config) {
        const parentElement = typeof parent === 'string' ? document.querySelector(parent) : parent;
        const host = parentElement || document.body;
        const panel = createHelperPanel(host);
        if (!panel) {
            return null;
        }
        return panel.addButton(config);
    }

    function initializeHelperPanel() {
        waitForElement(CONFIG.selectors.buttonParent).then((parent) => {
            const host = document.body; // must be body due to iframe constraints
            const buttons = [
                addButton(host, { label: 'Copy Startup BuKeys', icon: '🔑', onClick: copyBuKeys }),
                addButton(host, { label: 'Copy Startup for Elastic', icon: '🧭', onClick: copyElastic }),
                addButton(host, {
                    label: 'Copy Selected MSGIDs',
                    icon: '📋',
                    onClick: copySelectedMsgIds,
                    isActionAvailable: hasSelectedMsgIds
                })
            ].filter(Boolean);

            if (!buttons.length) {
                return;
            }

            const updateButtonState = () => {
                const baseEnabled = isProcessesContext() && hasReadableRows() && isDetailsOrBusinessViewTab();
                buttons.forEach((button) => {
                    const actionAvailable = button.isActionAvailable ? button.isActionAvailable() : true;
                    button.setEnabled(baseEnabled && actionAvailable);
                });
            };

            window.addEventListener('hashchange', updateButtonState);
            document.addEventListener('visibilitychange', updateButtonState);

            const domObserver = new MutationObserver(updateButtonState);
            domObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class']
            });

            updateButtonState();
        });
    }

    console.log('Orchestra Helper Functions loaded');
    initializeHelperPanel();
})();
