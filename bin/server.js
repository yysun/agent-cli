#!/usr/bin/env node

// server/src/relay-server-cli.ts
import { existsSync, realpathSync } from "node:fs";
import path2 from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// server/src/relay-server.ts
import { createServer } from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { URL } from "node:url";
var DEFAULT_SESSION_TTL_MS = 15 * 60 * 1e3;
var DEFAULT_PAIRING_TTL_MS = 5 * 60 * 1e3;
var DEFAULT_LONG_POLL_TIMEOUT_MS = 25 * 1e3;
var DEFAULT_SSE_HEARTBEAT_MS = 15e3;
var DEFAULT_SSE_RETRY_MS = 3e3;
var MAX_QUEUE_ITEMS = 250;
function resolveSessionLifetimeMs(value, fallbackMs) {
  if (value === 0) {
    return null;
  }
  return clampPositiveInteger(Number(value)) ?? fallbackMs;
}
function clampPositiveInteger(value) {
  if (!Number.isFinite(value) || value < 1) {
    return void 0;
  }
  return Math.floor(value);
}
function normalizeOptionalString(value) {
  const normalized = String(value ?? "").trim();
  return normalized || void 0;
}
function createToken() {
  return randomBytes(24).toString("base64url");
}
function normalizeAddressFamily(family) {
  if (family === "IPv4" || family === 4) {
    return "IPv4";
  }
  if (family === "IPv6" || family === 6) {
    return "IPv6";
  }
  return void 0;
}
function isWildcardAddress(address) {
  return address === "0.0.0.0" || address === "::";
}
function formatHostForUrl(address) {
  return address.includes(":") ? `[${address}]` : address;
}
function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1";
}
function isLocalIpv6Address(address) {
  return address === "::1" || address.startsWith("fe80:");
}
function isPrivateIpv4Address(address) {
  const octets = address.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  if (octets[0] === 10) {
    return true;
  }
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) {
    return true;
  }
  return octets[0] === 192 && octets[1] === 168;
}
function sortAddressPriority(entry) {
  if (entry.family === "IPv4" && isPrivateIpv4Address(entry.address) && !entry.internal) {
    return 0;
  }
  if (entry.family === "IPv4" && !entry.internal) {
    return 1;
  }
  if (entry.family === "IPv6" && !entry.internal && !isLocalIpv6Address(entry.address)) {
    return 2;
  }
  if (isLoopbackAddress(entry.address) || entry.internal) {
    return 3;
  }
  return 4;
}
function normalizeInterfaceAddress(entry) {
  if (!entry?.address) {
    return void 0;
  }
  if (normalizeAddressFamily(entry.family) === "IPv6") {
    const address = entry.address.split("%")[0];
    if (!address || address.startsWith("fe80:")) {
      return void 0;
    }
    return address;
  }
  return entry.address;
}
function listRelayListenUrls(addressInfo, options = {}) {
  const family = normalizeAddressFamily(addressInfo.family);
  const resolvedAddress = addressInfo.address;
  const port = addressInfo.port;
  if (!isWildcardAddress(resolvedAddress)) {
    return [`http://${formatHostForUrl(resolvedAddress)}:${port}`];
  }
  const interfaces = options.interfaces ?? networkInterfaces();
  const collectedAddresses = /* @__PURE__ */ new Map();
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (family && normalizeAddressFamily(entry.family) !== family) {
        continue;
      }
      const normalizedAddress = normalizeInterfaceAddress(entry);
      if (!normalizedAddress) {
        continue;
      }
      const candidate = {
        name,
        address: normalizedAddress,
        family: normalizeAddressFamily(entry.family),
        internal: Boolean(entry.internal)
      };
      const existing = collectedAddresses.get(normalizedAddress);
      if (!existing || sortAddressPriority(candidate) < sortAddressPriority(existing)) {
        collectedAddresses.set(normalizedAddress, candidate);
      }
    }
  }
  if (collectedAddresses.size === 0) {
    const fallbackAddress = family === "IPv6" ? "::1" : "127.0.0.1";
    collectedAddresses.set(fallbackAddress, {
      name: family === "IPv6" ? "lo0" : "lo0",
      address: fallbackAddress,
      family,
      internal: true
    });
  }
  return [...collectedAddresses.values()].sort((left, right) => {
    const priorityDifference = sortAddressPriority(left) - sortAddressPriority(right);
    if (priorityDifference !== 0) {
      return priorityDifference;
    }
    const interfaceDifference = left.name.localeCompare(right.name);
    if (interfaceDifference !== 0) {
      return interfaceDifference;
    }
    return left.address.localeCompare(right.address);
  }).map((entry) => `http://${formatHostForUrl(entry.address)}:${port}`);
}
function trimQueue(queue, maxItems = MAX_QUEUE_ITEMS) {
  while (queue.length > maxItems) {
    queue.shift();
  }
}
function resolveTimeoutMs(timeoutMs, fallbackMs = DEFAULT_LONG_POLL_TIMEOUT_MS) {
  return clampPositiveInteger(Number(timeoutMs)) ?? fallbackMs;
}
function readEventSequenceHeader(value) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return Math.max(0, clampPositiveInteger(Number(rawValue)) ?? 0);
}
function writeSseConnected(response, retryMs) {
  response.write(`retry: ${retryMs}
`);
  response.write(": connected\n\n");
}
function writeSseHeartbeat(response) {
  response.write(": heartbeat\n\n");
}
function writeSseEvent(response, event) {
  response.write(`id: ${event.sequence}
`);
  response.write("event: remote\n");
  response.write(`data: ${JSON.stringify(event)}

`);
}
function hasExpired(value, now) {
  if (!value) {
    return false;
  }
  return new Date(value).getTime() < now.getTime();
}
function buildClientConnectionUrl(baseUrl, sessionId, pairingToken) {
  const url = new URL(`/pair?sessionId=${encodeURIComponent(sessionId)}&pairingToken=${encodeURIComponent(pairingToken)}`, baseUrl);
  return url.toString();
}
function buildPairingInvite(now, ttlMs) {
  return {
    pairingToken: createToken(),
    createdAt: now.toISOString(),
    expiresAt: ttlMs === null ? null : new Date(now.getTime() + ttlMs).toISOString()
  };
}
function isEventVisibleToClient(event, clientId) {
  return !event.targetClientId || event.targetClientId === clientId;
}
function buildNotificationFromEvent(eventType, payload) {
  if (eventType === "tool_approval_request") {
    return {
      level: "approval_required",
      title: "Approval required",
      body: `Approve tool ${String(payload.toolName ?? "unknown_tool")}`
    };
  }
  if (eventType === "completion") {
    return {
      level: "run_completed",
      title: "Run completed",
      body: String(payload.text ?? "The remote run completed.")
    };
  }
  if (eventType === "failure") {
    return {
      level: "run_failed",
      title: "Run failed",
      body: String(payload.message ?? "The remote run failed.")
    };
  }
  if (eventType === "run_status" && String(payload.status ?? "") === "waiting_for_input") {
    return {
      level: "human_input_needed",
      title: "Input needed",
      body: "The remote session is waiting for user input."
    };
  }
  return null;
}
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function readRequiredString(body, key) {
  const value = normalizeOptionalString(String(body[key] ?? ""));
  if (!value) {
    throw new RelayServerError(400, `Missing required field: ${key}`);
  }
  return value;
}
var RelayServerError = class extends Error {
  /**
   * @param {number} statusCode
   * @param {string} message
   */
  constructor(statusCode, message) {
    super(message);
    this.name = "RelayServerError";
    this.statusCode = statusCode;
  }
};
var RelayService = class {
  /**
   * @param {{
   *   now?: () => Date,
   *   sessionTtlMs?: number,
   *   pairingTtlMs?: number,
   *   queueLimit?: number,
   * }} [options]
   */
  constructor(options = {}) {
    this.now = options.now ?? (() => /* @__PURE__ */ new Date());
    this.sessionTtlMs = clampPositiveInteger(Number(options.sessionTtlMs)) ?? DEFAULT_SESSION_TTL_MS;
    this.pairingTtlMs = clampPositiveInteger(Number(options.pairingTtlMs)) ?? DEFAULT_PAIRING_TTL_MS;
    this.queueLimit = clampPositiveInteger(Number(options.queueLimit)) ?? MAX_QUEUE_ITEMS;
    this.sessions = /* @__PURE__ */ new Map();
    this.cleanupInterval = setInterval(() => {
      this.sweepExpiredSessions();
    }, 30 * 1e3);
    this.cleanupInterval.unref?.();
  }
  close() {
    clearInterval(this.cleanupInterval);
    for (const session of this.sessions.values()) {
      for (const client of session.eventClients) {
        clearInterval(client.heartbeatTimer);
        client.response.end();
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
      for (const [pairingToken, invite] of session.pairingInvites.entries()) {
        if (hasExpired(invite.expiresAt, now)) {
          session.pairingInvites.delete(pairingToken);
        }
      }
      if (!session.expiresAt || new Date(session.expiresAt).getTime() > now.getTime()) {
        continue;
      }
      session.revokedAt = now.toISOString();
      session.revokeReason = session.revokeReason ?? "expired";
      this.broadcastEvent(session, {
        sequence: ++session.eventSequence,
        type: "disconnect",
        createdAt: now.toISOString(),
        payload: {
          reason: "expired"
        }
      });
      for (const waiter of session.commandWaiters) {
        clearTimeout(waiter.timer);
        waiter.resolve({ commands: [], cursor: waiter.after, timedOut: false, revoked: true, reason: "expired" });
      }
      session.commandWaiters.clear();
      for (const client of session.eventClients) {
        clearInterval(client.heartbeatTimer);
        client.response.end();
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
    const ttlMs = resolveSessionLifetimeMs(input.ttlMs, this.sessionTtlMs);
    const pairingTtlMs = resolveSessionLifetimeMs(input.pairingTtlMs, this.pairingTtlMs);
    const expiresAt = ttlMs === null ? null : new Date(now.getTime() + ttlMs).toISOString();
    const effectivePairingTtlMs = ttlMs === null ? pairingTtlMs : pairingTtlMs === null ? ttlMs : Math.min(ttlMs, pairingTtlMs);
    const pairingExpiresAt = effectivePairingTtlMs === null ? null : new Date(now.getTime() + effectivePairingTtlMs).toISOString();
    const initialInvite = buildPairingInvite(now, effectivePairingTtlMs);
    const session = {
      sessionId,
      desktopToken,
      localSessionId: normalizeOptionalString(input.localSessionId),
      chatId: normalizeOptionalString(input.chatId),
      metadata: isPlainObject(input.metadata) ? input.metadata : {},
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt,
      pairedAt: null,
      revokedAt: null,
      revokeReason: null,
      eventSequence: 0,
      commandSequence: 0,
      notificationSequence: 0,
      events: [],
      commands: [],
      notifications: [],
      pairingInvites: /* @__PURE__ */ new Map([[initialInvite.pairingToken, initialInvite]]),
      mobileClients: /* @__PURE__ */ new Map(),
      mobileTokenIndex: /* @__PURE__ */ new Map(),
      eventClients: /* @__PURE__ */ new Set(),
      commandWaiters: /* @__PURE__ */ new Set(),
      idempotency: {
        pair: /* @__PURE__ */ new Map(),
        pairingInvite: /* @__PURE__ */ new Map(),
        event: /* @__PURE__ */ new Map(),
        command: /* @__PURE__ */ new Map()
      }
    };
    this.sessions.set(sessionId, session);
    return {
      sessionId,
      desktopToken,
      pairingToken: initialInvite.pairingToken,
      clientConnectionUrl: buildClientConnectionUrl(input.baseUrl, sessionId, initialInvite.pairingToken),
      expiresAt,
      pairingExpiresAt,
      chatId: session.chatId,
      localSessionId: session.localSessionId
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
    if (!pairingToken) {
      throw new RelayServerError(401, "Invalid pairing token.");
    }
    const invite = session.pairingInvites.get(pairingToken);
    if (!invite) {
      throw new RelayServerError(401, "Invalid pairing token.");
    }
    if (hasExpired(invite.expiresAt, this.now())) {
      session.pairingInvites.delete(pairingToken);
      throw new RelayServerError(410, "Pairing token expired.");
    }
    session.pairingInvites.delete(pairingToken);
    const pairedAt = this.now().toISOString();
    const clientId = randomUUID();
    const mobileToken = createToken();
    const mobileName = normalizeOptionalString(input.mobileName);
    session.mobileClients.set(clientId, {
      clientId,
      mobileToken,
      mobileName,
      pairedAt,
      lastSeenAt: pairedAt
    });
    session.mobileTokenIndex.set(mobileToken, clientId);
    session.pairedAt = session.pairedAt ?? pairedAt;
    session.updatedAt = pairedAt;
    const result = {
      sessionId: session.sessionId,
      clientId,
      mobileToken,
      expiresAt: session.expiresAt,
      pairedAt,
      chatId: session.chatId,
      mobileName
    };
    if (idempotencyKey) {
      session.idempotency.pair.set(idempotencyKey, result);
    }
    return result;
  }
  /**
   * @param {string} sessionId
   * @param {{ token: string, idempotencyKey?: string, baseUrl: string }} input
   */
  createPairingInvite(sessionId, input) {
    const { session } = this.authenticateSessionToken(sessionId, input.token);
    const idempotencyKey = normalizeOptionalString(input.idempotencyKey);
    if (idempotencyKey && session.idempotency.pairingInvite.has(idempotencyKey)) {
      return session.idempotency.pairingInvite.get(idempotencyKey);
    }
    const now = this.now();
    const effectivePairingTtlMs = session.expiresAt ? Math.max(1, new Date(session.expiresAt).getTime() - now.getTime()) : this.pairingTtlMs;
    const invite = buildPairingInvite(now, effectivePairingTtlMs === null ? null : effectivePairingTtlMs);
    session.pairingInvites.set(invite.pairingToken, invite);
    session.updatedAt = invite.createdAt;
    const result = {
      sessionId: session.sessionId,
      pairingToken: invite.pairingToken,
      clientConnectionUrl: buildClientConnectionUrl(input.baseUrl, session.sessionId, invite.pairingToken),
      pairingExpiresAt: invite.expiresAt,
      chatId: session.chatId
    };
    if (idempotencyKey) {
      session.idempotency.pairingInvite.set(idempotencyKey, result);
    }
    return result;
  }
  /**
   * @param {string} sessionId
   * @param {{ desktopToken: string, type: string, payload?: Record<string, unknown>, idempotencyKey?: string, targetClientId?: string }} input
   */
  postEvent(sessionId, input) {
    const session = this.authenticateDesktop(sessionId, input.desktopToken);
    const eventType = normalizeOptionalString(input.type);
    if (!eventType) {
      throw new RelayServerError(400, "Missing required field: type");
    }
    const idempotencyKey = normalizeOptionalString(input.idempotencyKey);
    if (idempotencyKey && session.idempotency.event.has(idempotencyKey)) {
      return {
        ...session.idempotency.event.get(idempotencyKey),
        duplicate: true
      };
    }
    const event = {
      sequence: ++session.eventSequence,
      type: eventType,
      createdAt: this.now().toISOString(),
      payload: isPlainObject(input.payload) ? input.payload : {},
      ...normalizeOptionalString(input.targetClientId) ? { targetClientId: normalizeOptionalString(input.targetClientId) } : {},
      ...idempotencyKey ? { idempotencyKey } : {}
    };
    session.events.push(event);
    trimQueue(session.events, this.queueLimit);
    session.updatedAt = event.createdAt;
    if (event.type === "session_snapshot") {
      session.chatId = normalizeOptionalString(String(event.payload.activeChatId ?? event.payload.chatId ?? "")) ?? session.chatId;
    }
    this.broadcastEvent(session, event);
    const notification = event.targetClientId ? null : buildNotificationFromEvent(event.type, event.payload);
    if (notification) {
      session.notifications.push({
        sequence: ++session.notificationSequence,
        createdAt: event.createdAt,
        ...notification,
        eventSequence: event.sequence
      });
      trimQueue(session.notifications, this.queueLimit);
    }
    const result = {
      accepted: true,
      sequence: event.sequence,
      duplicate: false
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
    const { session, clientId } = this.authenticateMobile(sessionId, input.mobileToken);
    const commandType = normalizeOptionalString(input.type);
    if (!commandType) {
      throw new RelayServerError(400, "Missing required field: type");
    }
    const idempotencyKey = normalizeOptionalString(input.idempotencyKey);
    if (idempotencyKey && session.idempotency.command.has(idempotencyKey)) {
      return {
        ...session.idempotency.command.get(idempotencyKey),
        duplicate: true
      };
    }
    const command = {
      sequence: ++session.commandSequence,
      type: commandType,
      createdAt: this.now().toISOString(),
      clientId,
      payload: isPlainObject(input.payload) ? input.payload : {},
      ...idempotencyKey ? { idempotencyKey } : {}
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
        commands: session.commands.filter(
          /** @param {{ sequence: number }} entry */
          (entry) => entry.sequence > waiter.after
        ),
        cursor: session.commandSequence,
        timedOut: false
      });
      session.commandWaiters.delete(waiter);
    }
    const result = {
      accepted: true,
      sequence: command.sequence,
      duplicate: false
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
    const availableCommands = session.commands.filter(
      /** @param {{ sequence: number }} command */
      (command) => command.sequence > after
    );
    if (availableCommands.length > 0) {
      return {
        commands: availableCommands,
        cursor: session.commandSequence,
        timedOut: false
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
            timedOut: true
          });
        }, timeoutMs)
      };
      session.commandWaiters.add(waiter);
    });
  }
  /**
   * @param {string} sessionId
   * @param {{ mobileToken: string, after?: number }} input
   */
  readEvents(sessionId, input) {
    const { session, clientId, client } = this.authenticateMobile(sessionId, input.mobileToken);
    const after = Math.max(0, Number(input.after) || 0);
    const events = session.events.filter(
      /** @param {{ sequence: number }} event */
      (event) => event.sequence > after && isEventVisibleToClient(event, clientId)
    );
    client.lastSeenAt = this.now().toISOString();
    return {
      events,
      cursor: session.eventSequence
    };
  }
  /**
   * @param {string} sessionId
   * @param {{ mobileToken: string, after?: number }} input
   */
  readNotifications(sessionId, input) {
    const { session, client } = this.authenticateMobile(sessionId, input.mobileToken);
    const after = Math.max(0, Number(input.after) || 0);
    const notifications = session.notifications.filter(
      /** @param {{ sequence: number }} entry */
      (entry) => entry.sequence > after
    );
    client.lastSeenAt = this.now().toISOString();
    return {
      notifications,
      cursor: session.notificationSequence
    };
  }
  /**
   * @param {string} sessionId
   * @param {{ token: string, reason?: string }} input
   */
  revokeSession(sessionId, input) {
    const { session } = this.authenticateSessionToken(sessionId, input.token);
    this.assertSessionActive(session);
    const reason = normalizeOptionalString(input.reason) ?? "revoked";
    session.revokedAt = this.now().toISOString();
    session.revokeReason = reason;
    session.updatedAt = session.revokedAt;
    const event = {
      sequence: ++session.eventSequence,
      type: "disconnect",
      createdAt: session.revokedAt,
      payload: {
        reason
      }
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
        reason
      });
    }
    session.commandWaiters.clear();
    return {
      revoked: true,
      sessionId,
      reason,
      revokedAt: session.revokedAt
    };
  }
  /**
   * @param {string} sessionId
   */
  requireSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new RelayServerError(404, "Relay session not found.");
    }
    return session;
  }
  /** @param {any} session */
  assertSessionActive(session) {
    if (session.revokedAt) {
      throw new RelayServerError(410, `Relay session unavailable: ${session.revokeReason ?? "revoked"}.`);
    }
    if (hasExpired(session.expiresAt, this.now())) {
      throw new RelayServerError(410, "Relay session expired.");
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
      throw new RelayServerError(401, "Invalid desktop token.");
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
    const clientId = session.mobileTokenIndex.get(mobileToken);
    if (!clientId) {
      throw new RelayServerError(401, "Invalid mobile token.");
    }
    const client = session.mobileClients.get(clientId);
    if (!client) {
      throw new RelayServerError(401, "Invalid mobile token.");
    }
    return { session, clientId, client };
  }
  /**
   * @param {string} sessionId
   * @param {string} token
   */
  authenticateSessionToken(sessionId, token) {
    const session = this.requireSession(sessionId);
    this.assertSessionActive(session);
    if (token === session.desktopToken) {
      return { session, clientId: null };
    }
    const clientId = session.mobileTokenIndex.get(token);
    if (!clientId) {
      throw new RelayServerError(401, "Invalid relay session token.");
    }
    return { session, clientId };
  }
  /**
   * @param {any} session
   * @param {{ sequence: number, type: string, createdAt: string, payload: Record<string, unknown> }} event
   */
  broadcastEvent(session, event) {
    for (const client of session.eventClients) {
      if (client.response.writableEnded || client.response.destroyed) {
        clearInterval(client.heartbeatTimer);
        session.eventClients.delete(client);
        continue;
      }
      if (!isEventVisibleToClient(event, client.clientId)) {
        continue;
      }
      writeSseEvent(client.response, event);
    }
  }
};
async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (!rawBody) {
    return {};
  }
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new RelayServerError(400, "Invalid JSON request body.");
  }
}
function writeJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type,authorization");
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(payload, null, 2)}
`);
}
function writeNotFound(response, message = "Not found.") {
  writeJson(response, 404, { error: message });
}
function contentTypeForPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js" || extension === ".mjs") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".ico") return "image/x-icon";
  return "application/octet-stream";
}
function resolveStaticFilePath(staticDir, requestPathname) {
  const normalizedRequestPath = path.posix.normalize(`/${requestPathname}`).replace(/^\/+/u, "");
  const absoluteStaticRoot = path.resolve(staticDir);
  const absoluteRequestedPath = path.resolve(absoluteStaticRoot, normalizedRequestPath);
  const pathBoundary = `${absoluteStaticRoot}${path.sep}`;
  if (absoluteRequestedPath !== absoluteStaticRoot && !absoluteRequestedPath.startsWith(pathBoundary)) {
    return null;
  }
  return absoluteRequestedPath;
}
async function writeStaticFile(response, filePath) {
  const content = await readFile(filePath);
  response.statusCode = 200;
  response.setHeader("content-type", contentTypeForPath(filePath));
  response.end(content);
}
async function tryServeStatic(request, response, staticDir, pathname) {
  if (!staticDir) {
    return false;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const resolvedFilePath = resolveStaticFilePath(staticDir, requestedPath);
  if (!resolvedFilePath) {
    response.statusCode = 400;
    response.end("Invalid path.");
    return true;
  }
  try {
    await writeStaticFile(response, resolvedFilePath);
    return true;
  } catch {
    const extension = path.extname(requestedPath);
    if (extension) {
      return false;
    }
    const indexFilePath = resolveStaticFilePath(staticDir, "/index.html");
    if (!indexFilePath) {
      return false;
    }
    try {
      await writeStaticFile(response, indexFilePath);
      return true;
    } catch {
      return false;
    }
  }
}
function createRelayHttpServer(options = {}) {
  const service = options.service ?? new RelayService();
  const staticDir = normalizeOptionalString(options.staticDir);
  const sseHeartbeatMs = clampPositiveInteger(Number(options.sseHeartbeatMs)) ?? DEFAULT_SSE_HEARTBEAT_MS;
  const sseRetryMs = clampPositiveInteger(Number(options.sseRetryMs)) ?? DEFAULT_SSE_RETRY_MS;
  const server = createServer(async (request, response) => {
    try {
      if (!request.url || !request.method) {
        writeNotFound(response);
        return;
      }
      const origin = options.baseUrl ?? `http://${request.headers.host ?? "127.0.0.1"}`;
      const url = new URL(request.url, origin);
      const pathname = url.pathname;
      if (request.method === "OPTIONS") {
        response.statusCode = 204;
        response.setHeader("access-control-allow-origin", "*");
        response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
        response.setHeader("access-control-allow-headers", "content-type,authorization");
        response.end();
        return;
      }
      if (request.method === "GET" && pathname === "/healthz") {
        writeJson(response, 200, { ok: true });
        return;
      }
      if (request.method === "POST" && pathname === "/v1/sessions") {
        const body = await readRequestBody(request);
        const result = service.createSession({
          baseUrl: origin,
          localSessionId: normalizeOptionalString(String(body.localSessionId ?? "")),
          chatId: normalizeOptionalString(String(body.chatId ?? "")),
          ttlMs: Number(body.ttlMs),
          pairingTtlMs: Number(body.pairingTtlMs),
          metadata: isPlainObject(body.metadata) ? body.metadata : {}
        });
        writeJson(response, 201, result);
        return;
      }
      const pathMatch = pathname.match(/^\/v1\/sessions\/([^/]+)\/(pair|events|commands|notifications|revoke|pairing-invites)$/);
      const pollMatch = pathname.match(/^\/v1\/sessions\/([^/]+)\/commands\/poll$/);
      if (pathMatch) {
        const [, rawSessionId, action] = pathMatch;
        const sessionId = decodeURIComponent(rawSessionId);
        if (action === "pair" && request.method === "POST") {
          const body = await readRequestBody(request);
          const result = service.pairSession(sessionId, {
            pairingToken: readRequiredString(body, "pairingToken"),
            idempotencyKey: normalizeOptionalString(String(body.idempotencyKey ?? "")),
            mobileName: normalizeOptionalString(String(body.mobileName ?? ""))
          });
          writeJson(response, 200, result);
          return;
        }
        if (action === "pairing-invites" && request.method === "POST") {
          const body = await readRequestBody(request);
          const result = service.createPairingInvite(sessionId, {
            token: readRequiredString(body, "token"),
            idempotencyKey: normalizeOptionalString(String(body.idempotencyKey ?? "")),
            baseUrl: origin
          });
          writeJson(response, 201, result);
          return;
        }
        if (action === "events" && request.method === "POST") {
          const body = await readRequestBody(request);
          const result = service.postEvent(sessionId, {
            desktopToken: readRequiredString(body, "desktopToken"),
            type: readRequiredString(body, "type"),
            payload: isPlainObject(body.payload) ? body.payload : {},
            idempotencyKey: normalizeOptionalString(String(body.idempotencyKey ?? "")),
            targetClientId: normalizeOptionalString(String(body.targetClientId ?? ""))
          });
          writeJson(response, 202, result);
          return;
        }
        if (action === "events" && request.method === "GET") {
          const mobileToken = normalizeOptionalString(url.searchParams.get("mobileToken") ?? "");
          const after = Number(url.searchParams.get("after") ?? "0");
          if (!mobileToken) {
            throw new RelayServerError(400, "Missing required query parameter: mobileToken");
          }
          const acceptHeader = String(request.headers.accept ?? "").toLowerCase();
          if (acceptHeader.includes("text/event-stream")) {
            const { session, clientId } = service.authenticateMobile(sessionId, mobileToken);
            const lastEventId = readEventSequenceHeader(request.headers["last-event-id"]);
            const resumeAfter = Math.max(0, after || 0, lastEventId);
            const initialEvents = session.events.filter(
              /** @param {{ sequence: number, targetClientId?: string }} event */
              (event) => event.sequence > resumeAfter && isEventVisibleToClient(event, clientId)
            );
            response.writeHead(200, {
              "content-type": "text/event-stream; charset=utf-8",
              "cache-control": "no-cache, no-transform",
              connection: "keep-alive",
              "access-control-allow-origin": "*"
            });
            writeSseConnected(response, sseRetryMs);
            for (const event of initialEvents) {
              writeSseEvent(response, event);
            }
            const heartbeatTimer = setInterval(() => {
              if (response.writableEnded || response.destroyed) {
                clearInterval(heartbeatTimer);
                return;
              }
              writeSseHeartbeat(response);
            }, sseHeartbeatMs);
            heartbeatTimer.unref?.();
            const eventClient = { clientId, response, heartbeatTimer };
            session.eventClients.add(eventClient);
            const cleanupEventClient = () => {
              clearInterval(heartbeatTimer);
              for (const eventClient2 of session.eventClients) {
                if (eventClient2.response === response) {
                  session.eventClients.delete(eventClient2);
                  break;
                }
              }
            };
            request.on("close", cleanupEventClient);
            response.on("close", cleanupEventClient);
            return;
          }
          writeJson(response, 200, service.readEvents(sessionId, { mobileToken, after }));
          return;
        }
        if (action === "commands" && request.method === "POST") {
          const body = await readRequestBody(request);
          const result = service.enqueueCommand(sessionId, {
            mobileToken: readRequiredString(body, "mobileToken"),
            type: readRequiredString(body, "type"),
            payload: isPlainObject(body.payload) ? body.payload : {},
            idempotencyKey: normalizeOptionalString(String(body.idempotencyKey ?? ""))
          });
          writeJson(response, 202, result);
          return;
        }
        if (action === "notifications" && request.method === "GET") {
          const mobileToken = normalizeOptionalString(url.searchParams.get("mobileToken") ?? "");
          const after = Number(url.searchParams.get("after") ?? "0");
          if (!mobileToken) {
            throw new RelayServerError(400, "Missing required query parameter: mobileToken");
          }
          writeJson(response, 200, service.readNotifications(sessionId, { mobileToken, after }));
          return;
        }
        if (action === "revoke" && request.method === "POST") {
          const body = await readRequestBody(request);
          const result = service.revokeSession(sessionId, {
            token: readRequiredString(body, "token"),
            reason: normalizeOptionalString(String(body.reason ?? ""))
          });
          writeJson(response, 200, result);
          return;
        }
      }
      if (pollMatch && request.method === "GET") {
        const [, rawSessionId] = pollMatch;
        const sessionId = decodeURIComponent(rawSessionId);
        const desktopToken = normalizeOptionalString(url.searchParams.get("desktopToken") ?? "");
        if (!desktopToken) {
          throw new RelayServerError(400, "Missing required query parameter: desktopToken");
        }
        const result = await service.pollCommands(sessionId, {
          desktopToken,
          after: Number(url.searchParams.get("after") ?? "0"),
          timeoutMs: Number(url.searchParams.get("timeoutMs") ?? "0")
        });
        writeJson(response, 200, result);
        return;
      }
      const staticServed = await tryServeStatic(request, response, staticDir, pathname);
      if (staticServed) {
        return;
      }
      writeNotFound(response);
    } catch (error) {
      if (error instanceof RelayServerError) {
        writeJson(response, error.statusCode, {
          error: error.message
        });
        return;
      }
      writeJson(response, 500, {
        error: error instanceof Error ? error.message : "Internal relay server error."
      });
    }
  });
  server.on("close", () => {
    service.close();
  });
  return server;
}

// server/src/relay-server-cli.ts
var moduleDirectory = path2.dirname(fileURLToPath(import.meta.url));
var sourceDirectorySuffix = `${path2.sep}server${path2.sep}src`;
var packageRoot = moduleDirectory.endsWith(sourceDirectorySuffix) ? path2.resolve(moduleDirectory, "../..") : path2.basename(moduleDirectory) === "bin" ? path2.resolve(moduleDirectory, "..") : moduleDirectory.includes(`${path2.sep}dist${path2.sep}`) ? path2.resolve(moduleDirectory, "../../..") : moduleDirectory;
var fixedStaticDir = path2.join(packageRoot, "bin", "public");
function isCliEntrypoint(argvPath = process.argv[1], moduleUrl = import.meta.url) {
  if (!argvPath) {
    return false;
  }
  try {
    return realpathSync(argvPath) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return pathToFileURL(path2.resolve(argvPath)).href === moduleUrl;
  }
}
function readPort(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--port") {
      return Number(argv[index + 1] ?? "0") || 0;
    }
    if (arg.startsWith("--port=")) {
      return Number(arg.split("=")[1] ?? "0") || 0;
    }
  }
  return Number(process.env.PORT ?? "8787") || 8787;
}
function readHost(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--host") {
      return String(argv[index + 1] ?? "").trim() || "127.0.0.1";
    }
    if (arg.startsWith("--host=")) {
      return String(arg.split("=")[1] ?? "").trim() || "127.0.0.1";
    }
  }
  return String(process.env.HOST ?? "").trim() || "127.0.0.1";
}
function resolveStaticDir(host) {
  if (host !== "0.0.0.0" && host !== "::") {
    return void 0;
  }
  if (!existsSync(path2.join(fixedStaticDir, "index.html"))) {
    return void 0;
  }
  return fixedStaticDir;
}
function main(argv = process.argv.slice(2)) {
  const port = readPort(argv);
  const host = readHost(argv);
  const staticDir = resolveStaticDir(host);
  const server = createRelayHttpServer({ staticDir });
  server.listen(port, host, () => {
    const address = server.address();
    if (!address || typeof address === "string") {
      process.stdout.write(`Relay server listening on http://${host}:${port}
`);
      return;
    }
    const urls = listRelayListenUrls(address);
    if (urls.length === 1) {
      process.stdout.write(`Relay server listening on ${urls[0]}
`);
      if (staticDir) {
        process.stdout.write(`Serving static web app from ${staticDir}
`);
      }
      return;
    }
    process.stdout.write(`Relay server listening on:
${urls.map((url) => `- ${url}`).join("\n")}
`);
    if (staticDir) {
      process.stdout.write(`Serving static web app from ${staticDir}
`);
    }
  });
  return server;
}
if (isCliEntrypoint()) {
  main();
}
export {
  isCliEntrypoint,
  main,
  readHost,
  readPort,
  resolveStaticDir
};
