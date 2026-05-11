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
 * - 2026-05-11: Added static SPA fallback and API-precedence regression coverage.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createRelayHttpServer, RelayService } from '../../server/lib/relay-server.js';

/** @type {RelayService[]} */
const servicesToClose = [];
const tempDirsToRemove = [];

afterEach(async () => {
  while (servicesToClose.length > 0) {
    servicesToClose.pop()?.close();
  }

  while (tempDirsToRemove.length > 0) {
    const dir = tempDirsToRemove.pop();

    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

async function createTempStaticDir() {
  const dir = await mkdtemp(join(tmpdir(), 'agent-cli-relay-test-'));
  tempDirsToRemove.push(dir);
  return dir;
}

async function startServer(options = {}) {
  const server = createRelayHttpServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Failed to start relay test server.');
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

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

  it('serves SPA assets while keeping API routes authoritative', async () => {
    const staticDir = await createTempStaticDir();
    await mkdir(staticDir, { recursive: true });
    await writeFile(join(staticDir, 'index.html'), '<!doctype html><html><body>SPA</body></html>');
    await writeFile(join(staticDir, 'app.js'), 'console.log("spa")');

    const { server, baseUrl } = await startServer({ staticDir });
    servicesToClose.push({ close: () => server.close() });

    const healthResponse = await fetch(`${baseUrl}/healthz`);
    expect(healthResponse.headers.get('content-type')).toContain('application/json');
    expect(await healthResponse.json()).toEqual({ ok: true });

    const spaResponse = await fetch(`${baseUrl}/dashboard`);
    expect(spaResponse.headers.get('content-type')).toContain('text/html');
    expect(await spaResponse.text()).toContain('SPA');

    const apiResponse = await fetch(`${baseUrl}/v1/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chatId: 'chat-1' }),
    });

    expect(apiResponse.headers.get('content-type')).toContain('application/json');
    expect(apiResponse.status).toBe(201);
    const session = await apiResponse.json();
    expect(session.clientConnectionUrl).toContain('/pair?sessionId=');
  });
});