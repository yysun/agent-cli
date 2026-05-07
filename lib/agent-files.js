// @ts-check
/**
 * Agent CLI Agent File Loading
 *
 * Purpose:
 * - Load the system prompt and inventory `llm-runtime` skills from the local agent directory.
 *
 * Key features:
 * - Validates `./agent/system.md` and `./agent/skills/` before runtime calls.
 * - Discovers recursive `SKILL.md` files using deterministic lexical ordering.
 * - Summarizes available skills so the model can choose `load_skill` targets.
 *
 * Recent changes:
 * - 2026-05-07: Added agent prompt and skill inventory helpers for the CLI.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { SKILLS_ROOT, SYSTEM_PROMPT_PATH } from './paths.js';

/**
 * @param {string} filePath
 * @param {string} label
 */
async function assertReadableFile(filePath, label) {
  let stats;

  try {
    stats = await fs.stat(filePath);
  } catch {
    throw new Error(`Missing ${label}: ${filePath}`);
  }

  if (!stats.isFile()) {
    throw new Error(`Expected ${label} to be a file: ${filePath}`);
  }
}

/**
 * @param {string} directoryPath
 * @param {string} label
 */
async function assertReadableDirectory(directoryPath, label) {
  let stats;

  try {
    stats = await fs.stat(directoryPath);
  } catch {
    throw new Error(`Missing ${label}: ${directoryPath}`);
  }

  if (!stats.isDirectory()) {
    throw new Error(`Expected ${label} to be a directory: ${directoryPath}`);
  }
}

/**
 * @param {string} content
 */
function parseSkillFrontMatter(content) {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const frontMatterMatch = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);

  if (!frontMatterMatch || !frontMatterMatch[1]) {
    return { skillId: '', description: '' };
  }

  let skillId = '';
  let description = '';

  for (const line of frontMatterMatch[1].split('\n')) {
    const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/);

    if (!match) {
      continue;
    }

    const key = String(match[1] ?? '').trim();
    const value = String(match[2] ?? '').trim().replace(/^['"]|['"]$/g, '');

    if (key === 'name') {
      skillId = value;
    }

    if (key === 'description') {
      description = value;
    }
  }

  return { skillId, description };
}

/**
 * @param {string} rootPath
 */
async function collectSkillFilePaths(rootPath) {
  /** @type {string[]} */
  const discoveredPaths = [];
  /** @type {string[]} */
  const queue = [rootPath];

  while (queue.length > 0) {
    const currentPath = queue.shift();

    if (!currentPath) {
      continue;
    }

    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }

      if (entry.isFile() && entry.name === 'SKILL.md') {
        discoveredPaths.push(entryPath);
      }
    }
  }

  return discoveredPaths.sort((left, right) => left.localeCompare(right));
}

export async function loadSystemPrompt() {
  await assertReadableFile(SYSTEM_PROMPT_PATH, 'system prompt');
  return (await fs.readFile(SYSTEM_PROMPT_PATH, 'utf8')).trim();
}

export async function loadSkillInventory() {
  await assertReadableDirectory(SKILLS_ROOT, 'skills root');
  const skillFilePaths = await collectSkillFilePaths(SKILLS_ROOT);

  /** @type {Array<{ skillId: string, description: string, sourcePath: string }>} */
  const skills = [];

  for (const skillFilePath of skillFilePaths) {
    const content = await fs.readFile(skillFilePath, 'utf8');
    const metadata = parseSkillFrontMatter(content);

    if (!metadata.skillId) {
      continue;
    }

    skills.push({
      skillId: metadata.skillId,
      description: metadata.description,
      sourcePath: skillFilePath,
    });
  }

  return skills;
}

/**
 * @param {Array<{ skillId: string, description?: string }>} skills
 */
export function buildSkillInventoryMessage(skills) {
  if (skills.length === 0) {
    return '';
  }

  const lines = skills.map((skill) => {
    const description = skill.description || 'No description provided.';
    return `- ${skill.skillId}: ${description}`;
  });

  return [
    'Available skills can be loaded through the `load_skill` tool.',
    'When a skill is relevant, call `load_skill` with the exact `skillId` before answering.',
    '',
    ...lines,
  ].join('\n');
}