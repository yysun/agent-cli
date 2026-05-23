# Targeted Regression Spec: Agent World CLI Stream Display

## Unit Scenario: Interactive Plain Text Streams Assistant Output

1. Run `agent-world-cli` interactive mode through a mocked runtime that emits stream chunks for a plain text send.
2. Enter a plain text message.
3. Confirm assistant chunks are written as they arrive, before the prompt returns.
4. Confirm the prompt remains usable after the streamed response completes.

## Unit Scenario: Interactive Tool Diagnostics

1. Run `agent-world-cli` interactive mode through a mocked runtime that emits a tool call and tool result during a send.
2. Enter a plain text message.
3. Confirm stderr contains the same concise tool call/result style used by `agent-cli`.
4. Confirm stdout assistant text is not corrupted by diagnostics.

## Unit Scenario: Non-Interactive Send Remains JSON

1. Run `agent-world-cli send <message>` as a one-shot command.
2. Confirm stdout is valid JSON.
3. Confirm no streamed assistant text or terminal control output is emitted outside the JSON result.

## Binary Smoke Scenario: Interactive Startup

1. Run the built `bin/agent-world-cli.js` in interactive mode with provider-free environment.
2. Send `/help` and `/exit` through stdin.
3. Confirm the process exits cleanly and prints the interactive command list.
