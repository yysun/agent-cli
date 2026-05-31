# Electron Renderer Design System

This directory owns the renderer design-system core.

Allowed contents by layer:

- `primitives/`: atomic reusable controls such as buttons, checkboxes, icons, inputs, selects, switches, and textareas.

Forbidden contents:

- No chat, workspace, runtime, settings, skill, shell, or navigation-specific UI in this directory unless it has first been generalized.
- No imports from business-specific renderer UI into `primitives/`.

Dependency direction:

- `primitives -> app/features`

Visual source of truth:

- The restored Electron renderer stylesheet lives at `../styles.css` to preserve the original content, styling, and font sizes during the React migration.