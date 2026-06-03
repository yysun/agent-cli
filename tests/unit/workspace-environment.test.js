// @ts-check
/**
 * Workspace Environment Unit Tests
 *
 * Purpose:
 * - Validate workspace-local `.env` loading and Electron workspace-switch refresh behavior.
 *
 * Recent changes:
 * - 2026-06-03: Covered refresh behavior for workspace-managed `.env` values.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createTestRoot, removeTestRoot } from '../helpers/test-root.js';

const ENV_KEYS = [
  'AGENT_CLI_PROVIDER',
  'AGENT_CLI_MODEL',
  'GOOGLE_API_KEY',
];
const originalEnvironment = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
/** @type {string[]} */
const rootsToClean = [];

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

afterEach(async () => {
  restoreEnvironment();
  vi.resetModules();

  await Promise.all(rootsToClean.splice(0).map((rootPath) => removeTestRoot(rootPath)));
});

describe('workspace-environment', () => {
  it('refreshes workspace-managed env values when the workspace changes', async () => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }

    const firstWorkspaceRoot = await createTestRoot();
    const secondWorkspaceRoot = await createTestRoot();
    rootsToClean.push(firstWorkspaceRoot, secondWorkspaceRoot);

    await writeFile(
      path.join(firstWorkspaceRoot, '.env'),
      [
        'AGENT_CLI_PROVIDER=google',
        'AGENT_CLI_MODEL=gemini-2.5-pro',
        'GOOGLE_API_KEY=first-google-key',
        '',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      path.join(secondWorkspaceRoot, '.env'),
      [
        'AGENT_CLI_PROVIDER=anthropic',
        '',
      ].join('\n'),
      'utf8',
    );

    const { prepareWorkspaceEnvironment } = await import('../../core/workspace-environment.js');
    const { loadPersistedRuntimeConfig } = await import('../../core/agent-config.js');

    prepareWorkspaceEnvironment(firstWorkspaceRoot, { refreshDotEnv: true });

    expect(process.env.AGENT_CLI_PROVIDER).toBe('google');
    expect(process.env.AGENT_CLI_MODEL).toBe('gemini-2.5-pro');
    expect(process.env.GOOGLE_API_KEY).toBe('first-google-key');
    expect(loadPersistedRuntimeConfig()).toMatchObject({
      provider: 'google',
      model: 'gemini-2.5-pro',
    });

    prepareWorkspaceEnvironment(secondWorkspaceRoot, { refreshDotEnv: true });

    expect(process.env.AGENT_CLI_PROVIDER).toBe('anthropic');
    expect(process.env.AGENT_CLI_MODEL).toBeUndefined();
    expect(process.env.GOOGLE_API_KEY).toBeUndefined();
    expect(loadPersistedRuntimeConfig()).toEqual({
      provider: 'anthropic',
    });
  });

  it('does not override externally provided env values during refresh', async () => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    process.env.AGENT_CLI_PROVIDER = 'openai';

    const workspaceRoot = await createTestRoot();
    rootsToClean.push(workspaceRoot);
    await writeFile(
      path.join(workspaceRoot, '.env'),
      [
        'AGENT_CLI_PROVIDER=google',
        'AGENT_CLI_MODEL=gemini-2.5-pro',
        '',
      ].join('\n'),
      'utf8',
    );

    const { prepareWorkspaceEnvironment } = await import('../../core/workspace-environment.js');

    prepareWorkspaceEnvironment(workspaceRoot, { refreshDotEnv: true });

    expect(process.env.AGENT_CLI_PROVIDER).toBe('openai');
    expect(process.env.AGENT_CLI_MODEL).toBe('gemini-2.5-pro');
  });
});