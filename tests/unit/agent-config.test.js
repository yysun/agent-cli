// @ts-check
/**
 * Agent Config Unit Tests
 *
 * Purpose:
 * - Validate runtime config normalization and `.env` LLM-time defaults.
 *
 * Recent changes:
 * - 2026-05-26: Removed world.json and agent.json config loading.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'AGENT_CLI_PROVIDER',
  'AGENT_CLI_MODEL',
  'AGENT_CLI_TEMPERATURE',
  'AGENT_CLI_MAX_TOKENS',
  'AGENT_CLI_TOOL_PERMISSION',
  'AGENT_CLI_REASONING_EFFORT',
  'AGENT_CLI_PAST_MESSAGES',
  'AGENT_CLI_STREAM',
  'AGENT_CLI_STREAM_TRACE',
  'AGENT_CLI_WEB_SEARCH',
];
const originalEnvironment = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function restoreEnvironment() {
  for (const key of ENV_KEYS) {
    const value = originalEnvironment[key];

    if (typeof value === 'undefined') {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

afterEach(() => {
  restoreEnvironment();
  vi.resetModules();
});

describe('agent-config', () => {
  it('normalizes CLI runtime overrides and aliases', async () => {
    const { normalizeAgentConfig } = await import('../../core/agent-config.js');

    expect(normalizeAgentConfig({
      provider: 'google',
      modal: 'gemini-2.5-pro',
      temperature: '0.2',
      tokens: '2048',
      permissions: 'read',
      reasoning: 'medium',
      past_messages: '8',
      stream_trace: 'true',
      web_search: 'high',
    })).toEqual({
      provider: 'google',
      model: 'gemini-2.5-pro',
      temperature: 0.2,
      maxTokens: 2048,
      toolPermission: 'read',
      reasoningEffort: 'medium',
      pastMessages: 8,
      streamTrace: true,
      webSearch: {
        searchContextSize: 'high',
      },
    });
  });

  it('loads LLM-time runtime defaults from environment', async () => {
    process.env.AGENT_CLI_PROVIDER = 'anthropic';
    process.env.AGENT_CLI_MODEL = 'claude-sonnet-4-5';
    process.env.AGENT_CLI_TEMPERATURE = '0.4';
    process.env.AGENT_CLI_MAX_TOKENS = '2048';
    process.env.AGENT_CLI_TOOL_PERMISSION = 'ask';
    process.env.AGENT_CLI_REASONING_EFFORT = 'high';
    process.env.AGENT_CLI_PAST_MESSAGES = '15';
    process.env.AGENT_CLI_STREAM = 'false';
    process.env.AGENT_CLI_STREAM_TRACE = 'true';
    process.env.AGENT_CLI_WEB_SEARCH = 'low';

    const { loadPersistedRuntimeConfig } = await import('../../core/agent-config.js');

    expect(loadPersistedRuntimeConfig()).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      temperature: 0.4,
      maxTokens: 2048,
      toolPermission: 'ask',
      reasoningEffort: 'high',
      pastMessages: 15,
      stream: false,
      streamTrace: true,
      webSearch: {
        searchContextSize: 'low',
      },
    });
  });

  it('returns an empty persisted config when env defaults are absent', async () => {
    delete process.env.AGENT_CLI_PROVIDER;
    delete process.env.AGENT_CLI_MODEL;

    const { loadPersistedRuntimeConfig } = await import('../../core/agent-config.js');

    expect(loadPersistedRuntimeConfig()).toEqual({});
  });

  it('rejects malformed runtime values clearly', async () => {
    const { normalizeAgentConfig } = await import('../../core/agent-config.js');

    expect(() => normalizeAgentConfig({ maxTokens: 'nope' })).toThrow('Invalid agent config value for maxTokens');
    expect(() => normalizeAgentConfig({ toolPermission: 'root' })).toThrow('Invalid agent config value for permissions');
  });
});
