# E2E Spec: Retire Runtime JSON

## Scenario: World Runtime Defaults

1. Create a workspace with selected-world `world.json` containing provider/model/runtime defaults.
2. Run a CLI turn without `--provider` or `--model`.
3. Confirm startup diagnostics and runtime execution use the selected world's settings.
4. Confirm no workspace `runtime.json` is required.

## Scenario: Agent Settings Override World Defaults

1. Create a world with provider/model defaults in `world.json`.
2. Create an agent with different provider/model settings in `agent.json`.
3. Run a CLI turn with that agent selected.
4. Confirm the agent settings override the world defaults.

## Scenario: CLI Flags Override Persisted Settings

1. Create world and agent runtime settings.
2. Run with explicit `--provider` and `--model`.
3. Confirm CLI flag values win over both `agent.json` and `world.json`.

## Scenario: New Agent Writes Agent JSON Only

1. Run `agent-cli --new-agent research --provider ollama --model gemma4:e4b --help`.
2. Confirm `agents/research/agent.json` contains provider/model.
3. Confirm `agents/research/runtime.json` does not exist.

## Scenario: Error Messages Do Not Mention Runtime JSON

1. Configure a provider with no model default and no model in `world.json`, `agent.json`, or CLI flags.
2. Run the CLI.
3. Confirm the error message points to `world.json`, `agent.json`, or `--model`, not `runtime.json`.

## Execution Status

- Passed.
- `npm run test:unit`
- `npm run test:syntax`
- `npm run test:e2e:relay`
- `npm run web:typecheck`
