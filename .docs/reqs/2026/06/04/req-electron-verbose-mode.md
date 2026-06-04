# Electron Verbose Mode Requirement

## Problem

The Electron app exposes a setting called "Show tool messages", but that label undersells what the mode actually controls. The app also treats reasoning/thinking differently from the CLI: reasoning can appear even when tool messages are hidden, and current-turn runtime events are only delivered with the completed turn response instead of streaming as the model and tools run. The result is a weaker desktop debugging mode than `agent-cli --verbose`.

## Requirement

The Electron app must rename the setting to "Verbose mode". When verbose mode is disabled, the transcript should show ordinary user and assistant messages while hiding tool, model-response, and reasoning/thinking diagnostics. When verbose mode is enabled, the transcript should show tool messages as they are represented by the runtime and stream reasoning/thinking plus tool/model runtime diagnostics during the active turn, matching the CLI's verbose intent.

## Acceptance Criteria

- [ ] The settings panel presents the toggle as "Verbose mode" with matching accessible labeling.
- [ ] The renderer treats the toggle as a verbose-mode gate: reasoning/thinking, tool calls, tool results, and model-response runtime events are visible only when enabled; warnings and errors remain visible.
- [ ] Persisted tool-related chat messages remain hidden when verbose mode is disabled and visible when enabled.
- [ ] During a streaming Electron turn, reasoning/thinking and tool/model runtime events are appended to the current transcript before the final IPC response returns.
- [ ] The final completed turn response still contains the full turn event list so refresh/final state remains deterministic.

## Constraints

- Preserve the existing chat persistence format.
- Keep execution local-first and do not introduce external telemetry or relay behavior.
- Prefer targeted renderer/main-process changes over broader runtime refactors.
- Keep local ESM imports using `.js` extensions.

## Non-Goals

- Do not redesign the settings panel.
- Do not change CLI verbose output formatting.
- Do not add a new runtime option, environment variable, compatibility flag, or separate "show reasoning" setting.
