// ==UserScript==
// @name         Orchestra Helper Functions
// @namespace    http://tampermonkey.net/
// @version      2025-10-22
// @description  try to take over the world!
// @author       Christoph Rettinger
// @match        https://*.esb.wienkav.at:*/orchestra/*
// @match        https://*.wien.gv.at:*/orchestra/*
// @match        https://*.routine.akhwien.at:*/orchestra/*
// @match        https://*.esb.akhwien.at:*/orchestra/*
// @match        https://*.esb.magwien.gv.at:*/orchestra/*
// @match 		 https://*.wien.at/orchestra/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=wien.at
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        selectors: {
            buttonParent: '.header-holder',
            body: 'body',
            rows: '.scenarioChooser-content .mTable-data > tbody > tr:not(:first-child)',
            msgIdCells: 'div.gwt-TabPanelBottom>div:not([aria-hidden="true"]) .mTable-row-hover .mTable-data-cell,     div.gwt-TabPanelBottom>div:not([aria-hidden="true"]) .mTable-row-selected .mTable-data-cell',
            msgIdRows: 'div.gwt-TabPanelBottom>div:not([aria-hidden="true"]) .mTable-row-hover,     div.gwt-TabPanelBottom>div:not([aria-hidden="true"]) .mTable-row-selected',
            processNameCell: 'td:nth-child(6)',
            contextMenuItems: '.contextMenuPopup td.menuItem',
            popup: '.gwt-DecoratedPopupPanel',
            popupKeyCell: '.gwt-TabPanelBottom td.dialogTable-key',
            popupCancelCell: '.mButtonBar td.middleCenter',
            selectedTabLabel: '.mTabCaption-selected .mTabCaption-label',
            businessViewTabItems: '.gwt-TabBarItem',
            businessViewTabLabel: '.mTabCaption-label',
            businessViewTextBoxes: 'tr:nth-child(4) .mListBox-textBox',
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
            width: 275,
            headerText: 'Orchestra Tools',
            collapsedIcon: '🛠',
            collapsedSize: 26,
            zIndex: 2147483647
        },
        colors: {
            buttonEnabled: '#cbe5ff',
            buttonDisabled: '#d6d6d6',
            toggleExpanded: '#1565c0',
            toggleExpandedText: '#ffffff',
            toggleCollapsed: '#eceff1',
            toggleCollapsedText: '#111111'
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

    const MSGID_LABELS = ['_MSGID'];
    // The MSGID value is always stored in column 9 (1-based) of the process tables.
    const MSGID_COLUMN_INDEX = 9;
    const BUSINESS_VIEW_LABELS = ['business view', 'business-ansicht', 'business ansicht', 'business - ansicht'];
    const BUSINESS_KEY_PLACEHOLDERS = ['please select a business key', 'bitte wählen sie einen business-schlüssel'];
    const CONNECTOR_AND_LABELS = ['and', 'und'];
    const CONNECTOR_OR_LABELS = ['or', 'oder'];
    const SCENARIO_NAME_HEADER = 'Scenario name';
    const PROCESS_NAME_HEADER = 'Process name';
    const MSGID_SOURCE_LABELS = {
        clipboard: 'clipboard',
        selection: 'selected rows',
        scenarioDetail: 'scenario detail'
    };
    const SEARCH_MSGID_LABEL = 'Search MSGID';

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
    async function searchMsgIdsInBusinessView(msgIds, sourceLabel) {
        try {
            if (!Array.isArray(msgIds) || msgIds.length === 0) {
                showToast('Provide at least one MSGID before triggering the Business view search.', { type: 'warning' });
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

            const filtersReady = await prepareBusinessViewMsgIdFilter(msgIds);

            if (!filtersReady) {
                showToast('Business view filter could not be fully automated. Please verify the MSGID selection and input.', { type: 'warning' });
                return;
            }

            if (!triggerBusinessViewSearch()) {
                showToast('Could not trigger the Business view search button.', { type: 'error' });
                return;
            }

            const origin = sourceLabel || MSGID_SOURCE_LABELS.selection;
            showToast(`Searching Business view for MSGID ${msgId} (${origin}).`, { type: 'success' });
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

    // Ensures value lists keep a stable order while removing duplicates.
    function ensureUniqueValues(values) {
        const seen = new Set();
        return values.filter((value) => {
            if (value == null) {
                return false;
            }
            if (seen.has(value)) {
                return false;
            }
            seen.add(value);
            return true;
        });
    }

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

        const uniqueMsgIds = ensureUniqueValues(msgIds);

        if (uniqueMsgIds.length && closeAfterExtraction) {
            const closeButton = document.querySelector(CONFIG.selectors.scenarioDetailCloseButton);
            if (closeButton) {
                dispatchMouseClick(closeButton);
            }
        }

        return uniqueMsgIds;
    }

    // Resolves MSGID candidates by checking the selection and the scenario detail dialog.
    async function resolveMsgIds({ closeScenarioDetail = false } = {}) {
        const selectedMsgIds = collectSelectedMsgIds();
        if (selectedMsgIds.length) {
            return { msgIds: selectedMsgIds, source: 'selection' };
        }

        const detailMsgIds = collectScenarioDetailMsgIds({ closeAfterExtraction: closeScenarioDetail });
        if (detailMsgIds.length) {
            return { msgIds: detailMsgIds, source: 'scenarioDetail' };
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
    // Configures the Business view to search for the first available MSGID by resetting filters and filling the input.
    async function prepareBusinessViewMsgIdFilter(msgIds) {
        const msgId = msgIds?.[0];
        if (!msgId) {
            return false;
        }

        // Remove existing filters; the UI always leaves one row, so we avoid adding new ones afterwards.
        while (true) {
            const removeButton = document.querySelector(CONFIG.selectors.businessViewRemoveButton);
            if (!removeButton) {
                break;
            }
            dispatchMouseClick(removeButton);
            await delay(100);
        }

        const keySelectors = getBusinessViewTextBoxes();
        const keyBox = keySelectors.find((element) => {
            const text = element.textContent;
            return BUSINESS_KEY_PLACEHOLDERS.some((placeholder) => text.includes(placeholder)) || MSGID_LABELS.includes(text);
        }) ?? keySelectors[0];

        if (!keyBox) {
            return false;
        }

        const currentKey = keyBox.textContent;
        let keySelected = MSGID_LABELS.includes(currentKey);
        if (!keySelected){
            dispatchMouseClick(keyBox);
            await delay(100);
            keySelected= selectBusinessViewOption(MSGID_LABELS);
            dispatchMouseClick(document.body);
            await delay(100);
        }

        const inputs = Array.from(document.querySelectorAll(CONFIG.selectors.businessViewInputs));
        if (!inputs.length) {
            return false;
        }

        inputs.forEach((input) => {
            input.focus();
            input.value = msgId;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });

        return keySelected;
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
                    background: CONFIG.colors.toggleExpanded,
                    color: CONFIG.colors.toggleExpandedText,
                    border: '1px solid black',
                    padding: '2px 4px',
                    fontSize: '12px',
                    display: 'block',
                    width: '100%',
                    height: 'auto',
                    borderRadius: '0',
                    margin: '0'
                });
                this.toggleButton.textContent = CONFIG.panel.collapsedIcon;
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
                    background: CONFIG.colors.toggleCollapsed,
                    color: CONFIG.colors.toggleCollapsedText,
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
            applyStyles(labelSpan, {
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
            });
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

        addActionGroup({ label, icon, defaultOptionId, options, isActionAvailable, isEnabled }) {
            if (!Array.isArray(options) || options.length === 0) {
                throw new TypeError('options must be a non-empty array.');
            }

            const host = createElement('div');
            applyStyles(host, {
                display: 'flex',
                gap: '4px',
                position: 'relative',
                alignItems: 'stretch'
            });

            const optionMap = new Map();
            options.forEach((option, index) => {
                const optionId = option.id ?? `option-${index}`;
                optionMap.set(optionId, { ...option, id: optionId });
            });

            let currentDefault = optionMap.get(defaultOptionId) || optionMap.values().next().value;

            const mainButton = createElement('button', {
                attributes: { type: 'button' }
            });
            applyStyles(mainButton, {
                border: '1px solid black',
                padding: '4px 6px',
                textAlign: 'left',
                borderRadius: '2px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                justifyContent: 'flex-start',
                fontFamily: 'inherit',
                fontSize: '12px',
                flex: '1'
            });

            const labelWrapper = createElement('div');
            applyStyles(labelWrapper, {
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                minWidth: '0'
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

            const labelSpan = createElement('span', { textContent: label });
            applyStyles(labelSpan, {
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
            });
            labelWrapper.appendChild(labelSpan);
            const defaultLabelSpan = createElement('span', { textContent: '' });
            applyStyles(defaultLabelSpan, {
                fontSize: '11px',
                color: '#424242',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
            });
            labelWrapper.appendChild(defaultLabelSpan);
            mainButton.appendChild(labelWrapper);

            const dropdownToggle = createElement('button', { textContent: '⋯', attributes: { type: 'button' } });
            applyStyles(dropdownToggle, {
                border: '1px solid black',
                padding: '4px',
                width: '28px',
                borderRadius: '2px',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold'
            });

            const dropdown = createElement('div');
            applyStyles(dropdown, {
                position: 'absolute',
                top: '100%',
                right: '0',
                display: 'none',
                flexDirection: 'column',
                background: '#ffffff',
                border: '1px solid black',
                borderRadius: '2px',
                padding: '4px',
                gap: '4px',
                minWidth: '180px',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)',
                zIndex: String(Number(CONFIG.panel.zIndex) + 1)
            });

            let dropdownOpen = false;

            const setDefaultOption = (option) => {
                currentDefault = option;
                defaultLabelSpan.textContent = option?.label ? `(${option.label})` : '';
            };

            const closeDropdown = () => {
                dropdownOpen = false;
                dropdown.style.display = 'none';
            };

            const toggleDropdown = () => {
                dropdownOpen = !dropdownOpen;
                dropdown.style.display = dropdownOpen ? 'flex' : 'none';
            };

            const handleOutsideClick = (event) => {
                if (!dropdownOpen) {
                    return;
                }
                if (host.contains(event.target)) {
                    return;
                }
                closeDropdown();
            };

            document.addEventListener('click', handleOutsideClick);

            const runOption = (option) => {
                if (!option || typeof option.onSelect !== 'function') {
                    return;
                }
                if (!enabled || (controller.isActionAvailable && !controller.isActionAvailable())) {
                    return;
                }
                setDefaultOption(option);
                closeDropdown();
                option.onSelect();
            };

            options.forEach((option, index) => {
                const optionId = option.id ?? `option-${index}`;
                const optionButton = createElement('button', {
                    textContent: option.label,
                    attributes: { type: 'button', 'data-option-id': optionId }
                });
                applyStyles(optionButton, {
                    border: '1px solid black',
                    padding: '4px 6px',
                    textAlign: 'left',
                    borderRadius: '2px',
                    fontFamily: 'inherit',
                    fontSize: '12px',
                    background: '#f5f5f5',
                    whiteSpace: 'nowrap'
                });
                optionButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    const currentOption = optionMap.get(optionId);
                    runOption(currentOption);
                });
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
                isActionAvailable: typeof isActionAvailable === 'function' ? isActionAvailable : null,
                isEnabled: typeof isEnabled === 'function' ? isEnabled : null,
                setEnabled(value) {
                    enabled = Boolean(value);
                    const baseStyles = {
                        background: enabled ? CONFIG.colors.buttonEnabled : CONFIG.colors.buttonDisabled,
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

            setDefaultOption(currentDefault);
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

    const isScenarioRootContext = () => {
        const hash = window.location.hash || '';
        if (!hash.startsWith('#scenario/')) {
            return false;
        }
        if (hash.startsWith(CONFIG.routes.processOverviewHash)) {
            return false;
        }
        return !CONFIG.routes.processesHash.test(hash);
    };

    const hasReadableRows = () => document.querySelectorAll(CONFIG.selectors.rows).length > 0;

    function getSelectedTabLabel() {
        const labelElement = document.querySelector(CONFIG.selectors.selectedTabLabel);
        if (!labelElement || typeof labelElement.textContent !== 'string') {
            return '';
        }
        return labelElement.textContent.toLowerCase();
    }

    function isDetailsOrBusinessViewTab() {
        const text = getSelectedTabLabel();
        if (!text) {
            return false;
        }
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
        const msgIds = getSelectedRows()
            .map((row) => getColumnCell(row, MSGID_COLUMN_INDEX))
            .flatMap((cell) => {
                const text = cell?.innerText || '';
                const matches = Array.from(text.matchAll(/_MSGID:\s*([^,]*)/g));
                if (!matches.length) {
                    return [];
                }
                return matches.map((match) => match[1].trim()).filter(Boolean);
            });

        return ensureUniqueValues(msgIds);
    }

    function parseClipboardMsgIds(text) {
        if (typeof text !== 'string') {
            return [];
        }
        return ensureUniqueValues(
            text
                .split(/[,;\s\n\t]+/)
                .map((entry) => entry.trim())
                .filter(Boolean)
        );
    }

    const getMsgIdsFromSelection = () => collectSelectedMsgIds();

    async function getMsgIdsFromClipboard() {
        try {
            const clipboardText = await navigator.clipboard.readText();
            return parseClipboardMsgIds(clipboardText);
        } catch (error) {
            console.error('Unable to read MSGID from clipboard', error);
            showToast('Could not read MSGID from the clipboard. Allow clipboard permissions and try again.', { type: 'error' });
            return [];
        }
    }

    const hasMsgIdSource = () => {
        if (collectSelectedMsgIds().length > 0) {
            return true;
        }

        if (getSelectedRows().length > 0) {
            return true;
        }

        return collectScenarioDetailMsgIds().length > 0;
    };

    const canCopyScenarioNames = () => {
        const context = resolveScenarioCopyContext();
        if (!context) {
            return false;
        }
        return getSelectedRows().length > 0;
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

    const getSelectedRows = () => Array.from(document.querySelectorAll(CONFIG.selectors.msgIdRows));

    // Business key values are embedded in the MSGID column (column 9) as "Key: Value, Other_Key: Value" with values that may contain commas or colons.
    // Keys start with an underscore or uppercase letter and always include at least one underscore.
    const BUSINESS_KEY_PATTERN = /(_[A-Z_][A-Z0-9_]*|[A-Z]+_[a-z0-9_]+): */g;

    const getColumnCell = (row, columnIndex) => {
        if (!row) {
            return null;
        }
        const cells = Array.from(row.querySelectorAll('.mTable-data-cell, td'));
        return cells[columnIndex - 1] || null;
    };

    const findMsgIdCell = (row) => {
        return getColumnCell(row, MSGID_COLUMN_INDEX);
    };

    const parseBusinessKeyCell = (text) => {
        const data = Object.create(null);
        if (typeof text !== 'string' || !text.trim()) {
            return data;
        }

        BUSINESS_KEY_PATTERN.lastIndex = 0;
        const matches = [];
        let match;
        while ((match = BUSINESS_KEY_PATTERN.exec(text)) !== null) {
            matches.push({
                key: match[1],
                index: match.index,
                length: match[0].length
            });
        }

        matches.forEach((entry, index) => {
            const valueStart = entry.index + entry.length;
            const valueEnd = index < matches.length - 1 ? matches[index + 1].index : text.length;
            const rawValue = text.slice(valueStart, valueEnd);
            const normalized = rawValue.replace(/^[\s,]+|[\s,]+$/g, '');
            if (entry.key && normalized) {
                data[entry.key] = normalized;
            }
        });

        return data;
    };

    function extractBusinessKeyRow(row) {
        const sourceCell = findMsgIdCell(row);
        const text = sourceCell?.textContent || row?.innerText || '';
        return parseBusinessKeyCell(text);
    }

    function collectBusinessKeyRows() {
        const rows = getSelectedRows();
        return rows
            .map(extractBusinessKeyRow)
            .filter((row) => Object.keys(row).length > 0);
    }

    const collectHeaders = (rows) => {
        const headers = ensureUniqueValues(rows.flatMap((row) => Object.keys(row || {})));
        const msgIdIndex = headers.indexOf('_MSGID');
        if (msgIdIndex > 0) {
            headers.splice(msgIdIndex, 1);
            headers.unshift('_MSGID');
        }
        return headers;
    };

    const needsQuotes = (value, separator) => {
        return new RegExp(`[\"${separator}\n]`).test(value);
    };

    const escapeValue = (value, separator, quoteValues = false) => {
        const normalized = value == null ? '' : String(value);
        if (!quoteValues) {
            return normalized;
        }
        if (!needsQuotes(normalized, separator)) {
            return normalized;
        }
        const escaped = normalized.replace(/\"/g, '""');
        return `"${escaped}"`;
    };

    function formatRows(rows, separator, quoteValues) {
        if (!Array.isArray(rows) || rows.length === 0) {
            return '';
        }

        const headers = collectHeaders(rows);
        if (!headers.length) {
            return '';
        }

        const lines = [headers.join(separator)];
        rows.forEach((row) => {
            const line = headers
                .map((header) => escapeValue(row[header], separator, quoteValues))
                .join(separator);
            lines.push(line);
        });
        return lines.join('\n');
    }

    const formatRowsAsCsv = (rows) => formatRows(rows, ';', true);
    const formatRowsAsTab = (rows) => formatRows(rows, '\t', false);

    // List format repeats a header line per column group; plain format omits the headers.
    function formatRowsAsLists(rows, { includeHeader = true } = {}) {
        const headers = collectHeaders(rows);
        if (!headers.length) {
            return '';
        }

        const lines = headers.map((header) => {
            const values = rows
                .map((row) => row[header])
                .filter(Boolean);
            const listValues = ensureUniqueValues(values).join(', ');
            return includeHeader ? `${header}\n${listValues}` : listValues;
        });

        return lines.join('\n\n');
    }

    const formatRowsAsPlainLists = (rows) => formatRowsAsLists(rows, { includeHeader: false });

    // Scenario name copy helpers adapt to the current tab and table layout, including Business view.
    const SCENARIO_DETAIL_COLUMNS = [
        { index: 8, header: SCENARIO_NAME_HEADER },
        { index: 6, header: PROCESS_NAME_HEADER }
    ];
    const SCENARIO_COPY_CONTEXTS = {
        scenarioOverview: {
            label: 'Scenario overview (Overview tab)',
            columns: [{ index: 5, header: SCENARIO_NAME_HEADER }]
        },
        processOverview: {
            label: 'Process overview (Overview tab)',
            columns: [{ index: 4, header: SCENARIO_NAME_HEADER }]
        },
        processDetails: {
            label: 'Process details (Details tab)',
            columns: SCENARIO_DETAIL_COLUMNS
        },
        processBusinessView: {
            label: 'Process details (Business view tab)',
            columns: SCENARIO_DETAIL_COLUMNS
        }
    };

    const getRowCellText = (row, columnIndex) => {
        if (!row || !Number.isInteger(columnIndex)) {
            return '';
        }
        const cells = Array.from(row.querySelectorAll('td, .mTable-data-cell'));
        const cell = cells[columnIndex - 1];
        return cell?.textContent?.trim() || '';
    };

    const isOverviewTabSelected = () => getSelectedTabLabel().includes('overview');
    const isDetailsTabSelected = () => getSelectedTabLabel().includes('details');

    function resolveScenarioCopyContext() {
        if (isOverviewTabSelected()) {
            if (isScenarioRootContext()) {
                return SCENARIO_COPY_CONTEXTS.scenarioOverview;
            }
            if (window.location.hash?.startsWith(CONFIG.routes.processOverviewHash) || isProcessesContext()) {
                return SCENARIO_COPY_CONTEXTS.processOverview;
            }
        }

        if (isDetailsTabSelected() && isProcessesContext()) {
            return SCENARIO_COPY_CONTEXTS.processDetails;
        }

        if (isBusinessViewTabSelected() && isProcessesContext()) {
            return SCENARIO_COPY_CONTEXTS.processBusinessView;
        }

        return null;
    }

    function collectScenarioNameRows() {
        const context = resolveScenarioCopyContext();
        if (!context) {
            return null;
        }
        const rows = getSelectedRows();
        if (!rows.length) {
            return [];
        }

        const scenarioHeader = SCENARIO_NAME_HEADER;
        return rows
            .map((row) => {
                const scenarioName = getRowCellText(row, context.columns[0].index);
                if (!scenarioName) {
                    return null;
                }
                const rowData = { [scenarioHeader]: scenarioName };
                context.columns.slice(1).forEach((column) => {
                    rowData[column.header] = getRowCellText(row, column.index);
                });
                return rowData;
            })
            .filter(Boolean);
    }

    const formatMsgIdsAsCsv = (msgIds) => {
        if (!msgIds.length) {
            return '';
        }
        const lines = ['MSGID', ...msgIds];
        return lines.join('\n');
    };

    const formatMsgIdsAsList = (msgIds, { includeHeader = true } = {}) => {
        if (!msgIds.length) {
            return '';
        }
        const listValues = msgIds.join(', ');
        return includeHeader ? `MSGID\n${listValues}` : listValues;
    };

    const formatMsgIdsAsPlain = (msgIds) => formatMsgIdsAsList(msgIds, { includeHeader: false });

    const formatMsgIdsAsTab = (msgIds) => {
        if (!msgIds.length) {
            return '';
        }
        return ['MSGID', ...msgIds].join('\n');
    };

    const formatMsgIdsAsElastic = (msgIds) => {
        const clauses = msgIds.map((msgId) => `BusinessCaseId:${msgId}`);
        return clauses.length ? `(${clauses.join(' or ')})` : '';
    };

    async function copyScenarioNames(formatter, label) {
        try {
            const rows = collectScenarioNameRows();
            if (rows === null) {
                showToast('Scenario names can only be copied from the Overview, Details, or Business view tabs.', { type: 'warning' });
                return;
            }
            if (!rows.length) {
                showToast('Select at least one row to copy scenario names.', { type: 'warning' });
                return;
            }
            const content = formatter(rows);
            if (!content) {
                showToast('No scenario names found in the selected rows.', { type: 'warning' });
                return;
            }
            await navigator.clipboard.writeText(content);
            showToast(`Copied scenario names ${label}.`, { type: 'success' });
        } catch (error) {
            console.error('Failed to copy scenario names', error);
            showToast('Failed to copy scenario names. Check console for details.', { type: 'error' });
        }
    }

    const copyScenarioNamesAsCsv = () => copyScenarioNames(formatRowsAsCsv, 'as CSV');
    const copyScenarioNamesAsTab = () => copyScenarioNames(formatRowsAsTab, 'as a table');
    const copyScenarioNamesAsList = () => copyScenarioNames(formatRowsAsLists, 'as a list');
    const copyScenarioNamesAsPlain = () => copyScenarioNames(formatRowsAsPlainLists, 'as a plain list');

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
        // Snapshot the currently selected rows up front so later context menu interactions
        // cannot change which records get processed.
        const rows = getSelectedRows().map((row, index) => ({ element: row, index }));
        const totalRows = rows.length;
        if (!totalRows) {
            showToast('Select at least one row before extracting startup info.', { type: 'warning' });
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
        for (const [index, rowData] of rows.entries()) {
            if (cancelled) {
                break;
            }

            processedCount = index + 1;
            if (progressToast) {
                progressToast.update(`Processing row ${processedCount} of ${totalRows}…`);
            }

            const value = await processRowForBuKeys(rowData.element);
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

    async function ensureMsgIdsAvailable(getter, { emptyMessage, sourceLabel }) {
        const msgIds = await getter();
        const normalized = ensureUniqueValues(msgIds);
        if (!normalized.length) {
            showToast(emptyMessage, { type: 'warning' });
            return null;
        }
        return { msgIds: normalized, sourceLabel };
    }

    async function searchMsgIdFromSelection() {
        const result = await ensureMsgIdsAvailable(getMsgIdsFromSelection, {
            emptyMessage: 'Select at least one row before searching for an MSGID.',
            sourceLabel: MSGID_SOURCE_LABELS.selection
        });

        if (!result) {
            return;
        }

        await searchMsgIdsInBusinessView(result.msgIds, result.sourceLabel);
    }

    async function searchMsgIdFromClipboard() {
        const result = await ensureMsgIdsAvailable(getMsgIdsFromClipboard, {
            emptyMessage: 'Clipboard does not contain a valid MSGID yet.',
            sourceLabel: MSGID_SOURCE_LABELS.clipboard
        });

        if (!result) {
            return;
        }

        await searchMsgIdsInBusinessView(result.msgIds, result.sourceLabel);
    }

    async function copyMsgIds(formatter, label) {
        try {
            const result = await ensureMsgIdsAvailable(getMsgIdsFromSelection, {
                emptyMessage: 'Select at least one row with an MSGID first.',
                sourceLabel: MSGID_SOURCE_LABELS.selection
            });
            if (!result) {
                return;
            }

            const content = formatter(result.msgIds);
            if (!content) {
                showToast('Unable to format MSGIDs for export.', { type: 'error' });
                return;
            }

            await navigator.clipboard.writeText(content);
            const labelText = pluralize('MSGID', result.msgIds.length);
            showToast(`Copied ${result.msgIds.length} ${labelText} ${label}.`, { type: 'success' });
        } catch (error) {
            console.error('Failed to copy MSGIDs', error);
            showToast('Failed to copy MSGIDs. Check console for details.', { type: 'error' });
        }
    }

    const copyMsgIdsAsCsv = () => copyMsgIds(formatMsgIdsAsCsv, 'as CSV');
    const copyMsgIdsAsTab = () => copyMsgIds(formatMsgIdsAsTab, 'as a table');
    const copyMsgIdsAsList = () => copyMsgIds(formatMsgIdsAsList, 'as a list');
    const copyMsgIdsAsPlain = () => copyMsgIds(formatMsgIdsAsPlain, 'as a plain list');
    const copyMsgIdsAsElastic = () => copyMsgIds(formatMsgIdsAsElastic, 'for Elastic search');

    async function copyBusinessKeys(formatter, label) {
        try {
            const rows = collectBusinessKeyRows();
            if (!rows.length) {
                showToast('Select at least one row with business keys first.', { type: 'warning' });
                return;
            }
            const content = formatter(rows);
            if (!content) {
                showToast('No business keys found in the selected rows.', { type: 'warning' });
                return;
            }

            await navigator.clipboard.writeText(content);
            showToast(`Copied business keys ${label}.`, { type: 'success' });
        } catch (error) {
            console.error('Failed to copy business keys', error);
            showToast('Failed to copy business keys. Check console for details.', { type: 'error' });
        }
    }

    const copyBusinessKeysAsCsv = () => copyBusinessKeys(formatRowsAsCsv, 'as CSV');
    const copyBusinessKeysAsTab = () => copyBusinessKeys(formatRowsAsTab, 'as a table');
    const copyBusinessKeysAsList = () => copyBusinessKeys(formatRowsAsLists, 'as grouped lists');
    const copyBusinessKeysAsPlain = () => copyBusinessKeys(formatRowsAsPlainLists, 'as plain lists');

    function mapBuKeysToRows(values) {
        return values.map((value) => parseSubflRow(String(value || ''))).filter((row) => Object.keys(row).length > 0);
    }

    async function copyStartupBuKeys() {
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
            // Keep each record on its own line to simplify downstream pasting.
            await navigator.clipboard.writeText(normalizedKeys.join('\n'));
            const label = pluralize('BuKey', normalizedKeys.length);
            showToast(`Copied ${normalizedKeys.length} ${label} to the clipboard.`, { type: 'success' });
        } catch (error) {
            console.error('Failed to copy BuKeys', error);
            showToast('Failed to copy BuKeys. Check console for details.', { type: 'error' });
        }
    }

    async function copyStartupBuKeysAsCsv() {
        try {
            const buKeys = await getBuKeysArray();
            if (buKeys === null) {
                return;
            }
            const rows = mapBuKeysToRows(buKeys);
            if (!rows.length) {
                showToast('No startup information found for the current rows.', { type: 'warning' });
                return;
            }
            const content = formatRowsAsCsv(rows);
            await navigator.clipboard.writeText(content);
            showToast('Copied startup information as CSV.', { type: 'success' });
        } catch (error) {
            console.error('Failed to copy startup info as CSV', error);
            showToast('Failed to format startup info as CSV. Check console for details.', { type: 'error' });
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

    function addButton(parent, config) {
        const parentElement = typeof parent === 'string' ? document.querySelector(parent) : parent;
        const host = parentElement || document.body;
        const panel = createHelperPanel(host);
        if (!panel) {
            return null;
        }
        return panel.addButton(config);
    }

    function addActionGroup(parent, config) {
        const parentElement = typeof parent === 'string' ? document.querySelector(parent) : parent;
        const host = parentElement || document.body;
        const panel = createHelperPanel(host);
        if (!panel) {
            return null;
        }
        return panel.addActionGroup(config);
    }

    function initializeHelperPanel() {
        waitForElement(CONFIG.selectors.buttonParent).then((parent) => {
            const host = document.body; // must be body due to iframe constraints
            const searchMsgIdGroup = addActionGroup(host, {
                label: 'Search by MSGID',
                icon: '🔎',
                defaultOptionId: 'selection',
                options: [
                    { id: 'selection', label: 'from selection', onSelect: searchMsgIdFromSelection },
                    { id: 'clipboard', label: 'from clipboard', onSelect: searchMsgIdFromClipboard }
                ]
            });

            const copyMsgIdsGroup = addActionGroup(host, {
                label: 'Copy MSGIDs',
                icon: '📋',
                defaultOptionId: 'table',
                options: [
                    { id: 'table', label: 'as table', onSelect: copyMsgIdsAsTab },
                    /*{ id: 'csv', label: 'As CSV', onSelect: copyMsgIdsAsCsv },*/
                    { id: 'list', label: 'as list', onSelect: copyMsgIdsAsList },
                    { id: 'plain', label: 'as plain', onSelect: copyMsgIdsAsPlain },
                    { id: 'elastic', label: 'as Elastic search', onSelect: copyMsgIdsAsElastic }
                ],
                isActionAvailable: hasMsgIdSource
            });

            const businessKeysGroup = addActionGroup(host, {
                label: 'Extract Business Keys',
                icon: '🔑',
                defaultOptionId: 'table',
                options: [
                    { id: 'table', label: 'as table', onSelect: copyBusinessKeysAsTab },
                    { id: 'csv', label: 'as CSV', onSelect: copyBusinessKeysAsCsv },
                    { id: 'list', label: 'as list', onSelect: copyBusinessKeysAsList },
                    { id: 'plain', label: 'as plain', onSelect: copyBusinessKeysAsPlain }
                ]
            });

            /*
            const startupInfoGroup = addActionGroup(host, {
                label: 'Extract Startup Info',
                icon: '↪',
                defaultOptionId: 'bukeys',
                options: [
                    { id: 'bukeys', label: 'As BuKeys', onSelect: copyStartupBuKeys },
                    { id: 'csv', label: 'As CSV', onSelect: copyStartupBuKeysAsCsv },
                    { id: 'elastic', label: 'As Elastic query', onSelect: copyElastic }
                ]
            });
            */
            // Scenario names adapt to the selected tab and table layout.
            const copyScenarioNamesGroup = addActionGroup(host, {
                label: 'Copy Scenario names',
                icon: '📋',
                defaultOptionId: 'table',
                options: [
                    { id: 'table', label: 'as table', onSelect: copyScenarioNamesAsTab },
                    { id: 'csv', label: 'as CSV', onSelect: copyScenarioNamesAsCsv },
                    { id: 'list', label: 'as list', onSelect: copyScenarioNamesAsList },
                    { id: 'plain', label: 'as plain', onSelect: copyScenarioNamesAsPlain }
                ],
                isEnabled: canCopyScenarioNames
            });

            const buttons = [searchMsgIdGroup, copyMsgIdsGroup, businessKeysGroup, copyScenarioNamesGroup/*, startupInfoGroup*/].filter(Boolean);

            if (!buttons.length) {
                return;
            }

            const updateButtonState = () => {
                const baseEnabled = isProcessesContext() && hasReadableRows() && isDetailsOrBusinessViewTab();
                buttons.forEach((button) => {
                    const buttonEnabled = button.isEnabled ? button.isEnabled() : baseEnabled;
                    const actionAvailable = button.isActionAvailable ? button.isActionAvailable() : true;
                    button.setEnabled(buttonEnabled && actionAvailable);
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
