// @ts-check
/**
 * Agent CLI Agent File Unit Tests
 *
 * Purpose:
 * - Validate system-prompt loading and `SKILL.md` inventory behavior in isolation.
 *
 * Key features:
 * - Exercises recursive skill discovery and front matter parsing.
 * - Verifies the helper text exposed to the runtime.
 *
 * Recent changes:
 * - 2026-05-07: Added targeted Vitest coverage for agent file loading.
 * - 2026-05-11: Added coverage for separate built-in and project prompt sources.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createTestRoot, ensureSkillsRoot, removeTestRoot, writeSkill, writeSystemPrompt } from '../helpers/test-root.js';

/** @type {string[]} */
const rootsToClean = [];

/** @param {string} rootPath */
async function loadAgentFiles(rootPath) {
  process.env.AGENT_CLI_ROOT = rootPath;
  vi.resetModules();
  return await import('../../lib/agent-files.js');
}

afterEach(async () => {
  delete process.env.AGENT_CLI_ROOT;
  vi.doUnmock('node:fs');

  while (rootsToClean.length > 0) {
    await removeTestRoot(rootsToClean.pop());
  }
});

describe('agent-files', () => {
  it('loads the project system prompt and skill inventory in lexical path order', async () => {
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
    await mkdir(path.join(rootPath, '.agents', 'skills', 'invalid'), { recursive: true });
    await writeFile(
      path.join(rootPath, '.agents', 'skills', 'invalid', 'SKILL.md'),
      '# Missing front matter\n',
      'utf8',
    );

    const { loadProjectSystemPrompt, loadSkillInventory } = await loadAgentFiles(rootPath);

    await expect(loadProjectSystemPrompt()).resolves.toBe('Agent CLI system prompt');
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

  it('returns the built-in prompt independently of AGENTS.md state', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { DEFAULT_SYSTEM_PROMPT, getBuiltInSystemPrompt } = await loadAgentFiles(rootPath);

    expect(getBuiltInSystemPrompt()).toBe(DEFAULT_SYSTEM_PROMPT);
  });

  it('returns an empty project prompt when AGENTS.md is missing', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { loadProjectSystemPrompt } = await loadAgentFiles(rootPath);

    await expect(loadProjectSystemPrompt()).resolves.toBe('');
  });

  it('returns an empty project prompt when AGENTS.md is empty', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, '   ');

    const { loadProjectSystemPrompt } = await loadAgentFiles(rootPath);

    await expect(loadProjectSystemPrompt()).resolves.toBe('');
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

    const { loadProjectSystemPrompt } = await loadAgentFiles(rootPath);

    await expect(loadProjectSystemPrompt()).rejects.toThrow('Permission denied');
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
            if (String(targetPath).endsWith('/.agents/skills')) {
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