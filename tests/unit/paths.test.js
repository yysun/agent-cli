// @ts-check
/**
 * Agent CLI Path Resolution Unit Tests
 *
 * Purpose:
 * - Validate how the CLI resolves its workspace root across real runs and isolated tests.
 *
 * Key features:
 * - Prefers `process.cwd()` for normal execution.
 * - Prefers `AGENT_CLI_WORKSPACE` over `process.cwd()` when the override is present.
 * - Publishes the resolved default cwd back to `AGENT_CLI_WORKSPACE`.
 * - Verifies selected-world paths live under `.agent-world/worlds/default`.
 *
 * Recent changes:
 * - 2026-05-24: Removed legacy root-env expectations.
 * - 2026-05-24: Removed runtime.json path expectations.
 * - 2026-05-23: Updated expectations for multi-world workspace paths.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';

const originalCwd = process.cwd();

afterEach(() => {
  delete process.env.AGENT_CLI_WORKSPACE;
  vi.resetModules();
  process.chdir(originalCwd);
});

describe('paths', () => {
  it('uses the current working directory as the default workspace root', async () => {
    const cwdRoot = path.join(originalCwd, 'tests');
    process.chdir(cwdRoot);

    const paths = await import('../../core/paths.js');
    paths.configureWorkspaceRoot();

    expect(paths.WORKSPACE_ROOT).toBe(cwdRoot);
    expect(paths.REPO_ROOT).toBe(cwdRoot);
    expect(paths.SYSTEM_PROMPT_PATH).toBe(path.join(cwdRoot, 'AGENTS.md'));
    expect(paths.USER_SKILLS_ROOT).toBe(path.join(os.homedir(), '.agent-world', 'skills'));
    expect(paths.AGENT_WORLD_ROOT).toBe(path.join(cwdRoot, '.agent-world'));
    expect(paths.SKILLS_ROOT).toBe(path.join(cwdRoot, '.agent-world', 'skills'));
    expect(paths.WORLD_STATE_PATH).toBe(path.join(cwdRoot, '.agent-world', 'worlds', 'default', 'world.json'));
    expect(paths.REMOTE_HOST_LOCK_PATH).toBe(
      path.join(cwdRoot, '.agent-world', 'worlds', 'default', 'remote-host.lock.json'),
    );
  });

  it('publishes cwd to AGENT_CLI_WORKSPACE when explicitly configured without an override', async () => {
    const cwdRoot = path.join(originalCwd, 'tests');
    process.chdir(cwdRoot);

    const paths = await import('../../core/paths.js');
    paths.configureWorkspaceRoot();

    expect(paths.WORKSPACE_ROOT).toBe(cwdRoot);
    expect(process.env.AGENT_CLI_WORKSPACE).toBe(cwdRoot);
  });

  it('prefers AGENT_CLI_WORKSPACE over the current working directory', async () => {
    const overrideRoot = path.join(originalCwd, 'agent');
    const cwdRoot = path.join(originalCwd, 'tests');

    process.env.AGENT_CLI_WORKSPACE = overrideRoot;
    process.chdir(cwdRoot);

    const paths = await import('../../core/paths.js');

    expect(paths.WORKSPACE_ROOT).toBe(overrideRoot);
    expect(process.env.AGENT_CLI_WORKSPACE).toBe(overrideRoot);
    expect(paths.REPO_ROOT).toBe(overrideRoot);
    expect(paths.SYSTEM_PROMPT_PATH).toBe(path.join(overrideRoot, 'AGENTS.md'));
    expect(paths.USER_SKILLS_ROOT).toBe(path.join(os.homedir(), '.agent-world', 'skills'));
    expect(paths.SKILLS_ROOT).toBe(path.join(overrideRoot, '.agent-world', 'skills'));
    expect(paths.WORLD_STATE_PATH).toBe(path.join(overrideRoot, '.agent-world', 'worlds', 'default', 'world.json'));
    expect(paths.REMOTE_HOST_LOCK_PATH).toBe(
      path.join(overrideRoot, '.agent-world', 'worlds', 'default', 'remote-host.lock.json'),
    );
  });

  it('uses cwd when AGENT_CLI_WORKSPACE is empty', async () => {
    const cwdRoot = path.join(originalCwd, 'tests');

    process.env.AGENT_CLI_WORKSPACE = '';
    process.chdir(cwdRoot);

    const paths = await import('../../core/paths.js');
    paths.configureWorkspaceRoot();

    expect(paths.WORKSPACE_ROOT).toBe(cwdRoot);
    expect(paths.REPO_ROOT).toBe(cwdRoot);
    expect(process.env.AGENT_CLI_WORKSPACE).toBe(cwdRoot);
  });
});
