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
 * - 2026-05-26: Removed workspace registry and multi-world storage.
 */
import { promises as fs } from 'node:fs';

import {
  AGENT_WORLD_CHATS_ROOT,
  AGENT_WORLD_ROOT,
  SKILLS_ROOT,
  WORKSPACE_ROOT,
} from './paths.js';

export async function ensureWorkspaceStorage() {
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
