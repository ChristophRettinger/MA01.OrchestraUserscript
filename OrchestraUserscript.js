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

            const observer = new MutationObserver((mutations) => {
                if (document.querySelector(selector)) {
                    observer.disconnect();
                    resolve(document.querySelector(selector));
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
    const ENABLED_BUTTON_COLOR = "#c99999";
    const DISABLED_BUTTON_COLOR = "#d6d6d6";
    const BUTTON_PARENT_SELECTOR = ".header-holder";
    const BUTTON_PANEL_WIDTH = 220;
    const BUTTON_PANEL_HEADER_TEXT = "Helper Tools";
    const MSG_ID_CELL_SELECTOR = ".mTable-row-hover .mTable-data-cell, .mTable-row-selected .mTable-data-cell";

    const isProcessOverviewContext = () => window.location.hash.includes(PROCESS_OVERVIEW_HASH);
    const isProcessesContext = () => window.location.hash.match(PROCESSES_HASH) !== null;

    /**
     * Returns true when the scenario chooser has at least one data row (excluding the header).
     */
    const hasReadableRows = () => document.querySelectorAll(ROW_SELECTOR).length > 0;

    let helperPanel = null;
    let helperPanelCollapsed = false;

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
            fontWeight: "bold"
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
            toggleButton.textContent = (helperPanelCollapsed ? "[+] " : "[-] ") + BUTTON_PANEL_HEADER_TEXT;
            toggleButton.setAttribute("aria-expanded", (!helperPanelCollapsed).toString());
            content.style.display = helperPanelCollapsed ? "none" : "flex";
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

    async function getBuKeysArray() {

        let bukeys = [];

        // Get rows
        const rows = document.querySelectorAll(".scenarioChooser-content .mTable-data > tbody > tr:not(:first-child)");

        for (const row of rows) {

            const processNameCell = row.querySelector("td:nth-child(6)")

            // Open context menu
            let evt = new MouseEvent("contextmenu", {bubbles:true, conicelable:true, view:window, button:2})
            processNameCell.dispatchEvent(evt)

            let menuItem = Array.prototype.slice.call(document.querySelectorAll(".contextMenuPopup td.menuItem"))
            .filter(function (el) {
                return el.textContent.includes('Change variables')
            })[0];

            menuItem.click();

            await delay(delayMs);

            // Look for BuKeys
            let val = Array.prototype.slice.call(document.querySelectorAll(".gwt-TabPanelBottom td.dialogTable-key"))
            .filter(function (el) {
                return el.textContent.includes('BuKeys')
            })[0].nextElementSibling.querySelector("input").value


            // Gather keys
            bukeys.push(val);

            // Cancel Button
            let cancelButton = Array.prototype.slice.call(document.querySelectorAll(".mButtonBar td.middleCenter"))
            .filter(function (el) {
                return el.textContent.includes('Cancel')
            })[0];

            const clickEvent = new MouseEvent("click", {
                bubbles: true,
                cancelable: true,
                view: window
            });
            cancelButton.dispatchEvent(clickEvent);

            await delay(delayMs);
        }

        return bukeys;
    }

    async function copyBuKeys()
    {
        let buKeys = await getBuKeysArray();
        await navigator.clipboard.writeText(buKeys);
    }

    async function copyElastic()
    {
        let buKeys = await getBuKeysArray();
        await navigator.clipboard.writeText(buildElasticQuery(buKeys));
    }

    /**
     * Copies MSGIDs from hovered or selected rows into the clipboard.
     */
    async function copySelectedMsgIds()
    {
        const msgIds = collectSelectedMsgIds();
        if (!msgIds.length) {
            return;
        }
        await navigator.clipboard.writeText(msgIds.join(", "));
    }

    function addButton(parent, text, onClickHandler, options = {}) {
        const parentElement = typeof parent === "string" ? document.querySelector(parent) : parent;
        const panel = ensureHelperPanel(parentElement);
        if (!panel) {
            return null;
        }

        const div = document.createElement("div");
        div.textContent = text;
        div.setAttribute("role", "button");
        Object.assign(div.style, {
            background: ENABLED_BUTTON_COLOR,
            cursor: "pointer",
            border: "1px solid black",
            padding: "4px 6px",
            textAlign: "center",
            borderRadius: "2px"
        });

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
            addButton(document.body, "Get Startup BuKeys", copyBuKeys),
            addButton(document.body, "Get Startup BuKeys (Elastic)", copyElastic),
            addButton(document.body, "Copy Selected MSGIDs", copySelectedMsgIds, { isActionAvailable: hasSelectedMsgIds })
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
            const baseEnabled = isProcessesContext() && hasReadableRows();
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