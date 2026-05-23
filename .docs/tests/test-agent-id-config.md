# E2E Spec: Agent ID Config

## Scenario: Create a new agent from the CLI

1. Start from a temporary workspace root with no `.agent-world`.
2. Run `agent-cli --workspace <root> --new-agent research --provider ollama --model gemma4:e4b --help`.
3. Confirm `.agent-world/world.json` exists and has `defaultAgentId: "research"`.
4. Confirm `.agent-world/agents/research/agent.json` exists with `id`, `name`, `provider`, and `model`.
5. Confirm `.agent-world/agents/research/runtime.json` exists with provider/model runtime fields.

## Scenario: Select an existing agent

1. Create two agent folders under `.agent-world/agents`.
2. Run `agent-cli --workspace <root> --agent-id analyst --help`.
3. Confirm `world.json.defaultAgentId` is `analyst`.
4. Confirm no files are written under `.agent-world/analyst`.

## Scenario: Agent metadata provides runtime config

1. Create `.agent-world/agents/default/agent.json` with provider/model and no runtime.json.
2. Run a CLI invocation with mocked or locally available provider configuration.
3. Confirm runtime uses the provider/model from `agent.json` instead of falling back to OpenAI.

## Scenario: Prompt for missing new-agent fields

1. Run `agent-cli --new-agent draft` in an interactive terminal with no provider/model flags.
2. Enter a name, provider, and model when prompted.
3. Confirm the agent folder is created with the entered values.

## Verification

- Unit coverage validates CLI parsing, new-agent initialization from flags, interactive prompt wiring, named-agent selection, and `agent.json` provider/model fallback.
- Manual smoke verified that `--new-agent research --provider ollama --model gemma4:e4b --help` creates `.agent-world/agents/research`, updates `world.json.defaultAgentId`, writes `agent.json` and `runtime.json`, and does not create `.agent-world/research`.
