# Requirement: Agent ID Config

## Story

Users need to choose and create named agents from the CLI, with each agent carrying its own metadata and runtime provider/model configuration under the workspace-local `.agent-world/agents/{agentId}` directory.

## Acceptance Criteria

- `agent-cli --agent-id <agentId>` selects the agent for runtime config, chat persistence, stream traces, and remote state.
- If `--agent-id` is omitted, the CLI uses `default`.
- `agent-cli --new-agent <agentId>` creates or initializes `.agent-world/agents/{agentId}` and selects that agent for the invocation.
- If the selected agent folder is missing, the CLI creates it automatically.
- If required agent fields are missing, the CLI asks for enough information to populate them when an interactive prompt is available: name, provider, and model.
- Non-interactive or scripted invocations can satisfy provider/model through existing runtime flags such as `--provider` and `--model`.
- Agent metadata lives in `agent.json`; runtime provider/model config is loaded from the agent folder. Existing `agent.json` provider/model values must be honored when `runtime.json` is absent.
- Agent-specific runtime config is merged with repo-root `runtime.json`, then CLI flags override both.
- `world.json.defaultAgentId` is updated to the selected or newly created agent.
- README and targeted tests describe the new flags and agent config behavior.

## Non-Goals

- Do not move storage out of `.agent-world/agents/{agentId}`.
- Do not support `.agent-world/{agentId}` as a second layout.
- Do not store provider credentials in `agent.json` or `runtime.json`; credentials still come from environment or workspace `.env`.
- Do not remove existing repo-root `runtime.json` support.
