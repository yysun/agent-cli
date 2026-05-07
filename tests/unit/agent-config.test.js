// @ts-check
/**
 * Agent CLI Agent Config Unit Tests
 *
 * Purpose:
 * - Validate runtime override normalization used by CLI flags.
 *
 * Key features:
 * - Covers common field aliases such as `modal`, `tokens`, and `permissions`.
 * - Verifies invalid override values fail early with clear messages.
 */
import { describe, expect, it } from 'vitest';

import { normalizeAgentConfig } from '../../lib/agent-config.js';

describe('agent-config', () => {
  it('normalizes CLI-style runtime override keys', () => {
    expect(normalizeAgentConfig({
      provider: 'google',
      model: 'gemini-2.5-pro',
      temperature: '0.15',
      'max-tokens': '4096',
      'tool-permission': 'read',
      'reasoning-effort': 'low',
      'past-messages': '7',
      'stream-trace': 'false',
      'web-search': 'high',
    })).toEqual({
      provider: 'google',
      model: 'gemini-2.5-pro',
      temperature: 0.15,
      maxTokens: 4096,
      toolPermission: 'read',
      reasoningEffort: 'low',
      pastMessages: 7,
      streamTrace: false,
      webSearch: {
        searchContextSize: 'high',
      },
    });
  });

  it('normalizes aliased runtime settings', () => {
    expect(normalizeAgentConfig({
      provider: 'openai',
      modal: 'gpt-5-mini',
      temperature: '0.25',
      tokens: 2048,
      past_messages: 5,
      stream_trace: 'true',
      permissions: 'ask',
      reasoning: {
        effort: 'medium',
      },
      web_search: {
        enabled: true,
        size: 'high',
      },
    })).toEqual({
      provider: 'openai',
      model: 'gpt-5-mini',
      temperature: 0.25,
      maxTokens: 2048,
      pastMessages: 5,
      streamTrace: true,
      toolPermission: 'ask',
      reasoningEffort: 'medium',
      webSearch: {
        searchContextSize: 'high',
      },
    });
  });

  it('fails clearly for invalid enum values', () => {
    expect(() => normalizeAgentConfig({
      permissions: 'write',
    })).toThrow('Invalid agent config value for permissions: expected one of auto, ask, read.');
  });

  it('fails clearly for invalid streamTrace values', () => {
    expect(() => normalizeAgentConfig({
      streamTrace: 'maybe',
    })).toThrow('Invalid agent config value for streamTrace: expected true or false.');
  });
});
