// @ts-check
/**
 * Agent CLI Path Constants
 *
 * Purpose:
 * - Centralize repo-local filesystem paths used by the CLI and session store.
 *
 * Key features:
 * - Resolves `./agent` resources from the repository root.
 * - Keeps path construction in one place for CLI helpers.
 *
 * Recent changes:
 * - 2026-05-07: Added shared path helpers for the CLI implementation.
 * - 2026-05-07: Added `AGENT_CLI_ROOT` override support for isolated Vitest runs.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const configuredRoot = String(process.env.AGENT_CLI_ROOT ?? '').trim();

export const REPO_ROOT = configuredRoot
  ? path.resolve(configuredRoot)
  : path.resolve(moduleDirectory, '..');
export const AGENT_DIR = path.join(REPO_ROOT, 'agent');
export const SYSTEM_PROMPT_PATH = path.join(AGENT_DIR, 'system.md');
export const SKILLS_ROOT = path.join(AGENT_DIR, 'skills');
export const SESSIONS_ROOT = path.join(AGENT_DIR, 'sessions');
export const CHAT_DIRECTORY = path.join(SESSIONS_ROOT, 'chats');
export const CURRENT_CHAT_PATH = path.join(SESSIONS_ROOT, 'current.json');