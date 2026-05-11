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