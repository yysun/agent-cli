// @ts-check
/**
 * Agent CLI Agent File Loading
 *
 * Purpose:
 * - Load the built-in prompt, optional workspace prompt, and inventory `llm-runtime` skills.
 *
 * Key features:
 * - Reads optional `./AGENTS.md` prompt content without replacing the built-in prompt.
 * - Discovers recursive `SKILL.md` files using deterministic lexical ordering.
 * - Summarizes available skills so the model can choose `load_skill` targets.
 *
 * Recent changes:
 * - 2026-05-23: Renamed AGENTS.md prompt loading terminology from project to workspace.
 * - 2026-05-07: Added agent prompt and skill inventory helpers for the CLI.
 * - 2026-05-07: Switched prompt and skills loading to AGENTS/.agents conventions.
 * - 2026-05-11: Split built-in prompt loading from optional AGENTS.md prompt loading.
 * - 2026-05-16: Strengthened the built-in prompt with workspace evidence, tool usage, and secret-handling guidance.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SKILLS_ROOT, SYSTEM_PROMPT_PATH } from './paths.js';
export const DEFAULT_SYSTEM_PROMPT = [
    'You are Agent CLI.',
    'Be concise, factual, and action-oriented.',
    'Prefer workspace evidence over speculation when an answer depends on files, configuration, environment variables, logs, generated outputs, or repository state.',
    'Use available read-only tools before asking the user for information that may already exist in the workspace.',
    'When a task depends on domain-specific instructions, procedures, or contracts, use `load_skill` when a relevant skill is available.',
    'Do not claim files, configuration, or prerequisites are missing until you have inspected likely sources when appropriate.',
    'Do not reveal secret values by default; report presence, absence, or non-sensitive metadata unless the user explicitly asks to inspect file contents.',
].join(' ');
export function getBuiltInSystemPrompt() {
    return DEFAULT_SYSTEM_PROMPT;
}
/**
 * @param {string} filePath
 * @param {string} label
 */
async function assertReadableFile(filePath, label) {
    let stats;
    try {
        stats = await fs.stat(filePath);
    }
    catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code !== 'ENOENT') {
            throw error;
        }
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
    }
    catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code !== 'ENOENT') {
            throw error;
        }
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
export async function loadWorkspaceSystemPrompt() {
    try {
        await assertReadableFile(SYSTEM_PROMPT_PATH, 'system prompt');
    }
    catch (error) {
        if (error instanceof Error && error.message.startsWith('Missing system prompt:')) {
            return '';
        }
        throw error;
    }
    const content = (await fs.readFile(SYSTEM_PROMPT_PATH, 'utf8')).trim();
    return content;
}
export async function loadProjectSystemPrompt() {
    return loadWorkspaceSystemPrompt();
}
export async function loadSkillInventory() {
    try {
        await assertReadableDirectory(SKILLS_ROOT, 'skills root');
    }
    catch (error) {
        if (error instanceof Error && error.message.startsWith('Missing skills root:')) {
            return [];
        }
        throw error;
    }
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
