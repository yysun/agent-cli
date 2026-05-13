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
 *
 * Recent changes:
 * - 2026-05-12: Kept the workspace title static and moved the session label into the subtitle.
 */
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
import {
  buildResumeLocationHref,
  selectStoredRelaySession,
  type StoredRelaySession,
} from './relay-session';

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

const STORED_RELAY_SESSION_KEY = 'agent-cli.relay-web-session';

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

function formatTime(value: string | undefined): string {
  if (!value) {
    return '--';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
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
      return 'Analyzing the latest request.';
    case 'cancel_requested':
      return 'Stop requested from the browser.';
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
      statusText: 'Open a relay invite to begin.',
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
      statusText: 'Invite detected. Connect when ready.',
      inviteDetected: true,
    };
  } catch {
    return {
      connectionUrlInput: '',
      relayServer: window.location.origin,
      sessionId: '',
      pairingToken: '',
      statusText: 'Open a relay invite to begin.',
      inviteDetected: false,
    };
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readStoredRelaySession(): StoredRelaySession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(STORED_RELAY_SESSION_KEY);

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<StoredRelaySession>;

    if (
      typeof parsed.relayServer !== 'string'
      || typeof parsed.sessionId !== 'string'
      || typeof parsed.mobileToken !== 'string'
      || !parsed.relayServer
      || !parsed.sessionId
      || !parsed.mobileToken
    ) {
      return null;
    }

    return {
      relayServer: parsed.relayServer,
      sessionId: parsed.sessionId,
      mobileToken: parsed.mobileToken,
    };
  } catch {
    return null;
  }
}

function writeStoredRelaySession(session: StoredRelaySession): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(STORED_RELAY_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage failures and continue with the live session.
  }
}

function clearStoredRelaySession(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(STORED_RELAY_SESSION_KEY);
  } catch {
    // Ignore storage failures and continue with in-memory state.
  }
}

function isInvalidStoredRelaySession(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();

  return message.includes('invalid mobile token')
    || message.includes('relay session not found')
    || message.includes('invalid relay session token');
}

function buildWorkspaceSubtitle(sessionId: string): string {
  if (!sessionId) {
    return 'Desktop + Web sync';
  }

  return `Session ${sessionId.slice(0, 8)}`;
}

function logRelayMessage(label: string, details: Record<string, unknown>): void {
  console.info(`[relay] ${label}`, details);
}

function logRelayEvent(event: RelayEvent): void {
  if (event.type === 'run_status') {
    const status = formatRunStatus(String(event.payload?.status ?? 'unknown'));

    if (!status) {
      return;
    }

    logRelayMessage('status', {
      status: String(event.payload?.status ?? 'unknown'),
      text: status,
      createdAt: event.createdAt,
      sequence: event.sequence,
    });
    return;
  }

  if (event.type === 'failure') {
    logRelayMessage('failure', {
      message: String(event.payload?.message ?? 'Run failed.'),
      createdAt: event.createdAt,
      sequence: event.sequence,
    });
    return;
  }

  if (event.type === 'disconnect') {
    logRelayMessage('disconnect', {
      reason: String(event.payload?.reason ?? 'unknown reason'),
      createdAt: event.createdAt,
      sequence: event.sequence,
    });
  }
}

function logRelayNotification(notification: RelayNotification): void {
  logRelayMessage('notification', {
    level: notification.level,
    title: notification.title,
    body: notification.body,
    createdAt: notification.createdAt,
    sequence: notification.sequence,
  });
}

function sanitizeConnectedLocation(sessionId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const nextHref = buildResumeLocationHref(window.location.href, sessionId);

    if (nextHref !== window.location.href) {
      window.history.replaceState(null, '', nextHref);
    }
  } catch {
    // Ignore URL rewrite failures and continue with the live session.
  }
}

function renderMessageBody(role: 'assistant' | 'user' | 'system', text: string): JSX.Element {
  if (role !== 'assistant') {
    return <p>{text}</p>;
  }

  return (
    <div className="markdown-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

export default function App() {
  const initialDraft = useMemo(() => readInitialConnectionDraft(), []);
  const availableStoredRelaySession = useMemo(() => readStoredRelaySession(), []);
  const storedRelaySession = useMemo(
    () => selectStoredRelaySession(availableStoredRelaySession, {
      inviteDetected: initialDraft.inviteDetected,
      sessionId: initialDraft.sessionId,
    }),
    [availableStoredRelaySession, initialDraft.inviteDetected, initialDraft.sessionId],
  );

  const [connectionInput, setConnectionInput] = useState<string>(initialDraft.connectionUrlInput);
  const [relayServer, setRelayServer] = useState<string>(storedRelaySession?.relayServer ?? initialDraft.relayServer);
  const [sessionId, setSessionId] = useState<string>(storedRelaySession?.sessionId ?? initialDraft.sessionId);
  const [pairingToken, setPairingToken] = useState<string>(initialDraft.pairingToken);
  const [mobileToken, setMobileToken] = useState<string>('');
  const mobileName = 'web-supervisor';
  const [events, setEvents] = useState<RelayEvent[]>([]);
  const [, setNotifications] = useState<RelayNotification[]>([]);
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
  const autoConnectAttemptedRef = useRef<boolean>(false);

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
        meta: 'Analyzing and streaming updates…',
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

      if (event.type === 'run_status' || event.type === 'failure' || event.type === 'disconnect') {
        continue;
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
            : undefined,
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

  const workspaceSubtitle = buildWorkspaceSubtitle(sessionId);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ block: 'end' });
  }, [chatEntries.length]);

  useEffect(() => {
    if (mobileToken || connecting || autoConnectAttemptedRef.current) {
      return;
    }

    if (storedRelaySession) {
      autoConnectAttemptedRef.current = true;
      void restoreStoredSession(storedRelaySession);
      return;
    }

    if (!initialDraft.inviteDetected) {
      return;
    }

    autoConnectAttemptedRef.current = true;
    void connectSession();
  }, [connecting, initialDraft.inviteDetected, mobileToken, storedRelaySession]);

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
      const nextNotifications = result.notifications ?? [];
      nextNotifications.forEach(logRelayNotification);
      setNotifications((previous) => [...previous, ...nextNotifications].slice(-100));
      setActionErrorText('');
    } catch (error) {
      setActionErrorText(`Notification read failed: ${getErrorMessage(error)}`);
    } finally {
      setRefreshingNotifications(false);
    }
  }

  function applyConnectionInput(rawInput: string): boolean {
    const nextInput = rawInput.trim();

    if (!nextInput) {
      setConnectErrorText('');
      setSessionId('');
      setPairingToken('');
      setRelayServer(initialDraft.relayServer);
      return false;
    }

    try {
      const parsed = parseClientConnectionUrl(nextInput);
      setRelayServer(parsed.relayServer);
      setSessionId(parsed.sessionId);
      setPairingToken(parsed.pairingToken);
      setConnectErrorText('');
      setStatusText('Invite imported. Connecting to the relay session.');
      return true;
    } catch (error) {
      setConnectErrorText(`Invite import failed: ${getErrorMessage(error)}`);
      return false;
    }
  }

  function clearPersistedRelaySession(reason?: string): void {
    clearStoredRelaySession();
    setMobileToken('');
    setSessionId('');
    setPairingToken('');
    setRelayServer(initialDraft.relayServer);

    if (!initialDraft.inviteDetected) {
      setConnectionInput('');
    }

    if (reason) {
      setStatusText(reason);
    }
  }

  async function openConnectedSession(nextRelayServer: string, nextSessionId: string, nextMobileToken: string): Promise<void> {
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

    (backlog.events ?? []).forEach(logRelayEvent);
    (initialNotifications.notifications ?? []).forEach(logRelayNotification);

    setRelayServer(nextRelayServer);
    setSessionId(nextSessionId);
    setMobileToken(nextMobileToken);
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
        logRelayEvent(parsedEvent);
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

    writeStoredRelaySession({
      relayServer: nextRelayServer,
      sessionId: nextSessionId,
      mobileToken: nextMobileToken,
    });
    sanitizeConnectedLocation(nextSessionId);
  }

  async function restoreStoredSession(storedSession: StoredRelaySession): Promise<void> {
    setConnectErrorText('');
    setActionErrorText('');
    setConnecting(true);

    eventSourceRef.current?.close();
    eventSourceRef.current = null;

    try {
      await openConnectedSession(storedSession.relayServer, storedSession.sessionId, storedSession.mobileToken);
      setStatusText(`Restored session ${storedSession.sessionId}.`);
    } catch (error) {
      if (isInvalidStoredRelaySession(error)) {
        clearPersistedRelaySession('Saved relay session expired. Paste a fresh invite link to reconnect.');
      }

      setConnectErrorText(`Connection failed: ${getErrorMessage(error)}`);
    } finally {
      setConnecting(false);
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
      const nextConnectionInput = connectionInput.trim();

      if (nextConnectionInput) {
        const didImport = applyConnectionInput(nextConnectionInput);

        if (!didImport) {
          return;
        }

        const parsed = parseClientConnectionUrl(nextConnectionInput);
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
      setPairingToken(nextPairingToken);
      setStatusText(`Connected to session ${nextSessionId}. Expires ${formatTimestamp(pairResult.expiresAt)}.`);

      await openConnectedSession(nextRelayServer, nextSessionId, nextMobileToken);
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
      clearPersistedRelaySession('Session disconnected from the web UI.');
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    } catch (error) {
      setActionErrorText(`Disconnect failed: ${getErrorMessage(error)}`);
    }
  }

  return (
    <div className="workspace-page">
      <main className="workspace-shell">
        <header className="conversation-header">
          <div className="conversation-title-group">
            <div className="workspace-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div>
              <h1>Remote Workspace</h1>
              <p className="conversation-subtitle">{workspaceSubtitle}</p>
            </div>
          </div>

          <div className="conversation-actions">
            {mobileToken ? (
              <button
                type="button"
                className="icon-action"
                onClick={() => void disconnectSession()}
                aria-label="Disconnect session"
              >
                Disconnect
              </button>
            ) : (
              <div className="header-connect-row">
                <label className="header-session-field" htmlFor="session-id-input">
                  <span>Invite link</span>
                  <input
                    id="session-id-input"
                    type="text"
                    value={connectionInput}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setConnectionInput(nextValue);

                      if (!nextValue.trim()) {
                        setSessionId('');
                        setPairingToken('');
                        setRelayServer(initialDraft.relayServer);
                        setConnectErrorText('');
                        return;
                      }

                      try {
                        const parsed = parseClientConnectionUrl(nextValue);
                        setRelayServer(parsed.relayServer);
                        setSessionId(parsed.sessionId);
                        setPairingToken(parsed.pairingToken);
                        setConnectErrorText('');
                      } catch {
                        // Keep the raw input while the user is still typing an invite.
                      }
                    }}
                    placeholder="Paste invite link or sessionId=...&pairingToken=..."
                  />
                </label>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void connectSession()}
                  disabled={connecting || (!initialDraft.inviteDetected && !connectionInput.trim())}
                >
                  {connecting ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            )}
          </div>
        </header>

        {connectErrorText ? <p className="error page-error">{connectErrorText}</p> : null}

        <section className="message-stream">
          {chatEntries.map((entry) => {
            if (entry.kind === 'approval') {
              const decisionLabel = entry.decision === undefined
                ? 'Pending'
                : entry.decision
                  ? 'Approved'
                  : 'Rejected';

              return (
                <section key={entry.id} className="message-row agent-row approval-row">
                  <div className="avatar agent-avatar">AI</div>
                  <div className="message-stack">
                    <div className="message-meta">
                      <span>Agent</span>
                      <span>{formatTime(entry.createdAt)}</span>
                    </div>

                    <article className="approval-card mock-card">
                      <div className="approval-card-header">
                        <div>
                          <h3>Approval required</h3>
                          <p>Allow {entry.approval.toolName} for this relay session?</p>
                        </div>
                        <span className={`approval-state ${entry.decision === undefined ? 'pending' : entry.decision ? 'approved' : 'rejected'}`}>
                          {decisionLabel}
                        </span>
                      </div>

                      <p className="approval-token mono">{entry.approval.approvalId}</p>
                      <pre>{JSON.stringify(entry.approval.argumentSummary, null, 2)}</pre>

                      <div className="approval-actions mock-actions">
                        <button
                          type="button"
                          onClick={() => void sendApprovalDecision(entry.approval.approvalId, true)}
                          disabled={!mobileToken || entry.decision !== undefined}
                        >
                          Approve once
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => void sendApprovalDecision(entry.approval.approvalId, false)}
                          disabled={!mobileToken || entry.decision !== undefined}
                        >
                          Deny
                        </button>
                      </div>
                    </article>
                  </div>
                </section>
              );
            }

            const isUser = entry.role === 'user';
            const rowClassName = `message-row ${isUser ? 'user-row' : 'agent-row'}`;
            const bubbleClassName = `message-bubble ${isUser ? 'user-bubble' : entry.role === 'system' ? 'system-bubble' : 'agent-bubble'}${entry.tone === 'error' ? ' bubble-error' : ''}`;

            return (
              <section key={entry.id} className={rowClassName}>
                {!isUser ? <div className={`avatar ${entry.role === 'system' ? 'system-avatar' : 'agent-avatar'}`}>{entry.role === 'system' ? '•' : 'AI'}</div> : null}

                <div className="message-stack">
                  <div className={`message-meta ${isUser ? 'align-end' : ''}`}>
                    <span>{isUser ? 'You' : entry.role === 'assistant' ? 'Agent' : 'Relay'}</span>
                    <span>{formatTime(entry.createdAt)}</span>
                  </div>
                  <article className={bubbleClassName}>
                    {renderMessageBody(entry.role, entry.text)}
                    {entry.meta ? <p className="bubble-footnote">{entry.meta}</p> : null}
                  </article>
                </div>

                {isUser ? <div className="avatar user-avatar">Y</div> : null}
              </section>
            );
          })}

          <div ref={transcriptEndRef} />
        </section>

        <form className="composer-panel" onSubmit={(event) => void submitMessage(event)}>
          <label className="sr-only" htmlFor="message-input">Message Agent</label>
          <textarea
            id="message-input"
            value={messageInput}
            onChange={(event) => setMessageInput(event.target.value)}
            rows={3}
            placeholder={mobileToken ? 'Message Agent...' : 'Connect to a live session to send messages'}
            disabled={!mobileToken}
          />

          {actionErrorText ? <p className="error composer-error">{actionErrorText}</p> : null}

          <div className="composer-footer">
            <div className="composer-send">
              <button type="button" className="secondary" onClick={() => void postCommand('cancel').catch(() => undefined)} disabled={!mobileToken}>
                Stop
              </button>
              <button type="submit" disabled={sendingMessage || !mobileToken}>
                {sendingMessage ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
