# Electron Sidebar Collapse Requirement

## Requirement

The Electron app must match the left sidebar open/collapse behavior from `../agent-world/electron`, especially the location of the collapse and restore controls.

## Acceptance Criteria

- On macOS, the Electron app uses a hidden-inset titlebar so the sidebar controls live in the app titlebar area.
- The left sidebar has an explicit collapse control in the top-right strip of the expanded sidebar titlebar area.
- Activating the expanded-sidebar control hides the left sidebar without disrupting the current workspace, chat list, selected chat, or message composer state.
- When the left sidebar is collapsed, the restore control appears in the app titlebar at the same far-left main-header position used by `../agent-world/electron`, with enough left inset for the macOS titlebar traffic-light area.
- Activating the restore control reopens the sidebar and returns the collapse control to the sidebar strip.
- The control uses the same panel/sidebar icon shape and next-state arrow treatment as the reference app.
- The implementation stays local to the static Electron renderer unless build validation shows another file must change.

## Non-Goals

- No broader Electron redesign.
- No right-panel collapse behavior changes.
- No runtime, IPC, chat-store, or workspace-store behavior changes.