// @ts-check
/**
 * Agent CLI Agent Config Loading
 *
 * Purpose:
 * - Normalize runtime defaults from `.env` plus overrides from CLI flags.
 *
 * Key features:
 * - Reads LLM-time defaults from `AGENT_CLI_*` environment variables.
 * - Normalizes common CLI aliases such as `modal`, `tokens`, `permissions`, and `reasoning`.
 * - Keeps runtime defaults out of `.agent-world`; `world.json` is startup metadata, not runtime config.
 *
 * Recent changes:
 * - 2026-05-26: Added `.env` defaults for temperature, max tokens, permissions, reasoning, history, stream, trace, and web search.
 * - 2026-05-26: Removed persisted runtime config loading from world and agent metadata.
 */

type ReasoningEffortValue = 'default' | 'none' | 'low' | 'medium' | 'high';
type ToolPermissionValue = 'auto' | 'ask' | 'read';
type WebSearchContextSize = 'low' | 'medium' | 'high';

const REASONING_EFFORTS = new Set<ReasoningEffortValue>(['default', 'none', 'low', 'medium', 'high']);
const TOOL_PERMISSIONS = new Set<ToolPermissionValue>(['auto', 'ask', 'read']);
const WEB_SEARCH_CONTEXT_SIZES = new Set<WebSearchContextSize>(['low', 'medium', 'high']);

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
 * @param {Set<T>} allowedValues
 */
function normalizeEnum<T extends string>(value: unknown, label: string, allowedValues: Set<T>): T | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const normalized = String(value).trim().toLowerCase() as T;

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

export type AgentConfig = {
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  maxToolTurns?: number;
  toolPermission?: 'auto' | 'ask' | 'read';
  reasoningEffort?: 'default' | 'none' | 'low' | 'medium' | 'high';
  webSearch?: boolean | { searchContextSize?: 'low' | 'medium' | 'high' };
  pastMessages?: number;
  stream?: boolean;
  streamTrace?: boolean;
};

const AGENT_CONFIG_ALIASES = {
  provider: ['provider'],
  model: ['model', 'modal'],
  temperature: ['temperature'],
  maxTokens: ['maxTokens', 'maxOutputTokens', 'tokens', 'max-tokens', 'max-output-tokens'],
  maxToolTurns: ['maxToolTurns', 'max_tool_turns', 'max-tool-turns', 'maxConsecutiveToolTurns'],
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

  const normalizedConfig: AgentConfig = {
    provider: normalizeString(readAliasedValue(configSource, AGENT_CONFIG_ALIASES.provider), 'provider'),
    model: normalizeString(readAliasedValue(configSource, AGENT_CONFIG_ALIASES.model), 'model'),
    temperature: normalizeNumber(readAliasedValue(configSource, AGENT_CONFIG_ALIASES.temperature), 'temperature'),
    maxTokens: normalizePositiveInteger(
      readAliasedValue(configSource, AGENT_CONFIG_ALIASES.maxTokens),
      'maxTokens',
    ),
    maxToolTurns: normalizePositiveInteger(
      readAliasedValue(configSource, AGENT_CONFIG_ALIASES.maxToolTurns),
      'maxToolTurns',
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

export function loadPersistedRuntimeConfig() {
  return normalizeAgentConfig({
    provider: process.env.AGENT_CLI_PROVIDER,
    model: process.env.AGENT_CLI_MODEL,
    temperature: process.env.AGENT_CLI_TEMPERATURE,
    maxTokens: process.env.AGENT_CLI_MAX_TOKENS,
    maxToolTurns: process.env.AGENT_CLI_MAX_TOOL_TURNS,
    toolPermission: process.env.AGENT_CLI_TOOL_PERMISSION,
    reasoningEffort: process.env.AGENT_CLI_REASONING_EFFORT,
    pastMessages: process.env.AGENT_CLI_PAST_MESSAGES,
    stream: process.env.AGENT_CLI_STREAM,
    streamTrace: process.env.AGENT_CLI_STREAM_TRACE,
    webSearch: process.env.AGENT_CLI_WEB_SEARCH,
  });
}
