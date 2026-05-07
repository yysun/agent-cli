// @ts-check
/**
 * Agent CLI Agent Config Unit Tests
 *
 * Purpose:
 * - Validate optional `./agent/config.json` loading and normalization.
 *
 * Key features:
 * - Covers common field aliases such as `modal`, `tokens`, and `permissions`.
 * - Verifies invalid config values fail early with clear messages.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestRoot, removeTestRoot, writeAgentConfig } from '../helpers/test-root.js';

/** @type {string[]} */
const rootsToClean = [];

/** @param {string} rootPath */
async function loadAgentConfigModule(rootPath) {
  process.env.AGENT_CLI_ROOT = rootPath;
  vi.resetModules();
  return await import('../../lib/agent-config.js');
}

afterEach(async () => {
  delete process.env.AGENT_CLI_ROOT;

  while (rootsToClean.length > 0) {
    await removeTestRoot(rootsToClean.pop());
  }
});

describe('agent-config', () => {
  it('returns an empty config when agent/config.json is missing', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { loadAgentConfig } = await loadAgentConfigModule(rootPath);

    await expect(loadAgentConfig()).resolves.toEqual({});
  });

  it('normalizes aliased runtime settings from agent/config.json', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeAgentConfig(rootPath, {
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
    });

    const { loadAgentConfig } = await loadAgentConfigModule(rootPath);

    await expect(loadAgentConfig()).resolves.toEqual({
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

  it('fails clearly for invalid enum values', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeAgentConfig(rootPath, {
      permissions: 'write',
    });

    const { loadAgentConfig } = await loadAgentConfigModule(rootPath);

    await expect(loadAgentConfig()).rejects.toThrow(
      'Invalid agent config value for permissions: expected one of auto, ask, read.',
    );
  });

  it('fails clearly for invalid streamTrace values', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeAgentConfig(rootPath, {
      streamTrace: 'maybe',
    });

    const { loadAgentConfig } = await loadAgentConfigModule(rootPath);

    await expect(loadAgentConfig()).rejects.toThrow(
      'Invalid agent config value for streamTrace: expected true or false.',
    );
  });
});