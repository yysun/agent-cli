// @ts-check
/**
 * Agent World CLI End-to-End Tests
 *
 * Purpose:
 * - Exercise the published `agent-world-cli` binary against an isolated on-disk workspace.
 *
 * Key features:
 * - Mirrors the Electron E2E style: real built entrypoint, dedicated workspace, and durable state assertions.
 * - Covers help/world inspection, agent/chat lifecycle, and queue status transitions.
 * - Keeps the suite provider-free by using queued sends rather than direct LLM dispatch.
 *
 * Recent changes:
 * - 2026-05-23: Added real binary E2E coverage for `agent-world-cli`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createTestRoot, readJson, removeTestRoot } from '../helpers/test-root.js';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const agentWorldCliBin = path.join(repoRoot, 'bin', 'agent-world-cli.js');
/** @type {string[]} */
const rootsToClean = [];

afterEach(async () => {
  while (rootsToClean.length > 0) {
    await removeTestRoot(rootsToClean.pop());
  }
});

/**
 * @param {string} rootPath
 * @param {string[]} args
 */
async function runAgentWorldCli(rootPath, args) {
  const result = await execFileAsync(process.execPath, [agentWorldCliBin, ...args], {
    cwd: rootPath,
    env: {
      ...process.env,
      OPENAI_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      GOOGLE_API_KEY: '',
      XAI_API_KEY: '',
      AZURE_OPENAI_API_KEY: '',
      OPENAI_COMPATIBLE_API_KEY: '',
      OLLAMA_BASE_URL: '',
    },
  });

  return {
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
  };
}

/** @param {string} output */
function parseJsonOutput(output) {
  return JSON.parse(output);
}

describe('agent-world-cli binary', () => {
  it('prints help and loads a fresh world snapshot', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const help = await runAgentWorldCli(rootPath, ['help']);
    expect(help.stdout).toContain('agent-world-cli commands:');
    expect(help.stdout).toContain('queue pause|resume|stop|clear');

    const world = parseJsonOutput((await runAgentWorldCli(rootPath, ['world'])).stdout);
    expect(world).toMatchObject({
      defaultAgentId: 'default',
      currentChatId: '',
    });
    expect(world.agents).toEqual([expect.objectContaining({ id: 'default' })]);
    expect(world.chats).toEqual([]);
  });

  it('creates agents and chats through the real binary', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const agent = parseJsonOutput((await runAgentWorldCli(rootPath, [
      'agents',
      'create',
      'reviewer',
      '--name',
      'Reviewer',
      '--provider',
      'openai',
      '--model',
      'gpt-5',
    ])).stdout);
    expect(agent).toMatchObject({ id: 'reviewer', name: 'Reviewer' });

    const agents = parseJsonOutput((await runAgentWorldCli(rootPath, ['agents', 'list'])).stdout);
    expect(agents).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'default' }),
      expect.objectContaining({ id: 'reviewer' }),
    ]));

    const created = parseJsonOutput((await runAgentWorldCli(rootPath, ['chats', 'new'])).stdout);
    expect(created.chatId).toBeTruthy();

    const selected = parseJsonOutput((await runAgentWorldCli(rootPath, ['chats', 'use', created.chatId])).stdout);
    expect(selected.chatId).toBe(created.chatId);

    const world = await readJson(path.join(rootPath, '.agent-world', 'world.json'));
    expect(world.currentChatId).toBe(created.chatId);
  });

  it('surfaces queue lifecycle states for provider-free queued sends', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await runAgentWorldCli(rootPath, ['agents', 'create', 'reviewer', '--name', 'Reviewer']);
    const created = parseJsonOutput((await runAgentWorldCli(rootPath, ['chats', 'new'])).stdout);
    const chatId = created.chatId;

    const sent = parseJsonOutput((await runAgentWorldCli(rootPath, [
      'send',
      '--queue',
      '--chat',
      chatId,
      '@reviewer',
      'queue',
      'token',
    ])).stdout);
    expect(sent).toMatchObject({
      chatId,
      queued: true,
      queueMessage: {
        content: '@reviewer queue token',
        status: 'queued',
      },
    });

    const queuedRows = parseJsonOutput((await runAgentWorldCli(rootPath, ['queue', 'list', chatId])).stdout);
    expect(queuedRows).toEqual([
      expect.objectContaining({ content: '@reviewer queue token', status: 'queued' }),
    ]);

    const stopped = parseJsonOutput((await runAgentWorldCli(rootPath, ['queue', 'stop', chatId])).stdout);
    expect(stopped).toEqual({ stopped: true, chatId });
    const cancelledRows = parseJsonOutput((await runAgentWorldCli(rootPath, ['queue', 'list', chatId])).stdout);
    expect(cancelledRows).toEqual([
      expect.objectContaining({ content: '@reviewer queue token', status: 'cancelled' }),
    ]);

    const cleared = parseJsonOutput((await runAgentWorldCli(rootPath, ['queue', 'clear', chatId])).stdout);
    expect(cleared).toEqual({ cleared: true, chatId });
    expect(parseJsonOutput((await runAgentWorldCli(rootPath, ['queue', 'list', chatId])).stdout)).toEqual([]);
  });
});
