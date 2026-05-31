# Electron Reference UI Scenarios

## Scope

Validate the Electron renderer right panel, theme controls, tool-message visibility, and UI-only skills controls.

## Scenarios

1. Right panel collapse and reopen
   - Given the Electron renderer is loaded
   - When the settings panel is open
   - Then the header settings control is active and the right panel is visible
   - When the user activates the panel close control
   - Then the right panel collapses out of the layout and its body controls are not focusable
   - When the user activates the header settings control
   - Then the right panel opens again without clearing chat or composer state

2. Theme selection
   - Given the settings panel is open
   - When the user selects dark theme
   - Then the renderer root stores `data-theme="dark"`
   - When the user selects light theme
   - Then the renderer root stores `data-theme="light"`
   - When the user selects system theme
   - Then the renderer root has no explicit `data-theme` attribute

3. Tool-message visibility
   - Given the transcript contains tool-related messages
   - When `Show tool messages` is enabled
   - Then tool cards are visible in the transcript
   - When `Show tool messages` is disabled
   - Then tool-related transcript rows are hidden while normal user and assistant messages remain visible

4. Skills UI placeholders
   - Given the settings panel is open
   - Then it shows global and project skill scope controls
   - And it shows placeholder skill rows and install/edit affordances as UI-only controls
   - And using these controls does not call backend APIs or change runtime behavior

## Validation Notes

- Executed focused browser smoke against `http://127.0.0.1:4187/index.html` with a stubbed desktop bridge and sample user, assistant, tool-request, and tool-result messages.
- Confirmed the settings panel starts open, the close button collapses it with `aria-hidden="true"` and `inert`, and the header settings button reopens it without clearing transcript state.
- Confirmed dark, light, and system theme controls apply the expected `data-theme` state.
- Confirmed two compact tool cards render with `requested` and `completed` statuses.
- Confirmed disabling `Show tool messages` hides tool cards while user/assistant messages remain, and re-enabling restores the tool cards.
- Confirmed skills UI placeholders are present and the install/edit buttons are disabled UI-only controls.
- Browser console check reported 0 errors and 0 warnings after the smoke check.
