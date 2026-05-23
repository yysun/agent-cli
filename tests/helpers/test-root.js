// @ts-check
/**
 * Agent CLI Test Root Helpers
 *
 * Purpose:
 * - Build temporary repo-like fixtures for isolated Vitest runs.
 *
 * Key features:
 * - Creates temporary Agent CLI roots with AGENTS/.agent-world fixtures on demand.
 * - Provides helpers for selected-world fixture paths.
 * - Provides JSON and stdout helpers used by both unit and e2e suites.
 *
 * Recent changes:
 * - 2026-05-23: Added default-world path helper for multi-world storage tests.
 * - 2026-05-07: Added shared test-fixture helpers for unit and e2e coverage.
 * - 2026-05-23: Added optional TTY flags to output capture helpers.
 */
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** @param {string} [prefix] */
export async function createTestRoot(prefix = 'agent-cli-') {
  return await mkdtemp(path.join(os.tmpdir(), prefix));
}

/** @param {string} rootPath */
export async function removeTestRoot(rootPath) {
  await rm(rootPath, { recursive: true, force: true });
}

/**
 * @param {string} rootPath
 * @param {string} [content]
 */
export async function writeSystemPrompt(rootPath, content = 'System prompt') {
  await writeFile(path.join(rootPath, 'AGENTS.md'), `${content}\n`, 'utf8');
}

/** @param {string} rootPath */
export async function ensureSkillsRoot(rootPath) {
  await mkdir(path.join(rootPath, '.agent-world', 'skills'), { recursive: true });
}

/**
 * @param {string} rootPath
 * @param {string} [worldId]
 */
export function buildWorldRoot(rootPath, worldId = 'default') {
  return path.join(rootPath, '.agent-world', 'worlds', worldId);
}

/**
 * @param {string} rootPath
 * @param {string} relativeDirectory
 * @param {{ name: string, description: string, body?: string }} skill
 */
export async function writeSkill(rootPath, relativeDirectory, { name, description, body = '# Skill\n' }) {
  const directoryPath = path.join(rootPath, '.agent-world', 'skills', relativeDirectory);
  await mkdir(directoryPath, { recursive: true });
  const fileContent = [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    '---',
    '',
    body.trim(),
    '',
  ].join('\n');
  await writeFile(path.join(directoryPath, 'SKILL.md'), fileContent, 'utf8');
}

/** @param {string} filePath */
export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

/**
 * @param {{ stdoutIsTTY?: boolean, stderrIsTTY?: boolean }} [options]
 */
export function createIoCapture(options = {}) {
  /** @type {string[]} */
  const stdoutChunks = [];
  /** @type {string[]} */
  const stderrChunks = [];

  return {
    stdout: {
      ...(options.stdoutIsTTY ? { isTTY: true } : {}),
      /** @param {string} chunk */
      write(chunk) {
        stdoutChunks.push(String(chunk));
      },
    },
    stderr: {
      ...(options.stderrIsTTY ? { isTTY: true } : {}),
      /** @param {string} chunk */
      write(chunk) {
        stderrChunks.push(String(chunk));
      },
    },
    getStdout() {
      return stdoutChunks.join('');
    },
    getStderr() {
      return stderrChunks.join('');
    },
  };
}
