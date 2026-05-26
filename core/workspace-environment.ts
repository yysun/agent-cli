/**
 * Workspace Environment
 *
 * Purpose:
 * - Resolve the Agent CLI workspace root and load the allowed invocation-local `.env` keys.
 *
 * Key features:
 * - Preserves root precedence across explicit flags, `AGENT_CLI_WORKSPACE`, and cwd.
 * - Resolves `.env` from the process cwd for root discovery, runtime defaults, and credentials.
 * - Creates a cwd `.env.example` template when no cwd `.env` exists and no template is present.
 * - Limits `.env` imports to provider credentials, Agent CLI runtime defaults, and optional workspace selection.
 *
 * Recent changes:
 * - 2026-05-26: Added LLM-time runtime defaults to allowed `.env` keys.
 * - 2026-05-26: Added `AGENT_CLI_PROVIDER` and `AGENT_CLI_MODEL` runtime defaults.
 * - 2026-05-26: Removed relay configuration from `.env` handling.
 * - 2026-05-24: Removed legacy root-env handling.
 * - 2026-05-24: Resolved credential `.env` from cwd instead of the selected workspace root.
 * - 2026-05-23: Extracted shared workspace preparation for CLI entrypoints.
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
  'AGENT_CLI_PROVIDER',
  'AGENT_CLI_MODEL',
  'AGENT_CLI_TEMPERATURE',
  'AGENT_CLI_MAX_TOKENS',
  'AGENT_CLI_TOOL_PERMISSION',
  'AGENT_CLI_REASONING_EFFORT',
  'AGENT_CLI_PAST_MESSAGES',
  'AGENT_CLI_STREAM',
  'AGENT_CLI_STREAM_TRACE',
  'AGENT_CLI_WEB_SEARCH',
  WORKSPACE_ROOT_ENV_KEY,
]);

const DOTENV_EXAMPLE_CONTENT = `# Keep .env limited to credentials, Agent CLI runtime defaults, and optional workspace selection.
# CLI flags override these runtime defaults.

# Agent CLI runtime
AGENT_CLI_PROVIDER=openai
AGENT_CLI_MODEL=gpt-5
# AGENT_CLI_TEMPERATURE=0.2
# AGENT_CLI_MAX_TOKENS=4096
# AGENT_CLI_TOOL_PERMISSION=ask
# AGENT_CLI_REASONING_EFFORT=medium
# AGENT_CLI_PAST_MESSAGES=20
# AGENT_CLI_STREAM=true
# AGENT_CLI_STREAM_TRACE=false
# AGENT_CLI_WEB_SEARCH=false

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
