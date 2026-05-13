// @ts-check
/**
 * Agent CLI Remote Control Coordinator
 *
 * Purpose:
 * - Host one active local chat through the optional relay without moving execution off-machine.
 *
 * Key features:
 * - Registers a relay session, prints the client connection URL, and long-polls for remote commands.
 * - Routes approval decisions and cancel requests back into the local runtime loop.
 * - Emits normalized remote events for assistant output, run status, completion, failure, and disconnect.
 *
 * Recent changes:
 * - 2026-05-11: Added the initial remote-control host loop with redacted payload summaries.
 * - 2026-05-13: Added chat list/read/create/select handling for multi-client relay sessions.
 */
import QRCode from 'qrcode';

import { createRelayIdempotencyKey } from './relay-client.js';

const SENSITIVE_KEY_PATTERN = /(path|file|content|token|secret|key|env|authorization|password|prompt|workspace|memory)/i;

/** @param {{ write(chunk: string): void, isTTY?: boolean }} stdout */
function isInteractiveTerminal(stdout) {
  return Boolean(stdout && stdout.isTTY);
}

/** @param {string} connectionUrl */
async function renderConnectionQrCode(connectionUrl) {
  return await QRCode.toString(connectionUrl, {
    type: 'terminal',
    small: true,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
}

/**
 * @param {Record<string, unknown>} relaySession
 * @param {{ write(chunk: string): void, isTTY?: boolean }} stdout
 * @param {{ write(chunk: string): void } | undefined} stderr
 */
async function buildRemoteSessionReadyText(relaySession, stdout, stderr) {
  const clientConnectionUrl = String(relaySession.clientConnectionUrl ?? '');
  const expiresAt = typeof relaySession.expiresAt === 'string' && relaySession.expiresAt.trim()
    ? relaySession.expiresAt
    : 'No timeout';
  const lines = [
    'Remote relay session ready.',
    `Session ID: ${String(relaySession.sessionId ?? '')}`,
    `Client connection URL: ${clientConnectionUrl}`,
    `Pairing token: ${String(relaySession.pairingToken ?? '')}`,
    `Expires at: ${expiresAt}`,
  ];

  if (clientConnectionUrl && isInteractiveTerminal(stdout)) {
    try {
      lines.push('Scan this QR code from the client to connect:');
      lines.push((await renderConnectionQrCode(clientConnectionUrl)).trimEnd());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stderr?.write(`Warning: failed to render remote connection QR code: ${message}\n`);
    }
  }

  lines.push('Remote host is running and will keep responding until the client disconnects or you press Ctrl+C.');
  lines.push('');

  return lines.join('\n');
}

/** @param {unknown} value */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {string} key
 * @param {unknown} value
 */
function summarizeArgumentEntry(key, value) {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return {
      key,
      type: Array.isArray(value) ? 'array' : typeof value,
      summary: '[redacted]',
    };
  }

  if (typeof value === 'string') {
    return {
      key,
      type: 'string',
      summary: value.length > 80 ? `${value.slice(0, 77)}...` : value,
    };
  }

  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return {
      key,
      type: value === null ? 'null' : typeof value,
      summary: value,
    };
  }

  if (Array.isArray(value)) {
    return {
      key,
      type: 'array',
      summary: `[array:${value.length}]`,
    };
  }

  if (isPlainObject(value)) {
    return {
      key,
      type: 'object',
      summary: `[object:${Object.keys(value).length}]`,
    };
  }

  return {
    key,
    type: typeof value,
    summary: `[${typeof value}]`,
  };
}

/** @param {Record<string, unknown>} rawArguments */
export function buildRemoteArgumentSummary(rawArguments) {
  const argumentEntries = Object.entries(isPlainObject(rawArguments) ? rawArguments : {});

  return {
    argumentCount: argumentEntries.length,
    entries: argumentEntries.map(([key, value]) => summarizeArgumentEntry(key, value)),
  };
}

/** @param {unknown} error */
export function buildRemoteFailureSummary(error) {
  const message = error instanceof Error ? error.message : String(error);
  const loweredMessage = message.toLowerCase();

  if (loweredMessage.includes('cancel')) {
    return {
      category: 'cancelled',
      message: 'Run cancelled on the local host.',
    };
  }

  if (loweredMessage.includes('reject')) {
    return {
      category: 'rejected',
      message: 'A local action was rejected.',
    };
  }

  return {
    category: 'failed',
    message: 'Run failed on the local host.',
  };
}

/** @param {{ id: string, createdAt?: string, updatedAt?: string, messages?: any[] }} chat */
function buildRemoteChatSummary(chat) {
  return {
    id: String(chat.id ?? ''),
    createdAt: String(chat.createdAt ?? ''),
    updatedAt: String(chat.updatedAt ?? ''),
    messageCount: Array.isArray(chat.messages) ? chat.messages.length : 0,
  };
}

/** @param {any[]} messages */
function buildRemoteChatMessages(messages) {
  return (Array.isArray(messages) ? messages : []).map((message) => ({
    role: String(message?.role ?? ''),
    content: String(message?.content ?? ''),
    createdAt: typeof message?.createdAt === 'string' ? message.createdAt : undefined,
    ...(typeof message?.tool_call_id === 'string' ? { toolCallId: message.tool_call_id } : {}),
  }));
}

/**
 * @param {{
 *   postEvent: (type: string, payload?: Record<string, unknown>) => Promise<void>,
 *   signal: AbortSignal,
 * }} params
 */
function createRemoteApprovalGate({ postEvent, signal }) {
  /** @type {Map<string, { resolve: (decision: any) => void, reject: (error: unknown) => void }>} */
  const pendingApprovals = new Map();

  signal.addEventListener('abort', () => {
    for (const pending of pendingApprovals.values()) {
      pending.reject(new Error('Approval wait cancelled.'));
    }

    pendingApprovals.clear();
  }, { once: true });

  return {
    async requestApproval(request) {
      if (signal.aborted) {
        throw new Error('Approval wait cancelled.');
      }

      const approvalId = String(request.toolCallId ?? createRelayIdempotencyKey('approval'));
      await postEvent('tool_approval_request', {
        approvalId,
        toolCallId: request.toolCallId,
        toolName: request.toolName,
        argumentSummary: buildRemoteArgumentSummary(
          isPlainObject(request.arguments) ? request.arguments : {},
        ),
      });

      return await new Promise((resolve, reject) => {
        pendingApprovals.set(approvalId, { resolve, reject });
      });
    },
    resolveDecision(approvalId, decision) {
      const pending = pendingApprovals.get(approvalId);

      if (!pending) {
        return false;
      }

      pendingApprovals.delete(approvalId);
      pending.resolve(decision);
      return true;
    },
  };
}

/**
 * @param {{
 *   relayServer: string,
 *   chat: { id: string, messages: any[] },
 *   io: { stdout: { write(chunk: string): void }, stderr?: { write(chunk: string): void } },
 *   initialMessage?: string,
 *   executeTurn: (params: {
 *     chat: { id: string, messages: any[], createdAt?: string, updatedAt?: string },
 *     message: string,
 *     approvalGate?: { requestApproval: (request: Record<string, unknown>) => Promise<any> },
 *     abortSignal?: AbortSignal,
 *     onAssistantChunk?: (chunkText: string) => Promise<void> | void,
 *     commandSource?: string,
 *   }) => Promise<{ assistantText: string, messages: any[] }>,
 *   relayClient: typeof import('./relay-client.js'),
 *   chatStore?: {
 *     listChats?: () => Promise<Array<{ id: string, createdAt?: string, updatedAt?: string, messageCount?: number, isCurrent?: boolean }>>,
 *     loadChatById?: (chatId: string) => Promise<{ id: string, messages: any[], createdAt?: string, updatedAt?: string }>,
 *     createChat?: (options?: { setCurrent?: boolean }) => Promise<{ id: string, messages: any[], createdAt?: string, updatedAt?: string }>,
 *     setCurrentChat?: (chatId: string) => Promise<{ id: string, messages: any[], createdAt?: string, updatedAt?: string }>,
 *     updateRemoteHostLock?: (params: { chatId: string }) => Promise<boolean>,
 *   },
 *   onSessionReady?: (relaySession: Record<string, unknown>) => Promise<void> | void,
 *   ttlMs?: number,
 *   pairingTtlMs?: number,
 * }} params
 */
export async function runRemoteControlSession(params) {
  let activeChat = params.chat;
  const relaySession = await params.relayClient.createRelaySession({
    relayServer: params.relayServer,
    localSessionId: activeChat.id,
    chatId: activeChat.id,
    ttlMs: params.ttlMs ?? 0,
    pairingTtlMs: params.pairingTtlMs ?? 0,
    metadata: {
      mode: 'remote-control',
    },
  });

  await params.onSessionReady?.(relaySession);

  params.io.stdout.write(await buildRemoteSessionReadyText(
    relaySession,
    params.io.stdout,
    params.io.stderr,
  ));

  let active = true;
  let waitingForInput = false;
  let commandCursor = 0;
  let relaySessionClosed = false;
  let finalRevokeReason = 'session_closed';
  /** @type {Array<
   *   { kind: 'message', text: string, source: string, commandId?: string }
   *   | { kind: 'resume' }
   *>} */
  const queuedMessages = [];
  /** @type {((entry: ({ kind: 'message', text: string, source: string, commandId?: string } | { kind: 'resume' }) | null) => void) | null} */
  let nextMessageResolver = null;
  /** @type {AbortController | null} */
  let activeRunController = null;
  const remoteControlAbort = new AbortController();
  const approvalGate = createRemoteApprovalGate({
    postEvent: async (type, payload = {}) => {
      await params.relayClient.postRelayEvent({
        relayServer: params.relayServer,
        sessionId: relaySession.sessionId,
        desktopToken: relaySession.desktopToken,
        type,
        payload,
        idempotencyKey: createRelayIdempotencyKey(`event-${type}`),
      });
    },
    signal: remoteControlAbort.signal,
  });

  /**
   * @param {string} type
   * @param {Record<string, unknown>} [payload]
   * @param {{ targetClientId?: string }} [options]
   */
  const postEvent = async (type, payload = {}, options = {}) => {
    await params.relayClient.postRelayEvent({
      relayServer: params.relayServer,
      sessionId: relaySession.sessionId,
      desktopToken: relaySession.desktopToken,
      type,
      payload,
      idempotencyKey: createRelayIdempotencyKey(`event-${type}`),
      targetClientId: options.targetClientId,
    });
  };

  const publishSessionSnapshot = async () => {
    await postEvent('session_snapshot', {
      activeChatId: activeChat.id,
      chat: buildRemoteChatSummary(activeChat),
      waitingForInput,
    });
  };

  /**
   * @param {string} clientId
   * @param {string | undefined} requestId
   * @param {string} code
   * @param {string} message
   */
  const postCommandError = async (clientId, requestId, code, message) => {
    await postEvent('command_error', {
      requestId,
      code,
      message,
      activeChatId: activeChat.id,
    }, {
      targetClientId: clientId,
    });
  };

  /** @param {{ kind: 'message', text: string, source: string, commandId?: string } | { kind: 'resume' }} entry */
  const enqueueMessage = (entry) => {
    queuedMessages.push(entry);

    if (nextMessageResolver) {
      const resolve = nextMessageResolver;
      nextMessageResolver = null;
      resolve(queuedMessages.shift() ?? null);
    }
  };

  const commandPump = (async () => {
    while (active) {
      const commandResponse = await params.relayClient.pollRelayCommands({
        relayServer: params.relayServer,
        sessionId: relaySession.sessionId,
        desktopToken: relaySession.desktopToken,
        after: commandCursor,
        timeoutMs: 25000,
      });

      if (commandResponse.revoked) {
        active = false;
        relaySessionClosed = true;
        remoteControlAbort.abort();
        if (nextMessageResolver) {
          const resolve = nextMessageResolver;
          nextMessageResolver = null;
          resolve(null);
        }
        break;
      }

      for (const command of commandResponse.commands ?? []) {
        commandCursor = Math.max(commandCursor, Number(command.sequence) || commandCursor);

        const clientId = typeof command.clientId === 'string' ? command.clientId : '';
        const requestId = String(command.payload?.requestId ?? '');

        if (command.type === 'user_message') {
          enqueueMessage({
            kind: 'message',
            text: String(command.payload?.text ?? ''),
            source: 'remote',
            commandId: String(command.sequence),
          });
          continue;
        }

        if (command.type === 'list_chats') {
          try {
            if (!params.chatStore?.listChats) {
              throw new Error('Remote chat listing is unavailable.');
            }

            const chats = await params.chatStore.listChats();
            await postEvent('chat_list_result', {
              requestId,
              chats,
              activeChatId: activeChat.id,
            }, {
              targetClientId: clientId,
            });
          } catch (error) {
            await postCommandError(clientId, requestId, 'chat_list_failed', error instanceof Error ? error.message : String(error));
          }
          continue;
        }

        if (command.type === 'read_chat_messages') {
          try {
            if (!params.chatStore?.loadChatById) {
              throw new Error('Remote chat history is unavailable.');
            }

            const chatId = String(command.payload?.chatId ?? '').trim();
            const chat = await params.chatStore.loadChatById(chatId);
            await postEvent('chat_messages_result', {
              requestId,
              chatId: chat.id,
              activeChatId: activeChat.id,
              messages: buildRemoteChatMessages(chat.messages),
            }, {
              targetClientId: clientId,
            });
          } catch (error) {
            await postCommandError(clientId, requestId, 'chat_messages_failed', error instanceof Error ? error.message : String(error));
          }
          continue;
        }

        if (command.type === 'create_chat') {
          try {
            if (!params.chatStore?.createChat) {
              throw new Error('Remote chat creation is unavailable.');
            }

            const chat = await params.chatStore.createChat({ setCurrent: false });
            await postEvent('chat_created', {
              requestId,
              sourceClientId: clientId,
              chat: buildRemoteChatSummary(chat),
              activeChatId: activeChat.id,
            });
          } catch (error) {
            await postCommandError(clientId, requestId, 'chat_create_failed', error instanceof Error ? error.message : String(error));
          }
          continue;
        }

        if (command.type === 'select_chat') {
          try {
            if (!params.chatStore?.setCurrentChat) {
              throw new Error('Remote chat selection is unavailable.');
            }

            if (activeRunController) {
              throw new Error('Cannot switch chats while a run is still active.');
            }

            const chatId = String(command.payload?.chatId ?? '').trim();
            activeChat = await params.chatStore.setCurrentChat(chatId);
            await params.chatStore.updateRemoteHostLock?.({ chatId: activeChat.id });
            await postEvent('active_chat_changed', {
              requestId,
              sourceClientId: clientId,
              chatId: activeChat.id,
              chat: buildRemoteChatSummary(activeChat),
            });
            await publishSessionSnapshot();
          } catch (error) {
            await postCommandError(clientId, requestId, 'chat_select_failed', error instanceof Error ? error.message : String(error));
          }
          continue;
        }

        if (command.type === 'approval_decision') {
          approvalGate.resolveDecision(
            String(command.payload?.approvalId ?? ''),
            {
              approved: Boolean(command.payload?.approved),
              reason: String(command.payload?.reason ?? ''),
              source: 'remote',
              decidedAt: command.createdAt,
            },
          );
          continue;
        }

        if (command.type === 'cancel') {
          activeRunController?.abort();
          await postEvent('run_status', {
            status: 'cancel_requested',
            source: 'remote',
          });
          continue;
        }

        if (command.type === 'resume') {
          if (waitingForInput) {
            waitingForInput = false;
            enqueueMessage({ kind: 'resume' });
          }
          continue;
        }

        if (command.type === 'disconnect') {
          active = false;
          finalRevokeReason = 'remote_disconnect';
          activeRunController?.abort();
          remoteControlAbort.abort();
          if (nextMessageResolver) {
            const resolve = nextMessageResolver;
            nextMessageResolver = null;
            resolve(null);
          }
          break;
        }
      }
    }
  })();

  await postEvent('run_status', {
    status: 'remote_session_started',
    sessionId: relaySession.sessionId,
    activeChatId: activeChat.id,
  });
  await publishSessionSnapshot();

  if (params.initialMessage) {
    enqueueMessage({
      kind: 'message',
      text: params.initialMessage,
      source: 'local',
    });
  }

  while (active) {
    if (queuedMessages.length === 0) {
      waitingForInput = true;
      await postEvent('run_status', {
        status: 'waiting_for_input',
      });
    }

    const nextMessage = queuedMessages.length > 0
      ? queuedMessages.shift() ?? null
      : await new Promise((resolve) => {
        nextMessageResolver = resolve;
      });

    waitingForInput = false;

    if (!nextMessage || !active) {
      break;
    }

    if (nextMessage.kind === 'resume') {
      continue;
    }

    activeRunController = new AbortController();

    try {
      await postEvent('run_status', {
        status: 'started',
        source: nextMessage.source,
        commandId: nextMessage.commandId,
      });

      const result = await params.executeTurn({
        chat: activeChat,
        message: nextMessage.text,
        approvalGate,
        abortSignal: activeRunController.signal,
        commandSource: nextMessage.source,
        onAssistantChunk: async (chunkText) => {
          await postEvent('assistant_output', {
            text: chunkText,
            source: nextMessage.source,
          });
        },
      });

      activeChat.messages = result.messages;

      await postEvent('completion', {
        text: result.assistantText,
        source: nextMessage.source,
      });
      await postEvent('run_status', {
        status: 'completed',
        source: nextMessage.source,
      });
    } catch (error) {
      const wasCancelled = activeRunController.signal.aborted;

      if (!wasCancelled) {
        await postEvent('failure', {
          ...buildRemoteFailureSummary(error),
          source: nextMessage.source,
        });
      }

      await postEvent('run_status', {
        status: wasCancelled ? 'cancelled' : 'failed',
        source: nextMessage.source,
      });

      if (wasCancelled) {
        continue;
      }
    } finally {
      activeRunController = null;
    }
  }

  active = false;
  remoteControlAbort.abort();
  await commandPump;

  if (!relaySessionClosed) {
    try {
      await params.relayClient.revokeRelaySession({
        relayServer: params.relayServer,
        sessionId: relaySession.sessionId,
        token: relaySession.desktopToken,
        reason: finalRevokeReason,
      });
    } catch (error) {
      const statusCode = Number(
        error && typeof error === 'object' && 'statusCode' in error
          ? error.statusCode
          : 0,
      );

      if (statusCode !== 404 && statusCode !== 410) {
        throw error;
      }
    }
  }

  return relaySession;
}