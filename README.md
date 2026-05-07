# Agent CLI

Project: Agent CLI
Repo: yysun/agent-cli
CLI: agent-cli
Core objects:
- Memory = map marks
- Tension = terrain signals
- Insight = route judgment
- Action = next move

## CLI

Run the chat CLI with:

```bash
npm run agent-cli -- --new-chat "Map my next financial move"
```

Follow-up messages reuse the current chat automatically:

```bash
npm run agent-cli -- "What should I do first?"
```

Use `--verbose` when you want startup and runtime-selection diagnostics on stderr without affecting the assistant response on stdout.

### Agent Files

- System prompt: `./agent/system.md`
- Skills root: `./agent/skills/`
- Sessions: `./agent/sessions/`

The CLI treats the current working directory as the project root by default. Run it from the folder that contains `./agent`, or set `AGENT_CLI_ROOT` to point at a different project root.

Skills follow `llm-runtime` conventions and are discovered from recursive `SKILL.md` files under `./agent/skills/`.

### Runtime Configuration

Set runtime environment variables before running the CLI:

- `LLM_PROVIDER` defaults to `openai`
- `LLM_MODEL` defaults to `gpt-5` for `openai` and is required for other providers
- Provider credentials depend on `LLM_PROVIDER`

Supported provider env vars:

- `openai`: `OPENAI_API_KEY`
- `anthropic`: `ANTHROPIC_API_KEY`
- `google`: `GOOGLE_API_KEY`
- `xai`: `XAI_API_KEY`
- `openai-compatible`: `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_BASE_URL`
- `ollama`: `OLLAMA_BASE_URL`
- `azure`: `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_RESOURCE_NAME`, `AZURE_OPENAI_DEPLOYMENT_NAME` (or legacy `AZURE_OPENAI_DEPLOYMENT`), optional `AZURE_OPENAI_API_VERSION`

### Tests

- `npm test`: syntax checks plus all Vitest suites
- `npm run test:unit`: targeted module tests
- `npm run test:e2e`: end-to-end CLI flows against a real LLM provider

The repo now uses package-level ESM via `"type": "module"`, so local modules use `.js` files instead of `.mjs`.

The e2e suite uses the same runtime validation path as the CLI and always expects a usable live provider configuration. It prefers the configured provider when that configuration is complete; otherwise it falls back to another available live provider for the test process when possible. If no usable provider configuration is available, `npm run test:e2e` fails fast instead of skipping.