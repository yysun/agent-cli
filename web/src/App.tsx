/**
 * Agent CLI Relay Web App
 *
 * Purpose:
 * - Provide a browser UI to pair with the local relay and drive a long-running --remote CLI session.
 *
 * Key features:
 * - Supports pairing from the CLI-provided client connection URL.
 * - Streams relay events, surfaces notifications, and sends remote commands.
 * - Lets users approve/reject tool requests, send messages, and cancel/resume/disconnect runs.
 *
 * Recent changes:
 * - 2026-05-11: Added initial relay-connected React control surface.
 * - 2026-05-11: Migrated app to TypeScript.
 */
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import {
  createEventStream,
  parseClientConnectionUrl,
  pairSession,
  readEventBacklog,
  readNotifications,
  revokeSession,
  sendCommand,
  type RelayEvent,
  type RelayNotification,
  type RelayPayload,
} from './relay-api';

type ApprovalEntry = {
  approvalId: string;
  toolName: string;
  argumentSummary: RelayPayload;
  createdAt: string;
};

function makeIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatTimestamp(value: string | undefined): string {
  if (!value) {
    return '--';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return date.toLocaleString();
}

function describeEvent(event: RelayEvent): string {
  const payload = event.payload ?? {};

  if (event.type === 'assistant_output') {
    return String(payload.text ?? '').trim();
  }

  if (event.type === 'run_status') {
    return `status: ${String(payload.status ?? 'unknown')}`;
  }

  if (event.type === 'tool_approval_request') {
    return `approvalId: ${String(payload.approvalId ?? 'unknown')}`;
  }

  if (event.type === 'failure') {
    return String(payload.message ?? 'run failed');
  }

  if (event.type === 'completion') {
    return String(payload.text ?? 'completed');
  }

  if (event.type === 'disconnect') {
    return `reason: ${String(payload.reason ?? 'disconnect')}`;
  }

  return JSON.stringify(payload);
}

export default function App() {
  const [connectionUrlInput, setConnectionUrlInput] = useState<string>('');
  const [relayServer, setRelayServer] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');
  const [mobileToken, setMobileToken] = useState<string>('');
  const [mobileName, setMobileName] = useState<string>('web-supervisor');
  const [events, setEvents] = useState<RelayEvent[]>([]);
  const [notifications, setNotifications] = useState<RelayNotification[]>([]);
  const [messageInput, setMessageInput] = useState<string>('');
  const [statusText, setStatusText] = useState<string>('Paste the client connection URL from agent-cli --remote.');
  const [errorText, setErrorText] = useState<string>('');
  const [connecting, setConnecting] = useState<boolean>(false);
  const [sendingMessage, setSendingMessage] = useState<boolean>(false);
  const [refreshingNotifications, setRefreshingNotifications] = useState<boolean>(false);

  const eventCursorRef = useRef<number>(0);
  const notificationCursorRef = useRef<number>(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  const pendingApprovals = useMemo<ApprovalEntry[]>(() => {
    const approvalMap = new Map<string, ApprovalEntry>();

    for (const event of events) {
      if (event.type !== 'tool_approval_request') {
        continue;
      }

      const approvalId = String(event.payload?.approvalId ?? '');

      if (!approvalId) {
        continue;
      }

      approvalMap.set(approvalId, {
        approvalId,
        toolName: String(event.payload?.toolName ?? 'unknown_tool'),
        argumentSummary: (event.payload?.argumentSummary as RelayPayload | undefined) ?? {},
        createdAt: event.createdAt,
      });
    }

    return [...approvalMap.values()];
  }, [events]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  async function refreshNotificationList(): Promise<void> {
    if (!relayServer || !sessionId || !mobileToken) {
      return;
    }

    setRefreshingNotifications(true);

    try {
      const result = await readNotifications({
        relayServer,
        sessionId,
        mobileToken,
        after: notificationCursorRef.current,
      });

      notificationCursorRef.current = Number(result.cursor ?? notificationCursorRef.current);
      setNotifications((previous) => [...previous, ...(result.notifications ?? [])].slice(-100));
    } catch (error) {
      setErrorText(`Notification read failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRefreshingNotifications(false);
    }
  }

  async function connectFromClientUrl(): Promise<void> {
    setErrorText('');
    setConnecting(true);

    try {
      const parsed = parseClientConnectionUrl(connectionUrlInput);
      setRelayServer(parsed.relayServer);
      setSessionId(parsed.sessionId);

      const pairResult = await pairSession({
        relayServer: parsed.relayServer,
        sessionId: parsed.sessionId,
        pairingToken: parsed.pairingToken,
        mobileName,
      });

      setMobileToken(String(pairResult.mobileToken ?? ''));
      setStatusText(`Paired. Session expires at ${formatTimestamp(pairResult.expiresAt)}.`);

      const backlog = await readEventBacklog({
        relayServer: parsed.relayServer,
        sessionId: parsed.sessionId,
        mobileToken: String(pairResult.mobileToken ?? ''),
        after: 0,
      });

      eventCursorRef.current = Number(backlog.cursor ?? 0);
      notificationCursorRef.current = 0;
      setEvents(backlog.events ?? []);
      setNotifications([]);

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const eventSource = createEventStream({
        relayServer: parsed.relayServer,
        sessionId: parsed.sessionId,
        mobileToken: String(pairResult.mobileToken ?? ''),
        after: eventCursorRef.current,
      });

      eventSource.addEventListener('remote', (eventMessage: Event) => {
        try {
          const messageEvent = eventMessage as MessageEvent<string>;
          const parsedEvent = JSON.parse(messageEvent.data) as RelayEvent;
          eventCursorRef.current = Math.max(eventCursorRef.current, Number(parsedEvent.sequence) || 0);
          setEvents((previous) => [...previous, parsedEvent].slice(-250));
        } catch {
          setErrorText('Failed to parse incoming relay event.');
        }
      });

      eventSource.onerror = () => {
        setStatusText('Event stream disconnected. Reconnect using the same URL if needed.');
      };

      eventSourceRef.current = eventSource;
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setConnecting(false);
    }
  }

  async function postCommand(type: string, payload: RelayPayload = {}): Promise<void> {
    if (!relayServer || !sessionId || !mobileToken) {
      setErrorText('Pair first before sending commands.');
      return;
    }

    await sendCommand({
      relayServer,
      sessionId,
      mobileToken,
      type,
      payload,
      idempotencyKey: makeIdempotencyKey(type),
    });
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const text = messageInput.trim();

    if (!text) {
      return;
    }

    setSendingMessage(true);
    setErrorText('');

    try {
      await postCommand('user_message', { text });
      setMessageInput('');
      setStatusText('Message sent to local host.');
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setSendingMessage(false);
    }
  }

  async function sendApprovalDecision(approvalId: string, approved: boolean): Promise<void> {
    setErrorText('');

    try {
      await postCommand('approval_decision', {
        approvalId,
        approved,
        reason: approved ? 'approved from web ui' : 'rejected from web ui',
      });
      setStatusText(`Sent ${approved ? 'approve' : 'reject'} for ${approvalId}.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    }
  }

  async function disconnectSession(): Promise<void> {
    if (!relayServer || !sessionId || !mobileToken) {
      return;
    }

    setErrorText('');

    try {
      await revokeSession({
        relayServer,
        sessionId,
        token: mobileToken,
        reason: 'web_disconnect',
      });
      setStatusText('Session revoked from web UI.');
      eventSourceRef.current?.close();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    if (!mobileToken) {
      return;
    }

    const timer = setInterval(() => {
      void refreshNotificationList();
    }, 10000);

    return () => clearInterval(timer);
  }, [mobileToken, relayServer, sessionId]);

  return (
    <div className="app-shell">
      <header className="hero">
        <p className="eyebrow">Agent CLI Remote Supervision</p>
        <h1>Relay Command Deck</h1>
        <p className="subtitle">Pair this page with a long-running local <code>agent-cli --remote</code> session and supervise it in real time.</p>
      </header>

      <section className="panel pair-panel">
        <h2>Pair Session</h2>
        <label htmlFor="connection-url">Client connection URL</label>
        <input
          id="connection-url"
          type="text"
          value={connectionUrlInput}
          onChange={(event) => setConnectionUrlInput(event.target.value)}
          placeholder="http://127.0.0.1:8787/pair?sessionId=...&pairingToken=..."
        />

        <label htmlFor="mobile-name">Supervisor name</label>
        <input
          id="mobile-name"
          type="text"
          value={mobileName}
          onChange={(event) => setMobileName(event.target.value)}
          placeholder="web-supervisor"
        />

        <button type="button" onClick={() => void connectFromClientUrl()} disabled={connecting}>
          {connecting ? 'Pairing...' : 'Pair And Connect'}
        </button>

        <p className="status">{statusText}</p>
        {errorText ? <p className="error">{errorText}</p> : null}
      </section>

      <section className="panel command-panel">
        <h2>Commands</h2>
        <form onSubmit={(event) => void submitMessage(event)}>
          <textarea
            value={messageInput}
            onChange={(event) => setMessageInput(event.target.value)}
            rows={3}
            placeholder="Send a follow-up user message"
          />
          <button type="submit" disabled={sendingMessage || !mobileToken}>
            {sendingMessage ? 'Sending...' : 'Send User Message'}
          </button>
        </form>

        <div className="command-actions">
          <button type="button" onClick={() => void postCommand('cancel')} disabled={!mobileToken}>Cancel Run</button>
          <button type="button" onClick={() => void postCommand('resume')} disabled={!mobileToken}>Resume Waiting Host</button>
          <button type="button" onClick={() => void disconnectSession()} disabled={!mobileToken}>Disconnect Session</button>
        </div>
      </section>

      <section className="panel approvals-panel">
        <h2>Approvals</h2>
        {pendingApprovals.length === 0 ? <p className="muted">No pending approvals.</p> : null}
        {pendingApprovals.map((entry) => (
          <article key={entry.approvalId} className="approval-card">
            <h3>{entry.toolName}</h3>
            <p className="mono">{entry.approvalId}</p>
            <p>{formatTimestamp(entry.createdAt)}</p>
            <pre>{JSON.stringify(entry.argumentSummary, null, 2)}</pre>
            <div className="approval-actions">
              <button type="button" onClick={() => void sendApprovalDecision(entry.approvalId, true)}>Approve</button>
              <button type="button" className="ghost" onClick={() => void sendApprovalDecision(entry.approvalId, false)}>Reject</button>
            </div>
          </article>
        ))}
      </section>

      <section className="panel events-panel">
        <h2>Events</h2>
        <ul className="event-list">
          {[...events].reverse().map((event) => (
            <li key={`${event.sequence}-${event.type}`}>
              <p className="mono">#{event.sequence} {event.type}</p>
              <p>{describeEvent(event)}</p>
              <p className="muted">{formatTimestamp(event.createdAt)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel notifications-panel">
        <h2>Notifications</h2>
        <button type="button" onClick={() => void refreshNotificationList()} disabled={!mobileToken || refreshingNotifications}>
          {refreshingNotifications ? 'Refreshing...' : 'Refresh Notifications'}
        </button>
        <ul className="notification-list">
          {[...notifications].reverse().map((notification) => (
            <li key={`${notification.sequence}-${notification.level}`}>
              <p className="mono">#{notification.sequence} {notification.level}</p>
              <p>{notification.title}: {notification.body}</p>
              <p className="muted">{formatTimestamp(notification.createdAt)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
