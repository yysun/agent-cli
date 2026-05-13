// @ts-check
/**
 * Agent CLI Path Constants
 *
 * Purpose:
 * - Centralize project-local filesystem paths used by the CLI and session store.
 *
 * Key features:
 * - Resolves codex/copilot-style resources from the current working directory by default.
 * - Supports a test-only root override through `AGENT_CLI_ROOT`.
 * - Keeps path construction in one place for CLI helpers.
 *
 * Recent changes:
 * - 2026-05-07: Added shared path helpers for the CLI implementation.
 * - 2026-05-07: Added `AGENT_CLI_ROOT` override support for isolated Vitest runs.
 * - 2026-05-07: Switched prompt, skills, and chat storage to AGENTS/.agents/.chats.
 */
import path from 'node:path';

const configuredRoot = String(process.env.AGENT_CLI_ROOT ?? '').trim();

export const REPO_ROOT = configuredRoot
  ? path.resolve(configuredRoot)
  : process.cwd();
export const SYSTEM_PROMPT_PATH = path.join(REPO_ROOT, 'AGENTS.md');
export const SKILLS_ROOT = path.join(REPO_ROOT, '.agents', 'skills');
export const SESSIONS_ROOT = path.join(REPO_ROOT, '.chats');
export const CHAT_DIRECTORY = SESSIONS_ROOT;
export const CURRENT_CHAT_PATH = path.join(SESSIONS_ROOT, 'current.json');
export const REMOTE_HOST_LOCK_PATH = path.join(SESSIONS_ROOT, 'remote-host.lock.json');