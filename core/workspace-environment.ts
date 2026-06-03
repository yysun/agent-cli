/**
 * Workspace Environment
 *
 * Purpose:
 * - Resolve the Agent CLI workspace root and load the allowed workspace-local `.env` keys.
 *
 * Key features:
 * - Preserves root precedence across an explicit workspace flag and cwd.
 * - Resolves `.env` from the selected workspace root for runtime defaults and credentials.
 * - Supports Electron workspace switching by replacing only values previously loaded from workspace `.env` files.
 * - Creates a workspace `.env.example` template when no workspace `.env` exists and no template is present.
 * - Limits `.env` imports to provider credentials and Agent CLI runtime defaults.
 *
 * Recent changes:
 * - 2026-05-26: Resolved `.env` from the selected workspace root instead of invocation cwd.
 * - 2026-05-26: Allowed `AGENT_CLI_GLOBAL_SKILLS` in workspace `.env` for opt-in home skill loading.
 * - 2026-05-26: Added LLM-time runtime defaults to allowed `.env` keys.
 * - 2026-05-26: Added `AGENT_CLI_PROVIDER` and `AGENT_CLI_MODEL` runtime defaults.
 * - 2026-05-26: Removed relay configuration from `.env` handling.
 * - 2026-05-24: Removed legacy root-env handling.
 * - 2026-05-23: Extracted shared workspace preparation for CLI entrypoints.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config as loadDotEnvConfig } from 'dotenv';

import {
  configureWorkspaceRoot,
  WORKSPACE_ROOT,
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
  'AGENT_CLI_MAX_TOOL_TURNS',
  'AGENT_CLI_TOOL_PERMISSION',
  'AGENT_CLI_REASONING_EFFORT',
  'AGENT_CLI_PAST_MESSAGES',
  'AGENT_CLI_STREAM',
  'AGENT_CLI_STREAM_TRACE',
  'AGENT_CLI_WEB_SEARCH',
  'AGENT_CLI_GLOBAL_SKILLS',
]);

const DOTENV_EXAMPLE_CONTENT = `# Keep .env limited to credentials and Agent CLI runtime defaults.
# CLI flags override these runtime defaults.

# Agent CLI runtime
AGENT_CLI_PROVIDER=ollama
AGENT_CLI_MODEL=emma4:e4b
AGENT_CLI_TEMPERATURE=1
AGENT_CLI_MAX_TOKENS=4096
AGENT_CLI_MAX_TOOL_TURNS=24
AGENT_CLI_TOOL_PERMISSION=ask
AGENT_CLI_REASONING_EFFORT=medium
AGENT_CLI_PAST_MESSAGES=20
AGENT_CLI_STREAM=true
AGENT_CLI_STREAM_TRACE=false
AGENT_CLI_WEB_SEARCH=false
AGENT_CLI_GLOBAL_SKILLS=false

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
`;

const loadedDotEnvPaths = new Set<string>();
const workspaceDotEnvOriginalValues = new Map<string, string | undefined>();
const workspaceDotEnvManagedKeys = new Set<string>();

type DotEnvLoadOptions = {
  refresh?: boolean;
};

type WorkspaceEnvironmentOptions = {
  refreshDotEnv?: boolean;
};

function resolveWorkspaceDotEnvPath(workspaceRoot = WORKSPACE_ROOT): string {
  return path.join(workspaceRoot || process.cwd(), '.env');
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

function restoreManagedDotEnvKeys(parsedEnvironment: Record<string, string>): void {
  for (const key of workspaceDotEnvManagedKeys) {
    if (Object.hasOwn(parsedEnvironment, key)) {
      continue;
    }

    const originalValue = workspaceDotEnvOriginalValues.get(key);
    if (typeof originalValue === 'undefined') {
      delete process.env[key];
    } else {
      process.env[key] = originalValue;
    }
    workspaceDotEnvManagedKeys.delete(key);
  }
}

export function loadAllowedDotEnvEnvironment(
  workspaceRoot = WORKSPACE_ROOT,
  options: DotEnvLoadOptions = {},
): void {
  const dotEnvPath = resolveWorkspaceDotEnvPath(workspaceRoot);

  if (!options.refresh && loadedDotEnvPaths.has(dotEnvPath)) {
    return;
  }

  loadedDotEnvPaths.add(dotEnvPath);
  ensureDotEnvExampleFile(dotEnvPath);

  const parsed = loadDotEnvConfig({
    processEnv: {},
    path: dotEnvPath,
    quiet: true,
  }).parsed ?? {};

  if (options.refresh) {
    restoreManagedDotEnvKeys(parsed);
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (!DOTENV_ALLOWED_ENV_KEYS.has(key)) {
      continue;
    }

    if (
      !workspaceDotEnvManagedKeys.has(key)
      && typeof process.env[key] === 'string'
      && process.env[key].trim()
    ) {
      continue;
    }

    if (!workspaceDotEnvOriginalValues.has(key)) {
      workspaceDotEnvOriginalValues.set(key, process.env[key]);
    }

    process.env[key] = value;
    workspaceDotEnvManagedKeys.add(key);
  }
}

export function prepareWorkspaceEnvironment(
  workspaceRoot?: string,
  options: WorkspaceEnvironmentOptions = {},
): string {
  const resolvedRoot = configureWorkspaceRoot(workspaceRoot);
  loadAllowedDotEnvEnvironment(resolvedRoot, { refresh: options.refreshDotEnv === true });
  return resolvedRoot;
}
