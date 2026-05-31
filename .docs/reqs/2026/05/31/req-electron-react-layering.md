# Electron React Layering Requirement

## Requirement

The Electron app must migrate its renderer from static HTML, CSS, and DOM scripting to a React renderer that follows the sibling Agent World Electron app's layered project structure.

The new renderer must preserve the existing desktop chat workflow, IPC bridge behavior, visible content, visual styling, and font sizes while introducing clear layers for app orchestration, feature modules, hooks, types, utilities, and a local design system with primitives.

## Acceptance Criteria

- Electron renderer boots through React instead of the old static `renderer.js` DOM controller.
- Renderer source is organized under `electron/renderer/src` with app, design-system, features, hooks, types, utils, and constants layers.
- Design-system code includes only genuinely reusable primitives; app-shell and settings-only helpers live in their owning app/feature layers.
- The migration does not add new visible sidebar/header/composer/settings content beyond the original static renderer surface.
- The existing header agent-list style, message composer style, and original font sizes are preserved while being implemented through the new React layers.
- Existing workspace selection, chat list, create/select chat, message display, send message, edit/resend, theme selection, right-panel toggling, sidebar collapse, tool-message visibility, and runtime option controls continue to work through `window.agentCliDesktop`.
- Electron main loads the Vite dev server in development and the built renderer output in packaged/local build mode.
- Electron build commands produce both main/preload output and renderer assets.
- The preload bridge remains context-isolated and does not expose Node or Electron primitives directly.
- Validation covers TypeScript/build output and a renderer smoke check without requiring live provider credentials.

## Non-Goals

- No runtime ownership change; Agent CLI runtime remains in `core/agent-runtime.ts` and is invoked from Electron main.
- No redesign or visual/font-size changes beyond what is required to preserve the existing Electron renderer in React.
- No npm workspace split.
- No live provider call requirement for validation.