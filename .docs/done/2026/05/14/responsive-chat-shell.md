# DD: responsive-chat-shell

- Story slug: `responsive-chat-shell`
- Completed: `2026-05-14`
- Status: Done
- Related requirement: `./.docs/reqs/2026/05/13/req-responsive-chat-shell.md`
- Related plan: `./.docs/plans/2026/05/13/plan-responsive-chat-shell.md`
- Related test spec: `./.docs/tests/test-responsive-chat-shell.md`

## Outcome

Reshaped the relay web interface into a ChatGPT-like responsive chat workspace with a left chat list, a conversation-focused main pane, a desktop sidebar collapse mode, and a mobile drawer flow that hides navigation until the user asks for it.

The shipped behavior now includes:
- a full-screen shell rather than a framed card layout
- a left sidebar dedicated to chat navigation and chat preview
- a conversation pane centered around a readable transcript column
- a bottom-anchored composer surface with quieter shell controls
- desktop sidebar collapse behavior
- mobile sidebar overlay behavior with a restore or reopen control when the drawer is hidden
- SVG-based sidebar toggle icons instead of text-only toggle labels

## Delivered

1. Shell and layout redesign
- Reworked `web/src/App.tsx` into a two-region shell with sidebar and main conversation areas.
- Moved the product label into the main header and removed the old framed workspace presentation.
- Removed the intermediate status-card strip so the shell stays visually closer to the reference.

2. Responsive sidebar behavior
- Added desktop-only sidebar collapse state.
- Added mobile sidebar open or close state with overlay behavior and backdrop dismissal.
- Ensured the mobile UI still exposes a way to reopen the chat drawer after it has been hidden.

3. Visual system update
- Reworked `web/src/styles.css` around the extracted reference design system with quieter surfaces, softer separators, rounded controls, and a more open transcript area.
- Switched sidebar toggle controls to inline SVG icons.
- Smoothed sidebar motion by animating the desktop width change and mobile drawer slide.

4. Documentation and workflow updates
- Added and refined the requirement, plan, test spec, and this done doc for the story.
- Updated the plan to mark implementation complete and record the verification that actually ran.

## Requirement Coverage (REQ)

1. Two-panel chat workspace with left chat list and main conversation panel
- Satisfied by the new split shell in `web/src/App.tsx` and `web/src/styles.css`.

2. User-controlled collapse on desktop and hidden-by-default behavior on mobile
- Satisfied by separate desktop collapse state and mobile drawer state with backdrop dismissal.

3. ChatGPT screenshot used as design and layout reference
- Satisfied by aligning the shell to the extracted reference design system: slim left navigation, quieter controls, centered transcript column, and bottom-anchored composer.

4. Preserve existing relay chat behavior while changing the shell
- Satisfied by keeping chat list refresh, chat preview, chat selection, sharing, leave, approval handling, reconnect, and message sending on the existing data flow.

## Plan Coverage (AP)

1. Inspect current render and identify layout regions
- Completed by reviewing the existing chat list, transcript, header, and composer regions before refactoring.

2. Introduce shell-level state and restructure markup
- Completed by adding sidebar visibility state and reworking the JSX around sidebar and main-pane regions.

3. Rebuild the stylesheet around the extracted design system
- Completed by replacing the earlier card-heavy shell styling with the quieter reference-aligned surface, spacing, and responsive behavior.

4. Verify behavior and update docs
- Completed through static validation, build validation, plan updates, and this done doc.

## Verification

Executed during implementation on `2026-05-13` and `2026-05-14`:

1. `npm --prefix ./web run typecheck`
2. `npm --prefix ./web run build`

Observed result:
- Web TypeScript typecheck: passed.
- Vite production build: passed.
- Editor diagnostics for `web/src/App.tsx` and `web/src/styles.css`: clean at the time of completion.
- Manual browser execution of the human-readable responsive scenarios was not run in this session.

## Follow-Up Risks

1. The layout and motion changes were validated statically and by build, but not by manual browser interaction, so spacing and animation feel may still need tuning on real desktop and mobile viewports.
2. The sidebar preview area and chat list now share a tighter vertical space budget inside the navigation pane, so very long preview content may need additional truncation or layout tuning later.
3. The shell is now visually closer to the reference, so future additions to the header or sidebar should stay restrained or the UI could drift back toward a card-heavy control panel.