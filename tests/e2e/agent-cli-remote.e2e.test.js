// @ts-check
/**
 * Agent CLI Remote Host End-to-End Tests
 *
 * Purpose:
 * - Exercise the real `agent-cli --remote` host process against the real relay server.
 *
 * Key features:
 * - Launches the relay server binary and the CLI host as long-running child processes.
 * - Verifies remote clients can list chats, select the active chat, and load persisted chat history.
 *
 * Recent changes:
 * - 2026-05-13: Added deterministic e2e coverage for long-running remote host chat management.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  pairRelaySession,
  readRelayEvents,
  sendRelayCommand,
} from '../../lib/relay-client.js';
import {
  createTestRoot,
  ensureSkillsRoot,
  removeTestRoot,
  writeSystemPrompt,
} from '../helpers/test-root.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const relayServerBin = path.join(repoRoot, 'server/bin/relay-server.js');
const agentCliBin = path.join(repoRoot, 'bin/agent-cli.js');
const START_TIMEOUT_MS = 5000;

/** @type {import('node:child_process').ChildProcess[]} */
const processesToStop = [];
/** @type {string[]} */
const rootsToClean = [];

afterEach(async () => {
  while (processesToStop.length > 0) {
    const childProcess = processesToStop.pop();

    if (childProcess) {
      await stopChildProcess(childProcess);
    }
  }

  while (rootsToClean.length > 0) {
    const rootPath = rootsToClean.pop();

    if (rootPath) {
      await removeTestRoot(rootPath);
    }
  }
});

/** @param {import('node:child_process').ChildProcess} childProcess */
async function stopChildProcess(childProcess) {
  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return;
  }

  childProcess.kill('SIGTERM');

  const stopped = await Promise.race([
    once(childProcess, 'exit').then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 1000)),
  ]);

  if (stopped) {
    return;
  }

  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return;
  }

  childProcess.kill('SIGKILL');

  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return;
  }

  await once(childProcess, 'exit');
}

/**
 * @param {{ host?: string }} [options]
 * @returns {Promise<{ relayServer: string }>}
 */
async function startRelayServer(options = {}) {
  const host = options.host ?? '127.0.0.1';
  const relayProcess = spawn(process.execPath, [relayServerBin, '--host', host, '--port', '0'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processesToStop.push(relayProcess);

  relayProcess.stdout?.setEncoding('utf8');
  relayProcess.stderr?.setEncoding('utf8');

  let stdout = '';
  let stderr = '';

  return await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      finish(
        reject,
        new Error(`Timed out waiting for relay server to start.\nstdout:\n${stdout}\nstderr:\n${stderr}`),
      );
    }, START_TIMEOUT_MS);

    /**
     * @param {(value: any) => void} callback
     * @param {any} value
     */
    function finish(callback, value) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      relayProcess.removeListener('error', handleError);
      relayProcess.removeListener('exit', handleExit);
      callback(value);
    }

    /** @param {Error} error */
    function handleError(error) {
      finish(reject, error);
    }

    /**
     * @param {number | null} code
     * @param {NodeJS.Signals | null} signal
     */
    function handleExit(code, signal) {
      finish(
        reject,
        new Error(`Relay server exited before startup with code ${code ?? 'null'} and signal ${signal ?? 'null'}.\nstdout:\n${stdout}\nstderr:\n${stderr}`),
      );
    }

    relayProcess.once('error', handleError);
    relayProcess.once('exit', handleExit);
    relayProcess.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
      const match = stdout.match(/https?:\/\/[^\s]+/u);

      if (match) {
        finish(resolve, { relayServer: match[0] });
      }
    });
    relayProcess.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
  });
}

/**
 * @param {{ rootPath: string, relayServer: string }} input
 * @returns {Promise<{ cliProcess: import('node:child_process').ChildProcess, clientConnectionUrl: string }>}
 */
async function startRemoteCli(input) {
  const cliProcess = spawn(process.execPath, [agentCliBin, '--remote'], {
    cwd: input.rootPath,
    env: {
      ...process.env,
      AGENT_CLI_ROOT: input.rootPath,
      AGENT_CLI_RELAY_SERVER_URL: input.relayServer,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processesToStop.push(cliProcess);

  cliProcess.stdout?.setEncoding('utf8');
  cliProcess.stderr?.setEncoding('utf8');

  let stdout = '';
  let stderr = '';

  return await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      finish(
        reject,
        new Error(`Timed out waiting for agent-cli --remote to print the connection URL.\nstdout:\n${stdout}\nstderr:\n${stderr}`),
      );
    }, START_TIMEOUT_MS);

    /**
     * @param {(value: any) => void} callback
     * @param {any} value
     */
    function finish(callback, value) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      cliProcess.removeListener('error', handleError);
      cliProcess.removeListener('exit', handleExit);
      callback(value);
    }

    /** @param {Error} error */
    function handleError(error) {
      finish(reject, error);
    }

    /**
     * @param {number | null} code
     * @param {NodeJS.Signals | null} signal
     */
    function handleExit(code, signal) {
      finish(
        reject,
        new Error(`agent-cli --remote exited before startup with code ${code ?? 'null'} and signal ${signal ?? 'null'}.\nstdout:\n${stdout}\nstderr:\n${stderr}`),
      );
    }

    cliProcess.once('error', handleError);
    cliProcess.once('exit', handleExit);
    cliProcess.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
      const match = stdout.match(/Client connection URL:\s*(https?:\/\/[^\s]+)/u);

      if (match) {
        finish(resolve, {
          cliProcess,
          clientConnectionUrl: match[1],
        });
      }
    });
    cliProcess.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
  });
}

/**
 * @param {string} filePath
 * @param {unknown} value
 */
async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/**
 * @param {string} rootPath
 * @param {{ id: string, createdAt: string, updatedAt: string, messages: Array<Record<string, unknown>> }} chat
 */
async function seedPersistedChat(rootPath, chat) {
  await writeJson(path.join(rootPath, '.chats', chat.id, 'messages.json'), chat);
}

/**
 * @param {{ relayServer: string, sessionId: string, mobileToken: string, after: number, matchEvent: (event: any) => boolean, timeoutMs?: number }} input
 */
async function waitForMatchingEvent(input) {
  const timeoutMs = input.timeoutMs ?? 5000;
  const deadline = Date.now() + timeoutMs;
  let cursor = input.after;
  /** @type {string[]} */
  const seenEventTypes = [];

  while (Date.now() < deadline) {
    const backlog = await readRelayEvents({
      relayServer: input.relayServer,
      sessionId: input.sessionId,
      mobileToken: input.mobileToken,
      after: cursor,
    });
    const events = backlog.events ?? [];

    if (events.length > 0) {
      for (const event of events) {
        seenEventTypes.push(String(event.type ?? 'unknown'));
      }

      cursor = Math.max(cursor, ...events.map((event) => Number(event.sequence) || 0));
      const matchedEvent = events.find(input.matchEvent);

      if (matchedEvent) {
        return { event: matchedEvent, cursor };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for relay event. Seen events: ${seenEventTypes.join(', ') || '(none)'}`);
}

describe('agent-cli --remote host', () => {
  it('stays running and lets clients list chats, select a chat, and read chat history', async () => {
    const { relayServer } = await startRelayServer();
    const rootPath = await createTestRoot('agent-cli-remote-e2e-');
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'You are a test prompt.');
    await ensureSkillsRoot(rootPath);

    const currentChatId = '20260513T100000Z-chat-a1111111';
    const archivedChatId = '20260513T090000Z-chat-b2222222';

    await seedPersistedChat(rootPath, {
      id: currentChatId,
      createdAt: '2026-05-13T10:00:00.000Z',
      updatedAt: '2026-05-13T10:05:00.000Z',
      messages: [
        { role: 'user', content: 'current question', createdAt: '2026-05-13T10:00:00.000Z' },
        { role: 'assistant', content: 'current answer', createdAt: '2026-05-13T10:00:05.000Z' },
      ],
    });
    await seedPersistedChat(rootPath, {
      id: archivedChatId,
      createdAt: '2026-05-13T09:00:00.000Z',
      updatedAt: '2026-05-13T09:10:00.000Z',
      messages: [
        { role: 'user', content: 'archived question', createdAt: '2026-05-13T09:00:00.000Z' },
        { role: 'assistant', content: 'archived answer', createdAt: '2026-05-13T09:00:04.000Z' },
      ],
    });
    await writeJson(path.join(rootPath, '.chats', 'current.json'), { chatId: currentChatId });

    const { cliProcess, clientConnectionUrl } = await startRemoteCli({ rootPath, relayServer });
    const clientConnection = new URL(clientConnectionUrl);
    const sessionId = String(clientConnection.searchParams.get('sessionId') ?? '');
    const pairingToken = String(clientConnection.searchParams.get('pairingToken') ?? '');

    expect(sessionId).toBeTruthy();
    expect(pairingToken).toBeTruthy();
    expect(cliProcess.exitCode).toBeNull();

    const pairResult = await pairRelaySession({
      relayServer,
      sessionId,
      pairingToken,
      mobileName: 'agent-cli-remote-e2e-client',
    });

    expect(pairResult.mobileToken).toBeTruthy();
    expect(pairResult.clientId).toBeTruthy();
    expect(pairResult.chatId).toBe(currentChatId);

    const initialBacklog = await readRelayEvents({
      relayServer,
      sessionId,
      mobileToken: pairResult.mobileToken,
      after: 0,
    });
    const initialEventTypes = initialBacklog.events.map((event) => event.type);
    let cursor = Math.max(0, ...initialBacklog.events.map((event) => Number(event.sequence) || 0));

    expect(initialEventTypes).toContain('session_snapshot');
    expect(initialBacklog.events).toContainEqual(expect.objectContaining({
      type: 'session_snapshot',
      payload: expect.objectContaining({
        activeChatId: currentChatId,
      }),
    }));

    const listRequestId = 'e2e-list-chats';

    await sendRelayCommand({
      relayServer,
      sessionId,
      mobileToken: pairResult.mobileToken,
      type: 'list_chats',
      payload: { requestId: listRequestId },
    });

    const chatListResult = await waitForMatchingEvent({
      relayServer,
      sessionId,
      mobileToken: pairResult.mobileToken,
      after: cursor,
      matchEvent: (event) => event.type === 'chat_list_result' && event.payload?.requestId === listRequestId,
    });
    cursor = chatListResult.cursor;

    expect(chatListResult.event.payload).toMatchObject({
      requestId: listRequestId,
      activeChatId: currentChatId,
    });
    expect(chatListResult.event.payload.chats).toEqual([
      expect.objectContaining({ id: currentChatId, isCurrent: true, messageCount: 2 }),
      expect.objectContaining({ id: archivedChatId, isCurrent: false, messageCount: 2 }),
    ]);

    const selectRequestId = 'e2e-select-chat';

    await sendRelayCommand({
      relayServer,
      sessionId,
      mobileToken: pairResult.mobileToken,
      type: 'select_chat',
      payload: {
        requestId: selectRequestId,
        chatId: archivedChatId,
      },
    });

    const activeChatChanged = await waitForMatchingEvent({
      relayServer,
      sessionId,
      mobileToken: pairResult.mobileToken,
      after: cursor,
      matchEvent: (event) => event.type === 'active_chat_changed' && event.payload?.requestId === selectRequestId,
    });
    cursor = activeChatChanged.cursor;

    expect(activeChatChanged.event.payload).toMatchObject({
      requestId: selectRequestId,
      chatId: archivedChatId,
      chat: expect.objectContaining({ id: archivedChatId, messageCount: 2 }),
    });

    const currentChatPointer = JSON.parse(await readFile(path.join(rootPath, '.chats', 'current.json'), 'utf8'));

    expect(currentChatPointer).toEqual({ chatId: archivedChatId });

    const readMessagesRequestId = 'e2e-read-chat';

    await sendRelayCommand({
      relayServer,
      sessionId,
      mobileToken: pairResult.mobileToken,
      type: 'read_chat_messages',
      payload: {
        requestId: readMessagesRequestId,
        chatId: archivedChatId,
      },
    });

    const chatMessagesResult = await waitForMatchingEvent({
      relayServer,
      sessionId,
      mobileToken: pairResult.mobileToken,
      after: cursor,
      matchEvent: (event) => event.type === 'chat_messages_result' && event.payload?.requestId === readMessagesRequestId,
    });
    cursor = chatMessagesResult.cursor;

    expect(chatMessagesResult.event.payload).toMatchObject({
      requestId: readMessagesRequestId,
      chatId: archivedChatId,
      activeChatId: archivedChatId,
    });
    expect(chatMessagesResult.event.payload.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'archived question' }),
      expect.objectContaining({ role: 'assistant', content: 'archived answer' }),
    ]);

    await sendRelayCommand({
      relayServer,
      sessionId,
      mobileToken: pairResult.mobileToken,
      type: 'disconnect',
      payload: { requestId: 'e2e-disconnect' },
    });

    const [exitCode, signal] = await Promise.race([
      once(cliProcess, 'exit'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out waiting for agent-cli --remote to exit.')), 5000)),
    ]);

    expect(exitCode).toBe(0);
    expect(signal).toBeNull();
  });
});