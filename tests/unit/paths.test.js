// @ts-check
/**
 * Agent CLI Path Resolution Unit Tests
 *
 * Purpose:
 * - Validate how the CLI resolves its project root across real runs and isolated tests.
 *
 * Key features:
 * - Prefers `process.cwd()` for normal execution.
 * - Preserves `AGENT_CLI_ROOT` as an explicit override for tests.
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

    const paths = await import('../../lib/paths.js');

    expect(paths.REPO_ROOT).toBe(cwdRoot);
    expect(paths.AGENT_DIR).toBe(path.join(cwdRoot, 'agent'));
  });

  it('prefers AGENT_CLI_ROOT over the current working directory', async () => {
    const overrideRoot = path.join(originalCwd, 'agent');
    process.env.AGENT_CLI_ROOT = overrideRoot;
    process.chdir(path.join(originalCwd, 'tests'));

    const paths = await import('../../lib/paths.js');

    expect(paths.REPO_ROOT).toBe(overrideRoot);
    expect(paths.SYSTEM_PROMPT_PATH).toBe(path.join(overrideRoot, 'agent', 'system.md'));
  });
});