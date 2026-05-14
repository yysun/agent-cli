# REQ: responsive-chat-shell

- Story slug: `responsive-chat-shell`
- Created: `2026-05-13`
- Status: Requested

## Summary

Reshape the relay web interface into a ChatGPT-like responsive chat workspace with a left-side chat list and a main conversation panel, including a collapsible sidebar that automatically collapses on mobile layouts.

Use the user-provided ChatGPT screenshot from `2026-05-13` as the primary visual reference for layout direction, navigation hierarchy, and responsive shell behavior.

## Problem

The current relay web interface does not present chat navigation and message reading in the familiar split-view pattern the user expects. Chat discovery, chat switching, and message reading need to feel like a modern chat workspace instead of a single undifferentiated surface. The interface also needs responsive behavior so the chat list remains usable on smaller screens without crowding the conversation area.

## Reference-Derived Design System

Extract the following design-system traits from the attached ChatGPT screenshot and treat them as the intended visual direction for implementation:

1. Layout system
	- A slim, always-identifiable left navigation region with clear grouping for primary actions, chat history, and secondary items.
	- A dominant main conversation region with a centered reading column rather than edge-to-edge message content.
	- A low-noise top bar with only a small number of utility actions.
	- A bottom-anchored composer that feels persistent and easy to reach.
2. Surface system
	- Soft neutral backgrounds instead of high-contrast panels.
	- Subtle separators and borders rather than heavy card outlines.
	- Light visual layering, with the sidebar slightly differentiated from the main conversation surface.
	- Rounded interactive surfaces, especially for the composer and message bubbles.
3. Typography
	- Clean sans-serif body typography with modest weight contrast.
	- Strong readability over decorative styling.
	- Sidebar text sized for scanning rather than emphasis.
	- Main transcript text sized for comfortable long-form reading.
4. Spacing rhythm
	- Generous whitespace in the main pane.
	- Tighter but still readable spacing in navigation lists.
	- Consistent horizontal padding and vertical rhythm across controls, transcript blocks, and shell regions.
5. Control language
	- Quiet icon buttons and understated action styling.
	- Pills, rounded rectangles, and soft hover states instead of dense framed controls.
	- Navigation affordances that remain obvious without becoming visually heavy.
6. Message presentation
	- Clear distinction between user prompts and assistant responses.
	- User messages may appear as compact pill or bubble elements aligned away from the assistant content column.
	- Assistant content should read as the primary content area, with generous line length control and spacing.
7. Responsive behavior
	- Desktop keeps the navigation persistently available.
	- Narrow layouts prioritize the conversation pane and temporarily reveal navigation only when requested.
	- Mobile interactions must preserve a stable composer and readable transcript while the sidebar opens and closes.

## Requirements

1. The web interface must present a two-panel chat workspace with a dedicated left panel for the chat list and a main panel for chat messages.
2. The left panel must clearly present chat navigation as a list of available chats.
3. The main panel must prioritize the active conversation transcript and message composer.
4. The active chat selection must remain visible and understandable when moving between chats.
5. The left panel must support a user-controlled collapsed state on larger screens.
6. The interface must provide a clear control for collapsing and expanding the left panel.
7. On mobile or narrow viewports, the layout must adapt so the chat list does not permanently consume horizontal space needed for the conversation panel.
8. On mobile or narrow viewports, the left panel must default to a collapsed or hidden state until explicitly opened.
9. The mobile presentation must allow users to open the chat list, choose a chat, and return focus to the message panel without layout breakage.
10. The layout must remain usable across desktop, tablet, and mobile viewport sizes.
11. Existing relay chat behaviors, pairing flows, message rendering, approval handling, and message sending must continue to work within the new layout.
12. Existing chat list data and active-chat state must continue to drive the UI rather than introducing a separate source of truth.
13. The responsive layout must preserve access to key session actions that are already available in the web interface.
14. The redesign must feel visually closer to ChatGPT's chat workspace pattern while remaining within this product's existing functionality.
15. The redesign must use the attached ChatGPT screenshot as a reference for the overall shell composition, including a left navigation column, a conversation-focused main pane, and a bottom-anchored composer area.
16. The redesign should borrow the reference's sense of visual hierarchy, spacing, and pane proportions without requiring exact duplication of branding, icons, or proprietary details.
17. The redesign must follow the reference-derived design system in this requirement for layout, surfaces, typography, spacing, controls, message presentation, and responsive behavior.
18. The sidebar should feel lighter and more utility-oriented than the main conversation pane.
19. The main conversation area should preserve a centered reading column with enough whitespace to avoid a cramped transcript.
20. The composer should read as a persistent rounded input surface anchored near the bottom of the main pane.
21. Session actions and utility controls should remain visually quiet so they do not overpower chat navigation or transcript content.

## Non-Goals

1. Reproducing ChatGPT branding, assets, copy, or proprietary visual details is not required.
2. Changing relay APIs, chat persistence formats, or chat semantics is not required.
3. Adding new remote chat capabilities beyond the existing product behavior is not required.
4. Reworking message content, markdown rendering, or approval workflows is not required unless needed for layout fit.
5. Introducing a separate mobile-only application flow is not required.
6. Exact visual duplication of the attached ChatGPT interface is not required.

## Acceptance Criteria

1. Given a desktop-width viewport, when the web app loads, then the user sees a left-side chat list and a main conversation panel at the same time.
2. Given a desktop-width viewport, when the user collapses the left panel, then the conversation panel expands and the user can restore the chat list with a visible control.
3. Given a desktop-width viewport, when the user selects a chat from the left panel, then the main panel updates to show that chat's messages.
4. Given a mobile-width viewport, when the web app loads, then the conversation panel is prioritized and the chat list is not permanently open by default.
5. Given a mobile-width viewport, when the user opens the chat list and selects a chat, then the interface returns focus to the conversation panel in a way that preserves usable reading and replying space.
6. Given any supported viewport size, when messages stream, approvals appear, or the user sends a message, then the layout remains readable and functional.
7. Given existing relay session actions in the web UI, when the layout changes, then those actions remain reachable without causing overlap or unusable controls.

## Open Questions

1. The requirement calls for mobile collapse behavior, but the specific interaction pattern for opening the sidebar on small screens still needs to be chosen during planning.
2. The requirement defines the design system direction, but the exact breakpoint values and collapsed sidebar width still need to be chosen during planning.