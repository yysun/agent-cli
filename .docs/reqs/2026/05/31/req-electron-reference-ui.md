# Electron Reference UI Requirement

## Requirement

The Electron app must follow the relevant `../agent-world/electron` renderer behavior for right-panel open/collapse, theme selection, tool-message visibility, and settings-panel skills controls.

## Acceptance Criteria

- The right panel can be opened from the header settings control and collapsed from the panel close control without changing workspace, chat, message, edit, or composer state.
- The right panel uses a collapsed layout state that removes its width, padding, border, and focusable body content from the main layout.
- The header settings control reflects whether the settings panel is open.
- The settings panel exposes a theme selector with `system`, `light`, and `dark` choices.
- Theme selection applies immediately to the renderer root and persists locally for future renderer loads.
- The renderer supports light, dark, and system-driven theme tokens for the existing shell surfaces.
- The settings panel exposes a `Show tool messages` switch.
- Turning off `Show tool messages` hides tool-role messages and assistant tool-call request rows from the transcript; turning it back on restores them.
- Tool messages render with a clearer compact tool-card treatment that can display tool names, status, and result text when available.
- The settings panel includes skills UI only: global/project scope switches, placeholder skill rows, and install/edit affordances may appear but must not call any backend or change runtime behavior yet.
- The implementation stays local to the static Electron renderer unless validation shows another file must change.

## Non-Goals

- No skill discovery, install, edit, save, or runtime enablement implementation.
- No backend settings persistence or IPC changes.
- No chat store, workspace store, runtime, or provider behavior changes.
- No broad redesign beyond the requested reference-aligned controls.
