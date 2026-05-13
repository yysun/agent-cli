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
 * - 2026-05-13: Added multi-client pairing and targeted event delivery coverage.
 * - 2026-05-13: Updated protocol coverage for generic input commands and targeted command_result events.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createRelayHttpServer, listRelayListenUrls, RelayService } from '../../server/lib/relay-server.js';

/** @typedef {{ close: () => void }} Closeable */

/** @type {Closeable[]} */
const servicesToClose = [];
/** @type {string[]} */
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
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Failed to start relay test server.');
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

/**
 * @param {Response} response
 * @param {(text: string) => boolean} predicate
 * @param {number} [timeoutMs]
 */
async function readStreamTextUntil(response, predicate, timeoutMs = 1000) {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error('Expected a readable response body.');
  }

  const decoder = new TextDecoder();
  let text = '';
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const remainingMs = Math.max(1, deadline - Date.now());
    const result = await Promise.race([
      reader.read(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Timed out waiting for streamed text.\nReceived:\n${text}`)), remainingMs);
      }),
    ]);

    if (!result || typeof result !== 'object' || !('done' in result) || !('value' in result)) {
      continue;
    }

    if (result.done) {
      break;
    }

    text += decoder.decode(result.value, { stream: true });

    if (predicate(text)) {
      return text;
    }
  }

  throw new Error(`Timed out waiting for streamed text.\nReceived:\n${text}`);
}

describe('relay-server', () => {
  it('lists every IPv4 interface when the relay binds to the wildcard host', () => {
    const urls = listRelayListenUrls({
      address: '0.0.0.0',
      family: 'IPv4',
      port: 8787,
    }, {
      interfaces: {
        lo0: [
          { address: '127.0.0.1', family: 'IPv4', internal: true, netmask: '255.0.0.0', cidr: '127.0.0.1/8', mac: '00:00:00:00:00:00' },
        ],
        wlp2s0: [
          { address: '192.168.1.25', family: 'IPv4', internal: false, netmask: '255.255.255.0', cidr: '192.168.1.25/24', mac: '00:00:00:00:00:01' },
          { address: 'fe80::1%wlp2s0', family: 'IPv6', internal: false, netmask: 'ffff:ffff:ffff:ffff::', cidr: 'fe80::1/64', mac: '00:00:00:00:00:01', scopeid: 1 },
        ],
        tailscale0: [
          { address: '100.96.12.4', family: 'IPv4', internal: false, netmask: '255.192.0.0', cidr: '100.96.12.4/10', mac: '00:00:00:00:00:02' },
        ],
      },
    });

    expect(urls).toEqual([
      'http://192.168.1.25:8787',
      'http://100.96.12.4:8787',
      'http://127.0.0.1:8787',
    ]);
  });

  it('formats IPv6 listener URLs with brackets', () => {
    const urls = listRelayListenUrls({
      address: '::1',
      family: 'IPv6',
      port: 8787,
    });

    expect(urls).toEqual(['http://[::1]:8787']);
  });

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

    expect(firstPair.clientId).toBeTruthy();
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
    })).toThrow('Invalid pairing token.');
  });

  it('mints additional invites and supports multiple paired clients with targeted events', async () => {
    const service = new RelayService();
    servicesToClose.push(service);

    const session = service.createSession({
      baseUrl: 'http://127.0.0.1:8787',
      chatId: 'chat-1',
    });
    const firstPair = service.pairSession(session.sessionId, {
      pairingToken: session.pairingToken,
    });
    const secondInvite = service.createPairingInvite(session.sessionId, {
      token: firstPair.mobileToken,
      baseUrl: 'http://127.0.0.1:8787',
    });
    const secondPair = service.pairSession(session.sessionId, {
      pairingToken: secondInvite.pairingToken,
    });

    expect(secondInvite.clientConnectionUrl).toContain('/pair?sessionId=');

    service.postEvent(session.sessionId, {
      desktopToken: session.desktopToken,
      type: 'run_status',
      payload: { status: 'started' },
    });
    service.postEvent(session.sessionId, {
      desktopToken: session.desktopToken,
      type: 'command_result',
      payload: { requestId: 'request-1', kind: 'chat_list', chats: [{ id: 'chat-1', messageCount: 1 }] },
      targetClientId: firstPair.clientId,
    });

    expect(service.readNotifications(session.sessionId, {
      mobileToken: firstPair.mobileToken,
      after: 0,
    })).toEqual({
      notifications: [],
      cursor: 0,
    });

    const firstClientEvents = service.readEvents(session.sessionId, {
      mobileToken: firstPair.mobileToken,
      after: 0,
    });
    const secondClientEvents = service.readEvents(session.sessionId, {
      mobileToken: secondPair.mobileToken,
      after: 0,
    });

    expect(firstClientEvents.events).toHaveLength(2);
    expect(firstClientEvents.events[1]).toMatchObject({
      type: 'command_result',
      targetClientId: firstPair.clientId,
    });
    expect(secondClientEvents.events).toHaveLength(1);
    expect(secondClientEvents.events[0].type).toBe('run_status');

    service.enqueueCommand(session.sessionId, {
      mobileToken: secondPair.mobileToken,
      type: 'input',
      payload: { requestId: 'request-2', text: '/chats' },
    });

    await expect(service.pollCommands(session.sessionId, {
      desktopToken: session.desktopToken,
      after: 0,
      timeoutMs: 1,
    })).resolves.toMatchObject({
      commands: [
        expect.objectContaining({
          type: 'input',
          clientId: secondPair.clientId,
        }),
      ],
    });
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
      type: 'input',
      payload: { text: 'hello' },
      idempotencyKey: 'command-1',
    });
    const secondCommand = service.enqueueCommand(session.sessionId, {
      mobileToken: pair.mobileToken,
      type: 'input',
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
    const notificationLevels = notifications.notifications.map(
      /** @param {{ level: string }} entry */
      (entry) => entry.level,
    );

    expect(notificationLevels).toEqual([
      'human_input_needed',
      'run_completed',
    ]);
  });

  it('streams retry hints, heartbeats, and honors Last-Event-ID for SSE clients', async () => {
    const { server, baseUrl } = await startServer({
      sseHeartbeatMs: 10,
      sseRetryMs: 1234,
    });
    servicesToClose.push({ close: () => { server.close(); } });

    const createResponse = await fetch(`${baseUrl}/v1/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chatId: 'chat-sse-1' }),
    });
    const session = await createResponse.json();

    const pairResponse = await fetch(`${baseUrl}/v1/sessions/${encodeURIComponent(session.sessionId)}/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pairingToken: session.pairingToken }),
    });
    const pair = await pairResponse.json();

    await fetch(`${baseUrl}/v1/sessions/${encodeURIComponent(session.sessionId)}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        desktopToken: session.desktopToken,
        type: 'run_status',
        payload: { status: 'started' },
      }),
    });
    await fetch(`${baseUrl}/v1/sessions/${encodeURIComponent(session.sessionId)}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        desktopToken: session.desktopToken,
        type: 'run_status',
        payload: { status: 'waiting_for_input' },
      }),
    });
    await fetch(`${baseUrl}/v1/sessions/${encodeURIComponent(session.sessionId)}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        desktopToken: session.desktopToken,
        type: 'completion',
        payload: { text: 'done' },
      }),
    });

    const heartbeatController = new AbortController();
    const heartbeatResponse = await fetch(
      `${baseUrl}/v1/sessions/${encodeURIComponent(session.sessionId)}/events?mobileToken=${encodeURIComponent(pair.mobileToken)}&after=0`,
      {
        headers: { accept: 'text/event-stream' },
        signal: heartbeatController.signal,
      },
    );
    const heartbeatText = await readStreamTextUntil(
      heartbeatResponse,
      (text) => text.includes('retry: 1234') && text.includes(': connected') && text.includes(': heartbeat'),
    );
    heartbeatController.abort();

    expect(heartbeatResponse.headers.get('content-type')).toContain('text/event-stream');
    expect(heartbeatText).toContain('retry: 1234');
    expect(heartbeatText).toContain(': connected');
    expect(heartbeatText).toContain(': heartbeat');

    const resumeController = new AbortController();
    const resumeResponse = await fetch(
      `${baseUrl}/v1/sessions/${encodeURIComponent(session.sessionId)}/events?mobileToken=${encodeURIComponent(pair.mobileToken)}&after=1`,
      {
        headers: {
          accept: 'text/event-stream',
          'last-event-id': '2',
        },
        signal: resumeController.signal,
      },
    );
    const resumeText = await readStreamTextUntil(
      resumeResponse,
      (text) => text.includes('id: 3') && text.includes('"completion"'),
    );
    resumeController.abort();

    expect(resumeText).toContain('id: 3');
    expect(resumeText).not.toContain('id: 2');
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

  it('keeps sessions and pairing tokens active when ttlMs and pairingTtlMs are set to 0', async () => {
    let now = new Date('2026-05-11T12:00:00.000Z');
    const service = new RelayService({
      now: () => now,
      sessionTtlMs: 1000,
      pairingTtlMs: 1000,
    });
    servicesToClose.push(service);

    const session = service.createSession({
      baseUrl: 'http://127.0.0.1:8787',
      chatId: 'chat-1',
      ttlMs: 0,
      pairingTtlMs: 0,
    });

    expect(session.expiresAt).toBeNull();
    expect(session.pairingExpiresAt).toBeNull();

    now = new Date('2026-05-11T12:30:00.000Z');
    service.sweepExpiredSessions();

    const pair = service.pairSession(session.sessionId, {
      pairingToken: session.pairingToken,
    });

    expect(pair.expiresAt).toBeNull();

    await expect(service.pollCommands(session.sessionId, {
      desktopToken: session.desktopToken,
      after: 0,
      timeoutMs: 1,
    })).resolves.toMatchObject({
      commands: [],
      timedOut: true,
    });
  });

  it('serves SPA assets while keeping API routes authoritative', async () => {
    const staticDir = await createTempStaticDir();
    await mkdir(staticDir, { recursive: true });
    await writeFile(join(staticDir, 'index.html'), '<!doctype html><html><body>SPA</body></html>');
    await writeFile(join(staticDir, 'app.js'), 'console.log("spa")');

    const { server, baseUrl } = await startServer({ staticDir });
    servicesToClose.push({ close: () => { server.close(); } });

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