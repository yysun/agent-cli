// @ts-check
/**
 * Agent CLI Agent File Unit Tests
 *
 * Purpose:
 * - Validate AGENTS.md prompt loading and `SKILL.md` inventory behavior.
 *
 * Recent changes:
 * - 2026-05-26: Removed selected-world skills and switched workspace skills to `.agent-world/skills`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createTestRoot, ensureSkillsRoot, removeTestRoot, writeSkill, writeSystemPrompt } from '../helpers/test-root.js';

/** @type {string[]} */
const rootsToClean = [];
const originalCwd = process.cwd();
const originalHome = process.env.HOME;

/**
 * @param {string} rootPath
 * @param {string} [homePath]
 */
async function loadAgentFiles(rootPath, homePath = rootPath) {
  process.chdir(rootPath);
  process.env.HOME = homePath;
  vi.resetModules();
  return await import('../../core/agent-files.js');
}

afterEach(async () => {
  process.chdir(originalCwd);
  if (typeof originalHome === 'undefined') {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  vi.doUnmock('node:fs');

  while (rootsToClean.length > 0) {
    const rootPath = rootsToClean.pop();

    if (rootPath) {
      await removeTestRoot(rootPath);
    }
  }
});

describe('agent-files', () => {
  it('loads AGENTS.md and workspace skills from .agent-world/skills in lexical order', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    await writeSystemPrompt(rootPath, '  Agent CLI system prompt  ');
    await writeSkill(rootPath, 'zeta', {
      name: 'zeta-skill',
      description: 'Loaded last.',
    });
    await writeSkill(rootPath, 'alpha/deep', {
      name: 'alpha-skill',
      description: 'Loaded first.',
    });
    await mkdir(path.join(rootPath, '.agent-world', 'skills', 'invalid'), { recursive: true });
    await writeFile(
      path.join(rootPath, '.agent-world', 'skills', 'invalid', 'SKILL.md'),
      '# Missing front matter\n',
      'utf8',
    );

    const { loadWorkspaceSystemPrompt, loadSkillInventory } = await loadAgentFiles(rootPath);

    await expect(loadWorkspaceSystemPrompt()).resolves.toBe('Agent CLI system prompt');
    await expect(loadSkillInventory()).resolves.toEqual([
      expect.objectContaining({
        skillId: 'alpha-skill',
        description: 'Loaded first.',
        sourceScope: 'project',
      }),
      expect.objectContaining({
        skillId: 'zeta-skill',
        description: 'Loaded last.',
        sourceScope: 'project',
      }),
    ]);
  });

  it('layers user and workspace skills, with workspace overriding duplicate ids', async () => {
    const rootPath = await createTestRoot();
    const homeRoot = await createTestRoot();
    rootsToClean.push(rootPath, homeRoot);

    await mkdir(path.join(homeRoot, '.agent-world', 'skills', 'user-only'), { recursive: true });
    await writeFile(
      path.join(homeRoot, '.agent-world', 'skills', 'user-only', 'SKILL.md'),
      ['---', 'name: user-skill', 'description: User only.', '---', '', '# User', ''].join('\n'),
      'utf8',
    );
    await mkdir(path.join(homeRoot, '.agent-world', 'skills', 'duplicate'), { recursive: true });
    await writeFile(
      path.join(homeRoot, '.agent-world', 'skills', 'duplicate', 'SKILL.md'),
      ['---', 'name: duplicate-skill', 'description: User duplicate.', '---', '', '# User duplicate', ''].join('\n'),
      'utf8',
    );
    await writeSkill(rootPath, 'shared', {
      name: 'shared-skill',
      description: 'Workspace shared.',
    });
    await writeSkill(rootPath, 'duplicate', {
      name: 'duplicate-skill',
      description: 'Workspace duplicate.',
    });

    const { loadSkillInventory, loadSkillInventoryByScope } = await loadAgentFiles(rootPath, homeRoot);

    await expect(loadSkillInventoryByScope()).resolves.toMatchObject({
      user: [
        expect.objectContaining({ skillId: 'duplicate-skill', sourceScope: 'user' }),
        expect.objectContaining({ skillId: 'user-skill', sourceScope: 'user' }),
      ],
      project: [
        expect.objectContaining({ skillId: 'duplicate-skill', sourceScope: 'project' }),
        expect.objectContaining({ skillId: 'shared-skill', sourceScope: 'project' }),
      ],
    });
    await expect(loadSkillInventory()).resolves.toEqual([
      expect.objectContaining({
        skillId: 'duplicate-skill',
        description: 'Workspace duplicate.',
        sourceScope: 'project',
      }),
      expect.objectContaining({ skillId: 'shared-skill', description: 'Workspace shared.' }),
      expect.objectContaining({ skillId: 'user-skill', description: 'User only.' }),
    ]);
  });

  it('returns the built-in prompt independently of AGENTS.md state', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { DEFAULT_SYSTEM_PROMPT, getBuiltInSystemPrompt } = await loadAgentFiles(rootPath);

    expect(getBuiltInSystemPrompt()).toBe(DEFAULT_SYSTEM_PROMPT);
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Prefer workspace evidence over speculation');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Use available read-only tools before asking the user');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('use `load_skill` when a relevant skill is available');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Do not reveal secret values by default');
  });

  it('returns an empty workspace prompt when AGENTS.md is missing or empty', async () => {
    const missingRoot = await createTestRoot();
    const emptyRoot = await createTestRoot();
    rootsToClean.push(missingRoot, emptyRoot);
    await writeSystemPrompt(emptyRoot, '   ');

    await expect((await loadAgentFiles(missingRoot)).loadWorkspaceSystemPrompt()).resolves.toBe('');
    await expect((await loadAgentFiles(emptyRoot)).loadWorkspaceSystemPrompt()).resolves.toBe('');
  });

  it('preserves non-missing filesystem errors when loading AGENTS.md', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    vi.resetModules();
    vi.doMock('node:fs', async () => {
      const actual = /** @type {typeof import('node:fs')} */ (await vi.importActual('node:fs'));

      return {
        ...actual,
        promises: {
          ...actual.promises,
          stat: vi.fn(async (targetPath) => {
            if (String(targetPath).endsWith('/AGENTS.md')) {
              const error = new Error('Permission denied');
              // @ts-expect-error Test-only error shape.
              error.code = 'EACCES';
              throw error;
            }

            return actual.promises.stat(targetPath);
          }),
        },
      };
    });

    const { loadWorkspaceSystemPrompt } = await loadAgentFiles(rootPath);

    await expect(loadWorkspaceSystemPrompt()).rejects.toThrow('Permission denied');
  });

  it('builds a load_skill inventory hint only when skills are available', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    const { buildSkillInventoryMessage } = await loadAgentFiles(rootPath);

    expect(buildSkillInventoryMessage([])).toBe('');
    expect(
      buildSkillInventoryMessage([
        { skillId: 'agent-cli-core', description: 'Core Agent CLI framing.' },
      ]),
    ).toContain('load_skill');
    expect(
      buildSkillInventoryMessage([
        { skillId: 'agent-cli-core', description: 'Core Agent CLI framing.' },
      ]),
    ).toContain('agent-cli-core');
  });

  it('returns an empty inventory when the skill root is missing or empty', async () => {
    const missingRoot = await createTestRoot();
    const emptyRoot = await createTestRoot();
    rootsToClean.push(missingRoot, emptyRoot);
    await ensureSkillsRoot(emptyRoot);

    await expect((await loadAgentFiles(missingRoot)).loadSkillInventory()).resolves.toEqual([]);
    await expect((await loadAgentFiles(emptyRoot)).loadSkillInventory()).resolves.toEqual([]);
  });

  it('preserves non-missing filesystem errors when loading the skill root', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    vi.resetModules();
    vi.doMock('node:fs', async () => {
      const actual = /** @type {typeof import('node:fs')} */ (await vi.importActual('node:fs'));

      return {
        ...actual,
        promises: {
          ...actual.promises,
          stat: vi.fn(async (targetPath) => {
            if (String(targetPath).endsWith('/.agent-world/skills')) {
              const error = new Error('Permission denied');
              // @ts-expect-error Test-only error shape.
              error.code = 'EACCES';
              throw error;
            }

            return actual.promises.stat(targetPath);
          }),
        },
      };
    });

    const { loadSkillInventory } = await loadAgentFiles(rootPath);

    await expect(loadSkillInventory()).rejects.toThrow('Permission denied');
  });
});
