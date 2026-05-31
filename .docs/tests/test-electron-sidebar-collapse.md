# Electron Sidebar Collapse Scenarios

## Scope

Validate the Electron renderer left sidebar collapse and restore interaction.

## Scenarios

1. Expanded sidebar collapse control
   - Given the Electron renderer is loaded
   - When the sidebar is expanded
   - Then the collapse control is visible in the top-right sidebar titlebar strip
   - And the restore control in the main header is hidden

2. Collapse sidebar
   - Given the sidebar is expanded
   - When the user activates the collapse control
   - Then the sidebar collapses out of the layout
   - And the restore control appears in the app titlebar at the far-left of the main header with the reference-style inset
   - And chat/workspace controls in the main content remain usable

3. Restore sidebar
   - Given the sidebar is collapsed
   - When the user activates the restore control
   - Then the sidebar opens again
   - And the collapse control returns to the sidebar strip

## Validation Notes

- Executed focused browser smoke against `http://127.0.0.1:4179/index.html`.
- Confirmed expanded state: sidebar visible, collapse control visible in the sidebar strip, restore control hidden.
- Confirmed collapsed state: sidebar width `0px`, border `0px`, padding `0px`, restore control visible in the app titlebar/header, and header left padding `96px`.
- Confirmed titlebar drag behavior: sidebar titlebar strip and main header use `drag`; collapse and restore buttons use `no-drag`.
- Confirmed titlebar vertical alignment: open and collapsed buttons both measure `8px` from the viewport top.
- Confirmed restore state: sidebar returns to `320px`, collapse control is visible again, restore control is hidden, and header left padding returns to `20px`.
- Browser console check reported 0 errors and 0 warnings after the smoke check.