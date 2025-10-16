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

    function addButton(parentSelector, top, text, onClickHandler) {
        const parent = document.querySelector(parentSelector);
        if (!parent) return;

        const div = document.createElement("div");
        div.textContent = text;
        Object.assign(div.style, {
            position: "absolute",
            top: top + "px",
            right: "10px",
            width: "180px",
            background: "#c99999",
            cursor: "pointer",
            border: "1px solid black",
            padding: "0px 5px"
        });

        div.addEventListener("click", onClickHandler);
        parent.appendChild(div);
    }

    console.log("Orchestra Helper Functions loaded");

    waitForElm(".header-holder").then(() => {
        addButton(".header-holder", 2, "Get Startup BuKeys", copyBuKeys);
        addButton(".header-holder", 20, "Get Startup BuKeys (Elastic)", copyElastic);
    });
})();