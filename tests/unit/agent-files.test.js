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

  while (rootsToClean.length > 0) {
    await removeTestRoot(rootsToClean.pop());
  }
});

describe('agent-files', () => {
  it('loads the system prompt and skill inventory in lexical path order', async () => {
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
    await mkdir(path.join(rootPath, 'agent', 'skills', 'invalid'), { recursive: true });
    await writeFile(
      path.join(rootPath, 'agent', 'skills', 'invalid', 'SKILL.md'),
      '# Missing front matter\n',
      'utf8',
    );

    const { loadSkillInventory, loadSystemPrompt } = await loadAgentFiles(rootPath);

    await expect(loadSystemPrompt()).resolves.toBe('Agent CLI system prompt');
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

  it('fails clearly when the skills root is missing', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');

    const { loadSkillInventory } = await loadAgentFiles(rootPath);

    await expect(loadSkillInventory()).rejects.toThrow('Missing skills root');
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