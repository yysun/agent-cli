// @ts-check
/**
 * Agent CLI Relay Server Unit Tests
 *
 * Purpose:
 * - Validate short-lived relay session state and idempotent queue behavior.
 *
 * Key features:
 * - Covers session creation, pairing, command/event deduplication, and expiry semantics.
 *
 * Recent changes:
 * - 2026-05-11: Added relay server coverage for the optional remote supervision flow.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { RelayService } from '../../lib/relay-server.js';

/** @type {RelayService[]} */
const servicesToClose = [];

afterEach(() => {
  while (servicesToClose.length > 0) {
    servicesToClose.pop()?.close();
  }
});

describe('relay-server', () => {
  it('creates relay sessions with a client connection URL', () => {
    const service = new RelayService();
    servicesToClose.push(service);

    const session = service.createSession({
      baseUrl: 'http://127.0.0.1:8787',
      localSessionId: 'chat-1',
      chatId: 'chat-1',
    });

    expect(session.sessionId).toBeTruthy();
    expect(session.desktopToken).toBeTruthy();
    expect(session.pairingToken).toBeTruthy();
    expect(session.clientConnectionUrl).toContain('/pair?sessionId=');
  });

  it('pairs with a short-lived token and deduplicates by idempotency key', () => {
    const service = new RelayService();
    servicesToClose.push(service);

    const session = service.createSession({
      baseUrl: 'http://127.0.0.1:8787',
      chatId: 'chat-1',
    });

    const firstPair = service.pairSession(session.sessionId, {
      pairingToken: session.pairingToken,
      idempotencyKey: 'pair-1',
    });
    const secondPair = service.pairSession(session.sessionId, {
      pairingToken: session.pairingToken,
      idempotencyKey: 'pair-1',
    });

    expect(firstPair.mobileToken).toBeTruthy();
    expect(secondPair.mobileToken).toBe(firstPair.mobileToken);
  });

  it('rejects reused pairing tokens after the first successful pair', () => {
    const service = new RelayService();
    servicesToClose.push(service);

    const session = service.createSession({
      baseUrl: 'http://127.0.0.1:8787',
      chatId: 'chat-1',
    });

    service.pairSession(session.sessionId, {
      pairingToken: session.pairingToken,
    });

    expect(() => service.pairSession(session.sessionId, {
      pairingToken: session.pairingToken,
    })).toThrow('Pairing token already used.');
  });

  it('deduplicates events and commands by idempotency key', () => {
    const service = new RelayService();
    servicesToClose.push(service);

    const session = service.createSession({
      baseUrl: 'http://127.0.0.1:8787',
      chatId: 'chat-1',
    });
    const pair = service.pairSession(session.sessionId, {
      pairingToken: session.pairingToken,
    });

    const firstEvent = service.postEvent(session.sessionId, {
      desktopToken: session.desktopToken,
      type: 'run_status',
      payload: { status: 'started' },
      idempotencyKey: 'event-1',
    });
    const secondEvent = service.postEvent(session.sessionId, {
      desktopToken: session.desktopToken,
      type: 'run_status',
      payload: { status: 'started' },
      idempotencyKey: 'event-1',
    });

    const firstCommand = service.enqueueCommand(session.sessionId, {
      mobileToken: pair.mobileToken,
      type: 'user_message',
      payload: { text: 'hello' },
      idempotencyKey: 'command-1',
    });
    const secondCommand = service.enqueueCommand(session.sessionId, {
      mobileToken: pair.mobileToken,
      type: 'user_message',
      payload: { text: 'hello' },
      idempotencyKey: 'command-1',
    });

    expect(firstEvent.sequence).toBe(1);
    expect(secondEvent.sequence).toBe(1);
    expect(secondEvent.duplicate).toBe(true);
    expect(firstCommand.sequence).toBe(1);
    expect(secondCommand.sequence).toBe(1);
    expect(secondCommand.duplicate).toBe(true);
  });

  it('returns event backlog and notification summaries for the paired mobile client', () => {
    const service = new RelayService();
    servicesToClose.push(service);

    const session = service.createSession({
      baseUrl: 'http://127.0.0.1:8787',
      chatId: 'chat-1',
    });
    const pair = service.pairSession(session.sessionId, {
      pairingToken: session.pairingToken,
    });

    service.postEvent(session.sessionId, {
      desktopToken: session.desktopToken,
      type: 'run_status',
      payload: { status: 'waiting_for_input' },
    });
    service.postEvent(session.sessionId, {
      desktopToken: session.desktopToken,
      type: 'completion',
      payload: { text: 'done' },
    });

    const eventBacklog = service.readEvents(session.sessionId, {
      mobileToken: pair.mobileToken,
      after: 0,
    });
    const notifications = service.readNotifications(session.sessionId, {
      mobileToken: pair.mobileToken,
      after: 0,
    });

    expect(eventBacklog.events).toHaveLength(2);
    expect(eventBacklog.events[0].type).toBe('run_status');
    expect(eventBacklog.events[1].type).toBe('completion');
    expect(notifications.notifications.map((entry) => entry.level)).toEqual([
      'human_input_needed',
      'run_completed',
    ]);
  });

  it('marks expired sessions as revoked during sweeps', async () => {
    let now = new Date('2026-05-11T12:00:00.000Z');
    const service = new RelayService({
      now: () => now,
      sessionTtlMs: 1000,
    });
    servicesToClose.push(service);

    const session = service.createSession({
      baseUrl: 'http://127.0.0.1:8787',
      chatId: 'chat-1',
    });

    now = new Date('2026-05-11T12:00:02.000Z');
    service.sweepExpiredSessions();

    await expect(service.pollCommands(session.sessionId, {
      desktopToken: session.desktopToken,
      after: 0,
      timeoutMs: 1,
    })).rejects.toThrow('Relay session not found.');
  });
});