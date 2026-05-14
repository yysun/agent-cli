// @ts-check
/**
 * Agent CLI Agent Config Loading
 *
 * Purpose:
 * - Normalize runtime overrides from CLI flags and optional runtime.json files.
 *
 * Key features:
 * - Normalizes common aliases such as `modal`, `tokens`, `permissions`, and `reasoning`.
 * - Loads repo-root runtime defaults from `./runtime.json` when present.
 * - Applies an optional default-agent runtime override from `./.agent-world/agents/{agentId}/runtime.json`.
 * - Validates supported enum values before runtime calls.
 * - Keeps runtime override parsing separate from provider credential environment variables.
 *
 * Recent changes:
 * - 2026-05-07: Retired JSON config-file loading in favor of CLI/runtime-file config.
 * - 2026-05-14: Restored optional runtime.json defaults at the repo root and default-agent scope.
 */

import { promises as fs } from 'node:fs';

import {
  buildAgentRuntimeConfigPath,
  ROOT_RUNTIME_CONFIG_PATH,
  WORLD_STATE_PATH,
} from './paths.js';

const REASONING_EFFORTS = new Set(['default', 'none', 'low', 'medium', 'high']);
const TOOL_PERMISSIONS = new Set(['auto', 'ask', 'read']);
const WEB_SEARCH_CONTEXT_SIZES = new Set(['low', 'medium', 'high']);

/** @param {unknown} value */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {Record<string, unknown>} source
 * @param {string[]} keys
 */
function readAliasedValue(source, keys) {
  for (const key of keys) {
    if (Object.hasOwn(source, key)) {
      return source[key];
    }
  }

  return undefined;
}

/**
 * @param {unknown} value
 * @param {string} label
 */
function normalizeString(value, label) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = String(value).trim();

  if (!normalized) {
    throw new Error(`Invalid agent config value for ${label}: expected a non-empty string.`);
  }

  return normalized;
}

/**
 * @param {unknown} value
 * @param {string} label
 */
function normalizeNumber(value, label) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const normalized = Number(value);

  if (!Number.isFinite(normalized)) {
    throw new Error(`Invalid agent config value for ${label}: expected a number.`);
  }

  return normalized;
}

/**
 * @param {unknown} value
 * @param {string} label
 */
function normalizePositiveInteger(value, label) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized < 1) {
    throw new Error(`Invalid agent config value for ${label}: expected a positive integer.`);
  }

  return normalized;
}

/**
 * @param {unknown} value
 * @param {string} label
 */
function normalizeNonNegativeInteger(value, label) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new Error(`Invalid agent config value for ${label}: expected a non-negative integer.`);
  }

  return normalized;
}

/**
 * @param {unknown} value
 * @param {string} label
 */
function normalizeBoolean(value, label) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  throw new Error(`Invalid agent config value for ${label}: expected true or false.`);
}

/**
 * @param {unknown} value
 * @param {string} label
 * @param {Set<string>} allowedValues
 */
function normalizeEnum(value, label, allowedValues) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const normalized = String(value).trim().toLowerCase();

  if (!allowedValues.has(normalized)) {
    throw new Error(
      `Invalid agent config value for ${label}: expected one of ${[...allowedValues].join(', ')}.`,
    );
  }

  return normalized;
}

/** @param {unknown} value */
function normalizeReasoningEffort(value) {
  if (isPlainObject(value)) {
    return normalizeReasoningEffort(readAliasedValue(value, ['effort', 'reasoningEffort']));
  }

  return normalizeEnum(value, 'reasoning', REASONING_EFFORTS);
}

/** @param {unknown} value */
function normalizeToolPermission(value) {
  if (isPlainObject(value)) {
    return normalizeToolPermission(readAliasedValue(value, ['default', 'toolPermission', 'permission']));
  }

  return normalizeEnum(value, 'permissions', TOOL_PERMISSIONS);
}

/** @param {unknown} value */
function normalizeWebSearch(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }

    const searchContextSize = normalizeEnum(normalized, 'webSearch.searchContextSize', WEB_SEARCH_CONTEXT_SIZES);
    return searchContextSize ? { searchContextSize } : undefined;
  }

  if (!isPlainObject(value)) {
    throw new Error('Invalid agent config value for webSearch: expected a boolean, string, or object.');
  }

  const enabled = readAliasedValue(value, ['enabled']);

  if (enabled === false) {
    return false;
  }

  const searchContextSize = normalizeEnum(
    readAliasedValue(value, ['searchContextSize', 'contextSize', 'size']),
    'webSearch.searchContextSize',
    WEB_SEARCH_CONTEXT_SIZES,
  );

  if (searchContextSize) {
    return { searchContextSize };
  }

  return true;
}

/**
 * @typedef {{
 *   provider?: string,
 *   model?: string,
 *   temperature?: number,
 *   maxTokens?: number,
 *   toolPermission?: 'auto' | 'ask' | 'read',
 *   reasoningEffort?: 'default' | 'none' | 'low' | 'medium' | 'high',
 *   webSearch?: boolean | { searchContextSize?: 'low' | 'medium' | 'high' },
 *   pastMessages?: number,
 *   stream?: boolean,
 *   streamTrace?: boolean,
 * }} AgentConfig
 */

const AGENT_CONFIG_ALIASES = {
  provider: ['provider'],
  model: ['model', 'modal'],
  temperature: ['temperature'],
  maxTokens: ['maxTokens', 'maxOutputTokens', 'tokens', 'max-tokens', 'max-output-tokens'],
  toolPermission: ['toolPermission', 'permission', 'permissions', 'tool-permission'],
  reasoningEffort: ['reasoningEffort', 'reasoning', 'reasoning-effort'],
  pastMessages: ['pastMessages', 'historyMessages', 'past_messages', 'past-messages', 'history-messages'],
  stream: ['stream'],
  streamTrace: ['streamTrace', 'stream_trace', 'stream-trace'],
  webSearch: ['webSearch', 'web_search', 'web-search'],
};

/**
 * @param {Record<string, unknown>} source
 */
export function normalizeAgentConfig(source) {
  const configSource = isPlainObject(source.runtime)
    ? {
      ...source,
      ...source.runtime,
    }
    : source;

  /** @type {AgentConfig} */
  const normalizedConfig = {
    provider: normalizeString(readAliasedValue(configSource, AGENT_CONFIG_ALIASES.provider), 'provider'),
    model: normalizeString(readAliasedValue(configSource, AGENT_CONFIG_ALIASES.model), 'model'),
    temperature: normalizeNumber(readAliasedValue(configSource, AGENT_CONFIG_ALIASES.temperature), 'temperature'),
    maxTokens: normalizePositiveInteger(
      readAliasedValue(configSource, AGENT_CONFIG_ALIASES.maxTokens),
      'maxTokens',
    ),
    toolPermission: normalizeToolPermission(
      readAliasedValue(configSource, AGENT_CONFIG_ALIASES.toolPermission),
    ),
    reasoningEffort: normalizeReasoningEffort(
      readAliasedValue(configSource, AGENT_CONFIG_ALIASES.reasoningEffort),
    ),
    pastMessages: normalizeNonNegativeInteger(
      readAliasedValue(configSource, AGENT_CONFIG_ALIASES.pastMessages),
      'pastMessages',
    ),
    stream: normalizeBoolean(
      readAliasedValue(configSource, AGENT_CONFIG_ALIASES.stream),
      'stream',
    ),
    streamTrace: normalizeBoolean(
      readAliasedValue(configSource, AGENT_CONFIG_ALIASES.streamTrace),
      'streamTrace',
    ),
  };

  const webSearch = normalizeWebSearch(readAliasedValue(configSource, AGENT_CONFIG_ALIASES.webSearch));

  if (webSearch !== undefined) {
    normalizedConfig.webSearch = webSearch;
  }

  return Object.fromEntries(
    Object.entries(normalizedConfig).filter(([, value]) => value !== undefined),
  );
}

/**
 * @param {string} filePath
 * @param {string} label
 */
async function readJsonFileIfPresent(filePath, label) {
  let content;

  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }

  let parsed;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Invalid ${label}: ${filePath}`);
  }

  if (!isPlainObject(parsed)) {
    throw new Error(`Invalid ${label}: ${filePath}`);
  }

  return parsed;
}

/**
 * @param {unknown} schemaVersion
 * @param {string} filePath
 */
function validateRuntimeSchemaVersion(schemaVersion, filePath) {
  if (schemaVersion === undefined || schemaVersion === null || schemaVersion === '') {
    return;
  }

  const normalizedSchemaVersion = Number(schemaVersion);

  if (normalizedSchemaVersion !== 1) {
    throw new Error(`Unsupported runtime config schemaVersion in ${filePath}: expected 1.`);
  }
}

/**
 * @param {Record<string, unknown>} source
 * @param {string} filePath
 */
function normalizeRuntimeConfigFile(source, filePath) {
  validateRuntimeSchemaVersion(source.schemaVersion, filePath);
  return normalizeAgentConfig(source);
}

/** @param {string} filePath */
async function loadRuntimeConfigFile(filePath) {
  const config = await readJsonFileIfPresent(filePath, 'runtime config');

  if (!config) {
    return {};
  }

  return normalizeRuntimeConfigFile(config, filePath);
}

/** @param {string | undefined} agentId */
function normalizeAgentId(agentId) {
  if (agentId === undefined || agentId === null) {
    return '';
  }

  const normalizedAgentId = String(agentId).trim();
  return normalizedAgentId;
}

async function loadDefaultAgentIdFromWorld() {
  const world = await readJsonFileIfPresent(WORLD_STATE_PATH, 'world metadata');

  if (!world) {
    return '';
  }

  return normalizeAgentId(world.defaultAgentId);
}

/**
 * @param {{ agentId?: string }} [options]
 */
export async function loadPersistedRuntimeConfig(options = {}) {
  const rootRuntimeConfig = await loadRuntimeConfigFile(ROOT_RUNTIME_CONFIG_PATH);
  const configuredAgentId = normalizeAgentId(options.agentId);
  const defaultAgentId = configuredAgentId || await loadDefaultAgentIdFromWorld();

  if (!defaultAgentId) {
    return rootRuntimeConfig;
  }

  const agentRuntimeConfig = await loadRuntimeConfigFile(buildAgentRuntimeConfigPath(defaultAgentId));

  return {
    ...rootRuntimeConfig,
    ...agentRuntimeConfig,
  };
}
