# Electron React Layering Smoke Spec

## Goal

Verify the Electron renderer migration keeps the desktop shell usable after moving to React and the layered renderer structure.

## Scenarios

1. Built renderer boot
   - Build the Electron app assets.
   - Open the built renderer entry in a browser-compatible smoke environment.
   - Confirm the React root renders the workspace shell instead of a blank page.

2. Core controls are present
   - Confirm workspace, chat list, message composer, send, theme, sidebar, and settings controls are present.
   - Confirm unavailable IPC in a plain browser produces a visible bridge-unavailable state instead of a crash.
   - Confirm no extra visible sidebar/header/composer/settings content has been added compared with the pre-React renderer.
   - Confirm the header agent list, message composer, and original font sizes remain visually aligned with the pre-React Electron renderer.

3. Static interaction smoke
   - Toggle the right settings panel.
   - Toggle sidebar collapse and restore.
   - Change theme selection.
   - Toggle tool message visibility.
   - Confirm no console errors are produced by those local interactions.

## Notes

- This spec does not require live provider credentials.
- Full chat send and edit/resend behavior depends on Electron IPC and remains covered by the Electron build path plus the preserved preload bridge contract.