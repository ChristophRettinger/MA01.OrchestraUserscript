// ==UserScript==
// @name         Orchestra Helper Functions
// @namespace    http://tampermonkey.net/
// @version      2025-10-22
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
            selectedTabLabel: '.mTabCaption-selected .mTabCaption-label',
            businessViewTabItems: '.gwt-TabBarItem',
            businessViewTabLabel: '.mTabCaption-label',
            businessViewTextBoxes: '.mListBox-textBox',
            businessViewListRows: 'tr.mListBox-list-row > td',
            businessViewAddButton: "img.img[src='images/add.png']",
            businessViewRemoveButton: "img.img[src='images/remove.png']",
            businessViewInputs: '.gwt-TextBox',
            businessViewSearchButtons: 'table.mButton div.mButton-label',
            scenarioDetailKeyCell: '.dialogTable-key',
            scenarioDetailValueCell: '.dialogTable-value',
            scenarioDetailCloseButton: '.windowButton-close'
        },
        routes: {
            processOverviewHash: '#scenario/processOverview/',
            processesHash: /#scenario\/.*\/processes\//
        },
        panel: {
            width: 200,
            headerText: 'Orchestra Tools',
            collapsedIcon: '🛠',
            collapsedSize: 26,
            zIndex: 2147483647
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

    const MSGID_LABELS = ['_MSGID', 'MSGID'];
    const BUSINESS_VIEW_LABELS = ['business view', 'business-ansicht', 'business ansicht', 'business - ansicht'];
    const BUSINESS_KEY_PLACEHOLDERS = ['please select a business key', 'bitte wählen sie einen business-schlüssel'];
    const CONNECTOR_AND_LABELS = ['and', 'und'];
    const CONNECTOR_OR_LABELS = ['or', 'oder'];
    const MSGID_SOURCE_LABELS = {
        selection: 'selected rows',
        scenarioDetail: 'scenario detail',
        clipboard: 'clipboard'
    };
    const MSGID_CLIPBOARD_PATTERN = /^\d{22}$/;
    const SEARCH_MSGID_LABELS = {
        default: 'Search MSGID',
        fromClipboard: 'Search MSGID (from clipboard)'
    };

    const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

    const dispatchMouseClick = (element) => {
        if (!element) {
            return;
        }
        element.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
        }));
    };

    function applyStyles(element, ...styles) {
        styles.filter(Boolean).forEach((style) => Object.assign(element.style, style));
    }

    // Drives the Business view UI to search for the resolved MSGID automatically.
    async function searchMsgIdInBusinessView() {
        try {
            const { msgIds, source } = await resolveMsgIds({ includeClipboard: true, closeScenarioDetail: true });
            if (!msgIds.length) {
                showToast('No MSGID available. Select a row, open the scenario detail, or copy an MSGID first.', { type: 'warning' });
                return;
            }

            const msgId = msgIds[0];
            try {
                await navigator.clipboard.writeText(msgId);
            } catch (clipboardError) {
                console.warn('Unable to update clipboard before Business view search', clipboardError);
            }

            const businessViewReady = await ensureBusinessViewTabSelected();
            if (!businessViewReady) {
                showToast('Business view tab is not available on this page.', { type: 'error' });
                return;
            }

            const selectorsReady = await ensureBusinessViewKeySelectors();
            await ensureBusinessViewConnectorIsOr();

            if (!selectorsReady) {
                showToast('Business view key selection could not be fully automated. Please verify the filters.', { type: 'warning' });
            }

            if (!fillBusinessViewInputs(msgId)) {
                showToast('Failed to locate the Business view input fields.', { type: 'error' });
                return;
            }

            if (!triggerBusinessViewSearch()) {
                showToast('Could not trigger the Business view search button.', { type: 'error' });
                return;
            }

            const sourceLabel = source ? MSGID_SOURCE_LABELS[source] : 'current context';
            showToast(`Searching Business view for MSGID ${msgId} (${sourceLabel}).`, { type: 'success' });
        } catch (error) {
            console.error('Failed to search MSGID in Business view', error);
            showToast('Failed to search the Business view. Check console for details.', { type: 'error' });
        }
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

    const isScenarioDetailContext = () => window.location.href.includes('/processes/runtime/');

    function collectScenarioDetailMsgIds({ closeAfterExtraction = false } = {}) {
        if (!isScenarioDetailContext()) {
            return [];
        }

        const rows = Array.from(document.querySelectorAll(CONFIG.selectors.scenarioDetailKeyCell))
            .filter((cell) => MSGID_LABELS.includes(cell.textContent?.trim()));

        if (!rows.length) {
            return [];
        }

        const msgIds = rows
            .map((cell) => cell.parentElement?.querySelector(CONFIG.selectors.scenarioDetailValueCell)?.textContent?.trim())
            .filter(Boolean);

        if (msgIds.length && closeAfterExtraction) {
            const closeButton = document.querySelector(CONFIG.selectors.scenarioDetailCloseButton);
            if (closeButton) {
                dispatchMouseClick(closeButton);
            }
        }

        return msgIds;
    }

    const clipboardState = {
        isSupported: typeof navigator?.clipboard?.readText === 'function',
        isBlocked: false,
        hasLoggedError: false
    };

    function handleClipboardReadError(error) {
        clipboardState.isBlocked = true;
        if (!clipboardState.hasLoggedError) {
            console.warn('Unable to read MSGID from clipboard', error);
            clipboardState.hasLoggedError = true;
        }
    }

    async function readMsgIdsFromClipboard({ ignoreBlocked = false } = {}) {
        if (!clipboardState.isSupported) {
            return [];
        }

        if (clipboardState.isBlocked && !ignoreBlocked) {
            return [];
        }

        try {
            const clipboardText = await navigator.clipboard.readText();
            if (!clipboardText) {
                clipboardState.isBlocked = false;
                return [];
            }

            clipboardState.isBlocked = false;
            return clipboardText
                .split(/[\s,;]+/)
                .map((value) => value.trim())
                .filter((value) => MSGID_CLIPBOARD_PATTERN.test(value));
        } catch (error) {
            handleClipboardReadError(error);
            return [];
        }
    }

    // Resolves MSGID candidates by checking the selection, the scenario detail dialog, and finally the clipboard.
    async function resolveMsgIds({ includeClipboard = true, closeScenarioDetail = false } = {}) {
        const selectedMsgIds = collectSelectedMsgIds();
        if (selectedMsgIds.length) {
            return { msgIds: selectedMsgIds, source: 'selection' };
        }

        const detailMsgIds = collectScenarioDetailMsgIds({ closeAfterExtraction: closeScenarioDetail });
        if (detailMsgIds.length) {
            return { msgIds: detailMsgIds, source: 'scenarioDetail' };
        }

        if (includeClipboard) {
            const clipboardMsgIds = await readMsgIdsFromClipboard({ ignoreBlocked: true });
            if (clipboardMsgIds.length) {
                return { msgIds: clipboardMsgIds, source: 'clipboard' };
            }
        }

        return { msgIds: [], source: null };
    }

    const normalizeText = (value) => value?.toLowerCase().trim() ?? '';

    const isBusinessViewTabSelected = () => {
        const labelElement = document.querySelector(CONFIG.selectors.selectedTabLabel);
        if (!labelElement) {
            return false;
        }
        const text = normalizeText(labelElement.textContent);
        return BUSINESS_VIEW_LABELS.some((label) => text.includes(label));
    };

    async function ensureBusinessViewTabSelected() {
        if (isBusinessViewTabSelected()) {
            return true;
        }

        const candidate = Array.from(document.querySelectorAll(CONFIG.selectors.businessViewTabItems))
            .find((item) => {
                const label = item.querySelector(CONFIG.selectors.businessViewTabLabel);
                return label && BUSINESS_VIEW_LABELS.some((value) => normalizeText(label.textContent).includes(value));
            });

        if (!candidate) {
            return false;
        }

        dispatchMouseClick(candidate);
        await delay(150);
        return isBusinessViewTabSelected();
    }

    const getBusinessViewTextBoxes = () => Array.from(document.querySelectorAll(CONFIG.selectors.businessViewTextBoxes));

    function selectBusinessViewOption(possibleLabels) {
        const options = Array.from(document.querySelectorAll(CONFIG.selectors.businessViewListRows));
        const normalizedTargets = possibleLabels.map((label) => label.toLowerCase());
        const match = options.find((option) => normalizedTargets.includes(normalizeText(option.textContent)));
        if (!match) {
            return false;
        }
        dispatchMouseClick(match);
        return true;
    }

    function selectFirstAvailableBusinessOption() {
        const firstOption = document.querySelector(CONFIG.selectors.businessViewListRows);
        if (!firstOption) {
            return false;
        }
        dispatchMouseClick(firstOption);
        return true;
    }

    // Ensures the Business view has MSGID selectors prepared so the automatic search can run.
    async function ensureBusinessViewKeySelectors() {
        const removeButton = document.querySelector(CONFIG.selectors.businessViewRemoveButton);
        if (!removeButton) {
            const addButton = document.querySelector(CONFIG.selectors.businessViewAddButton);
            if (addButton) {
                dispatchMouseClick(addButton);
                await delay(100);
            }
        }

        const textBoxes = getBusinessViewTextBoxes();
        const pendingBoxes = textBoxes.filter((element) => {
            const text = normalizeText(element.textContent);
            return BUSINESS_KEY_PLACEHOLDERS.some((placeholder) => text.includes(placeholder));
        });

        let allConfigured = true;
        for (let index = 0; index < pendingBoxes.length; index += 1) {
            const element = pendingBoxes[index];
            dispatchMouseClick(element);
            await delay(100);

            const targetLabel = index === 1 ? 'MSGID' : '_MSGID';
            if (selectBusinessViewOption([targetLabel])) {
                continue;
            }

            const fallbackRemoved = index === 1 && selectBusinessViewOption(MSGID_LABELS);
            if (fallbackRemoved) {
                continue;
            }

            const remove = document.querySelector(CONFIG.selectors.businessViewRemoveButton);
            if (remove) {
                dispatchMouseClick(remove);
            } else {
                selectFirstAvailableBusinessOption();
            }
            allConfigured = false;
        }

        return allConfigured;
    }

    async function ensureBusinessViewConnectorIsOr() {
        const connector = getBusinessViewTextBoxes().find((element) => {
            const text = normalizeText(element.textContent);
            return CONNECTOR_AND_LABELS.includes(text);
        });

        if (!connector) {
            return;
        }

        dispatchMouseClick(connector);
        await delay(100);
        if (!selectBusinessViewOption(CONNECTOR_OR_LABELS)) {
            selectFirstAvailableBusinessOption();
        }
    }

    function fillBusinessViewInputs(value) {
        const inputs = Array.from(document.querySelectorAll(CONFIG.selectors.businessViewInputs));
        if (!inputs.length) {
            return false;
        }

        inputs.forEach((input) => {
            input.focus();
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });

        return true;
    }

    function triggerBusinessViewSearch() {
        const button = Array.from(document.querySelectorAll(CONFIG.selectors.businessViewSearchButtons))
            .find((element) => {
                const text = normalizeText(element.textContent);
                return text === 'search' || text === 'suchen';
            });

        if (!button) {
            return false;
        }

        const host = button.closest('table.mButton');
        if (!host) {
            return false;
        }

        dispatchMouseClick(host);
        return true;
    }

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
                // Keep the helper panel above modal overlays such as the scenario detail window.
                position: 'absolute',
                top: '5px',
                right: '5px',
                zIndex: String(CONFIG.panel.zIndex),
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
                },
                setLabel(value) {
                    if (typeof value === 'string') {
                        labelSpan.textContent = value;
                    }
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
        return text.includes('details') || BUSINESS_VIEW_LABELS.some((label) => text.includes(label));
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

    const hasMsgIdSource = () => {
        if (collectSelectedMsgIds().length > 0) {
            return true;
        }
        if (collectScenarioDetailMsgIds().length > 0) {
            return true;
        }
        return typeof navigator !== 'undefined' && Boolean(navigator.clipboard);
    };

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
        try {
            const { msgIds, source } = await resolveMsgIds({ includeClipboard: true, closeScenarioDetail: true });
            if (!msgIds.length) {
                showToast('No MSGID available. Select a row, open the scenario detail, or copy an MSGID first.', { type: 'warning' });
                return;
            }

            await navigator.clipboard.writeText(msgIds.join(', '));

            const label = pluralize('MSGID', msgIds.length);
            if (source === 'clipboard') {
                showToast(`Clipboard already contained ${msgIds.length} ${label}.`, { type: 'info' });
                return;
            }

            const sourceLabel = source ? MSGID_SOURCE_LABELS[source] : 'current context';
            showToast(`Copied ${msgIds.length} ${label} from the ${sourceLabel} to the clipboard.`, { type: 'success' });
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
            const copyStartupBuKeysButton = addButton(host, {
                label: 'Copy Startup BuKeys',
                icon: '🔑',
                onClick: copyBuKeys
            });
            const copyElasticButton = addButton(host, {
                label: 'Copy Startup for Elastic',
                icon: '🧭',
                onClick: copyElastic
            });
            const copyMsgIdsButton = addButton(host, {
                label: 'Copy MSGIDs',
                icon: '📋',
                onClick: copySelectedMsgIds,
                isActionAvailable: hasMsgIdSource
            });
            const searchMsgIdButton = addButton(host, {
                label: SEARCH_MSGID_LABELS.default,
                icon: '🔎',
                onClick: searchMsgIdInBusinessView,
                isActionAvailable: hasMsgIdSource
            });

            const buttons = [
                copyStartupBuKeysButton,
                copyElasticButton,
                copyMsgIdsButton,
                searchMsgIdButton
            ].filter(Boolean);

            if (!buttons.length) {
                return;
            }

            // Reflect whether a valid clipboard MSGID is available directly in the button caption.
            const updateSearchButtonLabel = async () => {
                if (!searchMsgIdButton?.setLabel) {
                    return;
                }
                if (!navigator?.clipboard?.readText) {
                    searchMsgIdButton.setLabel(SEARCH_MSGID_LABELS.default);
                    return;
                }

                try {
                    const clipboardMsgIds = await readMsgIdsFromClipboard();
                    const label = clipboardMsgIds.length
                        ? SEARCH_MSGID_LABELS.fromClipboard
                        : SEARCH_MSGID_LABELS.default;
                    searchMsgIdButton.setLabel(label);
                } catch (error) {
                    searchMsgIdButton.setLabel(SEARCH_MSGID_LABELS.default);
                }
            };

            const updateButtonState = async () => {
                const baseEnabled = isProcessesContext() && hasReadableRows() && isDetailsOrBusinessViewTab();
                buttons.forEach((button) => {
                    const actionAvailable = button.isActionAvailable ? button.isActionAvailable() : true;
                    button.setEnabled(baseEnabled && actionAvailable);
                });
                await updateSearchButtonLabel();
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
