/**
 * Workspace Environment
 *
 * Purpose:
 * - Resolve the Agent CLI workspace root and load the allowed invocation-local `.env` keys.
 *
 * Key features:
 * - Preserves root precedence across explicit flags, `AGENT_CLI_WORKSPACE`, and cwd.
 * - Resolves `.env` from the process cwd for root discovery, credentials, and relay configuration.
 * - Creates a cwd `.env.example` template when no cwd `.env` exists and no template is present.
 * - Limits `.env` imports to provider credentials and relay configuration.
 *
 * Recent changes:
 * - 2026-05-24: Removed legacy root-env handling.
 * - 2026-05-24: Resolved credential `.env` from cwd instead of the selected workspace root.
 * - 2026-05-23: Extracted shared workspace preparation for `agent-cli` and `agent-world-cli`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config as loadDotEnvConfig } from 'dotenv';

import {
  configureWorkspaceRoot,
  WORKSPACE_ROOT_ENV_KEY,
} from './paths.js';

export const DOTENV_ALLOWED_ENV_KEYS = new Set([
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'XAI_API_KEY',
  'OPENAI_COMPATIBLE_API_KEY',
  'OPENAI_COMPATIBLE_BASE_URL',
  'OLLAMA_BASE_URL',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_RESOURCE_NAME',
  'AZURE_OPENAI_DEPLOYMENT_NAME',
  'AZURE_OPENAI_API_VERSION',
  'AGENT_CLI_RELAY_SERVER_URL',
]);

const DOTENV_EXAMPLE_CONTENT = `# Keep .env limited to credentials and optional relay settings.
# Runtime defaults belong in .agent-world/worlds/{worldId}/world.json,
# .agent-world/worlds/{worldId}/agents/{agentId}/agent.json, or CLI flags.

# Provider credentials
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
XAI_API_KEY=

# OpenAI-compatible
OPENAI_COMPATIBLE_API_KEY=
OPENAI_COMPATIBLE_BASE_URL=

# Ollama
OLLAMA_BASE_URL=http://localhost:11434/v1

# Azure OpenAI
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_RESOURCE_NAME=
AZURE_OPENAI_DEPLOYMENT_NAME=
# AZURE_OPENAI_API_VERSION=

# Remote relay
AGENT_CLI_RELAY_SERVER_URL=

# Optional workspace selection from the invocation directory
# AGENT_CLI_WORKSPACE=
`;

const loadedDotEnvPaths = new Set<string>();

function resolveCwdDotEnvPath(): string {
  return path.join(process.cwd(), '.env');
}

function ensureDotEnvExampleFile(dotEnvPath: string): void {
  if (fs.existsSync(dotEnvPath)) {
    return;
  }

  const examplePath = path.join(path.dirname(dotEnvPath), '.env.example');
  if (fs.existsSync(examplePath)) {
    return;
  }

  try {
    fs.writeFileSync(examplePath, DOTENV_EXAMPLE_CONTENT, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      return;
    }

    throw error;
  }
}

export function loadAllowedDotEnvEnvironment(): void {
  const dotEnvPath = resolveCwdDotEnvPath();

  if (loadedDotEnvPaths.has(dotEnvPath)) {
    return;
  }

  loadedDotEnvPaths.add(dotEnvPath);
  ensureDotEnvExampleFile(dotEnvPath);

  const parsed = loadDotEnvConfig({
    processEnv: {},
    path: dotEnvPath,
    quiet: true,
  }).parsed ?? {};

  for (const [key, value] of Object.entries(parsed)) {
    if (!DOTENV_ALLOWED_ENV_KEYS.has(key)) {
      continue;
    }

    if (typeof process.env[key] === 'string' && process.env[key].trim()) {
      continue;
    }

    process.env[key] = value;
  }
}

export function readWorkspaceRootDotEnvFallback(): string | undefined {
  if (String(process.env[WORKSPACE_ROOT_ENV_KEY] ?? '').trim()) {
    return undefined;
  }

  const parsed = loadDotEnvConfig({
    processEnv: {},
    path: resolveCwdDotEnvPath(),
    quiet: true,
  }).parsed ?? {};
  const workspaceRoot = String(parsed[WORKSPACE_ROOT_ENV_KEY] ?? '').trim();

  return workspaceRoot || undefined;
}

export function prepareWorkspaceEnvironment(workspaceRoot?: string): string {
  const resolvedRoot = configureWorkspaceRoot(workspaceRoot ?? readWorkspaceRootDotEnvFallback());
  loadAllowedDotEnvEnvironment();
  return resolvedRoot;
}
