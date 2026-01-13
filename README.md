# MA01 Orchestra Userscript

The Userscript provides functionalities for the Orchestra Monitor website. It can be loaded e.g. using Tampermonkey.

## Functions

* Search by MSGID
  * Default action: **From selection** – reuses the selected row's MSGID to prepare and trigger the Business view search.
  * Dropdown option: **From clipboard** – pulls the MSGID from your clipboard before running the Business view search.
  * The helper clears stale Business view filters, fills the MSGID filter, and tries to keep the clipboard in sync with the searched value.

* Copy MSGIDs
  * Default action: **As Table** – copies the selected rows' MSGIDs from column 9 with a `MSGID` header and line-feed separated rows.
  * Further options: **As List** (single line, comma separated), **As Plain** (same list without the header line), and **As Elastic search** (e.g. `(BusinessCaseId:ID1 or BusinessCaseId:ID2)`).
  * Duplicate MSGIDs are still removed automatically so each list stays tidy.
  * Selecting multiple rows keeps the helper enabled so you can export MSGIDs from every highlighted row at once.

* Copy Scenario names
  * Default action: **As Table** – copies scenario names from the selected rows into a tab-separated table.
  * Further options: **As CSV** (quoted, `;` separated), **As List** (single line, comma separated), and **As Plain** (list without headers).
  * The helper adapts to the active tab: scenario overview uses column 5, process overview uses column 4, and process details or Business view uses column 8 plus the process name column (6).

* Extract Business Keys
  * Default action: **As CSV** – extracts all visible business keys from column 9 of the selected rows and exports them as `;` separated CSV with quotes when needed.
  * Further options: **As Table** (tab separated, unquoted), **As List** (one comma-separated list per business key), and **As Plain** (list output without headers).
  * Keys are parsed from the `_MSGID` cell using the `Key: Value, Key2: Value2` spacing so values that contain commas or colons remain intact.

* Extract Startup Info
  * Default action: **As BuKeys** – mirrors the previous "Copy Startup BuKeys" behaviour and joins the gathered keys with line feeds between records.
  * Further options: **As CSV** (quoted, `;` separated) and **As Elastic query** (mirrors the former "Copy Startup for Elastic" output).
  * Startup extraction now honours only the currently selected rows and snapshots that list before opening any dialogs, keeping later row highlights from changing the processed set.
  * The cancellable progress toast remains in place while opening each row's Startup window.

## Availability

The MSGID and Business Key helpers become active only on the process overview page (`#scenario/processOverview/`), when at least one process row is available, and while the "Details" or "Business view" tab is selected. In all other cases those buttons stay greyed out to prevent running the helpers without data. The MSGID helpers also activate when the scenario detail window contains an MSGID, so you can work with values that are not exposed in the list yet. If no MSGID can be resolved a warning toast explains which prerequisites are missing.

The **Copy Scenario names** helper follows the selected rows on the Scenario overview tab, the Process overview tab, or the Process details and Business view tabs. It adjusts the column mapping automatically to match each table layout so the scenario and process names are exported correctly.

## Helper Panel

The buttons live inside a collapsible panel pinned near the top right of the header so the toggle remains visible even when overlays appear. The panel starts collapsed to stay out of the way by default and uses a colour-coded toggle button (light grey when collapsed, deep blue when expanded). The toggle now shows only the wrench icon to save vertical space while keeping the controls recognizable. Expanding the panel restores the full list of helper buttons without adding an extra header row.

Actions are grouped into split buttons: the main button triggers the default behaviour while the adjacent ellipsis opens a dropdown with every available format. Icons remain in place to keep each action recognizable at a glance. The panel keeps a very high z-index so it remains clickable even when modal windows such as the scenario detail are open.

## Development Notes

The script is structured around a central `CONFIG` object that keeps selectors, colours, and labels together so they can be updated in a single place. UI elements such as the helper panel and toast notifications are encapsulated in dedicated helpers, keeping the business logic for BuKey collection and MSGID copying focused and easy to follow. When adding new helpers, create a button definition via `addButton` and hook it into the shared state update so it inherits the automatic enable/disable behaviour.

## Elastic MessageData Copier

`ElasticUserscript.js` enhances the Elastic Observability UI at `https://kb-obs.apps.zeus.wien.at/app/` with a floating overlay similar to the Orchestra helper panel. Open a detail drawer and the overlay (top right) exposes grouped split buttons for MessageData actions:

* **Get MessageData1** – default option **formatted** auto-detects whether the payload is JSON or XML before pretty-printing and copying it back to the clipboard. The **raw** option keeps the payload untouched.
* **Get MessageData2** – mirrors the MessageData1 controls but reads the `MessageData2` field from the Elastic copy payload instead.

The overlay keeps a very high z-index so it remains visible above Elastic modals, and the MessageData controls stay enabled at all times. It waits for the main Kibana container (`.kibana-body`) to appear before rendering so the helper only shows once the shell is ready, yet it still anchors to the document body. The floating panel now sits 80px from the right edge to avoid overlapping built-in controls. If Elastic's copy button is not present, the helper surfaces a toast to explain the missing prerequisite. Feedback toasts mirror the Orchestra styling to confirm each copy.

The helper now locates Elastic's copy control by its visible label (**Copy to clipboard**) rather than the SVG icon so it remains compatible with icon updates in Elastic.
