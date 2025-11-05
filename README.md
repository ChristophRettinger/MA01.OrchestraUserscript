# MA01 Orchestra Userscript

The Userscript provides functionalities for the Orchestra Monitor website. It can be loaded e.g. using Tampermonkey.

## Functions

* Get Startup BuKeys:
  Opens up the startup information from all processes on current page and extracts the BuKeys string.
  A cancellable progress toast keeps track of the processed rows so you can stop the run at any time.
  The helper copies the joined BuKeys to the clipboard and shows a toast summarising the number of keys processed.

* Get Startup BuKeys (Elastic)
  Opens up the startup information from all processes on current page and extracts the BuKeys string. The result is convertet to an Elastic query to find the origin processes.
  The cancellable progress toast is reused so you can interrupt the data gathering.
  A success toast confirms the copy action and references how many keys were included; warnings appear when no usable keys were found.

* Copy MSGIDs
  Copies `_MSGID` values from hovered or selected rows or the currently opened scenario detail window.
  The helper surfaces a toast referencing the source that was used and informs when no usable IDs are available.
  Duplicate MSGIDs are removed automatically so clipboard contents stay clean when multiple widgets expose the same value.

* Search MSGID in Business view
  Opens the Business view tab, prepares the MSGID filters, pastes the resolved MSGID, and triggers the search button.
  The helper now exclusively uses MSGIDs from the currently selected rows and issues a toast describing the search parameters.
  Duplicate MSGIDs are removed from the selected rows before the search so the Business view is queried only once per value.

## Availability

The helper buttons become active only on the process overview page (`#scenario/processOverview/`), when at least one process row is available, and while the "Details" or "Business view" tab is selected. In all other cases the buttons stay greyed out to prevent running the helpers without data. The MSGID helpers now also activate when the scenario detail window contains an MSGID, so you can work with values that are not exposed in the list yet. If no MSGID can be resolved a warning toast explains which prerequisites are missing.

## Helper Panel

The buttons are grouped inside a collapsible panel pinned to the top right of the header. The panel now starts collapsed so the "Orchestra Tools" controls stay out of the way by default. When collapsed the toggle button shows a circular icon with a white background and black border to keep it visible against the page chrome. Expanding the panel restores the full header with button list. Each helper now shows a leading icon so actions are easier to spot at a glance. The panel keeps a very high z-index so it remains clickable even when modal windows such as the scenario detail are open.

## Development Notes

The script is structured around a central `CONFIG` object that keeps selectors, colours, and labels together so they can be updated in a single place. UI elements such as the helper panel and toast notifications are encapsulated in dedicated helpers, keeping the business logic for BuKey collection and MSGID copying focused and easy to follow. When adding new helpers, create a button definition via `addButton` and hook it into the shared state update so it inherits the automatic enable/disable behaviour.

## Elastic MessageData Copier

`ElasticUserscript.js` enhances the Elastic Observability UI at `https://kb-obs.apps.zeus.wien.at/app/`. As soon as the standard "Copy to clipboard" action becomes available, the script adds an adjacent helper button titled "Copy MessageData to clipboard". Clicking the helper first triggers the built-in copy functionality and then replaces the clipboard contents with the `MessageData1` field extracted from the copied JSON payload. The helper retries clipboard access a few times to account for Elastic's asynchronous updates and logs success or error details to the browser console.

The helper button mirrors Elastic's original SVG icon, ensuring visual consistency while inserting an extra 20 px gap between both buttons so the new action is easier to spot. After the clipboard update succeeds, a toast notification adapted from the Orchestra script confirms that the `MessageData1` field has been copied.
To cope with Elastic's in-place navigation, the helper automatically re-attaches itself when the detail drawer refreshes so the additional action stays available for every record you inspect.
