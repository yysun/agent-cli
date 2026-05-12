// @ts-check
/**
 * Agent CLI Relay Server End-to-End Tests
 *
 * Purpose:
 * - Exercise the relay server binary through its public HTTP API.
 *
 * Key features:
 * - Launches the real server entrypoint on an ephemeral local port.
 * - Verifies desktop/mobile pairing, long-poll command delivery, event backlogs, notifications, and static serving.
 *
 * Recent changes:
 * - 2026-05-12: Added deterministic e2e coverage for the relay server process.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createRelaySession,
  pairRelaySession,
  pollRelayCommands,
  postRelayEvent,
  readRelayEvents,
  readRelayNotifications,
  revokeRelaySession,
  sendRelayCommand,
} from '../../lib/relay-client.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const relayServerBin = path.join(repoRoot, 'server/bin/relay-server.js');
const START_TIMEOUT_MS = 5000;

/** @type {import('node:child_process').ChildProcess[]} */
const relayProcessesToStop = [];
/** @type {string[]} */
const tempDirsToRemove = [];

afterEach(async () => {
  while (relayProcessesToStop.length > 0) {
    const relayProcess = relayProcessesToStop.pop();

    if (relayProcess) {
      await stopRelayProcess(relayProcess);
    }
  }

  while (tempDirsToRemove.length > 0) {
    const tempDir = tempDirsToRemove.pop();

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
});

/**
 * @param {{ host?: string, extraArgs?: string[] }} [options]
 * @returns {Promise<{ relayServer: string }>}
 */
async function startRelayServer(options = {}) {
  const host = options.host ?? '127.0.0.1';
  const extraArgs = options.extraArgs ?? [];
  const relayProcess = spawn(process.execPath, [relayServerBin, '--host', host, '--port', '0', ...extraArgs], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  relayProcessesToStop.push(relayProcess);

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
        const url = new URL(match[0]);
        const relayServer = host === '0.0.0.0'
          ? `http://127.0.0.1:${url.port}`
          : match[0];
        finish(resolve, { relayServer });
      }
    });
    relayProcess.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
  });
}

/** @param {import('node:child_process').ChildProcess} relayProcess */
async function stopRelayProcess(relayProcess) {
  if (relayProcess.exitCode !== null || relayProcess.signalCode !== null) {
    return;
  }

  relayProcess.kill('SIGTERM');

  const stopped = await Promise.race([
    once(relayProcess, 'exit').then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 1000)),
  ]);

  if (stopped) {
    return;
  }

  if (relayProcess.exitCode !== null || relayProcess.signalCode !== null) {
    return;
  }

  relayProcess.kill('SIGKILL');
  if (relayProcess.exitCode !== null || relayProcess.signalCode !== null) {
    return;
  }

  await once(relayProcess, 'exit');
}

async function createTempStaticDir() {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'agent-cli-relay-e2e-'));
  tempDirsToRemove.push(tempDir);
  return tempDir;
}

describe('relay server binary', () => {
  it('coordinates a desktop and mobile relay session over HTTP', async () => {
    const { relayServer } = await startRelayServer();

    const healthResponse = await fetch(`${relayServer}/healthz`);
    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.json()).toEqual({ ok: true });

    const session = await createRelaySession({
      relayServer,
      localSessionId: 'local-e2e-session',
      chatId: 'chat-e2e-session',
      ttlMs: 60000,
      pairingTtlMs: 60000,
      metadata: { source: 'relay-server-e2e' },
    });

    expect(session.sessionId).toBeTruthy();
    expect(session.desktopToken).toBeTruthy();
    expect(session.pairingToken).toBeTruthy();
    expect(session.clientConnectionUrl).toContain('/pair?sessionId=');

    const firstPair = await pairRelaySession({
      relayServer,
      sessionId: session.sessionId,
      pairingToken: session.pairingToken,
      mobileName: 'e2e-mobile',
      idempotencyKey: 'pair-e2e',
    });
    const secondPair = await pairRelaySession({
      relayServer,
      sessionId: session.sessionId,
      pairingToken: session.pairingToken,
      mobileName: 'e2e-mobile',
      idempotencyKey: 'pair-e2e',
    });

    expect(firstPair.mobileToken).toBeTruthy();
    expect(secondPair.mobileToken).toBe(firstPair.mobileToken);
    await expect(pairRelaySession({
      relayServer,
      sessionId: session.sessionId,
      pairingToken: session.pairingToken,
    })).rejects.toMatchObject({ statusCode: 410, message: 'Pairing token already used.' });

    const commandPoll = pollRelayCommands({
      relayServer,
      sessionId: session.sessionId,
      desktopToken: session.desktopToken,
      after: 0,
      timeoutMs: 5000,
    });
    const firstCommand = await sendRelayCommand({
      relayServer,
      sessionId: session.sessionId,
      mobileToken: firstPair.mobileToken,
      type: 'user_message',
      payload: { text: 'continue from e2e' },
      idempotencyKey: 'command-e2e',
    });
    const secondCommand = await sendRelayCommand({
      relayServer,
      sessionId: session.sessionId,
      mobileToken: firstPair.mobileToken,
      type: 'user_message',
      payload: { text: 'continue from e2e' },
      idempotencyKey: 'command-e2e',
    });
    const polledCommands = await commandPoll;

    expect(firstCommand).toMatchObject({ accepted: true, sequence: 1, duplicate: false });
    expect(secondCommand).toMatchObject({ accepted: true, sequence: 1, duplicate: true });
    expect(polledCommands).toMatchObject({ cursor: 1, timedOut: false });
    expect(polledCommands.commands).toEqual([
      expect.objectContaining({
        sequence: 1,
        type: 'user_message',
        payload: { text: 'continue from e2e' },
      }),
    ]);

    const firstEvent = await postRelayEvent({
      relayServer,
      sessionId: session.sessionId,
      desktopToken: session.desktopToken,
      type: 'run_status',
      payload: { status: 'waiting_for_input' },
      idempotencyKey: 'event-e2e',
    });
    const secondEvent = await postRelayEvent({
      relayServer,
      sessionId: session.sessionId,
      desktopToken: session.desktopToken,
      type: 'run_status',
      payload: { status: 'waiting_for_input' },
      idempotencyKey: 'event-e2e',
    });
    await postRelayEvent({
      relayServer,
      sessionId: session.sessionId,
      desktopToken: session.desktopToken,
      type: 'completion',
      payload: { text: 'relay e2e complete' },
    });

    expect(firstEvent).toMatchObject({ accepted: true, sequence: 1, duplicate: false });
    expect(secondEvent).toMatchObject({ accepted: true, sequence: 1, duplicate: true });

    const eventBacklog = await readRelayEvents({
      relayServer,
      sessionId: session.sessionId,
      mobileToken: firstPair.mobileToken,
      after: 0,
    });
    const notifications = await readRelayNotifications({
      relayServer,
      sessionId: session.sessionId,
      mobileToken: firstPair.mobileToken,
      after: 0,
    });

    expect(eventBacklog.events.map(
      /** @param {{ type?: string }} event */
      (event) => event.type,
    )).toEqual(['run_status', 'completion']);
    expect(notifications.notifications.map(
      /** @param {{ level?: string }} notification */
      (notification) => notification.level,
    )).toEqual([
      'human_input_needed',
      'run_completed',
    ]);

    const revoke = await revokeRelaySession({
      relayServer,
      sessionId: session.sessionId,
      token: firstPair.mobileToken,
      reason: 'e2e-finished',
    });

    expect(revoke).toMatchObject({ revoked: true, sessionId: session.sessionId, reason: 'e2e-finished' });
    await expect(readRelayEvents({
      relayServer,
      sessionId: session.sessionId,
      mobileToken: firstPair.mobileToken,
      after: 0,
    })).rejects.toMatchObject({ statusCode: 410, message: 'Relay session unavailable: e2e-finished.' });
  });

  it('serves static files from the entrypoint while preserving API routes', async () => {
    const { relayServer } = await startRelayServer({ host: '0.0.0.0' });

    const rootResponse = await fetch(`${relayServer}/`);
    expect(rootResponse.headers.get('content-type')).toContain('text/html');
    const rootHtml = await rootResponse.text();
    expect(rootHtml).toContain('Agent CLI Remote Relay');

    const scriptPathMatch = rootHtml.match(/src="([^"]+assets\/[^"/]+\.js)"/u);
    const scriptPath = scriptPathMatch?.[1];
    expect(scriptPath).toBeTruthy();

    const scriptResponse = await fetch(`${relayServer}${scriptPath}`);
    expect(scriptResponse.headers.get('content-type')).toContain('text/javascript');
    expect((await scriptResponse.text()).length).toBeGreaterThan(1000);

    const healthResponse = await fetch(`${relayServer}/healthz`);
    expect(healthResponse.headers.get('content-type')).toContain('application/json');
    expect(await healthResponse.json()).toEqual({ ok: true });

    const session = await createRelaySession({ relayServer, chatId: 'static-api-precedence' });
    expect(session.clientConnectionUrl).toContain('/pair?sessionId=');
  });
});