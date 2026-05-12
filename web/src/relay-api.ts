/**
 * Agent CLI Relay Web API Helpers
 *
 * Purpose:
 * - Provide browser-safe relay API helpers for pairing, streaming, and commands.
 *
 * Key features:
 * - Parses the CLI-provided connection URL into relay/session/pairing credentials.
 * - Offers typed helpers for pair, event backlog, commands, notifications, and revoke.
 *
 * Recent changes:
 * - 2026-05-11: Added initial web relay API wrapper for remote-control UI.
 * - 2026-05-11: Migrated helpers to TypeScript with typed relay contracts.
 */
export type RelayPayload = Record<string, unknown>;

export type RelayEvent = {
  sequence: number;
  type: string;
  createdAt: string;
  payload?: RelayPayload;
};

export type RelayNotification = {
  sequence: number;
  createdAt: string;
  level: string;
  title: string;
  body: string;
  eventSequence?: number;
};

export type ParsedClientConnection = {
  relayServer: string;
  sessionId: string;
  pairingToken: string;
};

export type PairSessionResult = {
  sessionId: string;
  mobileToken: string;
  expiresAt: string;
  pairedAt?: string;
  chatId?: string;
  mobileName?: string;
};

export type EventBacklogResult = {
  events: RelayEvent[];
  cursor: number;
};

export type NotificationResult = {
  notifications: RelayNotification[];
  cursor: number;
};

type RelayCommandResult = {
  accepted: boolean;
  sequence: number;
  duplicate?: boolean;
};

type RelayRevokeResult = {
  revoked: boolean;
  sessionId: string;
  reason: string;
  revokedAt: string;
};

function normalizeBaseUrl(rawUrl: string): string {
  const trimmed = String(rawUrl ?? '').trim();

  if (!trimmed) {
    throw new Error('Relay server URL is required.');
  }

  const url = new URL(trimmed);

  if (!/^https?:$/.test(url.protocol)) {
    throw new Error(`Unsupported protocol: ${url.protocol}`);
  }

  return url.toString().replace(/\/$/, '');
}

function getBrowserBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return 'http://127.0.0.1';
}

function toClientConnectionUrl(rawUrl: string): URL {
  const trimmed = String(rawUrl ?? '').trim();

  if (!trimmed) {
    throw new Error('Connection URL is required.');
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return new URL(trimmed);
  }

  if (trimmed.startsWith('/')) {
    return new URL(trimmed, getBrowserBaseUrl());
  }

  const queryText = trimmed.replace(/^\?/, '');
  const queryParams = new URLSearchParams(queryText);

  if (queryParams.has('sessionId') || queryParams.has('pairingToken')) {
    return new URL(`/pair?${queryParams.toString()}`, getBrowserBaseUrl());
  }

  return new URL(trimmed);
}

export function parseClientConnectionUrl(rawUrl: string): ParsedClientConnection {
  const url = toClientConnectionUrl(rawUrl);
  const sessionId = url.searchParams.get('sessionId') ?? '';
  const pairingToken = url.searchParams.get('pairingToken') ?? '';

  if (!sessionId || !pairingToken) {
    throw new Error('Connection URL must include sessionId and pairingToken.');
  }

  return {
    relayServer: normalizeBaseUrl(`${url.protocol}//${url.host}`),
    sessionId,
    pairingToken,
  };
}

async function readJson<T>(response: Response): Promise<T> {
  const rawText = await response.text();
  const parsed = rawText.trim() ? JSON.parse(rawText) : {};

  if (!response.ok) {
    throw new Error(String(parsed.error ?? response.statusText));
  }

  return parsed as T;
}

function buildRelayUrl(
  relayServer: string,
  pathname: string,
  query: Record<string, string | number | undefined> = {},
): string {
  const url = new URL(pathname, `${normalizeBaseUrl(relayServer)}/`);

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

export async function pairSession({
  relayServer,
  sessionId,
  pairingToken,
  mobileName,
}: {
  relayServer: string;
  sessionId: string;
  pairingToken: string;
  mobileName?: string;
}): Promise<PairSessionResult> {
  const response = await fetch(buildRelayUrl(relayServer, `/v1/sessions/${encodeURIComponent(sessionId)}/pair`), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      pairingToken,
      mobileName,
    }),
  });

  return await readJson<PairSessionResult>(response);
}

export async function readEventBacklog({
  relayServer,
  sessionId,
  mobileToken,
  after,
}: {
  relayServer: string;
  sessionId: string;
  mobileToken: string;
  after: number;
}): Promise<EventBacklogResult> {
  const response = await fetch(buildRelayUrl(relayServer, `/v1/sessions/${encodeURIComponent(sessionId)}/events`, {
    mobileToken,
    after,
  }));

  return await readJson<EventBacklogResult>(response);
}

export async function readNotifications({
  relayServer,
  sessionId,
  mobileToken,
  after,
}: {
  relayServer: string;
  sessionId: string;
  mobileToken: string;
  after: number;
}): Promise<NotificationResult> {
  const response = await fetch(buildRelayUrl(relayServer, `/v1/sessions/${encodeURIComponent(sessionId)}/notifications`, {
    mobileToken,
    after,
  }));

  return await readJson<NotificationResult>(response);
}

export async function sendCommand({
  relayServer,
  sessionId,
  mobileToken,
  type,
  payload,
  idempotencyKey,
}: {
  relayServer: string;
  sessionId: string;
  mobileToken: string;
  type: string;
  payload?: RelayPayload;
  idempotencyKey?: string;
}): Promise<RelayCommandResult> {
  const response = await fetch(buildRelayUrl(relayServer, `/v1/sessions/${encodeURIComponent(sessionId)}/commands`), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      mobileToken,
      type,
      payload: payload ?? {},
      idempotencyKey,
    }),
  });

  return await readJson<RelayCommandResult>(response);
}

export async function revokeSession({
  relayServer,
  sessionId,
  token,
  reason,
}: {
  relayServer: string;
  sessionId: string;
  token: string;
  reason?: string;
}): Promise<RelayRevokeResult> {
  const response = await fetch(buildRelayUrl(relayServer, `/v1/sessions/${encodeURIComponent(sessionId)}/revoke`), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      token,
      reason,
    }),
  });

  return await readJson<RelayRevokeResult>(response);
}

export function createEventStream({
  relayServer,
  sessionId,
  mobileToken,
  after,
}: {
  relayServer: string;
  sessionId: string;
  mobileToken: string;
  after: number;
}): EventSource {
  return new EventSource(buildRelayUrl(relayServer, `/v1/sessions/${encodeURIComponent(sessionId)}/events`, {
    mobileToken,
    after,
  }));
}
