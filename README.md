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

* Copy Selected MSGIDs
  Copies the `_MSGID` values from hovered or selected rows directly into the clipboard. Only available when at least one value is present.
  The helper surfaces a toast that states how many IDs were copied or warns when no eligible rows are available.

## Availability

The helper buttons become active only on the process overview page (`#scenario/processOverview/`) and when at least one process row is available. In all other cases the buttons stay greyed out to prevent running the helpers without data. The MSGID helper needs at least one `_MSGID` value in the hovered or selected rows before it enables.

## Helper Panel

The buttons are grouped inside a collapsible panel pinned to the top right of the header. When collapsed the "Orchestra Tools" panel shrinks to a small circular icon so it stays out of the way while remaining accessible. Expanding the panel restores the full header with button list. Each helper now shows a leading icon so actions are easier to spot at a glance.
