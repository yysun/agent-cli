// @ts-check
/**
 * Agent CLI Path Resolution Unit Tests
 *
 * Purpose:
 * - Validate how the CLI resolves its project root across real runs and isolated tests.
 *
 * Key features:
 * - Prefers `process.cwd()` for normal execution.
 * - Prefers `AGENT_CLI_ROOT` over `process.cwd()` when the override is present.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

const originalCwd = process.cwd();

afterEach(() => {
  delete process.env.AGENT_CLI_ROOT;
  vi.resetModules();
  process.chdir(originalCwd);
});

describe('paths', () => {
  it('uses the current working directory as the default project root', async () => {
    const cwdRoot = path.join(originalCwd, 'tests');
    process.chdir(cwdRoot);

    const paths = await import('../../core/paths.js');

    expect(paths.REPO_ROOT).toBe(cwdRoot);
    expect(paths.SYSTEM_PROMPT_PATH).toBe(path.join(cwdRoot, 'AGENTS.md'));
    expect(paths.ROOT_RUNTIME_CONFIG_PATH).toBe(path.join(cwdRoot, 'runtime.json'));
    expect(paths.AGENT_WORLD_ROOT).toBe(path.join(cwdRoot, '.agent-world'));
    expect(paths.SKILLS_ROOT).toBe(path.join(cwdRoot, '.agent-world', 'skills'));
    expect(paths.WORLD_STATE_PATH).toBe(path.join(cwdRoot, '.agent-world', 'world.json'));
    expect(paths.REMOTE_HOST_LOCK_PATH).toBe(path.join(cwdRoot, '.agent-world', 'remote-host.lock.json'));
    expect(paths.buildAgentRuntimeConfigPath('agent-1')).toBe(
      path.join(cwdRoot, '.agent-world', 'agents', 'agent-1', 'runtime.json'),
    );
  });

  it('prefers AGENT_CLI_ROOT over the current working directory', async () => {
    const overrideRoot = path.join(originalCwd, 'agent');
    const cwdRoot = path.join(originalCwd, 'tests');

    process.env.AGENT_CLI_ROOT = overrideRoot;
    process.chdir(cwdRoot);

    const paths = await import('../../core/paths.js');

    expect(paths.REPO_ROOT).toBe(overrideRoot);
    expect(paths.SYSTEM_PROMPT_PATH).toBe(path.join(overrideRoot, 'AGENTS.md'));
    expect(paths.ROOT_RUNTIME_CONFIG_PATH).toBe(path.join(overrideRoot, 'runtime.json'));
    expect(paths.SKILLS_ROOT).toBe(path.join(overrideRoot, '.agent-world', 'skills'));
    expect(paths.WORLD_STATE_PATH).toBe(path.join(overrideRoot, '.agent-world', 'world.json'));
    expect(paths.REMOTE_HOST_LOCK_PATH).toBe(path.join(overrideRoot, '.agent-world', 'remote-host.lock.json'));
  });
});
