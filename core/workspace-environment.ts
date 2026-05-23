/**
 * Workspace Environment
 *
 * Purpose:
 * - Resolve the Agent CLI workspace root and load the allowed workspace-local `.env` keys.
 *
 * Key features:
 * - Preserves root precedence across explicit flags, `AGENT_CLI_WORKSPACE`, legacy `AGENT_CLI_ROOT`, and cwd.
 * - Supports cwd `.env` fallback for workspace root discovery before loading workspace-local credentials.
 * - Limits `.env` imports to provider credentials and relay configuration.
 *
 * Recent changes:
 * - 2026-05-23: Extracted shared workspace preparation for `agent-cli` and `agent-world-cli`.
 */
import path from 'node:path';
import { config as loadDotEnvConfig } from 'dotenv';

import {
  configureWorkspaceRoot,
  LEGACY_PROJECT_ROOT_ENV_KEY,
  WORKSPACE_ROOT,
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

const loadedDotEnvRoots = new Set<string>();

export function loadAllowedDotEnvEnvironment(): void {
  if (loadedDotEnvRoots.has(WORKSPACE_ROOT)) {
    return;
  }

  loadedDotEnvRoots.add(WORKSPACE_ROOT);

  const parsed = loadDotEnvConfig({
    processEnv: {},
    path: path.join(WORKSPACE_ROOT, '.env'),
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
  if (
    String(process.env[WORKSPACE_ROOT_ENV_KEY] ?? '').trim()
    || String(process.env[LEGACY_PROJECT_ROOT_ENV_KEY] ?? '').trim()
  ) {
    return undefined;
  }

  const parsed = loadDotEnvConfig({
    processEnv: {},
    path: path.join(process.cwd(), '.env'),
    quiet: true,
  }).parsed ?? {};
  const workspaceRoot = String(parsed[WORKSPACE_ROOT_ENV_KEY] ?? '').trim();
  const legacyProjectRoot = String(parsed[LEGACY_PROJECT_ROOT_ENV_KEY] ?? '').trim();

  return workspaceRoot || legacyProjectRoot || undefined;
}

export function prepareWorkspaceEnvironment(workspaceRoot?: string): string {
  const resolvedRoot = configureWorkspaceRoot(workspaceRoot ?? readWorkspaceRootDotEnvFallback());
  loadAllowedDotEnvEnvironment();
  return resolvedRoot;
}
