// @ts-check
/**
 * Agent CLI Path Resolution Unit Tests
 *
 * Purpose:
 * - Validate how the CLI resolves its project root across real runs and isolated tests.
 *
 * Key features:
 * - Prefers `process.cwd()` for normal execution.
 * - Re-resolves paths from the active cwd after module reloads.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

const originalCwd = process.cwd();

afterEach(() => {
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
    expect(paths.SKILLS_ROOT).toBe(path.join(cwdRoot, '.agents', 'skills'));
    expect(paths.AGENT_WORLD_ROOT).toBe(path.join(cwdRoot, '.agent-world'));
    expect(paths.WORLD_STATE_PATH).toBe(path.join(cwdRoot, '.agent-world', 'world.json'));
    expect(paths.REMOTE_HOST_LOCK_PATH).toBe(path.join(cwdRoot, '.agent-world', 'remote-host.lock.json'));
    expect(paths.buildAgentRuntimeConfigPath('agent-1')).toBe(
      path.join(cwdRoot, '.agent-world', 'agents', 'agent-1', 'runtime.json'),
    );
  });

  it('re-resolves the project root from the latest current working directory after a module reload', async () => {
    const firstRoot = path.join(originalCwd, 'tests');
    const secondRoot = path.join(originalCwd, 'web');

    process.chdir(firstRoot);
    const firstPaths = await import('../../core/paths.js');

    expect(firstPaths.REPO_ROOT).toBe(firstRoot);

    vi.resetModules();
    process.chdir(secondRoot);
    const secondPaths = await import('../../core/paths.js');

    expect(secondPaths.REPO_ROOT).toBe(secondRoot);
    expect(secondPaths.SYSTEM_PROMPT_PATH).toBe(path.join(secondRoot, 'AGENTS.md'));
    expect(secondPaths.ROOT_RUNTIME_CONFIG_PATH).toBe(path.join(secondRoot, 'runtime.json'));
    expect(secondPaths.SKILLS_ROOT).toBe(path.join(secondRoot, '.agents', 'skills'));
    expect(secondPaths.WORLD_STATE_PATH).toBe(path.join(secondRoot, '.agent-world', 'world.json'));
    expect(secondPaths.REMOTE_HOST_LOCK_PATH).toBe(path.join(secondRoot, '.agent-world', 'remote-host.lock.json'));
  });
});