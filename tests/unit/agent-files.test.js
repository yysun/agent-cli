// @ts-check
/**
 * Agent CLI Agent File Unit Tests
 *
 * Purpose:
 * - Validate system-prompt loading and `SKILL.md` inventory behavior in isolation.
 *
 * Key features:
 * - Exercises recursive skill discovery and front matter parsing.
 * - Verifies workspace and selected-world skill inventory layering.
 * - Verifies the helper text exposed to the runtime.
 *
 * Recent changes:
 * - 2026-05-23: Added selected-world skill override coverage.
 * - 2026-05-23: Renamed AGENTS.md prompt tests from project to workspace terminology.
 * - 2026-05-07: Added targeted Vitest coverage for agent file loading.
 * - 2026-05-11: Added coverage for separate built-in and workspace prompt sources.
 * - 2026-05-16: Added assertions for the stronger built-in workspace guidance.
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
  delete process.env.AGENT_CLI_WORLD;
  if (typeof originalHome === 'undefined') {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  vi.doUnmock('node:fs');

  while (rootsToClean.length > 0) {
    await removeTestRoot(rootsToClean.pop());
  }
});

describe('agent-files', () => {
  it('loads the workspace system prompt and skill inventory in lexical path order', async () => {
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
      }),
      expect.objectContaining({
        skillId: 'zeta-skill',
        description: 'Loaded last.',
      }),
    ]);
  });

  it('layers user, workspace, and selected-world skills while keeping AGENTS.md workspace-only', async () => {
    const rootPath = await createTestRoot();
    const homeRoot = await createTestRoot();
    rootsToClean.push(rootPath, homeRoot);
    process.env.HOME = homeRoot;

    await writeSystemPrompt(rootPath, 'Workspace-only prompt');
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
    const worldSkillsRoot = path.join(rootPath, '.agent-world', 'worlds', 'research', 'skills');
    await mkdir(path.join(worldSkillsRoot, 'world-only'), { recursive: true });
    await writeFile(
      path.join(worldSkillsRoot, 'world-only', 'SKILL.md'),
      ['---', 'name: world-skill', 'description: World only.', '---', '', '# World', ''].join('\n'),
      'utf8',
    );
    await mkdir(path.join(worldSkillsRoot, 'duplicate'), { recursive: true });
    await writeFile(
      path.join(worldSkillsRoot, 'duplicate', 'SKILL.md'),
      ['---', 'name: duplicate-skill', 'description: World duplicate.', '---', '', '# Override', ''].join('\n'),
      'utf8',
    );
    await writeFile(path.join(rootPath, '.agent-world', 'worlds', 'research', 'AGENTS.md'), 'Wrong prompt\n', 'utf8');
    process.env.AGENT_CLI_WORLD = 'research';

    const { loadSkillInventory, loadSkillInventoryByScope, loadWorkspaceSystemPrompt } = await loadAgentFiles(rootPath, homeRoot);

    await expect(loadWorkspaceSystemPrompt()).resolves.toBe('Workspace-only prompt');
    await expect(loadSkillInventoryByScope()).resolves.toMatchObject({
      user: [
        expect.objectContaining({ skillId: 'duplicate-skill', sourceScope: 'user' }),
        expect.objectContaining({ skillId: 'user-skill', sourceScope: 'user' }),
      ],
      project: [
        expect.objectContaining({ skillId: 'duplicate-skill', sourceScope: 'project' }),
        expect.objectContaining({ skillId: 'shared-skill', sourceScope: 'project' }),
      ],
      world: [
        expect.objectContaining({ skillId: 'duplicate-skill', sourceScope: 'world' }),
        expect.objectContaining({ skillId: 'world-skill', sourceScope: 'world' }),
      ],
    });
    await expect(loadSkillInventory()).resolves.toEqual([
      expect.objectContaining({
        skillId: 'duplicate-skill',
        description: 'World duplicate.',
        sourceScope: 'world',
        sourcePath: expect.stringContaining(path.join('worlds', 'research', 'skills')),
      }),
      expect.objectContaining({ skillId: 'shared-skill', description: 'Workspace shared.' }),
      expect.objectContaining({ skillId: 'user-skill', description: 'User only.' }),
      expect.objectContaining({ skillId: 'world-skill', description: 'World only.' }),
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

  it('returns an empty workspace prompt when AGENTS.md is missing', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { loadWorkspaceSystemPrompt } = await loadAgentFiles(rootPath);

    await expect(loadWorkspaceSystemPrompt()).resolves.toBe('');
  });

  it('returns an empty workspace prompt when AGENTS.md is empty', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, '   ');

    const { loadWorkspaceSystemPrompt } = await loadAgentFiles(rootPath);

    await expect(loadWorkspaceSystemPrompt()).resolves.toBe('');
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

  it('returns an empty inventory when the skills root is missing', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');

    const { loadSkillInventory } = await loadAgentFiles(rootPath);

    await expect(loadSkillInventory()).resolves.toEqual([]);
  });

  it('preserves non-missing filesystem errors when loading the skills root', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');

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

  it('accepts an existing but empty skills root', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    await ensureSkillsRoot(rootPath);

    const { loadSkillInventory } = await loadAgentFiles(rootPath);

    await expect(loadSkillInventory()).resolves.toEqual([]);
  });
});
