// @ts-check
/**
 * Agent CLI Path Resolution Unit Tests
 *
 * Purpose:
 * - Validate workspace root and flat `.agent-world` path resolution.
 *
 * Recent changes:
 * - 2026-05-26: Added expectations for both global skill roots.
 * - 2026-05-26: Removed world-id path expectations and switched workspace skills to `.agent-world/skills`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';

const originalCwd = process.cwd();

afterEach(() => {
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
    expect(paths.AGENTS_SKILLS_ROOT).toBe(path.join(os.homedir(), '.agents', 'skills'));
    expect(paths.GLOBAL_SKILLS_ROOTS).toEqual([
      path.join(os.homedir(), '.agent-world', 'skills'),
      path.join(os.homedir(), '.agents', 'skills'),
    ]);
    expect(paths.AGENT_WORLD_ROOT).toBe(path.join(cwdRoot, '.agent-world'));
    expect(paths.SKILLS_ROOT).toBe(path.join(cwdRoot, '.agent-world', 'skills'));
    expect(paths.AGENT_WORLD_CHATS_ROOT).toBe(path.join(cwdRoot, '.agent-world', 'chats'));
    expect(paths.CURRENT_CHAT_PATH).toBe(path.join(cwdRoot, '.agent-world', 'chats', 'current.json'));
  });

  it('prefers an explicit workspace root over the current working directory', async () => {
    const overrideRoot = path.join(originalCwd, 'agent');
    const cwdRoot = path.join(originalCwd, 'tests');

    process.chdir(cwdRoot);

    const paths = await import('../../core/paths.js');
    paths.configureWorkspaceRoot(overrideRoot);

    expect(paths.WORKSPACE_ROOT).toBe(overrideRoot);
    expect(paths.REPO_ROOT).toBe(overrideRoot);
    expect(paths.SYSTEM_PROMPT_PATH).toBe(path.join(overrideRoot, 'AGENTS.md'));
    expect(paths.USER_SKILLS_ROOT).toBe(path.join(os.homedir(), '.agent-world', 'skills'));
    expect(paths.AGENTS_SKILLS_ROOT).toBe(path.join(os.homedir(), '.agents', 'skills'));
    expect(paths.SKILLS_ROOT).toBe(path.join(overrideRoot, '.agent-world', 'skills'));
    expect(paths.AGENT_WORLD_CHATS_ROOT).toBe(path.join(overrideRoot, '.agent-world', 'chats'));
  });

  it('uses cwd when an explicit workspace root is empty', async () => {
    const cwdRoot = path.join(originalCwd, 'tests');

    process.chdir(cwdRoot);

    const paths = await import('../../core/paths.js');
    paths.configureWorkspaceRoot('');

    expect(paths.WORKSPACE_ROOT).toBe(cwdRoot);
    expect(paths.REPO_ROOT).toBe(cwdRoot);
  });
});
