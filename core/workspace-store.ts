// @ts-check
/**
 * Agent CLI Workspace Store
 *
 * Purpose:
 * - Bootstrap the flat `.agent-world` storage layout for the local CLI.
 *
 * Key features:
 * - Creates `.agent-world/chats` and `.agent-world/skills`.
 * - Keeps the historical `ensureWorkspaceWorld` export as a compatibility name for local storage setup.
 * - Does not create registries, world ids, `world.json`, agents, or queues.
 *
 * Recent changes:
 * - 2026-05-26: Re-resolved `AGENT_CLI_WORKSPACE` before creating workspace storage.
 * - 2026-05-26: Removed workspace registry and multi-world storage.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  AGENT_WORLD_CHATS_ROOT,
  AGENT_WORLD_ROOT,
  configureWorkspaceRoot,
  SKILLS_ROOT,
  WORKSPACE_ROOT,
  WORKSPACE_ROOT_ENV_KEY,
} from './paths.js';

function syncWorkspaceRootFromEnvironment() {
  const configuredWorkspaceRoot = String(process.env[WORKSPACE_ROOT_ENV_KEY] ?? '').trim();

  if (!configuredWorkspaceRoot) {
    return;
  }

  const resolvedWorkspaceRoot = path.resolve(configuredWorkspaceRoot);
  if (resolvedWorkspaceRoot !== WORKSPACE_ROOT) {
    configureWorkspaceRoot(resolvedWorkspaceRoot);
  }
}

export async function ensureWorkspaceStorage() {
  syncWorkspaceRootFromEnvironment();

  await Promise.all([
    fs.mkdir(AGENT_WORLD_ROOT, { recursive: true }),
    fs.mkdir(AGENT_WORLD_CHATS_ROOT, { recursive: true }),
    fs.mkdir(SKILLS_ROOT, { recursive: true }),
  ]);

  return {
    workspaceRoot: WORKSPACE_ROOT,
    storageRoot: AGENT_WORLD_ROOT,
    chatsRoot: AGENT_WORLD_CHATS_ROOT,
    skillsRoot: SKILLS_ROOT,
  };
}

export async function ensureWorkspaceWorld() {
  return ensureWorkspaceStorage();
}
