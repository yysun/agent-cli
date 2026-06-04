# Tool Message Collapse Title Requirement

## Problem

Electron tool messages can dump large content directly into the transcript. The user has no per-message control to collapse an individual noisy tool card, and raw tool-result cards can still look like generic "tool result" entries instead of carrying the concrete tool name shown by the CLI.

The current experience makes status cards harder to scan: the important identity of the tool is weak, while the least useful part, the full payload, dominates the view.

## Requirement

Tool-related transcript cards in the Electron renderer must expose a right-aligned up/down arrow button that toggles only that card's content between expanded and collapsed states. Tool content must be collapsed by default. The card heading must still show the tool status, and tool messages must display the CLI-style diagnostic details as the title when runtime data or persisted message content provides enough information, such as `load_skill {"skill_id":"agent-world-skill"}` or `load_skill 5ms · 7 lines`, not merely the bare tool name. Electron titles must omit the CLI row glyphs.

## Acceptance Criteria

- [ ] Tool call and tool result runtime cards show a right-aligned borderless arrow button in the status area that toggles the card content open and closed.
- [ ] Persisted tool-related message cards also show the same per-card arrow button and keep their own collapsed state independent of other cards.
- [ ] Tool-related cards are collapsed by default, so payload/body text is hidden until the user expands that specific card.
- [ ] Collapsing a card hides the payload/body text while preserving the dot, title, status, and toggle control.
- [ ] The arrow indicates the action/state with up/down direction and accessible labels for screen readers.
- [ ] Tool call and tool result cards use the CLI diagnostic detail format when available, including call arguments and result summary details, but without CLI row glyphs such as `↳`, `✓`, or `✗`.
- [ ] The existing global "show tool messages" setting continues to hide or show tool-related cards as before.

## Constraints

- Keep changes inside the Electron renderer transcript and helper utilities unless a source-of-truth data gap is discovered.
- Do not add a new global setting, feature flag, or compatibility mode.
- Preserve existing message filtering and runtime event ordering.
- Keep the implementation local-first and avoid moving transcript data out of the renderer.
- Use targeted validation; this does not need a full Electron package build unless type or test failures point there.

## Non-Goals

- No redesign of the transcript card visual language.
- No change to how tool calls/results are generated or persisted by the runtime.
- No markdown renderer, syntax highlighter, or payload summarizer rewrite.
- No replacement of the global tool-message visibility toggle.
