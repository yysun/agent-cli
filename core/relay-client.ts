// @ts-check
/**
 * Agent CLI Relay Client
 *
 * Purpose:
 * - Wrap the optional relay HTTP API for desktop-host orchestration.
 *
 * Key features:
 * - Creates relay sessions, posts normalized events, and polls mobile commands.
 * - Normalizes relay URLs and surfaces HTTP failures as explicit relay errors.
 *
 * Recent changes:
 * - 2026-05-11: Added optional relay client helpers for remote supervision.
 * - 2026-05-13: Added multi-client invite minting and targeted event support.
 */
import { randomUUID } from 'node:crypto';

/** @param {string} rawUrl */
export function normalizeRelayServerUrl(rawUrl) {
  const normalized = String(rawUrl ?? '').trim();

  if (!normalized) {
    throw new Error('Missing relay server URL.');
  }

  const url = new URL(normalized);

  if (!/^https?:$/.test(url.protocol)) {
    throw new Error(`Unsupported relay server protocol: ${url.protocol}`);
  }

  return url.toString().replace(/\/$/, '');
}

export class RelayClientError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} message
   */
  constructor(statusCode, message) {
    super(message);
    this.name = 'RelayClientError';
    this.statusCode = statusCode;
  }
}

/** @param {string} prefix */
export function createRelayIdempotencyKey(prefix) {
  return `${prefix}-${randomUUID()}`;
}

/**
 * @param {string} relayServer
 * @param {string} pathname
 * @param {Record<string, string | number | undefined>} [query]
 */
function buildUrl(relayServer, pathname, query = {}) {
  const url = new URL(pathname, `${normalizeRelayServerUrl(relayServer)}/`);

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '') {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url;
}

/**
 * @param {Response} response
 */
async function readJsonResponse(response) {
  const rawText = await response.text();
  const trimmedText = rawText.trim();
  const parsed = trimmedText ? JSON.parse(trimmedText) : {};

  if (!response.ok) {
    throw new RelayClientError(response.status, String(parsed.error ?? response.statusText));
  }

  return parsed;
}

/**
 * @param {string} relayServer
 * @param {string} pathname
 * @param {Record<string, unknown>} body
 */
async function postJson(relayServer, pathname, body) {
  const response = await fetch(buildUrl(relayServer, pathname), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return await readJsonResponse(response);
}

/**
 * @param {string} relayServer
 * @param {string} pathname
 * @param {Record<string, string | number | undefined>} query
 */
async function getJson(relayServer, pathname, query) {
  const response = await fetch(buildUrl(relayServer, pathname, query));
  return await readJsonResponse(response);
}

/**
 * @param {{
 *   relayServer: string,
 *   localSessionId?: string,
 *   chatId?: string,
 *   ttlMs?: number,
 *   pairingTtlMs?: number,
 *   metadata?: Record<string, unknown>,
 * }} input
 */
export async function createRelaySession(input) {
  return await postJson(input.relayServer, '/v1/sessions', {
    localSessionId: input.localSessionId,
    chatId: input.chatId,
    ttlMs: input.ttlMs,
    pairingTtlMs: input.pairingTtlMs,
    metadata: input.metadata ?? {},
  });
}

/**
 * @param {{ relayServer: string, sessionId: string, pairingToken: string, idempotencyKey?: string, mobileName?: string }} input
 */
export async function pairRelaySession(input) {
  return await postJson(input.relayServer, `/v1/sessions/${encodeURIComponent(input.sessionId)}/pair`, {
    pairingToken: input.pairingToken,
    idempotencyKey: input.idempotencyKey,
    mobileName: input.mobileName,
  });
}

/**
 * @param {{ relayServer: string, sessionId: string, token: string, idempotencyKey?: string }} input
 */
export async function createRelayPairingInvite(input) {
  return await postJson(input.relayServer, `/v1/sessions/${encodeURIComponent(input.sessionId)}/pairing-invites`, {
    token: input.token,
    idempotencyKey: input.idempotencyKey,
  });
}

/**
 * @param {{ relayServer: string, sessionId: string, desktopToken: string, type: string, payload?: Record<string, unknown>, idempotencyKey?: string, targetClientId?: string }} input
 */
export async function postRelayEvent(input) {
  return await postJson(input.relayServer, `/v1/sessions/${encodeURIComponent(input.sessionId)}/events`, {
    desktopToken: input.desktopToken,
    type: input.type,
    payload: input.payload ?? {},
    idempotencyKey: input.idempotencyKey,
    targetClientId: input.targetClientId,
  });
}

/**
 * @param {{ relayServer: string, sessionId: string, desktopToken: string, after?: number, timeoutMs?: number }} input
 */
export async function pollRelayCommands(input) {
  return await getJson(input.relayServer, `/v1/sessions/${encodeURIComponent(input.sessionId)}/commands/poll`, {
    desktopToken: input.desktopToken,
    after: input.after,
    timeoutMs: input.timeoutMs,
  });
}

/**
 * @param {{ relayServer: string, sessionId: string, mobileToken: string, after?: number }} input
 */
export async function readRelayEvents(input) {
  return await getJson(input.relayServer, `/v1/sessions/${encodeURIComponent(input.sessionId)}/events`, {
    mobileToken: input.mobileToken,
    after: input.after,
  });
}

/**
 * @param {{ relayServer: string, sessionId: string, mobileToken: string, type: string, payload?: Record<string, unknown>, idempotencyKey?: string }} input
 */
export async function sendRelayCommand(input) {
  return await postJson(input.relayServer, `/v1/sessions/${encodeURIComponent(input.sessionId)}/commands`, {
    mobileToken: input.mobileToken,
    type: input.type,
    payload: input.payload ?? {},
    idempotencyKey: input.idempotencyKey,
  });
}

/**
 * @param {{ relayServer: string, sessionId: string, token: string, reason?: string }} input
 */
export async function revokeRelaySession(input) {
  return await postJson(input.relayServer, `/v1/sessions/${encodeURIComponent(input.sessionId)}/revoke`, {
    token: input.token,
    reason: input.reason,
  });
}

/**
 * @param {{ relayServer: string, sessionId: string, mobileToken: string, after?: number }} input
 */
export async function readRelayNotifications(input) {
  return await getJson(input.relayServer, `/v1/sessions/${encodeURIComponent(input.sessionId)}/notifications`, {
    mobileToken: input.mobileToken,
    after: input.after,
  });
}