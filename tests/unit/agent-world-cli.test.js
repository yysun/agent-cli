// @ts-check
/**
 * Agent World CLI Unit Tests
 *
 * Purpose:
 * - Validate the JSON-first command dispatcher without spawning a child process.
 *
 * Key features:
 * - Covers help output, world inspection, agent/chat mutations, and provider-free queued sends.
 * - Exercises the same runtime-backed paths as the published `agent-world-cli` binary.
 *
 * Recent changes:
 * - 2026-05-23: Added workspace resolution parity coverage for agent-world-cli.
 * - 2026-05-23: Added scripted interactive-mode coverage.
 * - 2026-05-23: Added initial command dispatcher coverage for `agent-world-cli`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';

import { createTestRoot, removeTestRoot } from '../helpers/test-root.js';

const originalCwd = process.cwd();
/** @type {string[]} */
const rootsToClean = [];
const AGENT_WORLD_ENVIRONMENT_KEYS = [
  'AGENT_CLI_WORKSPACE',
  'AGENT_CLI_ROOT',
  'AGENT_CLI_RELAY_SERVER_URL',
  'GOOGLE_API_KEY',
  'OPENAI_API_KEY',
];
const originalAgentWorldEnvironment = Object.fromEntries(
  AGENT_WORLD_ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]),
);

/** @param {Record<string, string | undefined>} snapshot */
function restoreAgentWorldEnvironment(snapshot) {
  for (const key of AGENT_WORLD_ENVIRONMENT_KEYS) {
    const value = snapshot[key];

    if (typeof value === 'undefined') {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

function createIoCapture() {
  let stdout = '';
  let stderr = '';

  return {
    io: {
      stdin: undefined,
      stdout: { write: (chunk) => { stdout += String(chunk); return true; } },
      stderr: { write: (chunk) => { stderr += String(chunk); return true; } },
    },
    getStdout: () => stdout,
    getStderr: () => stderr,
  };
}

/** @param {string} rootPath */
async function loadAgentWorldCli(rootPath) {
  process.chdir(rootPath);
  vi.resetModules();
  return await import('../../cli/src/agent-world-cli.ts');
}

/** @param {string} output */
function parseJsonOutput(output) {
  return JSON.parse(output);
}

afterEach(async () => {
  process.chdir(originalCwd);
  restoreAgentWorldEnvironment(originalAgentWorldEnvironment);
  vi.resetModules();

  while (rootsToClean.length > 0) {
    await removeTestRoot(rootsToClean.pop());
  }
});

describe('agent-world-cli', () => {
  it('prints help text', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    const { runAgentWorldCli } = await loadAgentWorldCli(rootPath);
    const capture = createIoCapture();

    const exitCode = await runAgentWorldCli(['help'], capture.io);

    expect(exitCode).toBe(0);
    expect(capture.getStdout()).toContain('agents create');
    expect(capture.getStdout()).toContain('queue pause|resume|stop|clear');
  });

  it('creates agents and chats through the world runtime', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    const { runAgentWorldCli } = await loadAgentWorldCli(rootPath);
    const createAgentCapture = createIoCapture();

    expect(await runAgentWorldCli([
      'agents',
      'create',
      'reviewer',
      '--name',
      'Reviewer',
      '--provider',
      'openai',
      '--model',
      'gpt-5',
    ], createAgentCapture.io)).toBe(0);
    expect(parseJsonOutput(createAgentCapture.getStdout())).toMatchObject({
      id: 'reviewer',
      name: 'Reviewer',
    });

    const createChatCapture = createIoCapture();
    expect(await runAgentWorldCli(['chats', 'new'], createChatCapture.io)).toBe(0);
    const createdChat = parseJsonOutput(createChatCapture.getStdout());
    expect(createdChat.chatId).toBeTruthy();

    const listCapture = createIoCapture();
    expect(await runAgentWorldCli(['chats', 'list'], listCapture.io)).toBe(0);
    expect(parseJsonOutput(listCapture.getStdout())).toEqual([
      expect.objectContaining({ id: createdChat.chatId }),
    ]);
  });

  it('stores state under --workspace= instead of cwd or environment workspace', async () => {
    const rootPath = await createTestRoot();
    const cwdRoot = await createTestRoot();
    rootsToClean.push(rootPath, cwdRoot);
    process.env.AGENT_CLI_WORKSPACE = cwdRoot;
    const { runAgentWorldCli } = await loadAgentWorldCli(cwdRoot);
    const capture = createIoCapture();

    expect(await runAgentWorldCli([`--workspace=${rootPath}`, 'chats', 'new'], capture.io)).toBe(0);

    expect(await readdir(path.join(rootPath, '.agent-world'))).toContain('world.json');
    await expect(readdir(path.join(cwdRoot, '.agent-world'))).rejects.toThrow();
  });

  it('supports legacy --project and workspace .env credential loading', async () => {
    const rootPath = await createTestRoot();
    const cwdRoot = await createTestRoot();
    rootsToClean.push(rootPath, cwdRoot);
    await writeFile(
      path.join(rootPath, '.env'),
      'GOOGLE_API_KEY=dotenv-google-key\nAGENT_CLI_RELAY_SERVER_URL=http://127.0.0.1:8787\n',
      'utf8',
    );
    delete process.env.AGENT_CLI_RELAY_SERVER_URL;
    delete process.env.GOOGLE_API_KEY;
    const { runAgentWorldCli } = await loadAgentWorldCli(cwdRoot);
    const capture = createIoCapture();

    expect(await runAgentWorldCli(['--project', rootPath, 'world'], capture.io)).toBe(0);

    expect(process.env.GOOGLE_API_KEY).toBe('dotenv-google-key');
    expect(process.env.AGENT_CLI_RELAY_SERVER_URL).toBe('http://127.0.0.1:8787');
    expect(parseJsonOutput(capture.getStdout())).toMatchObject({ defaultAgentId: 'default' });
    expect(await readdir(path.join(rootPath, '.agent-world'))).toContain('world.json');
    await expect(readdir(path.join(cwdRoot, '.agent-world'))).rejects.toThrow();
  });

  it('falls back to AGENT_CLI_WORKSPACE from cwd .env when no workspace flag or environment variable is set', async () => {
    const cwdRoot = await createTestRoot();
    const workspaceRoot = path.join(cwdRoot, 'workspace-from-dotenv');
    rootsToClean.push(cwdRoot);
    await mkdir(workspaceRoot, { recursive: true });
    await writeFile(path.join(cwdRoot, '.env'), 'AGENT_CLI_WORKSPACE=workspace-from-dotenv\n', 'utf8');
    await writeFile(path.join(workspaceRoot, '.env'), 'GOOGLE_API_KEY=dotenv-google-key\n', 'utf8');
    delete process.env.AGENT_CLI_WORKSPACE;
    delete process.env.AGENT_CLI_ROOT;
    delete process.env.GOOGLE_API_KEY;
    const { runAgentWorldCli } = await loadAgentWorldCli(cwdRoot);
    const capture = createIoCapture();

    expect(await runAgentWorldCli(['world'], capture.io)).toBe(0);

    expect(process.env.GOOGLE_API_KEY).toBe('dotenv-google-key');
    expect(parseJsonOutput(capture.getStdout())).toMatchObject({ defaultAgentId: 'default' });
    expect(await readdir(path.join(workspaceRoot, '.agent-world'))).toContain('world.json');
  });

  it('queues sends without dispatching to a provider', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    const { runAgentWorldCli } = await loadAgentWorldCli(rootPath);
    const createChatCapture = createIoCapture();
    await runAgentWorldCli(['chats', 'new'], createChatCapture.io);
    const { chatId } = parseJsonOutput(createChatCapture.getStdout());
    const sendCapture = createIoCapture();

    expect(await runAgentWorldCli(['send', '--queue', '--chat', chatId, '@reviewer', 'check', 'this'], sendCapture.io)).toBe(0);
    const sendResult = parseJsonOutput(sendCapture.getStdout());
    expect(sendResult).toMatchObject({
      chatId,
      queued: true,
      queueMessage: {
        chatId,
        content: '@reviewer check this',
        status: 'queued',
      },
    });

    const queueCapture = createIoCapture();
    expect(await runAgentWorldCli(['queue', 'list', chatId], queueCapture.io)).toBe(0);
    expect(parseJsonOutput(queueCapture.getStdout())).toEqual([
      expect.objectContaining({ content: '@reviewer check this', status: 'queued' }),
    ]);
  });

  it('runs scripted interactive commands over the shared dispatcher', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    const { runAgentWorldCli } = await loadAgentWorldCli(rootPath);
    const capture = createIoCapture();
    capture.io.stdin = Readable.from([
      '/help\n',
      '/agents create reviewer --name Reviewer\n',
      '/new\n',
      '/send --queue @reviewer interactive token\n',
      '/queue\n',
      '/clear\n',
      '/queue\n',
      '/exit\n',
    ]);

    const exitCode = await runAgentWorldCli([], capture.io);

    expect(exitCode).toBe(0);
    expect(capture.getStdout()).toContain('agent-world-cli interactive');
    expect(capture.getStdout()).toContain('/send [--chat <chatId>]');
    expect(capture.getStdout()).toContain('"id": "reviewer"');
    expect(capture.getStdout()).toContain('"content": "@reviewer interactive token"');
    expect(capture.getStdout()).toContain('"cleared": true');
    expect(capture.getStderr()).toBe('');
  });
});
