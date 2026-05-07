// @ts-check
/**
 * Agent CLI Path Constants
 *
 * Purpose:
 * - Centralize project-local filesystem paths used by the CLI and session store.
 *
 * Key features:
 * - Resolves `./agent` resources from the current working directory by default.
 * - Supports a test-only root override through `AGENT_CLI_ROOT`.
 * - Keeps path construction in one place for CLI helpers.
 *
 * Recent changes:
 * - 2026-05-07: Added shared path helpers for the CLI implementation.
 * - 2026-05-07: Added `AGENT_CLI_ROOT` override support for isolated Vitest runs.
 */
import path from 'node:path';

const configuredRoot = String(process.env.AGENT_CLI_ROOT ?? '').trim();

export const REPO_ROOT = configuredRoot
  ? path.resolve(configuredRoot)
  : process.cwd();
export const AGENT_DIR = path.join(REPO_ROOT, 'agent');
export const AGENT_CONFIG_PATH = path.join(AGENT_DIR, 'config.json');
export const SYSTEM_PROMPT_PATH = path.join(AGENT_DIR, 'system.md');
export const SKILLS_ROOT = path.join(AGENT_DIR, 'skills');
export const SESSIONS_ROOT = path.join(AGENT_DIR, 'sessions');
export const CHAT_DIRECTORY = path.join(SESSIONS_ROOT, 'chats');
export const CURRENT_CHAT_PATH = path.join(SESSIONS_ROOT, 'current.json');