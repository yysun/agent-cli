// @ts-check
/**
 * Agent CLI Workspace Store
 *
 * Purpose:
 * - Manage workspace-level Agent World registry state and selected-world resolution.
 *
 * Key features:
 * - Bootstraps `.agent-world/registry.json` and `.agent-world/worlds/{worldId}`.
 * - Keeps AGENTS.md, `.env`, root runtime config, and workspace skills outside world-owned state.
 *
 * Recent changes:
 * - 2026-05-23: Added workspace API and multi-world storage registry with new-layout-only storage.
 */
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  ACTIVE_WORLD_ID,
  ACTIVE_WORLD_ROOT,
  AGENT_WORLD_ROOT,
  AGENT_WORLD_WORLDS_ROOT,
  WORKSPACE_REGISTRY_PATH,
  WORKSPACE_ROOT,
  WORLD_ID_ENV_KEY,
  configureActiveWorld,
} from './paths.js';

const DEFAULT_WORLD_ID = 'default';
const REGISTRY_SCHEMA_VERSION = 1;
let pinnedWorldId = '';

/**
 * @param {string | undefined | null} value
 */
export function normalizeWorldId(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  const slug = normalized
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || DEFAULT_WORLD_ID;
}

/** @param {string} worldId */
export function pinWorkspaceWorld(worldId) {
  pinnedWorldId = normalizeWorldId(worldId);
  configureActiveWorld(pinnedWorldId);
  return pinnedWorldId;
}

function defaultWorldName() {
  return path.basename(WORKSPACE_ROOT) || 'Default';
}

/**
 * @param {string} filePath
 * @param {unknown} value
 */
async function writeJsonAtomic(filePath, value) {
  const directoryPath = path.dirname(filePath);
  const fileName = path.basename(filePath);
  const temporaryPath = path.join(directoryPath, `.${fileName}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`);

  await fs.mkdir(directoryPath, { recursive: true });
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

/**
 * @param {string} filePath
 */
async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

/**
 * @param {unknown} value
 */
function normalizeRegistry(value) {
  const now = new Date().toISOString();
  const registry = value && typeof value === 'object' ? value : {};
  const rawWorlds = Array.isArray(registry.worlds) ? registry.worlds : [];
  const worlds = rawWorlds
    .map((world) => {
      if (!world || typeof world !== 'object') {
        return null;
      }

      const id = normalizeWorldId(world.id);
      return {
        id,
        name: String(world.name ?? id).trim() || id,
        createdAt: String(world.createdAt ?? now),
        updatedAt: String(world.updatedAt ?? world.createdAt ?? now),
      };
    })
    .filter(Boolean);

  if (!worlds.some((world) => world?.id === DEFAULT_WORLD_ID)) {
    worlds.unshift({
      id: DEFAULT_WORLD_ID,
      name: defaultWorldName(),
      createdAt: now,
      updatedAt: now,
    });
  }

  const currentWorldId = normalizeWorldId(registry.currentWorldId);
  const selectedWorldId = worlds.some((world) => world?.id === currentWorldId)
    ? currentWorldId
    : DEFAULT_WORLD_ID;

  return {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    currentWorldId: selectedWorldId,
    worlds,
    createdAt: String(registry.createdAt ?? now),
    updatedAt: String(registry.updatedAt ?? now),
  };
}

async function readWorkspaceRegistry() {
  const registry = await readJsonIfPresent(WORKSPACE_REGISTRY_PATH);
  return normalizeRegistry(registry);
}

/** @param {ReturnType<typeof normalizeRegistry>} registry */
async function writeWorkspaceRegistry(registry) {
  const nextRegistry = {
    ...registry,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonAtomic(WORKSPACE_REGISTRY_PATH, nextRegistry);
  return nextRegistry;
}

/** @param {string} worldId */
async function ensureWorldDirectories(worldId) {
  const worldRoot = path.join(AGENT_WORLD_WORLDS_ROOT, normalizeWorldId(worldId));
  await Promise.all([
    fs.mkdir(worldRoot, { recursive: true }),
    fs.mkdir(path.join(worldRoot, 'agents'), { recursive: true }),
    fs.mkdir(path.join(worldRoot, 'chats'), { recursive: true }),
    fs.mkdir(path.join(worldRoot, 'queues'), { recursive: true }),
    fs.mkdir(path.join(worldRoot, 'skills'), { recursive: true }),
  ]);
  return worldRoot;
}

/**
 * @param {{ worldId?: string, select?: boolean, name?: string }} [options]
 */
export async function ensureWorkspaceWorld(options = {}) {
  await fs.mkdir(AGENT_WORLD_ROOT, { recursive: true });
  await fs.mkdir(path.join(AGENT_WORLD_ROOT, 'skills'), { recursive: true });
  await fs.mkdir(AGENT_WORLD_WORLDS_ROOT, { recursive: true });

  let registry = await readWorkspaceRegistry();
  const envWorldId = String(process.env[WORLD_ID_ENV_KEY] ?? '').trim();
  const requestedWorldId = options.worldId
    ? pinWorkspaceWorld(options.worldId)
    : (envWorldId ? pinWorkspaceWorld(envWorldId) : pinnedWorldId);

  if (requestedWorldId && !registry.worlds.some((world) => world.id === requestedWorldId)) {
    const now = new Date().toISOString();
    registry.worlds.push({
      id: requestedWorldId,
      name: String(options.name ?? requestedWorldId).trim() || requestedWorldId,
      createdAt: now,
      updatedAt: now,
    });
  }

  const selectedWorldId = requestedWorldId || normalizeWorldId(registry.currentWorldId);
  const nextCurrentWorldId = options.select || !registry.currentWorldId
    ? selectedWorldId
    : normalizeWorldId(registry.currentWorldId);

  registry = {
    ...registry,
    currentWorldId: nextCurrentWorldId,
  };
  registry = await writeWorkspaceRegistry(registry);

  const activeWorldId = selectedWorldId || registry.currentWorldId || DEFAULT_WORLD_ID;
  await ensureWorldDirectories(activeWorldId);
  configureActiveWorld(activeWorldId);

  return {
    workspaceRoot: WORKSPACE_ROOT,
    worldId: ACTIVE_WORLD_ID,
    worldRoot: ACTIVE_WORLD_ROOT,
    registry,
  };
}

export async function listWorkspaceWorlds() {
  const { registry } = await ensureWorkspaceWorld();
  return registry.worlds.map((world) => ({
    ...world,
    isCurrent: world.id === registry.currentWorldId,
  }));
}

/**
 * @param {{ worldId: string, name?: string, select?: boolean }} input
 */
export async function createWorkspaceWorld(input) {
  const worldId = normalizeWorldId(input.worldId);
  let { registry } = await ensureWorkspaceWorld();
  if (!registry.worlds.some((world) => world.id === worldId)) {
    const now = new Date().toISOString();
    registry = await writeWorkspaceRegistry({
      ...registry,
      worlds: [
        ...registry.worlds,
        {
          id: worldId,
          name: String(input.name ?? worldId).trim() || worldId,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
  }

  await ensureWorldDirectories(worldId);

  if (input.select === true) {
    registry = await writeWorkspaceRegistry({
      ...registry,
      currentWorldId: worldId,
    });
    pinWorkspaceWorld(worldId);
  }

  return registry.worlds.find((world) => world.id === worldId) ?? null;
}

/** @param {string} worldId */
export async function selectWorkspaceWorld(worldId) {
  const normalizedWorldId = normalizeWorldId(worldId);
  let { registry } = await ensureWorkspaceWorld();
  if (!registry.worlds.some((world) => world.id === normalizedWorldId)) {
    throw new Error(`Missing world: ${normalizedWorldId}`);
  }

  registry = await writeWorkspaceRegistry({
    ...registry,
    currentWorldId: normalizedWorldId,
  });
  await ensureWorkspaceWorld({ worldId: normalizedWorldId });
  return registry.worlds.find((world) => world.id === normalizedWorldId) ?? null;
}

/**
 * @param {string} worldId
 * @param {string} name
 */
export async function renameWorkspaceWorld(worldId, name) {
  const normalizedWorldId = normalizeWorldId(worldId);
  const normalizedName = String(name ?? '').trim();

  if (!normalizedName) {
    throw new Error('Missing world name.');
  }

  let { registry } = await ensureWorkspaceWorld();
  let found = false;
  registry = {
    ...registry,
    worlds: registry.worlds.map((world) => {
      if (world.id !== normalizedWorldId) {
        return world;
      }

      found = true;
      return {
        ...world,
        name: normalizedName,
        updatedAt: new Date().toISOString(),
      };
    }),
  };

  if (!found) {
    throw new Error(`Missing world: ${normalizedWorldId}`);
  }

  await writeWorkspaceRegistry(registry);
  return registry.worlds.find((world) => world.id === normalizedWorldId) ?? null;
}

/** @param {string} worldId */
export async function deleteWorkspaceWorld(worldId) {
  const normalizedWorldId = normalizeWorldId(worldId);
  let { registry } = await ensureWorkspaceWorld();

  if (normalizedWorldId === DEFAULT_WORLD_ID) {
    throw new Error('Cannot delete the default world.');
  }

  if (registry.currentWorldId === normalizedWorldId) {
    throw new Error('Cannot delete the current world.');
  }

  const nextWorlds = registry.worlds.filter((world) => world.id !== normalizedWorldId);
  if (nextWorlds.length === registry.worlds.length) {
    throw new Error(`Missing world: ${normalizedWorldId}`);
  }

  registry = await writeWorkspaceRegistry({
    ...registry,
    worlds: nextWorlds,
  });
  await fs.rm(path.join(AGENT_WORLD_WORLDS_ROOT, normalizedWorldId), { recursive: true, force: true });

  return {
    worldId: normalizedWorldId,
    deleted: true,
    registry,
  };
}
