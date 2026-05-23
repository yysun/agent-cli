// @ts-check
/**
 * Agent CLI Agent Config Unit Tests
 *
 * Purpose:
 * - Validate runtime override normalization used by CLI flags and runtime files.
 *
 * Key features:
 * - Covers common field aliases such as `modal`, `tokens`, and `permissions`.
 * - Verifies workspace runtime.json and selected-world agent runtime overrides merge predictably.
 * - Verifies invalid override values fail early with clear messages.
 *
 * Recent changes:
 * - 2026-05-23: Updated default-agent fixtures for selected-world storage.
 * - 2026-05-20: Added coverage for agent.json provider/model runtime fallback.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createTestRoot, removeTestRoot } from '../helpers/test-root.js';

import { normalizeAgentConfig } from '../../core/agent-config.js';

/** @type {string[]} */
const rootsToClean = [];
const originalCwd = process.cwd();

/** @param {string} rootPath */
async function loadAgentConfigModule(rootPath) {
  process.chdir(rootPath);
  vi.resetModules();
  return await import('../../core/agent-config.js');
}

afterEach(async () => {
  process.chdir(originalCwd);

  while (rootsToClean.length > 0) {
    await removeTestRoot(rootsToClean.pop());
  }
});

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

  it('normalizes explicit stream values', () => {
    expect(normalizeAgentConfig({
      stream: 'false',
    })).toEqual({
      stream: false,
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

  it('fails clearly for invalid numeric values', () => {
    expect(() => normalizeAgentConfig({
      maxTokens: 'many',
    })).toThrow('Invalid agent config value for maxTokens: expected a positive integer.');
  });

  it('loads runtime.json from the repo root', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    await writeFile(path.join(rootPath, 'runtime.json'), `${JSON.stringify({
      schemaVersion: 1,
      provider: 'openai',
      model: 'gpt-5',
      reasoningEffort: 'medium',
      temperature: 0.2,
      maxTokens: 4096,
      toolPermission: 'ask',
      webSearch: false,
      pastMessages: 20,
      stream: true,
      streamTrace: false,
    }, null, 2)}\n`, 'utf8');

    const { loadPersistedRuntimeConfig } = await loadAgentConfigModule(rootPath);

    await expect(loadPersistedRuntimeConfig()).resolves.toEqual({
      provider: 'openai',
      model: 'gpt-5',
      reasoningEffort: 'medium',
      temperature: 0.2,
      maxTokens: 4096,
      toolPermission: 'ask',
      webSearch: false,
      pastMessages: 20,
      stream: true,
      streamTrace: false,
    });
  });

  it('lets the default-agent runtime.json override repo-root runtime.json', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    await writeFile(path.join(rootPath, 'runtime.json'), `${JSON.stringify({
      schemaVersion: 1,
      provider: 'openai',
      model: 'gpt-5',
      toolPermission: 'ask',
      pastMessages: 20,
      stream: true,
    }, null, 2)}\n`, 'utf8');
    await mkdir(path.join(rootPath, '.agent-world', 'worlds', 'default', 'agents', 'agent-2'), { recursive: true });
    await writeFile(path.join(rootPath, '.agent-world', 'worlds', 'default', 'world.json'), `${JSON.stringify({
      id: 'world-1',
      name: 'Test World',
      defaultAgentId: 'agent-2',
      currentChatId: 'chat-1',
    }, null, 2)}\n`, 'utf8');
    await writeFile(path.join(rootPath, '.agent-world', 'worlds', 'default', 'agents', 'agent-2', 'runtime.json'), `${JSON.stringify({
      schemaVersion: 1,
      model: 'gpt-5-mini',
      toolPermission: 'read',
      stream: false,
    }, null, 2)}\n`, 'utf8');

    const { loadPersistedRuntimeConfig } = await loadAgentConfigModule(rootPath);

    await expect(loadPersistedRuntimeConfig()).resolves.toEqual({
      provider: 'openai',
      model: 'gpt-5-mini',
      toolPermission: 'read',
      pastMessages: 20,
      stream: false,
    });
  });

  it('loads provider and model from agent.json when runtime.json is absent', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    await mkdir(path.join(rootPath, '.agent-world', 'worlds', 'default', 'agents', 'default'), { recursive: true });
    await writeFile(path.join(rootPath, '.agent-world', 'worlds', 'default', 'world.json'), `${JSON.stringify({
      id: 'world-1',
      name: 'Test World',
      defaultAgentId: 'default',
      currentChatId: '',
    }, null, 2)}\n`, 'utf8');
    await writeFile(path.join(rootPath, '.agent-world', 'worlds', 'default', 'agents', 'default', 'agent.json'), `${JSON.stringify({
      id: 'default',
      name: 'Local Agent',
      provider: 'ollama',
      model: 'gemma4:e4b',
    }, null, 2)}\n`, 'utf8');

    const { loadPersistedRuntimeConfig } = await loadAgentConfigModule(rootPath);

    await expect(loadPersistedRuntimeConfig()).resolves.toEqual({
      provider: 'ollama',
      model: 'gemma4:e4b',
    });
  });

  it('fails clearly for unsupported runtime config schema versions', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    await writeFile(path.join(rootPath, 'runtime.json'), `${JSON.stringify({
      schemaVersion: 2,
      provider: 'openai',
    }, null, 2)}\n`, 'utf8');

    const { loadPersistedRuntimeConfig } = await loadAgentConfigModule(rootPath);

    await expect(loadPersistedRuntimeConfig()).rejects.toThrow(
      /Unsupported runtime config schemaVersion in .*runtime\.json: expected 1\./,
    );
  });
});
