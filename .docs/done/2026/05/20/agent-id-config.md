# Done: Agent ID Config

## Summary

Added CLI-level named-agent support:

- `--agent-id <id>` selects an existing or missing agent, defaulting to `default` when omitted.
- `--new-agent <id>` creates/selects an agent under `.agent-world/agents/{id}`.
- Missing selected-agent folders are initialized automatically with `agent.json`, `runtime.json`, state, inbox, events, and memory files.
- Interactive creation asks for name, provider, and model when a prompt is available.
- Non-interactive creation can use `--provider` and `--model`.
- Runtime config now merges repo `runtime.json`, agent `agent.json`, agent `runtime.json`, and CLI flags in that order.

## Files

- `cli/src/cli-shell.ts`
- `core/session-store.ts`
- `core/agent-config.ts`
- `README.md`
- `tests/unit/agent-cli.test.js`
- `tests/unit/session-store.test.js`
- `tests/unit/agent-config.test.js`

Generated outputs were rebuilt in `bin/agent-cli.js`, `core/session-store.js`, and `core/agent-config.js`.

## Validation

- `npm run test:syntax && npm run test:unit`: 102 unit tests passed.
- Temporary-workspace smoke: `node ./bin/agent-cli.js --workspace <tmp> --new-agent research --provider ollama --model gemma4:e4b --help`

Both passed.
