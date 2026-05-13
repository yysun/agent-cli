// @ts-check
/**
 * Agent CLI Remote Control Unit Tests
 *
 * Purpose:
 * - Validate the remote-safe payload summaries used by the host coordinator.
 *
 * Key features:
 * - Redacts sensitive tool arguments and failure details before relay publication.
 *
 * Recent changes:
 * - 2026-05-11: Added remote payload summary coverage for relay-safe events.
 * - 2026-05-13: Added multi-client chat-management coverage.
 * - 2026-05-13: Updated coverage for slash-command chat operations over the generic relay input path.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  buildRemoteArgumentSummary,
  buildRemoteFailureSummary,
  runRemoteControlSession,
} from '../../lib/remote-control.js';

function createDeferred() {
  /** @type {(value: unknown) => void} */
  let resolve;
  /** @type {(reason?: unknown) => void} */
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

describe('remote-control', () => {
  it('redacts sensitive argument fields in approval summaries', () => {
    const summary = buildRemoteArgumentSummary({
      prompt: 'secret prompt',
      safe: true,
      count: 3,
      filePath: '/Users/example/project/.env',
      nested: { a: 1, b: 2 },
    });

    expect(summary.argumentCount).toBe(5);
    expect(summary.entries).toContainEqual({
      key: 'prompt',
      type: 'string',
      summary: '[redacted]',
    });
    expect(summary.entries).toContainEqual({
      key: 'safe',
      type: 'boolean',
      summary: true,
    });
    expect(summary.entries).toContainEqual({
      key: 'nested',
      type: 'object',
      summary: '[object:2]',
    });
  });

  it('returns a redacted failure summary for remote display', () => {
    const summary = buildRemoteFailureSummary(new Error('ENOENT: no such file /Users/example/project/.env SECRET=123'));

    expect(summary).toEqual({
      category: 'failed',
      message: 'Run failed on the local host.',
    });
  });

  it('prints a QR-ready session banner for interactive terminals', async () => {
    const relayClient = {
      createRelaySession: vi.fn().mockResolvedValue({
        sessionId: 'relay-session-1',
        desktopToken: 'desktop-token',
        pairingToken: 'pairing-token',
        clientConnectionUrl: 'http://127.0.0.1:8787/pair?sessionId=relay-session-1&pairingToken=pairing-token',
        expiresAt: '2026-05-11T12:15:00.000Z',
      }),
      postRelayEvent: vi.fn().mockResolvedValue({ accepted: true }),
      pollRelayCommands: vi.fn().mockResolvedValue({
        commands: [{
          sequence: 1,
          type: 'disconnect',
          payload: {},
          createdAt: '2026-05-11T12:01:00.000Z',
        }],
      }),
      revokeRelaySession: vi.fn().mockResolvedValue({ revoked: true }),
    };
    let stdout = '';

    await runRemoteControlSession({
      relayServer: 'http://127.0.0.1:8787',
      chat: {
        id: 'chat-1',
        messages: [],
      },
      io: {
        stdout: {
          isTTY: true,
          write(chunk) {
            stdout += chunk;
          },
        },
        stderr: { write() { } },
      },
      executeTurn: vi.fn(),
      relayClient,
    });

    expect(relayClient.createRelaySession).toHaveBeenCalledWith({
      relayServer: 'http://127.0.0.1:8787',
      localSessionId: 'chat-1',
      chatId: 'chat-1',
      ttlMs: 0,
      pairingTtlMs: 0,
      metadata: {
        mode: 'remote-control',
      },
    });

    expect(stdout).toContain('Client connection URL: http://127.0.0.1:8787/pair?sessionId=relay-session-1&pairingToken=pairing-token');
    expect(stdout).toContain('Scan this QR code from the client to connect:');
    expect(stdout).toContain('Remote host is running and will keep responding until the client disconnects or you press Ctrl+C.');
    expect(stdout.split(/\r?\n/u).length).toBeGreaterThan(8);
  });

  it('shows no-timeout in the session banner when the relay session does not expire', async () => {
    const relayClient = {
      createRelaySession: vi.fn().mockResolvedValue({
        sessionId: 'relay-session-1',
        desktopToken: 'desktop-token',
        pairingToken: 'pairing-token',
        clientConnectionUrl: 'http://127.0.0.1:8787/pair?sessionId=relay-session-1&pairingToken=pairing-token',
        expiresAt: null,
      }),
      postRelayEvent: vi.fn().mockResolvedValue({ accepted: true }),
      pollRelayCommands: vi.fn().mockResolvedValue({
        commands: [{
          sequence: 1,
          type: 'disconnect',
          payload: {},
          createdAt: '2026-05-11T12:01:00.000Z',
        }],
      }),
      revokeRelaySession: vi.fn().mockResolvedValue({ revoked: true }),
    };
    let stdout = '';

    await runRemoteControlSession({
      relayServer: 'http://127.0.0.1:8787',
      chat: {
        id: 'chat-1',
        messages: [],
      },
      io: {
        stdout: {
          write(chunk) {
            stdout += chunk;
          },
        },
      },
      executeTurn: vi.fn(),
      relayClient,
    });

    expect(stdout).toContain('Expires at: No timeout');
  });

  it('keeps running and handles multiple remote messages before disconnect', async () => {
    const firstPoll = createDeferred();
    const secondPoll = createDeferred();
    const thirdPoll = createDeferred();
    const pollQueue = [firstPoll, secondPoll, thirdPoll];

    const relayClient = {
      createRelaySession: vi.fn().mockResolvedValue({
        sessionId: 'relay-session-1',
        desktopToken: 'desktop-token',
        pairingToken: 'pairing-token',
        clientConnectionUrl: 'http://127.0.0.1:8787/pair?sessionId=relay-session-1&pairingToken=pairing-token',
        expiresAt: '2026-05-11T12:15:00.000Z',
      }),
      postRelayEvent: vi.fn().mockResolvedValue({ accepted: true }),
      pollRelayCommands: vi.fn().mockImplementation(() => {
        const nextPoll = pollQueue.shift();

        if (!nextPoll) {
          return Promise.resolve({ commands: [] });
        }

        return nextPoll.promise;
      }),
      revokeRelaySession: vi.fn().mockResolvedValue({ revoked: true }),
    };
    const executeTurn = vi.fn()
      .mockImplementationOnce(async ({ chat, message }) => ({
        assistantText: `reply:${message}`,
        messages: [...chat.messages, { role: 'user', content: message }, { role: 'assistant', content: `reply:${message}` }],
      }))
      .mockImplementationOnce(async ({ chat, message }) => ({
        assistantText: `reply:${message}`,
        messages: [...chat.messages, { role: 'user', content: message }, { role: 'assistant', content: `reply:${message}` }],
      }));

    const sessionPromise = runRemoteControlSession({
      relayServer: 'http://127.0.0.1:8787',
      chat: {
        id: 'chat-1',
        messages: [],
      },
      io: {
        stdout: { write() { } },
        stderr: { write() { } },
      },
      executeTurn,
      relayClient,
    });

    firstPoll.resolve({
      commands: [{
        sequence: 1,
        type: 'input',
        payload: { text: 'first' },
        createdAt: '2026-05-11T12:01:00.000Z',
      }],
    });

    await vi.waitFor(() => {
      expect(executeTurn).toHaveBeenCalledTimes(1);
    });

    secondPoll.resolve({
      commands: [{
        sequence: 2,
        type: 'input',
        payload: { text: 'second' },
        createdAt: '2026-05-11T12:02:00.000Z',
      }],
    });

    await vi.waitFor(() => {
      expect(executeTurn).toHaveBeenCalledTimes(2);
    });

    thirdPoll.resolve({
      commands: [{
        sequence: 3,
        type: 'disconnect',
        payload: {},
        createdAt: '2026-05-11T12:03:00.000Z',
      }],
    });

    await sessionPromise;

    expect(executeTurn).toHaveBeenNthCalledWith(1, expect.objectContaining({
      message: 'first',
      commandSource: 'remote',
    }));
    expect(executeTurn).toHaveBeenNthCalledWith(2, expect.objectContaining({
      message: 'second',
      commandSource: 'remote',
    }));
    expect(relayClient.revokeRelaySession).toHaveBeenCalledWith({
      relayServer: 'http://127.0.0.1:8787',
      sessionId: 'relay-session-1',
      token: 'desktop-token',
      reason: 'remote_disconnect',
    });
  });

  it('revokes the relay session when a remote disconnect command is received', async () => {
    const relayClient = {
      createRelaySession: vi.fn().mockResolvedValue({
        sessionId: 'relay-session-1',
        desktopToken: 'desktop-token',
        pairingToken: 'pairing-token',
        clientConnectionUrl: 'http://127.0.0.1:8787/pair?sessionId=relay-session-1',
        expiresAt: '2026-05-11T12:15:00.000Z',
      }),
      postRelayEvent: vi.fn().mockResolvedValue({ accepted: true }),
      pollRelayCommands: vi.fn().mockResolvedValue({
        commands: [{
          sequence: 1,
          type: 'disconnect',
          payload: {},
          createdAt: '2026-05-11T12:01:00.000Z',
        }],
      }),
      revokeRelaySession: vi.fn().mockResolvedValue({ revoked: true }),
    };

    await runRemoteControlSession({
      relayServer: 'http://127.0.0.1:8787',
      chat: {
        id: 'chat-1',
        messages: [],
      },
      io: {
        stdout: { write() { } },
      },
      executeTurn: vi.fn(),
      relayClient,
    });

    expect(relayClient.revokeRelaySession).toHaveBeenCalledWith({
      relayServer: 'http://127.0.0.1:8787',
      sessionId: 'relay-session-1',
      token: 'desktop-token',
      reason: 'remote_disconnect',
    });
  });

  it('routes slash commands through the session store and targets requester-only results', async () => {
    const firstPoll = createDeferred();
    const secondPoll = createDeferred();
    const thirdPoll = createDeferred();
    const fourthPoll = createDeferred();
    const fifthPoll = createDeferred();
    const pollQueue = [firstPoll, secondPoll, thirdPoll, fourthPoll, fifthPoll];

    const relayClient = {
      createRelaySession: vi.fn().mockResolvedValue({
        sessionId: 'relay-session-1',
        desktopToken: 'desktop-token',
        pairingToken: 'pairing-token',
        clientConnectionUrl: 'http://127.0.0.1:8787/pair?sessionId=relay-session-1&pairingToken=pairing-token',
        expiresAt: '2026-05-11T12:15:00.000Z',
      }),
      postRelayEvent: vi.fn().mockResolvedValue({ accepted: true }),
      pollRelayCommands: vi.fn().mockImplementation(() => {
        const nextPoll = pollQueue.shift();

        if (!nextPoll) {
          return Promise.resolve({ commands: [] });
        }

        return nextPoll.promise;
      }),
      revokeRelaySession: vi.fn().mockResolvedValue({ revoked: true }),
    };
    const chatStore = {
      listChats: vi.fn().mockResolvedValue([
        { id: 'chat-1', createdAt: '2026-05-11T12:00:00.000Z', updatedAt: '2026-05-11T12:01:00.000Z', messageCount: 2, isCurrent: true },
      ]),
      loadChatById: vi.fn().mockResolvedValue({
        id: 'chat-2',
        createdAt: '2026-05-11T12:02:00.000Z',
        updatedAt: '2026-05-11T12:03:00.000Z',
        messages: [
          { role: 'user', content: 'history', createdAt: '2026-05-11T12:02:00.000Z' },
        ],
      }),
      createChat: vi.fn().mockResolvedValue({
        id: 'chat-3',
        createdAt: '2026-05-11T12:04:00.000Z',
        updatedAt: '2026-05-11T12:04:00.000Z',
        messages: [],
      }),
      setCurrentChat: vi.fn().mockResolvedValue({
        id: 'chat-2',
        createdAt: '2026-05-11T12:02:00.000Z',
        updatedAt: '2026-05-11T12:03:00.000Z',
        messages: [
          { role: 'user', content: 'history', createdAt: '2026-05-11T12:02:00.000Z' },
        ],
      }),
      updateRemoteHostLock: vi.fn().mockResolvedValue(true),
    };

    const sessionPromise = runRemoteControlSession({
      relayServer: 'http://127.0.0.1:8787',
      chat: {
        id: 'chat-1',
        messages: [],
      },
      chatStore,
      io: {
        stdout: { write() { } },
        stderr: { write() { } },
      },
      executeTurn: vi.fn().mockResolvedValue({
        assistantText: 'ok',
        messages: [],
      }),
      relayClient,
    });

    firstPoll.resolve({
      commands: [{
        sequence: 1,
        clientId: 'client-1',
        type: 'input',
        payload: { requestId: 'request-list', text: '/chats' },
        createdAt: '2026-05-11T12:01:00.000Z',
      }],
    });

    await vi.waitFor(() => {
      expect(chatStore.listChats).toHaveBeenCalledTimes(1);
    });

    secondPoll.resolve({
      commands: [{
        sequence: 2,
        clientId: 'client-1',
        type: 'input',
        payload: { requestId: 'request-read', text: '/messages chat-2' },
        createdAt: '2026-05-11T12:02:00.000Z',
      }],
    });

    await vi.waitFor(() => {
      expect(chatStore.loadChatById).toHaveBeenCalledWith('chat-2');
    });

    thirdPoll.resolve({
      commands: [{
        sequence: 3,
        clientId: 'client-1',
        type: 'input',
        payload: { requestId: 'request-create', text: '/new' },
        createdAt: '2026-05-11T12:03:00.000Z',
      }],
    });

    await vi.waitFor(() => {
      expect(chatStore.createChat).toHaveBeenCalledWith({ setCurrent: true });
    });

    fourthPoll.resolve({
      commands: [{
        sequence: 4,
        clientId: 'client-1',
        type: 'input',
        payload: { requestId: 'request-select', text: '/use chat-2' },
        createdAt: '2026-05-11T12:04:00.000Z',
      }],
    });

    await vi.waitFor(() => {
      expect(chatStore.setCurrentChat).toHaveBeenCalledWith('chat-2');
      expect(chatStore.updateRemoteHostLock).toHaveBeenCalledWith({ chatId: 'chat-2' });
    });

    fifthPoll.resolve({
      commands: [{
        sequence: 5,
        type: 'disconnect',
        payload: {},
        createdAt: '2026-05-11T12:05:00.000Z',
      }],
    });

    await sessionPromise;

    expect(relayClient.postRelayEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'command_result',
      targetClientId: 'client-1',
      payload: expect.objectContaining({
        requestId: 'request-list',
        kind: 'chat_list',
      }),
    }));
    expect(relayClient.postRelayEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'command_result',
      targetClientId: 'client-1',
      payload: expect.objectContaining({
        requestId: 'request-read',
        kind: 'chat_messages',
        chatId: 'chat-2',
      }),
    }));
    expect(relayClient.postRelayEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'command_result',
      targetClientId: 'client-1',
      payload: expect.objectContaining({
        requestId: 'request-create',
        kind: 'chat_selected',
        chat: expect.objectContaining({ id: 'chat-3' }),
      }),
    }));
    expect(relayClient.postRelayEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'command_result',
      targetClientId: 'client-1',
      payload: expect.objectContaining({
        requestId: 'request-select',
        kind: 'chat_selected',
        chat: expect.objectContaining({ id: 'chat-2' }),
      }),
    }));
  });

  it('runs subsequent user messages against the remotely selected chat', async () => {
    const firstPoll = createDeferred();
    const secondPoll = createDeferred();
    const thirdPoll = createDeferred();
    const pollQueue = [firstPoll, secondPoll, thirdPoll];

    const relayClient = {
      createRelaySession: vi.fn().mockResolvedValue({
        sessionId: 'relay-session-1',
        desktopToken: 'desktop-token',
        pairingToken: 'pairing-token',
        clientConnectionUrl: 'http://127.0.0.1:8787/pair?sessionId=relay-session-1&pairingToken=pairing-token',
        expiresAt: '2026-05-11T12:15:00.000Z',
      }),
      postRelayEvent: vi.fn().mockResolvedValue({ accepted: true }),
      pollRelayCommands: vi.fn().mockImplementation(() => {
        const nextPoll = pollQueue.shift();

        if (!nextPoll) {
          return Promise.resolve({ commands: [] });
        }

        return nextPoll.promise;
      }),
      revokeRelaySession: vi.fn().mockResolvedValue({ revoked: true }),
    };
    const executeTurn = vi.fn().mockResolvedValue({
      assistantText: 'reply',
      messages: [
        { role: 'assistant', content: 'reply' },
      ],
    });
    const chatStore = {
      setCurrentChat: vi.fn().mockResolvedValue({
        id: 'chat-selected',
        createdAt: '2026-05-11T12:02:00.000Z',
        updatedAt: '2026-05-11T12:03:00.000Z',
        messages: [],
      }),
      updateRemoteHostLock: vi.fn().mockResolvedValue(true),
    };

    const sessionPromise = runRemoteControlSession({
      relayServer: 'http://127.0.0.1:8787',
      chat: {
        id: 'chat-1',
        messages: [],
      },
      chatStore,
      io: {
        stdout: { write() { } },
      },
      executeTurn,
      relayClient,
    });

    firstPoll.resolve({
      commands: [{
        sequence: 1,
        clientId: 'client-1',
        type: 'input',
        payload: { requestId: 'request-select', text: '/use chat-selected' },
        createdAt: '2026-05-11T12:01:00.000Z',
      }],
    });

    await vi.waitFor(() => {
      expect(chatStore.setCurrentChat).toHaveBeenCalledWith('chat-selected');
    });

    secondPoll.resolve({
      commands: [{
        sequence: 2,
        clientId: 'client-1',
        type: 'input',
        payload: { text: 'hello' },
        createdAt: '2026-05-11T12:02:00.000Z',
      }],
    });

    await vi.waitFor(() => {
      expect(executeTurn).toHaveBeenCalledWith(expect.objectContaining({
        chat: expect.objectContaining({ id: 'chat-selected' }),
        message: 'hello',
      }));
    });

    thirdPoll.resolve({
      commands: [{
        sequence: 3,
        type: 'disconnect',
        payload: {},
        createdAt: '2026-05-11T12:03:00.000Z',
      }],
    });

    await sessionPromise;
  });
});