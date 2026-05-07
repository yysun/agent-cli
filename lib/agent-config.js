// @ts-check
/**
 * Agent CLI Agent Config Loading
 *
 * Purpose:
 * - Load optional runtime defaults from `./agent/config.json`.
 *
 * Key features:
 * - Normalizes common aliases such as `modal`, `tokens`, `permissions`, and `reasoning`.
 * - Validates supported enum values before runtime calls.
 * - Keeps agent-local runtime settings separate from provider credential environment variables.
 *
 * Recent changes:
 * - 2026-05-07: Added optional agent-local runtime config loading.
 */
import { promises as fs } from 'node:fs';

import { AGENT_CONFIG_PATH } from './paths.js';

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
 *   streamTrace?: boolean,
 * }} AgentConfig
 */

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
    provider: normalizeString(readAliasedValue(configSource, ['provider']), 'provider'),
    model: normalizeString(readAliasedValue(configSource, ['model', 'modal']), 'model'),
    temperature: normalizeNumber(readAliasedValue(configSource, ['temperature']), 'temperature'),
    maxTokens: normalizePositiveInteger(
      readAliasedValue(configSource, ['maxTokens', 'maxOutputTokens', 'tokens', 'max-tokens', 'max-output-tokens']),
      'maxTokens',
    ),
    toolPermission: normalizeToolPermission(
      readAliasedValue(configSource, ['toolPermission', 'permission', 'permissions', 'tool-permission']),
    ),
    reasoningEffort: normalizeReasoningEffort(
      readAliasedValue(configSource, ['reasoningEffort', 'reasoning', 'reasoning-effort']),
    ),
    pastMessages: normalizeNonNegativeInteger(
      readAliasedValue(configSource, ['pastMessages', 'historyMessages', 'past_messages', 'past-messages', 'history-messages']),
      'pastMessages',
    ),
    streamTrace: normalizeBoolean(
      readAliasedValue(configSource, ['streamTrace', 'stream_trace', 'stream-trace']),
      'streamTrace',
    ),
  };

  const webSearch = normalizeWebSearch(readAliasedValue(configSource, ['webSearch', 'web_search', 'web-search']));

  if (webSearch !== undefined) {
    normalizedConfig.webSearch = webSearch;
  }

  return Object.fromEntries(
    Object.entries(normalizedConfig).filter(([, value]) => value !== undefined),
  );
}

export async function loadAgentConfig() {
  let rawConfig;

  try {
    rawConfig = await fs.readFile(AGENT_CONFIG_PATH, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {};
    }

    throw error;
  }

  let parsedConfig;

  try {
    parsedConfig = JSON.parse(rawConfig);
  } catch {
    throw new Error(`Invalid agent config JSON: ${AGENT_CONFIG_PATH}`);
  }

  if (!isPlainObject(parsedConfig)) {
    throw new Error(`Invalid agent config: expected a JSON object in ${AGENT_CONFIG_PATH}`);
  }

  return normalizeAgentConfig(parsedConfig);
}