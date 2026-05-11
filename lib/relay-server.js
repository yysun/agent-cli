// @ts-check
/**
 * Agent CLI Relay Server
 *
 * Purpose:
 * - Provide an optional short-lived coordination relay for remote supervision.
 *
 * Key features:
 * - Creates relay sessions with separate desktop, mobile, and one-time pairing tokens.
 * - Stores short-lived event, command, and notification queues entirely in memory.
 * - Exposes HTTP endpoints for pairing, long-poll commands, SSE events, revoke, and expiry.
 *
 * Recent changes:
 * - 2026-05-11: Added the initial optional remote-control relay server.
 */
import { createServer } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { URL } from 'node:url';

const DEFAULT_SESSION_TTL_MS = 15 * 60 * 1000;
const DEFAULT_PAIRING_TTL_MS = 5 * 60 * 1000;
const DEFAULT_LONG_POLL_TIMEOUT_MS = 25 * 1000;
const MAX_QUEUE_ITEMS = 250;

/** @param {number} value */
function clampPositiveInteger(value) {
  if (!Number.isFinite(value) || value < 1) {
    return undefined;
  }

  return Math.floor(value);
}

/** @param {string | undefined} value */
function normalizeOptionalString(value) {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

function createToken() {
  return randomBytes(24).toString('base64url');
}

/**
 * @param {Array<any>} queue
 * @param {number} maxItems
 */
function trimQueue(queue, maxItems = MAX_QUEUE_ITEMS) {
  while (queue.length > maxItems) {
    queue.shift();
  }
}

/**
 * @param {number | undefined} timeoutMs
 * @param {number} fallbackMs
 */
function resolveTimeoutMs(timeoutMs, fallbackMs = DEFAULT_LONG_POLL_TIMEOUT_MS) {
  return clampPositiveInteger(Number(timeoutMs)) ?? fallbackMs;
}

/**
 * @param {string} baseUrl
 * @param {string} sessionId
 * @param {string} pairingToken
 */
function buildClientConnectionUrl(baseUrl, sessionId, pairingToken) {
  const url = new URL(`/pair?sessionId=${encodeURIComponent(sessionId)}&pairingToken=${encodeURIComponent(pairingToken)}`, baseUrl);
  return url.toString();
}

/**
 * @param {string} eventType
 * @param {Record<string, unknown>} payload
 */
function buildNotificationFromEvent(eventType, payload) {
  if (eventType === 'tool_approval_request') {
    return {
      level: 'approval_required',
      title: 'Approval required',
      body: `Approve tool ${String(payload.toolName ?? 'unknown_tool')}`,
    };
  }

  if (eventType === 'completion') {
    return {
      level: 'run_completed',
      title: 'Run completed',
      body: String(payload.text ?? 'The remote run completed.'),
    };
  }

  if (eventType === 'failure') {
    return {
      level: 'run_failed',
      title: 'Run failed',
      body: String(payload.message ?? 'The remote run failed.'),
    };
  }

  if (eventType === 'run_status' && String(payload.status ?? '') === 'waiting_for_input') {
    return {
      level: 'human_input_needed',
      title: 'Input needed',
      body: 'The remote session is waiting for user input.',
    };
  }

  return null;
}

/**
 * @param {any} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} key
 */
function readRequiredString(body, key) {
  const value = normalizeOptionalString(String(body[key] ?? ''));

  if (!value) {
    throw new RelayServerError(400, `Missing required field: ${key}`);
  }

  return value;
}

export class RelayServerError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} message
   */
  constructor(statusCode, message) {
    super(message);
    this.name = 'RelayServerError';
    this.statusCode = statusCode;
  }
}

export class RelayService {
  /**
   * @param {{
   *   now?: () => Date,
   *   sessionTtlMs?: number,
   *   pairingTtlMs?: number,
   *   queueLimit?: number,
   * }} [options]
   */
  constructor(options = {}) {
    this.now = options.now ?? (() => new Date());
    this.sessionTtlMs = clampPositiveInteger(Number(options.sessionTtlMs)) ?? DEFAULT_SESSION_TTL_MS;
    this.pairingTtlMs = clampPositiveInteger(Number(options.pairingTtlMs)) ?? DEFAULT_PAIRING_TTL_MS;
    this.queueLimit = clampPositiveInteger(Number(options.queueLimit)) ?? MAX_QUEUE_ITEMS;
    /** @type {Map<string, any>} */
    this.sessions = new Map();
    this.cleanupInterval = setInterval(() => {
      this.sweepExpiredSessions();
    }, 30 * 1000);
    this.cleanupInterval.unref?.();
  }

  close() {
    clearInterval(this.cleanupInterval);

    for (const session of this.sessions.values()) {
      for (const client of session.eventClients) {
        client.end();
      }

      for (const waiter of session.commandWaiters) {
        clearTimeout(waiter.timer);
        waiter.resolve({ commands: [], cursor: waiter.after, timedOut: true });
      }
    }

    this.sessions.clear();
  }

  sweepExpiredSessions() {
    const now = this.now();

    for (const [sessionId, session] of this.sessions.entries()) {
      if (new Date(session.expiresAt).getTime() > now.getTime()) {
        continue;
      }

      session.revokedAt = now.toISOString();
      session.revokeReason = session.revokeReason ?? 'expired';
      this.broadcastEvent(session, {
        sequence: ++session.eventSequence,
        type: 'disconnect',
        createdAt: now.toISOString(),
        payload: {
          reason: 'expired',
        },
      });

      for (const waiter of session.commandWaiters) {
        clearTimeout(waiter.timer);
        waiter.resolve({ commands: [], cursor: waiter.after, timedOut: false, revoked: true, reason: 'expired' });
      }

      session.commandWaiters.clear();

      for (const client of session.eventClients) {
        client.end();
      }

      this.sessions.delete(sessionId);
    }
  }

  /**
   * @param {{
   *   baseUrl: string,
   *   localSessionId?: string,
   *   chatId?: string,
   *   ttlMs?: number,
   *   pairingTtlMs?: number,
   *   metadata?: Record<string, unknown>,
   * }} input
   */
  createSession(input) {
    const now = this.now();
    const sessionId = randomUUID();
    const desktopToken = createToken();
    const pairingToken = createToken();
    const ttlMs = clampPositiveInteger(Number(input.ttlMs)) ?? this.sessionTtlMs;
    const pairingTtlMs = clampPositiveInteger(Number(input.pairingTtlMs)) ?? this.pairingTtlMs;
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
    const pairingExpiresAt = new Date(now.getTime() + Math.min(ttlMs, pairingTtlMs)).toISOString();
    const session = {
      sessionId,
      desktopToken,
      pairingToken,
      mobileToken: null,
      localSessionId: normalizeOptionalString(input.localSessionId),
      chatId: normalizeOptionalString(input.chatId),
      metadata: isPlainObject(input.metadata) ? input.metadata : {},
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt,
      pairingExpiresAt,
      pairedAt: null,
      revokedAt: null,
      revokeReason: null,
      eventSequence: 0,
      commandSequence: 0,
      notificationSequence: 0,
      events: [],
      commands: [],
      notifications: [],
      eventClients: new Set(),
      commandWaiters: new Set(),
      idempotency: {
        pair: new Map(),
        event: new Map(),
        command: new Map(),
      },
    };

    this.sessions.set(sessionId, session);

    return {
      sessionId,
      desktopToken,
      pairingToken,
      clientConnectionUrl: buildClientConnectionUrl(input.baseUrl, sessionId, pairingToken),
      expiresAt,
      pairingExpiresAt,
      chatId: session.chatId,
      localSessionId: session.localSessionId,
    };
  }

  /**
   * @param {string} sessionId
   * @param {{ pairingToken: string, idempotencyKey?: string, mobileName?: string }} input
   */
  pairSession(sessionId, input) {
    const session = this.requireSession(sessionId);
    const idempotencyKey = normalizeOptionalString(input.idempotencyKey);

    if (idempotencyKey && session.idempotency.pair.has(idempotencyKey)) {
      return session.idempotency.pair.get(idempotencyKey);
    }

    this.assertSessionActive(session);
    const pairingToken = normalizeOptionalString(input.pairingToken);

    if (session.mobileToken) {
      throw new RelayServerError(410, 'Pairing token already used.');
    }

    if (!pairingToken || pairingToken !== session.pairingToken) {
      throw new RelayServerError(401, 'Invalid pairing token.');
    }

    if (new Date(session.pairingExpiresAt).getTime() < this.now().getTime()) {
      throw new RelayServerError(410, 'Pairing token expired.');
    }

    session.mobileToken = createToken();
    session.pairingToken = null;
    session.pairedAt = this.now().toISOString();
    session.updatedAt = session.pairedAt;

    const result = {
      sessionId: session.sessionId,
      mobileToken: session.mobileToken,
      expiresAt: session.expiresAt,
      pairedAt: session.pairedAt,
      chatId: session.chatId,
      mobileName: normalizeOptionalString(input.mobileName),
    };

    if (idempotencyKey) {
      session.idempotency.pair.set(idempotencyKey, result);
    }

    return result;
  }

  /**
   * @param {string} sessionId
   * @param {{ desktopToken: string, type: string, payload?: Record<string, unknown>, idempotencyKey?: string }} input
   */
  postEvent(sessionId, input) {
    const session = this.authenticateDesktop(sessionId, input.desktopToken);
    const eventType = normalizeOptionalString(input.type);

    if (!eventType) {
      throw new RelayServerError(400, 'Missing required field: type');
    }

    const idempotencyKey = normalizeOptionalString(input.idempotencyKey);

    if (idempotencyKey && session.idempotency.event.has(idempotencyKey)) {
      return {
        ...session.idempotency.event.get(idempotencyKey),
        duplicate: true,
      };
    }

    const event = {
      sequence: ++session.eventSequence,
      type: eventType,
      createdAt: this.now().toISOString(),
      payload: isPlainObject(input.payload) ? input.payload : {},
      ...(idempotencyKey ? { idempotencyKey } : {}),
    };

    session.events.push(event);
    trimQueue(session.events, this.queueLimit);
    session.updatedAt = event.createdAt;
    this.broadcastEvent(session, event);

    const notification = buildNotificationFromEvent(event.type, event.payload);

    if (notification) {
      session.notifications.push({
        sequence: ++session.notificationSequence,
        createdAt: event.createdAt,
        ...notification,
        eventSequence: event.sequence,
      });
      trimQueue(session.notifications, this.queueLimit);
    }

    const result = {
      accepted: true,
      sequence: event.sequence,
      duplicate: false,
    };

    if (idempotencyKey) {
      session.idempotency.event.set(idempotencyKey, result);
    }

    return result;
  }

  /**
   * @param {string} sessionId
   * @param {{ mobileToken: string, type: string, payload?: Record<string, unknown>, idempotencyKey?: string }} input
   */
  enqueueCommand(sessionId, input) {
    const session = this.authenticateMobile(sessionId, input.mobileToken);
    const commandType = normalizeOptionalString(input.type);

    if (!commandType) {
      throw new RelayServerError(400, 'Missing required field: type');
    }

    const idempotencyKey = normalizeOptionalString(input.idempotencyKey);

    if (idempotencyKey && session.idempotency.command.has(idempotencyKey)) {
      return {
        ...session.idempotency.command.get(idempotencyKey),
        duplicate: true,
      };
    }

    const command = {
      sequence: ++session.commandSequence,
      type: commandType,
      createdAt: this.now().toISOString(),
      payload: isPlainObject(input.payload) ? input.payload : {},
      ...(idempotencyKey ? { idempotencyKey } : {}),
    };

    session.commands.push(command);
    trimQueue(session.commands, this.queueLimit);
    session.updatedAt = command.createdAt;

    for (const waiter of session.commandWaiters) {
      if (command.sequence <= waiter.after) {
        continue;
      }

      clearTimeout(waiter.timer);
      waiter.resolve({
        commands: session.commands.filter((entry) => entry.sequence > waiter.after),
        cursor: session.commandSequence,
        timedOut: false,
      });
      session.commandWaiters.delete(waiter);
    }

    const result = {
      accepted: true,
      sequence: command.sequence,
      duplicate: false,
    };

    if (idempotencyKey) {
      session.idempotency.command.set(idempotencyKey, result);
    }

    return result;
  }

  /**
   * @param {string} sessionId
   * @param {{ desktopToken: string, after?: number, timeoutMs?: number }} input
   */
  async pollCommands(sessionId, input) {
    const session = this.authenticateDesktop(sessionId, input.desktopToken);
    const after = Math.max(0, Number(input.after) || 0);
    const availableCommands = session.commands.filter((command) => command.sequence > after);

    if (availableCommands.length > 0) {
      return {
        commands: availableCommands,
        cursor: session.commandSequence,
        timedOut: false,
      };
    }

    return await new Promise((resolve) => {
      const timeoutMs = resolveTimeoutMs(input.timeoutMs);
      const waiter = {
        after,
        resolve,
        timer: setTimeout(() => {
          session.commandWaiters.delete(waiter);
          resolve({
            commands: [],
            cursor: session.commandSequence,
            timedOut: true,
          });
        }, timeoutMs),
      };

      session.commandWaiters.add(waiter);
    });
  }

  /**
   * @param {string} sessionId
   * @param {{ mobileToken: string, after?: number }} input
   */
  readEvents(sessionId, input) {
    const session = this.authenticateMobile(sessionId, input.mobileToken);
    const after = Math.max(0, Number(input.after) || 0);
    const events = session.events.filter((event) => event.sequence > after);

    return {
      events,
      cursor: session.eventSequence,
    };
  }

  /**
   * @param {string} sessionId
   * @param {{ mobileToken: string, after?: number }} input
   */
  readNotifications(sessionId, input) {
    const session = this.authenticateMobile(sessionId, input.mobileToken);
    const after = Math.max(0, Number(input.after) || 0);
    const notifications = session.notifications.filter((entry) => entry.sequence > after);

    return {
      notifications,
      cursor: session.notificationSequence,
    };
  }

  /**
   * @param {string} sessionId
   * @param {{ token: string, reason?: string }} input
   */
  revokeSession(sessionId, input) {
    const session = this.requireSession(sessionId);

    if (input.token !== session.desktopToken && input.token !== session.mobileToken) {
      throw new RelayServerError(401, 'Invalid relay session token.');
    }

    this.assertSessionActive(session);
    const reason = normalizeOptionalString(input.reason) ?? 'revoked';
    session.revokedAt = this.now().toISOString();
    session.revokeReason = reason;
    session.updatedAt = session.revokedAt;

    const event = {
      sequence: ++session.eventSequence,
      type: 'disconnect',
      createdAt: session.revokedAt,
      payload: {
        reason,
      },
    };

    session.events.push(event);
    trimQueue(session.events, this.queueLimit);
    this.broadcastEvent(session, event);

    for (const waiter of session.commandWaiters) {
      clearTimeout(waiter.timer);
      waiter.resolve({
        commands: [],
        cursor: session.commandSequence,
        timedOut: false,
        revoked: true,
        reason,
      });
    }

    session.commandWaiters.clear();

    return {
      revoked: true,
      sessionId,
      reason,
      revokedAt: session.revokedAt,
    };
  }

  /**
   * @param {string} sessionId
   */
  requireSession(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new RelayServerError(404, 'Relay session not found.');
    }

    return session;
  }

  /** @param {any} session */
  assertSessionActive(session) {
    if (session.revokedAt) {
      throw new RelayServerError(410, `Relay session unavailable: ${session.revokeReason ?? 'revoked'}.`);
    }

    if (new Date(session.expiresAt).getTime() < this.now().getTime()) {
      throw new RelayServerError(410, 'Relay session expired.');
    }
  }

  /**
   * @param {string} sessionId
   * @param {string} desktopToken
   */
  authenticateDesktop(sessionId, desktopToken) {
    const session = this.requireSession(sessionId);
    this.assertSessionActive(session);

    if (desktopToken !== session.desktopToken) {
      throw new RelayServerError(401, 'Invalid desktop token.');
    }

    return session;
  }

  /**
   * @param {string} sessionId
   * @param {string} mobileToken
   */
  authenticateMobile(sessionId, mobileToken) {
    const session = this.requireSession(sessionId);
    this.assertSessionActive(session);

    if (!session.mobileToken || mobileToken !== session.mobileToken) {
      throw new RelayServerError(401, 'Invalid mobile token.');
    }

    return session;
  }

  /**
   * @param {any} session
   * @param {{ sequence: number, type: string, createdAt: string, payload: Record<string, unknown> }} event
   */
  broadcastEvent(session, event) {
    for (const response of session.eventClients) {
      response.write(`id: ${event.sequence}\n`);
      response.write(`event: remote\n`);
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }
}

/**
 * @param {import('node:http').IncomingMessage} request
 */
async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString('utf8').trim();

  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new RelayServerError(400, 'Invalid JSON request body.');
  }
}

/**
 * @param {import('node:http').ServerResponse} response
 * @param {number} statusCode
 * @param {Record<string, unknown>} payload
 */
function writeJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

/**
 * @param {import('node:http').ServerResponse} response
 * @param {string} message
 */
function writeNotFound(response, message = 'Not found.') {
  writeJson(response, 404, { error: message });
}

/**
 * @param {{ service?: RelayService, baseUrl?: string }} [options]
 */
export function createRelayHttpServer(options = {}) {
  const service = options.service ?? new RelayService();
  const server = createServer(async (request, response) => {
    try {
      if (!request.url || !request.method) {
        writeNotFound(response);
        return;
      }

      const origin = options.baseUrl ?? `http://${request.headers.host ?? '127.0.0.1'}`;
      const url = new URL(request.url, origin);
      const pathname = url.pathname;

      if (request.method === 'GET' && pathname === '/healthz') {
        writeJson(response, 200, { ok: true });
        return;
      }

      if (request.method === 'POST' && pathname === '/v1/sessions') {
        const body = await readRequestBody(request);
        const result = service.createSession({
          baseUrl: origin,
          localSessionId: normalizeOptionalString(String(body.localSessionId ?? '')),
          chatId: normalizeOptionalString(String(body.chatId ?? '')),
          ttlMs: Number(body.ttlMs),
          pairingTtlMs: Number(body.pairingTtlMs),
          metadata: isPlainObject(body.metadata) ? body.metadata : {},
        });
        writeJson(response, 201, result);
        return;
      }

      const pathMatch = pathname.match(/^\/v1\/sessions\/([^/]+)\/(pair|events|commands|notifications|revoke)$/);
      const pollMatch = pathname.match(/^\/v1\/sessions\/([^/]+)\/commands\/poll$/);

      if (pathMatch) {
        const [, rawSessionId, action] = pathMatch;
        const sessionId = decodeURIComponent(rawSessionId);

        if (action === 'pair' && request.method === 'POST') {
          const body = await readRequestBody(request);
          const result = service.pairSession(sessionId, {
            pairingToken: readRequiredString(body, 'pairingToken'),
            idempotencyKey: normalizeOptionalString(String(body.idempotencyKey ?? '')),
            mobileName: normalizeOptionalString(String(body.mobileName ?? '')),
          });
          writeJson(response, 200, result);
          return;
        }

        if (action === 'events' && request.method === 'POST') {
          const body = await readRequestBody(request);
          const result = service.postEvent(sessionId, {
            desktopToken: readRequiredString(body, 'desktopToken'),
            type: readRequiredString(body, 'type'),
            payload: isPlainObject(body.payload) ? body.payload : {},
            idempotencyKey: normalizeOptionalString(String(body.idempotencyKey ?? '')),
          });
          writeJson(response, 202, result);
          return;
        }

        if (action === 'events' && request.method === 'GET') {
          const mobileToken = normalizeOptionalString(url.searchParams.get('mobileToken') ?? '');
          const after = Number(url.searchParams.get('after') ?? '0');

          if (!mobileToken) {
            throw new RelayServerError(400, 'Missing required query parameter: mobileToken');
          }

          const acceptHeader = String(request.headers.accept ?? '').toLowerCase();

          if (acceptHeader.includes('text/event-stream')) {
            const session = service.authenticateMobile(sessionId, mobileToken);
            const initialEvents = session.events.filter((event) => event.sequence > Math.max(0, after || 0));

            response.writeHead(200, {
              'content-type': 'text/event-stream; charset=utf-8',
              'cache-control': 'no-cache, no-transform',
              connection: 'keep-alive',
            });
            response.write(': connected\n\n');

            for (const event of initialEvents) {
              response.write(`id: ${event.sequence}\n`);
              response.write('event: remote\n');
              response.write(`data: ${JSON.stringify(event)}\n\n`);
            }

            session.eventClients.add(response);
            request.on('close', () => {
              session.eventClients.delete(response);
            });
            return;
          }

          writeJson(response, 200, service.readEvents(sessionId, { mobileToken, after }));
          return;
        }

        if (action === 'commands' && request.method === 'POST') {
          const body = await readRequestBody(request);
          const result = service.enqueueCommand(sessionId, {
            mobileToken: readRequiredString(body, 'mobileToken'),
            type: readRequiredString(body, 'type'),
            payload: isPlainObject(body.payload) ? body.payload : {},
            idempotencyKey: normalizeOptionalString(String(body.idempotencyKey ?? '')),
          });
          writeJson(response, 202, result);
          return;
        }

        if (action === 'notifications' && request.method === 'GET') {
          const mobileToken = normalizeOptionalString(url.searchParams.get('mobileToken') ?? '');
          const after = Number(url.searchParams.get('after') ?? '0');

          if (!mobileToken) {
            throw new RelayServerError(400, 'Missing required query parameter: mobileToken');
          }

          writeJson(response, 200, service.readNotifications(sessionId, { mobileToken, after }));
          return;
        }

        if (action === 'revoke' && request.method === 'POST') {
          const body = await readRequestBody(request);
          const result = service.revokeSession(sessionId, {
            token: readRequiredString(body, 'token'),
            reason: normalizeOptionalString(String(body.reason ?? '')),
          });
          writeJson(response, 200, result);
          return;
        }
      }

      if (pollMatch && request.method === 'GET') {
        const [, rawSessionId] = pollMatch;
        const sessionId = decodeURIComponent(rawSessionId);
        const desktopToken = normalizeOptionalString(url.searchParams.get('desktopToken') ?? '');

        if (!desktopToken) {
          throw new RelayServerError(400, 'Missing required query parameter: desktopToken');
        }

        const result = await service.pollCommands(sessionId, {
          desktopToken,
          after: Number(url.searchParams.get('after') ?? '0'),
          timeoutMs: Number(url.searchParams.get('timeoutMs') ?? '0'),
        });
        writeJson(response, 200, result);
        return;
      }

      writeNotFound(response);
    } catch (error) {
      if (error instanceof RelayServerError) {
        writeJson(response, error.statusCode, {
          error: error.message,
        });
        return;
      }

      writeJson(response, 500, {
        error: error instanceof Error ? error.message : 'Internal relay server error.',
      });
    }
  });

  server.on('close', () => {
    service.close();
  });

  return server;
}