# MA01 Orchestra Userscript

The Userscript provides functionalities for the Orchestra Monitor website. It can be loaded e.g. using Tampermonkey.

## Functions

* Search by MSGID
  * Default action: **From selection** – reuses the selected row's MSGID to prepare and trigger the Business view search.
  * Dropdown option: **From clipboard** – pulls the MSGID from your clipboard before running the Business view search.
  * The helper clears stale Business view filters, fills the MSGID filter, and tries to keep the clipboard in sync with the searched value.

* Copy MSGIDs
  * Default action: **As CSV** – copies the selected rows' MSGIDs with a `MSGID` header and line-feed separated rows.
  * Further options: **As Table** (tab separated), **As List** (single line, comma separated), and **As Elastic search** (e.g. `(BusinessCaseId:ID1 or BusinessCaseId:ID2)`).
  * Duplicate MSGIDs are still removed automatically so each list stays tidy.
  * Selecting multiple rows keeps the helper enabled so you can export MSGIDs from every highlighted row at once.

* Extract Business Keys
  * Default action: **As CSV** – extracts all visible business keys from the selected rows and exports them as `;` separated CSV with quotes when needed.
  * Further options: **As Table** (tab separated, unquoted) and **As List** (one comma-separated list per business key).
  * Keys are parsed from the `_MSGID` cell using the `Key: Value, Key2: Value2` spacing so values that contain commas or colons remain intact.

* Extract Startup Info
  * Default action: **As BuKeys** – mirrors the previous "Copy Startup BuKeys" behaviour and joins the gathered keys with line feeds between records.
  * Further options: **As CSV** (quoted, `;` separated) and **As Elastic query** (mirrors the former "Copy Startup for Elastic" output).
  * Startup extraction now honours only the currently selected rows and snapshots that list before opening any dialogs, keeping later row highlights from changing the processed set.
  * The cancellable progress toast remains in place while opening each row's Startup window.

## Availability

The helper buttons become active only on the process overview page (`#scenario/processOverview/`), when at least one process row is available, and while the "Details" or "Business view" tab is selected. In all other cases the buttons stay greyed out to prevent running the helpers without data. The MSGID helpers now also activate when the scenario detail window contains an MSGID, so you can work with values that are not exposed in the list yet. If no MSGID can be resolved a warning toast explains which prerequisites are missing.

## Helper Panel

The buttons live inside a collapsible panel pinned near the top right of the header so the toggle remains visible even when overlays appear. The panel starts collapsed to stay out of the way by default and uses a colour-coded toggle button (light grey when collapsed, deep blue when expanded). The toggle now shows only the wrench icon to save vertical space while keeping the controls recognizable. Expanding the panel restores the full list of helper buttons without adding an extra header row.

Actions are grouped into split buttons: the main button triggers the default behaviour while the adjacent ellipsis opens a dropdown with every available format. Icons remain in place to keep each action recognizable at a glance. The panel keeps a very high z-index so it remains clickable even when modal windows such as the scenario detail are open.

## Development Notes

The script is structured around a central `CONFIG` object that keeps selectors, colours, and labels together so they can be updated in a single place. UI elements such as the helper panel and toast notifications are encapsulated in dedicated helpers, keeping the business logic for BuKey collection and MSGID copying focused and easy to follow. When adding new helpers, create a button definition via `addButton` and hook it into the shared state update so it inherits the automatic enable/disable behaviour.

## Elastic MessageData Copier

`ElasticUserscript.js` enhances the Elastic Observability UI at `https://kb-obs.apps.zeus.wien.at/app/` with a floating overlay similar to the Orchestra helper panel. Open a detail drawer and the overlay (top right) exposes a grouped split button for MessageData actions:

* Default action: **Format XML + copy** – triggers Elastic's native copy, extracts `MessageData1`, formats it with indentation, and replaces the clipboard content.
* Dropdown option: **Copy raw MessageData** – same workflow but leaves the XML untouched.

The overlay keeps a very high z-index so it remains visible above Elastic modals, and the MessageData controls stay enabled at all times. If Elastic's copy button is not present, the helper surfaces a toast to explain the missing prerequisite. Feedback toasts mirror the Orchestra styling to confirm each copy.
