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

    expect(stdout).toContain('Client connection URL: http://127.0.0.1:8787/pair?sessionId=relay-session-1&pairingToken=pairing-token');
    expect(stdout).toContain('Scan this QR code from the client to connect:');
    expect(stdout).toContain('Remote host is running and will keep responding until the client disconnects or you press Ctrl+C.');
    expect(stdout.split(/\r?\n/u).length).toBeGreaterThan(8);
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
        type: 'user_message',
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
        type: 'user_message',
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
});