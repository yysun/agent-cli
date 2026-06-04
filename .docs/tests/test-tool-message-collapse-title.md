# Tool Message Collapse Title E2E Spec

## Scope

Validate the Electron transcript behavior for per-card tool-message collapse and CLI-like tool titles.

## Scenario: Collapse And Reopen A Tool Card

1. Start the Electron app in a workspace where tool messages are visible.
2. Trigger a prompt that produces a visible tool call and tool result, such as an `ask_user_input` request or skill-loading tool result.
3. Observe that the tool card heading shows the CLI-style diagnostic details without row glyphs, such as `load_skill {"skill_id":"agent-world-skill"}` or `load_skill 5ms · 7 lines`, plus a status pill and a right-aligned borderless arrow button.
4. Verify that the card payload text is hidden by default, while the dot, title, status, and arrow remain visible.
5. Click the arrow button on one tool card.
6. Verify that only that card's payload text becomes visible.
7. Click the same arrow button again.
8. Verify that the original payload text is visible again.

## Scenario: Global Tool Visibility Still Wins

1. With at least one tool card visible, turn off the existing "Show tool messages" setting.
2. Verify tool call, tool result, and model response cards are hidden according to the existing setting.
3. Turn "Show tool messages" back on.
4. Verify tool cards return with their heading, status, and per-card arrow controls available.

## Expected Result

Per-card collapse reduces transcript noise without changing runtime ordering, global filtering, or the content sent to the model.
