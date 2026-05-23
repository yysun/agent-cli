// @ts-check
/**
 * Agent CLI Path Constants
 *
 * Purpose:
 * - Centralize workspace-local filesystem paths used by the CLI and world store.
 *
 * Key features:
 * - Resolves workspace-local resources from `AGENT_CLI_WORKSPACE` when set, otherwise compatibility env or cwd.
 * - Keeps path construction in one place for CLI helpers.
 * - Separates workspace-owned paths from selected-world paths under `.agent-world/worlds/{worldId}`.
 *
 * Recent changes:
 * - 2026-05-23: Renamed the loaded root terminology from project to workspace.
 * - 2026-05-07: Added shared path helpers for the CLI implementation.
 * - 2026-05-07: Added `AGENT_CLI_ROOT` override support for isolated runs.
 * - 2026-05-07: Switched prompt, skills, and chat storage to AGENTS/.agents/.chats.
 * - 2026-05-14: Added `.agent-world` runtime-config paths for root and agent overrides.
 * - 2026-05-14: Added `.agent-world` chat and agent persistence paths.
 * - 2026-05-23: Moved skills under `.agent-world/skills`.
 * - 2026-05-23: Added workspace registry and selected-world path roots for multi-world storage.
 */
import path from 'node:path';

export const WORKSPACE_ROOT_ENV_KEY = 'AGENT_CLI_WORKSPACE';
export const LEGACY_PROJECT_ROOT_ENV_KEY = 'AGENT_CLI_ROOT';
export const WORLD_ID_ENV_KEY = 'AGENT_CLI_WORLD';

function resolveWorkspaceRoot(workspaceRoot?: string): string {
  const configuredRoot = [
    workspaceRoot,
    process.env[WORKSPACE_ROOT_ENV_KEY],
    process.env[LEGACY_PROJECT_ROOT_ENV_KEY],
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
export let ROOT_RUNTIME_CONFIG_PATH = '';
export let SKILLS_ROOT = '';
export let AGENT_WORLD_ROOT = '';
export let WORKSPACE_REGISTRY_PATH = '';
export let AGENT_WORLD_WORLDS_ROOT = '';
export let ACTIVE_WORLD_ID = '';
export let ACTIVE_WORLD_ROOT = '';
export let WORLD_STATE_PATH = '';
export let AGENT_WORLD_CHATS_ROOT = '';
export let AGENT_WORLD_AGENTS_ROOT = '';
export let AGENT_WORLD_QUEUES_ROOT = '';
export let WORLD_SKILLS_ROOT = '';
export let REMOTE_HOST_LOCK_PATH = '';

function configureActiveWorldPaths(worldId = 'default'): string {
  ACTIVE_WORLD_ID = String(worldId || 'default').trim() || 'default';
  ACTIVE_WORLD_ROOT = path.join(AGENT_WORLD_WORLDS_ROOT, ACTIVE_WORLD_ID);
  WORLD_STATE_PATH = path.join(ACTIVE_WORLD_ROOT, 'world.json');
  AGENT_WORLD_CHATS_ROOT = path.join(ACTIVE_WORLD_ROOT, 'chats');
  AGENT_WORLD_AGENTS_ROOT = path.join(ACTIVE_WORLD_ROOT, 'agents');
  AGENT_WORLD_QUEUES_ROOT = path.join(ACTIVE_WORLD_ROOT, 'queues');
  WORLD_SKILLS_ROOT = path.join(ACTIVE_WORLD_ROOT, 'skills');
  REMOTE_HOST_LOCK_PATH = path.join(ACTIVE_WORLD_ROOT, 'remote-host.lock.json');

  return ACTIVE_WORLD_ROOT;
}

export function configureWorkspaceRoot(workspaceRoot?: string): string {
  WORKSPACE_ROOT = resolveWorkspaceRoot(workspaceRoot);
  REPO_ROOT = WORKSPACE_ROOT;
  SYSTEM_PROMPT_PATH = path.join(WORKSPACE_ROOT, 'AGENTS.md');
  ROOT_RUNTIME_CONFIG_PATH = path.join(WORKSPACE_ROOT, 'runtime.json');
  AGENT_WORLD_ROOT = path.join(WORKSPACE_ROOT, '.agent-world');
  SKILLS_ROOT = path.join(AGENT_WORLD_ROOT, 'skills');
  WORKSPACE_REGISTRY_PATH = path.join(AGENT_WORLD_ROOT, 'registry.json');
  AGENT_WORLD_WORLDS_ROOT = path.join(AGENT_WORLD_ROOT, 'worlds');
  configureActiveWorldPaths(ACTIVE_WORLD_ID || 'default');

  return WORKSPACE_ROOT;
}

/** @param {string} worldId */
export function configureActiveWorld(worldId) {
  return configureActiveWorldPaths(worldId);
}

export function configureProjectRoot(projectRoot?: string): string {
  return configureWorkspaceRoot(projectRoot);
}

configureWorkspaceRoot();

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

/** @param {string} agentId */
export function buildAgentDirectoryPath(agentId) {
  return path.join(AGENT_WORLD_AGENTS_ROOT, agentId);
}

/** @param {string} agentId */
export function buildAgentMetadataPath(agentId) {
  return path.join(buildAgentDirectoryPath(agentId), 'agent.json');
}

/** @param {string} agentId */
export function buildAgentInboxPath(agentId) {
  return path.join(buildAgentDirectoryPath(agentId), 'inbox.jsonl');
}

/** @param {string} agentId */
export function buildAgentStatePath(agentId) {
  return path.join(buildAgentDirectoryPath(agentId), 'state.json');
}

/** @param {string} agentId */
export function buildAgentEventsPath(agentId) {
  return path.join(buildAgentDirectoryPath(agentId), 'events.jsonl');
}

/** @param {string} agentId */
export function buildAgentMemoryPath(agentId) {
  return path.join(buildAgentDirectoryPath(agentId), 'memory.md');
}

/** @param {string} agentId */
export function buildAgentMemoryLogPath(agentId) {
  return path.join(buildAgentDirectoryPath(agentId), 'memory.jsonl');
}

/** @param {string} agentId */
export function buildAgentRuntimeConfigPath(agentId) {
  return path.join(buildAgentDirectoryPath(agentId), 'runtime.json');
}

/** @param {string} chatId */
export function buildWorldQueuePath(chatId) {
  return path.join(AGENT_WORLD_QUEUES_ROOT, `${chatId}.json`);
}
