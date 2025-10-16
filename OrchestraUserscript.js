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

    let delayMs = 500;

    function waitForElm(selector) {
        return new Promise((resolve) => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }

            const observer = new MutationObserver(() => {
                const element = document.querySelector(selector);
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
            });
        });
    }

    /**
     * Resolves once the provided element has been removed from the DOM.
     */
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

            observer.observe(document.body, {
                childList: true,
                subtree: true,
            });
        });
    }

    const delay = (durationMs) => {
        return new Promise(resolve => setTimeout(resolve, durationMs));
    }

    const ROW_SELECTOR = ".scenarioChooser-content .mTable-data > tbody > tr:not(:first-child)";
    const PROCESS_OVERVIEW_HASH = "#scenario/processOverview/";
    const PROCESSES_HASH = "#scenario/.*/processes/";
    const ENABLED_BUTTON_COLOR = "#A9D0F5";
    const DISABLED_BUTTON_COLOR = "#d6d6d6";
    const BUTTON_PARENT_SELECTOR = ".header-holder";
    const BUTTON_PANEL_WIDTH = 220;
    const BUTTON_PANEL_HEADER_TEXT = "Orchestra Tools";
    const BUTTON_PANEL_COLLAPSED_ICON = "🎛️";
    const BUTTON_PANEL_COLLAPSED_SIZE = 36;
    const MSG_ID_CELL_SELECTOR = ".mTable-row-hover .mTable-data-cell, .mTable-row-selected .mTable-data-cell";

    const isProcessOverviewContext = () => window.location.hash.includes(PROCESS_OVERVIEW_HASH);
    const isProcessesContext = () => window.location.hash.match(PROCESSES_HASH) !== null;

    /**
     * Returns true when the scenario chooser has at least one data row (excluding the header).
     */
    const hasReadableRows = () => document.querySelectorAll(ROW_SELECTOR).length > 0;

    /**
     * Checks whether the currently selected tab exposes either the Details
     * or Business view content which is required for the helpers to operate.
     */
    const isDetailsOrBusinessViewTab = () => {
        const labelElement = document.querySelector(".mTabCaption-selected .mTabCaption-label");
        if (!labelElement || typeof labelElement.textContent !== "string") {
            return false;
        }
        const text = labelElement.textContent.toLowerCase();
        return text.includes("details") || text.includes("business view");
    };

    let helperPanel = null;
    let helperPanelCollapsed = true;

    let toastContainer = null;

    const TOAST_THEMES = {
        info: "#1976d2",
        success: "#2e7d32",
        warning: "#ed6c02",
        error: "#d32f2f"
    };

    const DEFAULT_TOAST_DURATION_MS = 3500;

    /**
     * Ensures the helper panel exists and returns its container elements.
     */
    function ensureHelperPanel(parent) {
        if (helperPanel) {
            return helperPanel;
        }

        if (!parent) {
            return null;
        }

        const wrapper = document.createElement("div");
        Object.assign(wrapper.style, {
            position: "absolute",
            top: "10px",
            right: "10px",
            width: BUTTON_PANEL_WIDTH + "px",
            background: "#f5f5f5",
            border: "1px solid black",
            padding: "6px",
            zIndex: "9999",
            fontFamily: "inherit",
            fontSize: "12px"
        });

        const toggleButton = document.createElement("button");
        toggleButton.type = "button";
        Object.assign(toggleButton.style, {
            width: "100%",
            background: "#bdbdbd",
            border: "1px solid black",
            cursor: "pointer",
            padding: "2px 4px",
            fontWeight: "bold",
            transition: "background 0.2s ease"
        });

        const content = document.createElement("div");
        content.setAttribute("role", "group");
        Object.assign(content.style, {
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            marginTop: "6px"
        });

        const applyCollapsedState = () => {
            const expanded = !helperPanelCollapsed;
            toggleButton.setAttribute("aria-expanded", expanded.toString());
            toggleButton.setAttribute(
                "aria-label",
                expanded ? `Collapse ${BUTTON_PANEL_HEADER_TEXT}` : `Expand ${BUTTON_PANEL_HEADER_TEXT}`
            );
            toggleButton.title = expanded ? `Collapse ${BUTTON_PANEL_HEADER_TEXT}` : `Expand ${BUTTON_PANEL_HEADER_TEXT}`;
            content.style.display = expanded ? "flex" : "none";

            if (expanded) {
                wrapper.style.width = BUTTON_PANEL_WIDTH + "px";
                wrapper.style.background = "#f5f5f5";
                wrapper.style.border = "1px solid black";
                wrapper.style.padding = "6px";
                wrapper.style.height = "auto";
                wrapper.style.borderRadius = "0";

                toggleButton.textContent = "[-] " + BUTTON_PANEL_HEADER_TEXT;
                toggleButton.style.background = "#bdbdbd";
                toggleButton.style.border = "1px solid black";
                toggleButton.style.padding = "2px 4px";
                toggleButton.style.fontSize = "12px";
                toggleButton.style.display = "block";
                toggleButton.style.width = "100%";
                toggleButton.style.height = "auto";
                toggleButton.style.borderRadius = "0";
                wrapper.style.boxShadow = "none";
            } else {
                const collapsedPadding = 4;
                const collapsedDiameter = BUTTON_PANEL_COLLAPSED_SIZE + collapsedPadding * 2;
                wrapper.style.width = collapsedDiameter + "px";
                wrapper.style.background = "#ffffff";
                wrapper.style.border = "1px solid black";
                wrapper.style.padding = collapsedPadding + "px";
                wrapper.style.height = collapsedDiameter + "px";
                wrapper.style.borderRadius = collapsedDiameter / 2 + "px";

                toggleButton.textContent = BUTTON_PANEL_COLLAPSED_ICON;
                toggleButton.style.background = "#ffffff";
                toggleButton.style.border = "none";
                toggleButton.style.padding = "0";
                toggleButton.style.fontSize = "20px";
                toggleButton.style.display = "flex";
                toggleButton.style.alignItems = "center";
                toggleButton.style.justifyContent = "center";
                toggleButton.style.width = BUTTON_PANEL_COLLAPSED_SIZE + "px";
                toggleButton.style.height = BUTTON_PANEL_COLLAPSED_SIZE + "px";
                toggleButton.style.borderRadius = BUTTON_PANEL_COLLAPSED_SIZE / 2 + "px";
            }
        };

        toggleButton.addEventListener("click", () => {
            helperPanelCollapsed = !helperPanelCollapsed;
            applyCollapsedState();
        });

        wrapper.appendChild(toggleButton);
        wrapper.appendChild(content);
        parent.appendChild(wrapper);

        helperPanel = {
            wrapper,
            container: content,
            toggleButton,
            applyCollapsedState
        };

        applyCollapsedState();
        return helperPanel;
    }

    /**
     * Renders a toast message so users get quick feedback from helper actions.
     * Supports persistent toasts with inline action buttons and returns a controller
     * that can update or dismiss the toast programmatically.
     *
     * @param {string|Node} message - Toast content. Strings become text nodes; DOM nodes are inserted directly.
     * @param {{type?: string, durationMs?: number, persistent?: boolean, actions?: Array<{label: string, ariaLabel?: string, onClick?: (event: MouseEvent) => void}>}} options
     * @returns {{update: (newMessage: string|Node) => void, dismiss: () => void, element: HTMLElement}}
     */
    function showToast(message, options = {}) {
        const {
            type = "info",
            durationMs = DEFAULT_TOAST_DURATION_MS,
            persistent = false,
            actions = []
        } = options;
        if (!toastContainer) {
            toastContainer = document.createElement("div");
            Object.assign(toastContainer.style, {
                position: "fixed",
                top: "16px",
                right: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                zIndex: "10000",
                fontFamily: "inherit",
                fontSize: "12px"
            });
            document.body.appendChild(toastContainer);
        }

        const toast = document.createElement("div");
        const background = TOAST_THEMES[type] || "#333";
        Object.assign(toast.style, {
            background,
            color: "#fff",
            padding: "8px 12px",
            borderRadius: "4px",
            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)",
            opacity: "0",
            transform: "translateY(-10px)",
            transition: "opacity 0.2s ease, transform 0.2s ease",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            minWidth: "220px"
        });

        const messageSpan = document.createElement("span");
        messageSpan.style.display = "block";
        const setMessageContent = (content) => {
            if (content instanceof Node) {
                messageSpan.replaceChildren(content);
            } else {
                messageSpan.replaceChildren();
                messageSpan.textContent = typeof content === "string" ? content : String(content ?? "");
            }
        };
        setMessageContent(message);
        toast.appendChild(messageSpan);

        if (Array.isArray(actions) && actions.length > 0) {
            const actionsWrapper = document.createElement("div");
            Object.assign(actionsWrapper.style, {
                display: "flex",
                justifyContent: "flex-end",
                gap: "8px"
            });

            actions.forEach((action) => {
                if (!action || typeof action.label !== "string") {
                    return;
                }
                const actionButton = document.createElement("button");
                actionButton.type = "button";
                actionButton.textContent = action.label;
                if (action.ariaLabel) {
                    actionButton.setAttribute("aria-label", action.ariaLabel);
                }
                Object.assign(actionButton.style, {
                    background: "rgba(255, 255, 255, 0.15)",
                    color: "#fff",
                    border: "1px solid rgba(255, 255, 255, 0.4)",
                    borderRadius: "3px",
                    padding: "4px 8px",
                    cursor: "pointer",
                    fontSize: "11px"
                });
                actionButton.addEventListener("click", (event) => {
                    event.preventDefault();
                    if (typeof action.onClick === "function") {
                        action.onClick(event);
                    }
                });
                actionsWrapper.appendChild(actionButton);
            });

            if (actionsWrapper.childElementCount > 0) {
                toast.appendChild(actionsWrapper);
            }
        }
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");

        toastContainer.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = "1";
            toast.style.transform = "translateY(0)";
        });

        let timeoutId = null;
        let dismissed = false;
        const teardown = () => {
            toast.remove();
            if (toastContainer && toastContainer.childElementCount === 0) {
                toastContainer.remove();
                toastContainer = null;
            }
        };

        const startDismiss = () => {
            if (dismissed) {
                return;
            }
            dismissed = true;
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
            }
            toast.style.opacity = "0";
            toast.style.transform = "translateY(-10px)";
            toast.addEventListener("transitionend", teardown, { once: true });
        };

        if (!persistent) {
            const safeDuration = Math.max(1000, durationMs);
            timeoutId = window.setTimeout(startDismiss, safeDuration);
        }

        const controller = {
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

        return controller;
    }

    /**
     * Collects MSGIDs from hovered or selected rows.
     */
    function collectSelectedMsgIds() {
        return Array.from(document.querySelectorAll(MSG_ID_CELL_SELECTOR))
            .map((cell) => {
                const matches = Array.from(cell.innerText.matchAll(/_MSGID:\s*([^,]*)/g));
                if (!matches.length) {
                    return null;
                }
                return matches.map((match) => match[1].trim()).join("");
            })
            .filter(Boolean);
    }

    const hasSelectedMsgIds = () => collectSelectedMsgIds().length > 0;

    /**
     * Build Elastic query string for given HCM→HL7(v3) SUBFL rows.
     * BK prefix is fixed. You can specify which fields to use (default: _CASENO_ISH, SUBFL_category, SUBFL_changedate, _PID_ISH, _HCMMSGEVENT, _UNIT)
     *   Special handling: _UNIT is translated to _INSTITUTION for elastic
     *
     * @param {string[]} rows - Array of pipe-delimited key:value strings.
     * @param {string[]} fields - Field names to include in each OR clause.
     * @returns {string} Elastic query string.
     */
    function buildElasticQuery(rows, fields = ["_CASENO_ISH", "SUBFL_category", "SUBFL_changedate", "_PID_ISH", "_HCMMSGEVENT", "_UNIT"]) {
        // Parse one row like: "key1:val1|key2:val2|..."
        const parseRow = (row) => {
            const kv = Object.create(null);
            row.split("|").forEach(part => {
                const i = part.indexOf(":");
                if (i > -1) {
                    const key = part.slice(0, i).trim();
                    const val = part.slice(i + 1).trim();
                    kv[key] = val;
                }
            });
            return kv;
        };

        // Build the OR-clauses
        const clauses = rows.map(parseRow).map(kv => {
            const parts = fields.map(f => {
                const val = kv[f];
                if (!val) return null;
                // Quote timestamps (or anything with ':' to be safe)
                const quoted = /:/.test(val) ? `"${val}"` : val;
                return `BK.${(f === "_UNIT") ? "_INSTITUTION" : f}:${quoted}`;
            }).filter(Boolean);

            return parts.length > 0 ? `(${parts.join(" and ")})` : null;
        }).filter(Boolean);

        if (clauses.length === 0) {
            return `ScenarioName:ITI_SUBFL_SAP_HCM_empfangen_129 and Environment:production`;
        }

        return `ScenarioName:ITI_SUBFL_SAP_HCM_empfangen_129 and Environment:production and ( ${clauses.join(" or ")} )`;
    }

    /**
     * Collects BuKeys from the scenario table. Displays a cancellable progress toast
     * so the user can stop the automation while it iterates over rows.
     *
     * @returns {Promise<string[]|null>} Array of BuKey strings or null when the user cancels the run.
     */
    async function getBuKeysArray() {

        let bukeys = [];

        const rows = Array.from(document.querySelectorAll(".scenarioChooser-content .mTable-data > tbody > tr:not(:first-child)"));
        const totalRows = rows.length;
        if (!totalRows) {
            return bukeys;
        }

        let cancelled = false;
        let processedCount = 0;
        let progressToast = null;

        const cancelAction = {
            label: "Cancel",
            ariaLabel: "Cancel BuKey processing",
            onClick: () => {
                cancelled = true;
                if (progressToast) {
                    progressToast.update("Cancelling…");
                    progressToast.dismiss();
                }
            }
        };

        progressToast = showToast(`Processing row 1 of ${totalRows}…`, {
            type: "info",
            persistent: true,
            actions: [cancelAction]
        });

        for (const [index, row] of rows.entries()) {
            if (cancelled) {
                break;
            }

            processedCount = index + 1;
            if (progressToast) {
                progressToast.update(`Processing row ${processedCount} of ${totalRows}…`);
            }

            const processNameCell = row.querySelector("td:nth-child(6)");
            if (!processNameCell) {
                continue;
            }

            // Open context menu
            const evt = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, view: window, button: 2 });
            processNameCell.dispatchEvent(evt);

            const menuItem = Array.from(document.querySelectorAll(".contextMenuPopup td.menuItem"))
                .find((el) => el.textContent.includes("Change variables"));

            if (!menuItem) {
                continue;
            }

            menuItem.click();

            await waitForElm(".gwt-DecoratedPopupPanel");

            let popup = document.querySelector(".gwt-DecoratedPopupPanel");

            // Look for BuKeys
            const buKeyCell = Array.from(popup.querySelectorAll(".gwt-TabPanelBottom td.dialogTable-key"))
                .find((el) => el.textContent.includes("BuKeys"));

            if (buKeyCell) {
                const input = buKeyCell.nextElementSibling?.querySelector("input");
                const value = input?.value?.trim();
                if (value) {
                    // Gather keys
                    bukeys.push(value);
                }
            }

            const cancelButton = Array.from(popup.querySelectorAll(".mButtonBar td.middleCenter"))
                .find((el) => el.textContent.includes("Cancel"));

            if (!cancelButton) {
                continue;
            }

            const clickEvent = new MouseEvent("click", {
                bubbles: true,
                cancelable: true,
                view: window
            });
            cancelButton.dispatchEvent(clickEvent);

            await waitForElementRemoval(popup);
        }

        if (progressToast) {
            progressToast.dismiss();
        }

        if (cancelled) {
            showToast(`Cancelled after processing ${processedCount} of ${totalRows} rows.`, { type: "warning" });
            return null;
        }

        return bukeys;
    }

    async function copyBuKeys()
    {
        try {
            const buKeys = await getBuKeysArray();
            if (buKeys === null) {
                return;
            }
            const normalizedKeys = Array.isArray(buKeys)
                ? buKeys.filter(Boolean)
                : (typeof buKeys === "string" ? buKeys.split(/\s*,\s*/).filter(Boolean) : []);

            if (!normalizedKeys.length) {
                showToast("No BuKeys found for the current rows.", { type: "warning" });
                return;
            }

            await navigator.clipboard.writeText(normalizedKeys.join(","));
            const label = normalizedKeys.length === 1 ? "BuKey" : "BuKeys";
            showToast("Copied " + normalizedKeys.length + " " + label + " to the clipboard.", { type: "success" });
        } catch (error) {
            console.error("Failed to copy BuKeys", error);
            showToast("Failed to copy BuKeys. Check console for details.", { type: "error" });
        }
    }

    async function copyElastic()
    {
        try {
            const buKeys = await getBuKeysArray();
            if (buKeys === null) {
                return;
            }
            const normalizedKeys = Array.isArray(buKeys)
                ? buKeys.filter(Boolean)
                : (typeof buKeys === "string" ? buKeys.split(/\s*,\s*/).filter(Boolean) : []);

            if (!normalizedKeys.length) {
                showToast("No BuKeys available to build an Elastic query.", { type: "warning" });
                return;
            }

            const query = buildElasticQuery(normalizedKeys);
            await navigator.clipboard.writeText(query);
            const label = normalizedKeys.length === 1 ? "BuKey" : "BuKeys";
            showToast("Copied Elastic query for " + normalizedKeys.length + " " + label + ".", { type: "success" });
        } catch (error) {
            console.error("Failed to copy Elastic query", error);
            showToast("Failed to copy the Elastic query. Check console for details.", { type: "error" });
        }
    }

    /**
     * Copies MSGIDs from hovered or selected rows into the clipboard.
     */
    async function copySelectedMsgIds()
    {
        const msgIds = collectSelectedMsgIds();
        if (!msgIds.length) {
            showToast("No MSGIDs selected. Hover or select rows first.", { type: "warning" });
            return;
        }

        try {
            await navigator.clipboard.writeText(msgIds.join(", "));
            const label = msgIds.length === 1 ? "MSGID" : "MSGIDs";
            showToast("Copied " + msgIds.length + " " + label + " to the clipboard.", { type: "success" });
        } catch (error) {
            console.error("Failed to copy MSGIDs", error);
            showToast("Failed to copy MSGIDs. Check console for details.", { type: "error" });
        }
    }


    function addButton(parent, text, onClickHandler, options = {}) {
        const parentElement = typeof parent === "string" ? document.querySelector(parent) : parent;
        const panel = ensureHelperPanel(parentElement);
        if (!panel) {
            return null;
        }

        const div = document.createElement("div");
        div.setAttribute("role", "button");
        Object.assign(div.style, {
            background: ENABLED_BUTTON_COLOR,
            cursor: "pointer",
            border: "1px solid black",
            padding: "4px 6px",
            textAlign: "left",
            borderRadius: "2px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            justifyContent: "flex-start"
        });

        if (options.icon) {
            const iconSpan = document.createElement("span");
            iconSpan.textContent = options.icon;
            iconSpan.setAttribute("aria-hidden", "true");
            Object.assign(iconSpan.style, {
                width: "16px",
                display: "inline-flex",
                justifyContent: "center"
            });
            div.appendChild(iconSpan);
        }

        const labelSpan = document.createElement("span");
        labelSpan.textContent = text;
        div.appendChild(labelSpan);

        const controller = {
            element: div,
            setEnabled(isEnabled) {
                const value = Boolean(isEnabled);
                div.dataset.enabled = value ? "true" : "false";
                div.style.cursor = value ? "pointer" : "not-allowed";
                div.style.opacity = value ? "1" : "0.5";
                div.style.background = value ? ENABLED_BUTTON_COLOR : DISABLED_BUTTON_COLOR;
                div.style.pointerEvents = value ? "auto" : "none";
                div.setAttribute("aria-disabled", value ? "false" : "true");
                div.tabIndex = value ? 0 : -1;
            },
            isActionAvailable: typeof options.isActionAvailable === "function" ? options.isActionAvailable : null
        };

        const handleClick = (event) => {
            const actionAvailable = controller.isActionAvailable ? controller.isActionAvailable() : true;
            if (div.dataset.enabled !== "true" || !actionAvailable) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            onClickHandler(event);
        };

        div.addEventListener("click", handleClick);
        div.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleClick(event);
            }
        });
        panel.container.appendChild(div);

        controller.setEnabled(false);
        return controller;
    }



    console.log("Orchestra Helper Functions loaded");

    waitForElm(BUTTON_PARENT_SELECTOR).then((parent) => {
        const buttons = [
            addButton(document.body, "Get Startup BuKeys", copyBuKeys, { icon: "🔑" }),
            addButton(document.body, "Get Startup BuKeys (Elastic)", copyElastic, { icon: "🧭" }),
            addButton(document.body, "Copy Selected MSGIDs", copySelectedMsgIds, { icon: "📋", isActionAvailable: hasSelectedMsgIds })
        ].filter(Boolean);

        if (!buttons.length) {
            return;
        }

        /**
         * Enable or disable helper buttons depending on the current page context.
         * Buttons only make sense on the process overview page when rows are present.
         */
        const updateButtonState = () => {
            //console.log("Check " + isProcessesContext()+ " " + hasReadableRows());
            const baseEnabled = isProcessesContext() && hasReadableRows() && isDetailsOrBusinessViewTab();
            buttons.forEach((button) => {
                //console.log("  Checkbutton " + (button.isActionAvailable ? button.isActionAvailable() : true));
                const actionAvailable = button.isActionAvailable ? button.isActionAvailable() : true;
                button.setEnabled(baseEnabled && actionAvailable);
            });
        };

        window.addEventListener("hashchange", updateButtonState);
        document.addEventListener("visibilitychange", updateButtonState);

        const domObserver = new MutationObserver(updateButtonState);
        domObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

        updateButtonState();
    });
})();
