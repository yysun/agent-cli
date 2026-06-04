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
- The settings panel includes global/project skill scope switches and per-skill enablement controls backed by the workspace skill inventory.
- Sending or resending a chat message applies the settings panel's enabled skill choices to both the skill inventory shown to the model and the runtime `load_skill` registry.
- Disabled skill scopes and disabled individual skills are not advertised in the chat prompt and are not available through `load_skill` for that turn.
- Install/edit affordances may remain disabled until a separate skill-management requirement exists.

## Non-Goals

- No skill install, edit, save, or marketplace implementation.
- No backend settings persistence beyond carrying the current renderer settings into each send/resend request.
- No chat store, workspace store, or provider behavior changes.
- No broad redesign beyond the requested reference-aligned controls.
