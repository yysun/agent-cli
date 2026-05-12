/**
 * Agent CLI Relay Web App
 *
 * Purpose:
 * - Provide a browser UI to pair with the local relay and drive a long-running --remote CLI session.
 *
 * Key features:
 * - Reads relay invite details from the current /pair URL when available.
 * - Streams relay events into a chat-first transcript with inline approval handling.
 * - Sends remote messages, run controls, and disconnect requests for the active session.
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

type OutboundMessage = {
  id: string;
  text: string;
  createdAt: string;
  status: 'sending' | 'sent' | 'failed';
  errorText?: string;
};

type ChatEntry =
  | {
    id: string;
    kind: 'message';
    role: 'assistant' | 'user' | 'system';
    text: string;
    createdAt: string;
    meta?: string;
    tone?: 'error' | 'muted';
  }
  | {
    id: string;
    kind: 'approval';
    createdAt: string;
    approval: ApprovalEntry;
    decision?: boolean;
  };

type InitialConnectionDraft = {
  connectionUrlInput: string;
  relayServer: string;
  sessionId: string;
  pairingToken: string;
  statusText: string;
  inviteDetected: boolean;
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

function toSortValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatRunStatus(status: string): string | null {
  switch (status) {
    case 'remote_session_started':
      return 'Remote session is ready.';
    case 'waiting_for_input':
      return 'Waiting for the next message.';
    case 'started':
      return 'Local host started a run.';
    case 'cancel_requested':
      return 'Cancellation requested.';
    case 'cancelled':
      return 'Run cancelled.';
    case 'failed':
      return 'Run failed.';
    case 'completed':
      return null;
    default:
      return `Status: ${status}`;
  }
}

function readInitialConnectionDraft(): InitialConnectionDraft {
  if (typeof window === 'undefined') {
    return {
      connectionUrlInput: '',
      relayServer: '',
      sessionId: '',
      pairingToken: '',
      statusText: 'Open a relay invite or paste a client connection URL to begin.',
      inviteDetected: false,
    };
  }

  try {
    const parsed = parseClientConnectionUrl(window.location.href);

    return {
      connectionUrlInput: window.location.href,
      relayServer: parsed.relayServer,
      sessionId: parsed.sessionId,
      pairingToken: parsed.pairingToken,
      statusText: 'Invite detected. Review the session details and connect.',
      inviteDetected: true,
    };
  } catch {
    return {
      connectionUrlInput: '',
      relayServer: window.location.origin,
      sessionId: '',
      pairingToken: '',
      statusText: 'Open a relay invite or paste a client connection URL to begin.',
      inviteDetected: false,
    };
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function App() {
  const initialDraft = useMemo(() => readInitialConnectionDraft(), []);

  const [connectionUrlInput, setConnectionUrlInput] = useState<string>(initialDraft.connectionUrlInput);
  const [relayServer, setRelayServer] = useState<string>(initialDraft.relayServer);
  const [sessionId, setSessionId] = useState<string>(initialDraft.sessionId);
  const [pairingToken, setPairingToken] = useState<string>(initialDraft.pairingToken);
  const [mobileToken, setMobileToken] = useState<string>('');
  const [mobileName, setMobileName] = useState<string>('web-supervisor');
  const [events, setEvents] = useState<RelayEvent[]>([]);
  const [notifications, setNotifications] = useState<RelayNotification[]>([]);
  const [outboundMessages, setOutboundMessages] = useState<OutboundMessage[]>([]);
  const [approvalDecisions, setApprovalDecisions] = useState<Record<string, boolean>>({});
  const [messageInput, setMessageInput] = useState<string>('');
  const [statusText, setStatusText] = useState<string>(initialDraft.statusText);
  const [connectErrorText, setConnectErrorText] = useState<string>('');
  const [actionErrorText, setActionErrorText] = useState<string>('');
  const [connecting, setConnecting] = useState<boolean>(false);
  const [sendingMessage, setSendingMessage] = useState<boolean>(false);
  const [refreshingNotifications, setRefreshingNotifications] = useState<boolean>(false);

  const eventCursorRef = useRef<number>(0);
  const notificationCursorRef = useRef<number>(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const pendingApprovals = useMemo<ApprovalEntry[]>(() => {
    const approvalMap = new Map<string, ApprovalEntry>();

    for (const event of events) {
      if (event.type !== 'tool_approval_request') {
        continue;
      }

      const approvalId = String(event.payload?.approvalId ?? '');

      if (!approvalId || approvalId in approvalDecisions) {
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
  }, [approvalDecisions, events]);

  const chatEntries = useMemo<ChatEntry[]>(() => {
    const derived: ChatEntry[] = [];
    let assistantText = '';
    let assistantCreatedAt = '';
    let assistantSequence = 0;

    function flushAssistantChunk(): void {
      const text = assistantText.trim();

      if (!text) {
        assistantText = '';
        assistantCreatedAt = '';
        assistantSequence = 0;
        return;
      }

      derived.push({
        id: `assistant-stream-${assistantSequence}`,
        kind: 'message',
        role: 'assistant',
        text,
        createdAt: assistantCreatedAt,
        meta: 'Streaming…',
      });

      assistantText = '';
      assistantCreatedAt = '';
      assistantSequence = 0;
    }

    for (const event of events) {
      if (event.type === 'assistant_output') {
        const chunkText = String(event.payload?.text ?? '');

        if (!chunkText) {
          continue;
        }

        if (!assistantText) {
          assistantCreatedAt = event.createdAt;
          assistantSequence = event.sequence;
        }

        assistantText += chunkText;
        continue;
      }

      if (event.type === 'completion') {
        const completedText = String(event.payload?.text ?? '').trim();

        if (completedText) {
          derived.push({
            id: `event-${event.sequence}`,
            kind: 'message',
            role: 'assistant',
            text: completedText,
            createdAt: event.createdAt,
          });
        } else {
          flushAssistantChunk();
        }

        assistantText = '';
        assistantCreatedAt = '';
        assistantSequence = 0;
        continue;
      }

      if (event.type === 'tool_approval_request') {
        flushAssistantChunk();

        const approvalId = String(event.payload?.approvalId ?? '');

        if (!approvalId) {
          continue;
        }

        derived.push({
          id: `approval-${approvalId}`,
          kind: 'approval',
          createdAt: event.createdAt,
          approval: {
            approvalId,
            toolName: String(event.payload?.toolName ?? 'unknown_tool'),
            argumentSummary: (event.payload?.argumentSummary as RelayPayload | undefined) ?? {},
            createdAt: event.createdAt,
          },
          decision: approvalDecisions[approvalId],
        });
        continue;
      }

      flushAssistantChunk();

      if (event.type === 'run_status') {
        const status = formatRunStatus(String(event.payload?.status ?? 'unknown'));

        if (!status) {
          continue;
        }

        derived.push({
          id: `event-${event.sequence}`,
          kind: 'message',
          role: 'system',
          text: status,
          createdAt: event.createdAt,
          tone: 'muted',
        });
        continue;
      }

      if (event.type === 'failure') {
        derived.push({
          id: `event-${event.sequence}`,
          kind: 'message',
          role: 'system',
          text: String(event.payload?.message ?? 'Run failed.'),
          createdAt: event.createdAt,
          tone: 'error',
        });
        continue;
      }

      if (event.type === 'disconnect') {
        derived.push({
          id: `event-${event.sequence}`,
          kind: 'message',
          role: 'system',
          text: `Disconnected: ${String(event.payload?.reason ?? 'unknown reason')}`,
          createdAt: event.createdAt,
          tone: 'error',
        });
      }
    }

    flushAssistantChunk();

    for (const message of outboundMessages) {
      derived.push({
        id: message.id,
        kind: 'message',
        role: 'user',
        text: message.text,
        createdAt: message.createdAt,
        meta: message.status === 'sending'
          ? 'Sending…'
          : message.status === 'failed'
            ? `Failed: ${message.errorText ?? 'Unknown error'}`
            : 'Sent',
        tone: message.status === 'failed' ? 'error' : undefined,
      });
    }

    return derived.sort((left, right) => {
      const sortDelta = toSortValue(left.createdAt) - toSortValue(right.createdAt);

      if (sortDelta !== 0) {
        return sortDelta;
      }

      return left.id.localeCompare(right.id);
    });
  }, [approvalDecisions, events, outboundMessages]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ block: 'end' });
  }, [chatEntries.length]);

  useEffect(() => {
    if (!mobileToken) {
      return;
    }

    const timer = setInterval(() => {
      void refreshNotificationList();
    }, 10000);

    return () => clearInterval(timer);
  }, [mobileToken, relayServer, sessionId]);

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
      setActionErrorText('');
    } catch (error) {
      setActionErrorText(`Notification read failed: ${getErrorMessage(error)}`);
    } finally {
      setRefreshingNotifications(false);
    }
  }

  function applyConnectionUrl(): boolean {
    setConnectErrorText('');

    try {
      const parsed = parseClientConnectionUrl(connectionUrlInput);
      setRelayServer(parsed.relayServer);
      setSessionId(parsed.sessionId);
      setPairingToken(parsed.pairingToken);
      setStatusText('Invite imported. Connect when ready.');
      return true;
    } catch (error) {
      setConnectErrorText(`Invite import failed: ${getErrorMessage(error)}`);
      return false;
    }
  }

  async function connectSession(): Promise<void> {
    setConnectErrorText('');
    setActionErrorText('');
    setConnecting(true);

    eventSourceRef.current?.close();
    eventSourceRef.current = null;

    try {
      let nextRelayServer = relayServer.trim();
      let nextSessionId = sessionId.trim();
      let nextPairingToken = pairingToken.trim();

      if ((!nextRelayServer || !nextSessionId || !nextPairingToken) && connectionUrlInput.trim()) {
        const didImport = applyConnectionUrl();

        if (!didImport) {
          return;
        }

        const parsed = parseClientConnectionUrl(connectionUrlInput);
        nextRelayServer = parsed.relayServer;
        nextSessionId = parsed.sessionId;
        nextPairingToken = parsed.pairingToken;
      }

      if (!nextRelayServer || !nextSessionId || !nextPairingToken) {
        throw new Error('Relay server, session ID, and pairing token are required to connect.');
      }

      const pairResult = await pairSession({
        relayServer: nextRelayServer,
        sessionId: nextSessionId,
        pairingToken: nextPairingToken,
        mobileName,
      });

      const nextMobileToken = String(pairResult.mobileToken ?? '');

      if (!nextMobileToken) {
        throw new Error('Relay pairing succeeded without a mobile token.');
      }

      const backlog = await readEventBacklog({
        relayServer: nextRelayServer,
        sessionId: nextSessionId,
        mobileToken: nextMobileToken,
        after: 0,
      });

      const initialNotifications = await readNotifications({
        relayServer: nextRelayServer,
        sessionId: nextSessionId,
        mobileToken: nextMobileToken,
        after: 0,
      });

      setRelayServer(nextRelayServer);
      setSessionId(nextSessionId);
      setPairingToken(nextPairingToken);
      setMobileToken(nextMobileToken);
      setStatusText(`Connected to session ${nextSessionId}. Expires ${formatTimestamp(pairResult.expiresAt)}.`);
      setEvents(backlog.events ?? []);
      setNotifications(initialNotifications.notifications ?? []);
      setOutboundMessages([]);
      setApprovalDecisions({});

      eventCursorRef.current = Number(backlog.cursor ?? 0);
      notificationCursorRef.current = Number(initialNotifications.cursor ?? 0);

      const eventSource = createEventStream({
        relayServer: nextRelayServer,
        sessionId: nextSessionId,
        mobileToken: nextMobileToken,
        after: eventCursorRef.current,
      });

      eventSource.addEventListener('remote', (eventMessage: Event) => {
        try {
          const messageEvent = eventMessage as MessageEvent<string>;
          const parsedEvent = JSON.parse(messageEvent.data) as RelayEvent;
          eventCursorRef.current = Math.max(eventCursorRef.current, Number(parsedEvent.sequence) || 0);
          setEvents((previous) => [...previous, parsedEvent].slice(-250));
        } catch {
          setActionErrorText('Failed to parse an incoming relay event.');
        }
      });

      eventSource.onerror = () => {
        setStatusText('Live stream interrupted. Retry connect to resubscribe.');
        setConnectErrorText('Connection failed: the live relay stream disconnected.');
      };

      eventSourceRef.current = eventSource;
    } catch (error) {
      setMobileToken('');
      setStatusText('Connection failed. Review the session details and retry.');
      setConnectErrorText(`Connection failed: ${getErrorMessage(error)}`);
    } finally {
      setConnecting(false);
    }
  }

  async function postCommand(type: string, payload: RelayPayload = {}): Promise<void> {
    if (!relayServer || !sessionId || !mobileToken) {
      setActionErrorText('Connect first before sending commands.');
      throw new Error('Connect first before sending commands.');
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

    const messageId = makeIdempotencyKey('message');
    const createdAt = new Date().toISOString();
    const nextOutboundMessage: OutboundMessage = {
      id: messageId,
      text,
      createdAt,
      status: 'sending',
    };

    setSendingMessage(true);
    setActionErrorText('');
    setOutboundMessages((previous) => [...previous, nextOutboundMessage].slice(-100));

    try {
      await postCommand('user_message', { text });
      setOutboundMessages((previous) => previous.map((message) => (
        message.id === messageId
          ? { ...message, status: 'sent' }
          : message
      )));
      setMessageInput('');
      setStatusText('Message sent to the local host.');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      setOutboundMessages((previous) => previous.map((message) => (
        message.id === messageId
          ? { ...message, status: 'failed', errorText: errorMessage }
          : message
      )));
      setActionErrorText(`Message send failed: ${errorMessage}`);
    } finally {
      setSendingMessage(false);
    }
  }

  async function sendApprovalDecision(approvalId: string, approved: boolean): Promise<void> {
    setActionErrorText('');

    try {
      await postCommand('approval_decision', {
        approvalId,
        approved,
        reason: approved ? 'approved from web ui' : 'rejected from web ui',
      });
      setApprovalDecisions((previous) => ({
        ...previous,
        [approvalId]: approved,
      }));
      setStatusText(`Sent ${approved ? 'approve' : 'reject'} for ${approvalId}.`);
    } catch (error) {
      setActionErrorText(`Approval send failed: ${getErrorMessage(error)}`);
    }
  }

  async function disconnectSession(): Promise<void> {
    if (!relayServer || !sessionId || !mobileToken) {
      return;
    }

    setActionErrorText('');
    setConnectErrorText('');

    try {
      await revokeSession({
        relayServer,
        sessionId,
        token: mobileToken,
        reason: 'web_disconnect',
      });
      setMobileToken('');
      setStatusText('Session disconnected from the web UI.');
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    } catch (error) {
      setActionErrorText(`Disconnect failed: ${getErrorMessage(error)}`);
    }
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Agent CLI Remote Chat</p>
          <h1>Run the remote session like a conversation.</h1>
          <p className="subtitle">
            Open the relay invite link or paste it below. The homepage reads the session details, connects to the relay,
            and turns live output, approvals, and state changes into a chat transcript.
          </p>
        </div>

        <div className="hero-stats">
          <article className="hero-stat">
            <span>Session</span>
            <strong>{sessionId || 'Waiting for invite'}</strong>
          </article>
          <article className="hero-stat">
            <span>Relay</span>
            <strong>{relayServer || 'Not set'}</strong>
          </article>
          <article className="hero-stat">
            <span>Pending approvals</span>
            <strong>{pendingApprovals.length}</strong>
          </article>
        </div>
      </header>

      <section className="panel chat-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">Home</p>
            <h2>Remote Chat</h2>
          </div>
          <span className={`connection-pill ${mobileToken ? 'connected' : 'idle'}`}>
            {mobileToken ? 'Connected' : 'Not connected'}
          </span>
        </div>

        <p className="status-banner">{statusText}</p>

        <div className="chat-thread">
          {chatEntries.length === 0 ? (
            <div className="empty-state">
              <h3>Connect to start the conversation</h3>
              <p>
                The transcript appears here after you join a relay session. Assistant output streams in live, and approval
                requests appear inline where they block the run.
              </p>
            </div>
          ) : null}

          {chatEntries.map((entry) => {
            if (entry.kind === 'approval') {
              const decisionLabel = entry.decision === undefined
                ? 'Waiting for review'
                : entry.decision
                  ? 'Approved'
                  : 'Rejected';

              return (
                <article key={entry.id} className="approval-card inline-approval">
                  <div className="bubble-meta">
                    <span>Approval request</span>
                    <span>{formatTimestamp(entry.createdAt)}</span>
                  </div>
                  <h3>{entry.approval.toolName}</h3>
                  <p className="mono">{entry.approval.approvalId}</p>
                  <pre>{JSON.stringify(entry.approval.argumentSummary, null, 2)}</pre>
                  <div className="approval-actions">
                    <span className={`approval-state ${entry.decision === undefined ? 'pending' : entry.decision ? 'approved' : 'rejected'}`}>
                      {decisionLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() => void sendApprovalDecision(entry.approval.approvalId, true)}
                      disabled={!mobileToken || entry.decision !== undefined}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => void sendApprovalDecision(entry.approval.approvalId, false)}
                      disabled={!mobileToken || entry.decision !== undefined}
                    >
                      Reject
                    </button>
                  </div>
                </article>
              );
            }

            return (
              <article
                key={entry.id}
                className={`chat-bubble ${entry.role}${entry.tone === 'error' ? ' is-error' : ''}${entry.tone === 'muted' ? ' is-muted' : ''}`}
              >
                <div className="bubble-meta">
                  <span>{entry.role === 'assistant' ? 'Assistant' : entry.role === 'user' ? 'You' : 'Relay'}</span>
                  <span>{formatTimestamp(entry.createdAt)}</span>
                </div>
                <p>{entry.text}</p>
                {entry.meta ? <p className="bubble-footnote">{entry.meta}</p> : null}
              </article>
            );
          })}

          <div ref={transcriptEndRef} />
        </div>

        <form className="composer" onSubmit={(event) => void submitMessage(event)}>
          <label htmlFor="message-input">Message</label>
          <textarea
            id="message-input"
            value={messageInput}
            onChange={(event) => setMessageInput(event.target.value)}
            rows={4}
            placeholder={mobileToken ? 'Send the next user turn to the local host' : 'Connect to a live session to send messages'}
            disabled={!mobileToken}
          />

          {actionErrorText ? <p className="error">{actionErrorText}</p> : null}

          <div className="composer-actions">
            <p className="muted">Messages route through the relay. The local machine still runs tools, reads files, and holds secrets.</p>
            <button type="submit" disabled={sendingMessage || !mobileToken}>
              {sendingMessage ? 'Sending...' : 'Send Message'}
            </button>
          </div>
        </form>
      </section>

      <aside className="sidebar">
        <section className="panel connect-panel">
          <div className="panel-heading compact">
            <div>
              <p className="panel-kicker">Connect</p>
              <h2>Session Details</h2>
            </div>
            {initialDraft.inviteDetected ? <span className="mini-badge">Invite link detected</span> : null}
          </div>

          <label htmlFor="relay-server">Relay server</label>
          <input
            id="relay-server"
            type="text"
            value={relayServer}
            onChange={(event) => setRelayServer(event.target.value)}
            placeholder="http://127.0.0.1:8787"
          />

          <label htmlFor="session-id">Session ID</label>
          <input
            id="session-id"
            type="text"
            value={sessionId}
            onChange={(event) => setSessionId(event.target.value)}
            placeholder="relay session id"
          />

          <label htmlFor="pairing-token">Pairing token</label>
          <input
            id="pairing-token"
            type="text"
            value={pairingToken}
            onChange={(event) => setPairingToken(event.target.value)}
            placeholder="pairing token"
          />

          <label htmlFor="mobile-name">Supervisor name</label>
          <input
            id="mobile-name"
            type="text"
            value={mobileName}
            onChange={(event) => setMobileName(event.target.value)}
            placeholder="web-supervisor"
          />

          <label htmlFor="connection-url">Client connection URL</label>
          <input
            id="connection-url"
            type="text"
            value={connectionUrlInput}
            onChange={(event) => setConnectionUrlInput(event.target.value)}
            placeholder="http://127.0.0.1:8787/pair?sessionId=...&pairingToken=..."
          />

          <div className="stack-actions">
            <button type="button" className="secondary" onClick={applyConnectionUrl} disabled={!connectionUrlInput.trim() || connecting}>
              Import Invite URL
            </button>
            <button type="button" onClick={() => void connectSession()} disabled={connecting}>
              {connecting ? 'Connecting...' : 'Connect'}
            </button>
          </div>

          {connectErrorText ? <p className="error">{connectErrorText}</p> : null}
        </section>

        <section className="panel controls-panel">
          <div className="panel-heading compact">
            <div>
              <p className="panel-kicker">Session</p>
              <h2>Controls</h2>
            </div>
            <span className="mini-badge">{mobileToken ? 'Live' : 'Idle'}</span>
          </div>

          <div className="control-grid">
            <button type="button" className="secondary" onClick={() => void postCommand('cancel').catch(() => undefined)} disabled={!mobileToken}>
              Cancel Run
            </button>
            <button type="button" className="secondary" onClick={() => void postCommand('resume').catch(() => undefined)} disabled={!mobileToken}>
              Resume Host
            </button>
            <button type="button" className="secondary" onClick={() => void refreshNotificationList()} disabled={!mobileToken || refreshingNotifications}>
              {refreshingNotifications ? 'Refreshing...' : 'Refresh Alerts'}
            </button>
            <button type="button" className="ghost" onClick={() => void disconnectSession()} disabled={!mobileToken}>
              Disconnect
            </button>
          </div>

          <dl className="session-facts">
            <div>
              <dt>Session ID</dt>
              <dd>{sessionId || '--'}</dd>
            </div>
            <div>
              <dt>Supervisor</dt>
              <dd>{mobileName || '--'}</dd>
            </div>
            <div>
              <dt>Pending approvals</dt>
              <dd>{pendingApprovals.length}</dd>
            </div>
          </dl>
        </section>

        <section className="panel activity-panel">
          <div className="panel-heading compact">
            <div>
              <p className="panel-kicker">Activity</p>
              <h2>Notifications</h2>
            </div>
            <span className="mini-badge">{notifications.length}</span>
          </div>

          {notifications.length === 0 ? <p className="muted">No relay notifications yet.</p> : null}

          <ul className="notification-list">
            {[...notifications].reverse().map((notification) => (
              <li key={`${notification.sequence}-${notification.level}`}>
                <p className="mono">#{notification.sequence} {notification.level}</p>
                <p>{notification.title}</p>
                <p className="muted">{notification.body}</p>
                <p className="muted">{formatTimestamp(notification.createdAt)}</p>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
