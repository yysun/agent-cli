// @ts-check
/**
 * Agent CLI Path Constants
 *
 * Purpose:
 * - Centralize workspace-local filesystem paths used by the CLI and store.
 *
 * Key features:
 * - Resolves workspace-local resources from `AGENT_CLI_WORKSPACE` when set, otherwise cwd.
 * - Keeps durable storage directly under `.agent-world` with no world-id folder layer.
 * - Resolves optional `.agent-world/world.json` startup metadata.
 * - Uses `.agent-world/chats` for chat state and `.agent-world/skills` for workspace skills.
 *
 * Recent changes:
 * - 2026-05-27: Added the workspace-local Agent World JSON config path.
 * - 2026-05-26: Added explicit global skill roots for opt-in home-directory skill loading.
 * - 2026-05-26: Flattened storage by removing workspace registry, worlds, world ids, and agent paths.
 * - 2026-05-26: Switched workspace skill storage back to `.agent-world/skills`.
 */
import path from 'node:path';
import os from 'node:os';

export const WORKSPACE_ROOT_ENV_KEY = 'AGENT_CLI_WORKSPACE';

function resolveWorkspaceRoot(workspaceRoot?: string): string {
  const configuredRoot = [
    workspaceRoot,
    process.env[WORKSPACE_ROOT_ENV_KEY],
  ]
    .map((value) => String(value ?? '').trim())
    .find((value) => value.length > 0) ?? '';

  return configuredRoot
    ? path.resolve(configuredRoot)
    : process.cwd();
}

export let WORKSPACE_ROOT = '';
export let REPO_ROOT = '';
export let SYSTEM_PROMPT_PATH = '';
export let USER_SKILLS_ROOT = '';
export let AGENTS_SKILLS_ROOT = '';
export let GLOBAL_SKILLS_ROOTS: string[] = [];
export let SKILLS_ROOT = '';
export let AGENT_WORLD_ROOT = '';
export let AGENT_WORLD_CONFIG_PATH = '';
export let AGENT_WORLD_CHATS_ROOT = '';
export let CURRENT_CHAT_PATH = '';

export function configureWorkspaceRoot(
  workspaceRoot?: string,
  options: { publishEnvironment?: boolean } = {},
): string {
  WORKSPACE_ROOT = resolveWorkspaceRoot(workspaceRoot);
  if (options.publishEnvironment ?? true) {
    process.env[WORKSPACE_ROOT_ENV_KEY] = WORKSPACE_ROOT;
  }

  REPO_ROOT = WORKSPACE_ROOT;
  SYSTEM_PROMPT_PATH = path.join(WORKSPACE_ROOT, 'AGENTS.md');
  USER_SKILLS_ROOT = path.join(os.homedir(), '.agent-world', 'skills');
  AGENTS_SKILLS_ROOT = path.join(os.homedir(), '.agents', 'skills');
  GLOBAL_SKILLS_ROOTS = [USER_SKILLS_ROOT, AGENTS_SKILLS_ROOT];
  AGENT_WORLD_ROOT = path.join(WORKSPACE_ROOT, '.agent-world');
  AGENT_WORLD_CONFIG_PATH = path.join(AGENT_WORLD_ROOT, 'world.json');
  SKILLS_ROOT = path.join(AGENT_WORLD_ROOT, 'skills');
  AGENT_WORLD_CHATS_ROOT = path.join(AGENT_WORLD_ROOT, 'chats');
  CURRENT_CHAT_PATH = path.join(AGENT_WORLD_CHATS_ROOT, 'current.json');

  return WORKSPACE_ROOT;
}

export function configureProjectRoot(projectRoot?: string): string {
  return configureWorkspaceRoot(projectRoot);
}

configureWorkspaceRoot(undefined, { publishEnvironment: false });

/** @param {string} chatId */
export function buildWorldChatDirectoryPath(chatId) {
  return path.join(AGENT_WORLD_CHATS_ROOT, chatId);
}

/** @param {string} chatId */
export function buildWorldChatMetadataPath(chatId) {
  return path.join(buildWorldChatDirectoryPath(chatId), 'chat.json');
}

/** @param {string} chatId */
export function buildWorldChatMessagesPath(chatId) {
  return path.join(buildWorldChatDirectoryPath(chatId), 'messages.jsonl');
}

/** @param {string} chatId */
export function buildWorldChatSummaryPath(chatId) {
  return path.join(buildWorldChatDirectoryPath(chatId), 'summary.md');
}

/** @param {string} chatId */
export function buildWorldChatEventsPath(chatId) {
  return path.join(buildWorldChatDirectoryPath(chatId), 'events.jsonl');
}
