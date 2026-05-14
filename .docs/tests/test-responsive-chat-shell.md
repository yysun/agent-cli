# AT: responsive-chat-shell

- Story slug: `responsive-chat-shell`
- Created: `2026-05-13`
- Related requirement: `./.docs/reqs/2026/05/13/req-responsive-chat-shell.md`
- Related plan: `./.docs/plans/2026/05/13/plan-responsive-chat-shell.md`

## Scope

Validate that the relay web interface presents a responsive, ChatGPT-like split chat shell with a collapsible left chat list, a conversation-focused main panel, and mobile behavior that hides the sidebar until the user asks for it.

Use the attached ChatGPT screenshot from `2026-05-13` as the reference point for validating overall shell composition, not exact branded duplication.

## Scenarios

1. Desktop layout shows chat list and conversation together
- Given the relay web app is paired and loaded on a desktop-width viewport
- When the main workspace renders
- Then the user sees a left-side chat list panel
- And the user sees a main conversation panel at the same time
- And the overall composition broadly matches the attached ChatGPT reference with navigation on the left and conversation emphasis in the main pane

2. Desktop sidebar can collapse and expand
- Given the app is open on a desktop-width viewport
- When the user activates the sidebar collapse control
- Then the left panel collapses into a reduced-width state
- And the main conversation region expands
- And the user can restore the sidebar with a visible control

3. Selecting a chat updates the main transcript
- Given multiple chats are available in the sidebar
- When the user selects a different chat
- Then the active chat indication updates
- And the main panel shows the selected chat's messages

4. Session actions remain accessible after the layout change
- Given the app is paired to a relay session
- When the user looks for the existing key session actions
- Then those actions remain visible or clearly reachable
- And they do not overlap the transcript or composer at common viewport sizes

5. Mobile layout prioritizes the conversation panel
- Given the relay web app is opened on a mobile-width viewport
- When the page loads
- Then the conversation panel is the primary visible region
- And the chat list is not permanently open by default

6. Mobile sidebar can be opened and dismissed safely
- Given the app is open on a mobile-width viewport
- When the user opens the chat list
- Then the sidebar appears as a temporary panel or overlay
- And the user can dismiss it without breaking the conversation layout

7. Mobile chat selection returns focus to the conversation panel
- Given the chat list is open on a mobile-width viewport
- When the user selects a chat
- Then the active chat changes successfully
- And the sidebar closes or otherwise yields focus back to the conversation panel
- And the composer remains usable

8. Streaming and approvals still fit the responsive layout
- Given a remote turn streams assistant output or triggers an approval card
- When those updates appear in the conversation pane
- Then the transcript remains readable
- And the approval controls remain usable
- And the composer stays accessible

9. Empty and reconnect states remain usable in the new shell
- Given the app loads before pairing, or reconnects to a stored session
- When the shell renders those states
- Then the UI still communicates session status clearly
- And the responsive layout does not hide the controls needed to continue

## Expected Verification During SS

1. Web TypeScript typecheck passes.
2. Manual viewport checks cover desktop, tablet, and mobile widths.
3. Manual interaction checks confirm sidebar collapse, sidebar open or close behavior, chat switching, and composer usability.
4. Existing relay-specific behaviors such as message streaming, approvals, and reconnect remain functional after the layout refactor.
5. The implemented shell should be visually compared against the attached ChatGPT reference for layout similarity at the level of structure, spacing, and responsive behavior.