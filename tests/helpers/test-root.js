// @ts-check
/**
 * Agent CLI Test Root Helpers
 *
 * Purpose:
 * - Build temporary repo-like fixtures for isolated Vitest runs.
 *
 * Key features:
 * - Creates temporary Agent CLI roots with agent and session folders on demand.
 * - Provides JSON and stdout helpers used by both unit and e2e suites.
 *
 * Recent changes:
 * - 2026-05-07: Added shared test-fixture helpers for unit and e2e coverage.
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

/** @param {string} rootPath */
export async function ensureAgentRoot(rootPath) {
  await mkdir(path.join(rootPath, 'agent'), { recursive: true });
}

/**
 * @param {string} rootPath
 * @param {string} [content]
 */
export async function writeSystemPrompt(rootPath, content = 'System prompt') {
  await ensureAgentRoot(rootPath);
  await writeFile(path.join(rootPath, 'agent', 'system.md'), `${content}\n`, 'utf8');
}

/**
 * @param {string} rootPath
 * @param {Record<string, unknown>} config
 */
export async function writeAgentConfig(rootPath, config) {
  await ensureAgentRoot(rootPath);
  await writeFile(path.join(rootPath, 'agent', 'config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

/** @param {string} rootPath */
export async function ensureSkillsRoot(rootPath) {
  await mkdir(path.join(rootPath, 'agent', 'skills'), { recursive: true });
}

/**
 * @param {string} rootPath
 * @param {string} relativeDirectory
 * @param {{ name: string, description: string, body?: string }} skill
 */
export async function writeSkill(rootPath, relativeDirectory, { name, description, body = '# Skill\n' }) {
  const directoryPath = path.join(rootPath, 'agent', 'skills', relativeDirectory);
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

export function createIoCapture() {
  /** @type {string[]} */
  const stdoutChunks = [];
  /** @type {string[]} */
  const stderrChunks = [];

  return {
    stdout: {
      /** @param {string} chunk */
      write(chunk) {
        stdoutChunks.push(String(chunk));
      },
    },
    stderr: {
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