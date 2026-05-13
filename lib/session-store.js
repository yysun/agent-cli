// @ts-check
/**
 * Agent CLI Session Store
 *
 * Purpose:
 * - Persist current-chat metadata and completed conversation turns under `./.chats`.
 *
 * Key features:
 * - Creates stable chat IDs and keeps `current.json` in sync with chat files.
 * - Reads and writes chat JSON through atomic same-directory renames.
 * - Defers persistence until a full assistant response is available.
 *
 * Recent changes:
 * - 2026-05-07: Added file-backed chat persistence for the CLI.
 * - 2026-05-07: Moved chat persistence root to `./.chats`.
 * - 2026-05-13: Added chat listing and explicit selection helpers for remote multi-client flows.
 */
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { CHAT_DIRECTORY, CURRENT_CHAT_PATH, REMOTE_HOST_LOCK_PATH } from './paths.js';

/**
 * @param {Date} [now]
 */
function createChatId(now = new Date()) {
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${timestamp}-${randomUUID().slice(0, 8)}`;
}

/**
 * @param {string} chatId
 */
function buildChatDirectoryPath(chatId) {
  return path.join(CHAT_DIRECTORY, chatId);
}

/**
 * @param {string} chatId
 */
function buildChatMessagesPath(chatId) {
  return path.join(buildChatDirectoryPath(chatId), 'messages.json');
}

/**
 * @param {string} chatId
 */
function buildChatEventsPath(chatId) {
  return path.join(buildChatDirectoryPath(chatId), 'events.json');
}

/**
 * @param {string} chatId
 */
function buildChatRemotePath(chatId) {
  return path.join(buildChatDirectoryPath(chatId), 'remote.json');
}

/**
 * @param {string} chatId
 */
function buildLegacyChatPath(chatId) {
  return path.join(CHAT_DIRECTORY, `${chatId}.json`);
}

/**
 * @param {string | Date | undefined} value
 * @param {string} fallbackTimestamp
 */
function normalizeTimestamp(value, fallbackTimestamp) {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return fallbackTimestamp;
}

/**
 * @param {unknown} value
 */
function normalizeToolCalls(value) {
  return Array.isArray(value) ? value : undefined;
}

/**
 * @param {any} message
 * @param {string} fallbackTimestamp
 */
function normalizePersistedMessage(message, fallbackTimestamp) {
  if (!message || typeof message !== 'object') {
    throw new Error('Encountered an invalid chat message while persisting the session.');
  }

  const role = String(message.role ?? '').trim();
  const content = String(message.content ?? '');

  if (!role) {
    throw new Error('Encountered a chat message without a role while persisting the session.');
  }

  const toolCalls = normalizeToolCalls(message.tool_calls);

  return {
    role,
    content,
    createdAt: normalizeTimestamp(message.createdAt, fallbackTimestamp),
    ...(typeof message.tool_call_id === 'string' ? { tool_call_id: message.tool_call_id } : {}),
    ...(toolCalls ? { tool_calls: toolCalls } : {}),
  };
}


/**
 * @param {string} filePath
 * @param {unknown} value
 */
async function writeJsonAtomic(filePath, value) {
  const directoryPath = path.dirname(filePath);
  const fileName = path.basename(filePath);
  const temporaryPath = path.join(directoryPath, `.${fileName}.${process.pid}.${Date.now()}.tmp`);

  await fs.mkdir(directoryPath, { recursive: true });
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

/**
 * @param {string} filePath
 * @param {string} missingMessage
 * @param {string} invalidMessage
 */
async function readJson(filePath, missingMessage, invalidMessage) {
  let rawContent;

  try {
    rawContent = await fs.readFile(filePath, 'utf8');
  } catch {
    throw new Error(missingMessage);
  }

  try {
    return JSON.parse(rawContent);
  } catch {
    throw new Error(invalidMessage);
  }
}

async function ensureSessionDirectory() {
  await fs.mkdir(CHAT_DIRECTORY, { recursive: true });
}

async function readCurrentChatId() {
  let currentPointer;

  try {
    currentPointer = await readJson(
      CURRENT_CHAT_PATH,
      'Missing current chat metadata.',
      `Invalid current chat metadata: ${CURRENT_CHAT_PATH}`,
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Missing current chat metadata.') {
      return null;
    }

    throw error;
  }

  const chatId = String(currentPointer.chatId ?? '').trim();

  if (!chatId) {
    throw new Error(`Invalid current chat metadata: ${CURRENT_CHAT_PATH}`);
  }

  return chatId;
}

/** @param {number} pid */
function isProcessRunning(pid) {
  if (!Number.isInteger(pid) || pid < 1) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(
      error
      && typeof error === 'object'
      && 'code' in error
      && error.code === 'EPERM',
    );
  }
}

/** @param {unknown} remoteLock */
function isActiveRemoteHostLock(remoteLock) {
  if (!remoteLock || typeof remoteLock !== 'object') {
    return false;
  }

  const pid = Number(remoteLock.pid);
  return isProcessRunning(pid);
}

/** @param {unknown} remoteLock */
function buildRemoteHostConflictError(remoteLock) {
  const chatId = String(
    remoteLock && typeof remoteLock === 'object' && 'chatId' in remoteLock
      ? remoteLock.chatId ?? ''
      : '',
  ).trim();
  const pid = Number(
    remoteLock && typeof remoteLock === 'object' && 'pid' in remoteLock
      ? remoteLock.pid
      : NaN,
  );
  const details = [
    chatId ? `chat ${chatId}` : null,
    Number.isInteger(pid) && pid > 0 ? `pid ${pid}` : null,
  ].filter(Boolean).join(', ');

  return new Error(
    details
      ? `Remote mode already active for this project root (${details}).`
      : 'Remote mode already active for this project root.',
  );
}

async function readRemoteHostLock() {
  try {
    return JSON.parse(await fs.readFile(REMOTE_HOST_LOCK_PATH, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }

    return null;
  }
}

export async function assertNoActiveRemoteHost() {
  const remoteLock = await readRemoteHostLock();

  if (!remoteLock) {
    return null;
  }

  if (isActiveRemoteHostLock(remoteLock)) {
    throw buildRemoteHostConflictError(remoteLock);
  }

  await fs.rm(REMOTE_HOST_LOCK_PATH, { force: true });
  return null;
}

/**
 * @param {{ chat: { id: string } }} params
 */
export async function acquireRemoteHostLock({ chat }) {
  await ensureSessionDirectory();
  const now = new Date().toISOString();

  const remoteLock = {
    chatId: chat.id,
    pid: process.pid,
    startedAt: now,
    updatedAt: now,
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await fs.writeFile(
        REMOTE_HOST_LOCK_PATH,
        `${JSON.stringify(remoteLock, null, 2)}\n`,
        { encoding: 'utf8', flag: 'wx' },
      );
      return remoteLock;
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST') {
        throw error;
      }

      const existingRemoteLock = await readRemoteHostLock();

      if (isActiveRemoteHostLock(existingRemoteLock)) {
        throw buildRemoteHostConflictError(existingRemoteLock);
      }

      await fs.rm(REMOTE_HOST_LOCK_PATH, { force: true });
    }
  }

  throw new Error('Failed to acquire the remote host lock for this project root.');
}

export async function releaseRemoteHostLock() {
  const remoteLock = await readRemoteHostLock();

  if (!remoteLock || Number(remoteLock.pid) !== process.pid) {
    return false;
  }

  await fs.rm(REMOTE_HOST_LOCK_PATH, { force: true });
  return true;
}

/**
 * @param {{ chatId: string }} params
 */
export async function updateRemoteHostLock({ chatId }) {
  const remoteLock = await readRemoteHostLock();

  if (!remoteLock || Number(remoteLock.pid) !== process.pid) {
    return false;
  }

  await writeJsonAtomic(REMOTE_HOST_LOCK_PATH, {
    ...remoteLock,
    chatId,
    updatedAt: new Date().toISOString(),
  });

  return true;
}

/**
 * @param {string} filePath
 */
async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function createEmptyChat() {
  const createdAt = new Date().toISOString();

  return {
    id: createChatId(),
    createdAt,
    updatedAt: createdAt,
    messages: [],
  };
}

/**
 * @param {string} chatId
 */
async function resolveStoredChatPath(chatId) {
  const messagesPath = buildChatMessagesPath(chatId);

  if (await pathExists(messagesPath)) {
    return messagesPath;
  }

  const legacyChatPath = buildLegacyChatPath(chatId);

  if (await pathExists(legacyChatPath)) {
    return legacyChatPath;
  }

  return null;
}

/**
 * @param {string} chatId
 */
export async function loadChatById(chatId) {
  const normalizedChatId = String(chatId ?? '').trim();

  if (!normalizedChatId) {
    throw new Error('Missing chat ID.');
  }

  const chatPath = await resolveStoredChatPath(normalizedChatId);

  if (!chatPath) {
    throw new Error(`Missing chat session file: ${buildChatMessagesPath(normalizedChatId)}`);
  }

  const chat = await readJson(
    chatPath,
    `Missing current chat file: ${chatPath}`,
    `Invalid chat session file: ${chatPath}`,
  );

  if (!Array.isArray(chat.messages)) {
    throw new Error(`Invalid chat session file: ${chatPath}`);
  }

  return {
    id: String(chat.id ?? normalizedChatId),
    createdAt: String(chat.createdAt ?? ''),
    updatedAt: String(chat.updatedAt ?? ''),
    messages: chat.messages.map((message) => normalizePersistedMessage(message, new Date().toISOString())),
  };
}

export async function listPersistedChats() {
  await ensureSessionDirectory();

  const currentChatId = await readCurrentChatId();
  const directoryEntries = await fs.readdir(CHAT_DIRECTORY, { withFileTypes: true });
  const chats = [];

  for (const entry of directoryEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const chatId = String(entry.name ?? '').trim();

    if (!chatId) {
      continue;
    }

    try {
      const chat = await loadChatById(chatId);
      chats.push({
        id: chat.id,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        messageCount: chat.messages.length,
        isCurrent: chat.id === currentChatId,
      });
    } catch {
      // Ignore non-chat directories or partial files.
    }
  }

  return chats.sort((left, right) => {
    const leftTimestamp = Date.parse(left.updatedAt || left.createdAt || '0');
    const rightTimestamp = Date.parse(right.updatedAt || right.createdAt || '0');

    if (Number.isFinite(leftTimestamp) && Number.isFinite(rightTimestamp) && leftTimestamp !== rightTimestamp) {
      return rightTimestamp - leftTimestamp;
    }

    return left.id.localeCompare(right.id);
  });
}

/**
 * @param {{ setCurrent?: boolean }} [options]
 */
export async function createPersistedChat(options = {}) {
  const chat = createEmptyChat();

  await persistCompletedChat({
    chat,
    messages: chat.messages,
    setCurrent: options.setCurrent !== false,
  });

  return chat;
}

/**
 * @param {string} chatId
 */
export async function setCurrentChat(chatId) {
  const chat = await loadChatById(chatId);

  await writeJsonAtomic(CURRENT_CHAT_PATH, { chatId: chat.id });

  return chat;
}

/**
 * @param {{ newChat: boolean }} params
 */
export async function loadRequestedChat({ newChat }) {
  if (newChat) {
    return createEmptyChat();
  }

  const chatId = await readCurrentChatId();

  if (!chatId) {
    return createEmptyChat();
  }

  try {
    return await loadChatById(chatId);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Missing chat session file: ')) {
      return createEmptyChat();
    }

    throw error;
  }
}

/**
 * @param {{ chat: { id: string, createdAt?: string, updatedAt?: string }, messages: any[], setCurrent?: boolean }} params
 */
export async function persistCompletedChat({ chat, messages, setCurrent = true }) {
  await ensureSessionDirectory();

  const now = new Date().toISOString();
  const persistedChat = {
    id: chat.id,
    createdAt: chat.createdAt || now,
    updatedAt: now,
    messages: messages.map((message) => normalizePersistedMessage(message, now)),
  };

  await writeJsonAtomic(buildChatMessagesPath(chat.id), persistedChat);

  if (setCurrent) {
    await writeJsonAtomic(CURRENT_CHAT_PATH, { chatId: chat.id });
  }

  return persistedChat;
}

/**
 * @param {{
 *   chat: { id: string },
 *   streamTraceEvents: Array<{ type: string, text: string, createdAt: string }>,
 * }} params
 */
export async function persistStreamTraceEvents({ chat, streamTraceEvents }) {
  if (!Array.isArray(streamTraceEvents) || streamTraceEvents.length === 0) {
    return null;
  }

  const eventsPath = buildChatEventsPath(chat.id);
  await writeJsonAtomic(eventsPath, {
    chatId: chat.id,
    createdAt: new Date().toISOString(),
    events: streamTraceEvents,
  });

  return eventsPath;
}

/**
 * @param {{
 *   chat: { id: string },
 *   remoteSession: Record<string, unknown>,
 * }} params
 */
export async function persistRemoteSessionState({ chat, remoteSession }) {
  const remotePath = buildChatRemotePath(chat.id);

  await writeJsonAtomic(remotePath, {
    chatId: chat.id,
    updatedAt: new Date().toISOString(),
    remoteSession,
  });

  return remotePath;
}