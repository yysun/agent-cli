# Requirement: Pending Dots Waiting Indicator

## Problem

The CLI three-dot display is supposed to answer a simple user question: is the assistant still working on a response? Today the answer is inconsistent. Non-verbose mode keeps the dots around hidden model and tool activity, while verbose mode clears them for diagnostics and leaves the terminal looking idle even though the turn is still waiting for assistant text.

`rlpCRM` gets the product rule right: progress messages may appear, but the dots remain the waiting-for-assistant-text signal until assistant text starts streaming or the response is complete. The CLI should follow that rule. Verbose diagnostics are useful trace output, not a replacement for a waiting indicator.

## Requirements

- Treat the three dots as a streamed-turn waiting indicator for assistant-visible text.
- Show the indicator in both verbose and non-verbose streamed turns while the turn is waiting for assistant text.
- Clear the indicator before writing assistant text, human-input prompts, terminal errors, or verbose diagnostics.
- Resume the indicator after verbose model/tool diagnostics when the turn is still continuing toward more assistant text.
- Keep `--stream-off` free of pending-dot terminal output.
- Keep non-TTY output clean of pending animation/control output.

## Acceptance Criteria

- Verbose tool calls and tool results temporarily clear the dots for diagnostics, then restore the dots while waiting continues.
- Verbose model responses that indicate tool continuation restore the dots while waiting continues.
- Verbose model responses that indicate natural completion do not restart the dots.
- Non-verbose tool continuation behavior remains covered.
- Existing stream-off behavior remains covered.
