// @ts-check
/**
 * Agent CLI Chat Store
 *
 * Purpose:
 * - Persist local chat history under the flat `.agent-world/chats` layout.
 *
 * Key features:
 * - Stores chat metadata, messages, summaries, and stream events inside each chat folder.
 * - Stores selected chat state in `.agent-world/chats/current.json`.
 * - Does not persist worlds, world ids, agents, `agent.json`, or runtime defaults.
 *
 * Recent changes:
 * - 2026-05-26: Made requested or missing current chats persist as the selected chat immediately.
 * - 2026-05-26: Ensured new chat requests also initialize workspace storage.
 * - 2026-05-26: Flattened storage to `.agent-world/chats` and removed persisted agent/world state.
 */
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  AGENT_WORLD_CHATS_ROOT,
  buildWorldChatDirectoryPath,
  buildWorldChatEventsPath,
  buildWorldChatMessagesPath,
  buildWorldChatMetadataPath,
  buildWorldChatSummaryPath,
  CURRENT_CHAT_PATH,
} from './paths.js';
import { ensureWorkspaceWorld } from './workspace-store.js';

/**
 * @param {Date} [now]
 */
function createChatId(now = new Date()) {
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${timestamp}-${randomUUID().slice(0, 8)}`;
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

/** @param {(string | Date | undefined)[]} values */
function pickLatestTimestamp(values) {
  let latestTimestamp = '';
  let latestValue = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    const normalizedValue = typeof value === 'string'
      ? value.trim()
      : (value instanceof Date ? value.toISOString() : '');

    if (!normalizedValue) {
      continue;
    }

    const parsedValue = Date.parse(normalizedValue);

    if (!Number.isFinite(parsedValue)) {
      continue;
    }

    if (!latestTimestamp || parsedValue > latestValue) {
      latestTimestamp = normalizedValue;
      latestValue = parsedValue;
    }
  }

  return latestTimestamp;
}

/** @param {unknown} value */
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
  const temporaryPath = path.join(directoryPath, `.${fileName}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`);

  await fs.mkdir(directoryPath, { recursive: true });
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

/**
 * @param {string} filePath
 * @param {string} text
 */
async function writeTextAtomic(filePath, text) {
  const directoryPath = path.dirname(filePath);
  const fileName = path.basename(filePath);
  const temporaryPath = path.join(directoryPath, `.${fileName}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`);

  await fs.mkdir(directoryPath, { recursive: true });
  await fs.writeFile(temporaryPath, text, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

/**
 * @param {string} filePath
 * @param {unknown[]} values
 */
async function writeJsonlAtomic(filePath, values) {
  const serialized = values.length > 0
    ? `${values.map((value) => JSON.stringify(value)).join('\n')}\n`
    : '';
  await writeTextAtomic(filePath, serialized);
}

/**
 * @param {string} filePath
 * @param {unknown[]} values
 */
async function appendJsonl(filePath, values) {
  if (!Array.isArray(values) || values.length === 0) {
    return;
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const serialized = `${values.map((value) => JSON.stringify(value)).join('\n')}\n`;
  await fs.appendFile(filePath, serialized, 'utf8');
}

/** @param {string} filePath */
async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

/** @param {string} filePath */
async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} filePath
 * @param {string} defaultText
 */
async function ensureTextFile(filePath, defaultText = '') {
  if (await pathExists(filePath)) {
    return;
  }

  await writeTextAtomic(filePath, defaultText);
}

/** @param {string} filePath */
async function readJsonl(filePath) {
  let rawContent;

  try {
    rawContent = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`Missing chat session file: ${filePath}`);
    }

    throw error;
  }

  const lines = rawContent.split(/\r?\n/u).filter(Boolean);

  try {
    return lines.map((line) => JSON.parse(line));
  } catch {
    throw new Error(`Invalid chat session file: ${filePath}`);
  }
}

async function ensureChatStorage() {
  await ensureWorkspaceWorld();
  await fs.mkdir(AGENT_WORLD_CHATS_ROOT, { recursive: true });
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

async function readCurrentChatId() {
  const current = await readJsonIfPresent(CURRENT_CHAT_PATH);
  return String(
    current && typeof current === 'object' && 'chatId' in current
      ? current.chatId ?? ''
      : '',
  ).trim();
}

/** @param {string} chatId */
async function writeCurrentChatId(chatId) {
  await writeJsonAtomic(CURRENT_CHAT_PATH, {
    chatId,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * @param {{ id: string, createdAt?: string, updatedAt?: string, messages: any[] }} chat
 */
async function persistWorldChat(chat) {
  const now = new Date().toISOString();
  const messages = chat.messages.map((message) => normalizePersistedMessage(message, now));
  const createdAt = normalizeTimestamp(chat.createdAt, now);
  const updatedAt = pickLatestTimestamp([
    chat.updatedAt,
    messages.at(-1)?.createdAt,
    createdAt,
  ]) || now;
  const metadata = {
    id: chat.id,
    createdAt,
    updatedAt,
    messageCount: messages.length,
  };

  await writeJsonAtomic(buildWorldChatMetadataPath(chat.id), metadata);
  await writeJsonlAtomic(buildWorldChatMessagesPath(chat.id), messages);
  await ensureTextFile(buildWorldChatSummaryPath(chat.id));

  return {
    ...metadata,
    messages,
  };
}

/** @param {string} chatId */
async function loadWorldChatMetadata(chatId) {
  const metadataPath = buildWorldChatMetadataPath(chatId);
  let rawContent;

  try {
    rawContent = await fs.readFile(metadataPath, 'utf8');
  } catch {
    throw new Error(`Missing chat session file: ${buildWorldChatMessagesPath(chatId)}`);
  }

  try {
    return JSON.parse(rawContent);
  } catch {
    throw new Error(`Invalid chat session file: ${metadataPath}`);
  }
}

/** @param {string} chatId */
async function loadWorldChatById(chatId) {
  const normalizedChatId = String(chatId ?? '').trim();

  if (!normalizedChatId) {
    throw new Error('Missing chat ID.');
  }

  const metadata = await loadWorldChatMetadata(normalizedChatId);
  const messages = (await readJsonl(buildWorldChatMessagesPath(normalizedChatId)))
    .map((message) => normalizePersistedMessage(message, new Date().toISOString()));

  return {
    id: String(metadata.id ?? normalizedChatId),
    createdAt: String(metadata.createdAt ?? ''),
    updatedAt: String(metadata.updatedAt ?? ''),
    messages,
  };
}

/**
 * @param {string} chatId
 */
export async function loadChatById(chatId) {
  await ensureChatStorage();
  return await loadWorldChatById(chatId);
}

/**
 * @param {string} chatId
 */
export async function loadChatMessages(chatId) {
  return (await loadChatById(chatId)).messages;
}

export async function listPersistedChats() {
  await ensureChatStorage();
  const currentChatId = await readCurrentChatId();
  const entries = await fs.readdir(AGENT_WORLD_CHATS_ROOT, { withFileTypes: true });
  const chats = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const chatId = String(entry.name ?? '').trim();

    if (!chatId) {
      continue;
    }

    const metadata = await readJsonIfPresent(buildWorldChatMetadataPath(chatId));

    if (!metadata || typeof metadata !== 'object') {
      continue;
    }

    chats.push({
      id: String(metadata.id ?? chatId),
      createdAt: String(metadata.createdAt ?? ''),
      updatedAt: String(metadata.updatedAt ?? ''),
      messageCount: Number(metadata.messageCount ?? 0),
      isCurrent: String(metadata.id ?? chatId) === currentChatId,
    });
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

/** @param {string} chatId */
export async function deletePersistedChat(chatId) {
  const normalizedChatId = String(chatId ?? '').trim();

  if (!normalizedChatId) {
    throw new Error('Missing chat ID.');
  }

  await ensureChatStorage();
  await fs.rm(buildWorldChatDirectoryPath(normalizedChatId), { recursive: true, force: true });

  if (await readCurrentChatId() === normalizedChatId) {
    await writeCurrentChatId('');
  }

  return {
    chatId: normalizedChatId,
    deleted: true,
  };
}

/**
 * @param {string} chatId
 */
export async function setCurrentChat(chatId) {
  await ensureChatStorage();
  const chat = await loadChatById(chatId);
  await writeCurrentChatId(chat.id);
  return chat;
}

/**
 * @param {{ newChat: boolean }} params
 */
export async function loadRequestedChat({ newChat }) {
  await ensureChatStorage();

  if (newChat) {
    return await createPersistedChat();
  }

  const chatId = await readCurrentChatId();

  if (!chatId) {
    return await createPersistedChat();
  }

  try {
    return await loadChatById(chatId);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Missing chat session file: ')) {
      return await createPersistedChat();
    }

    throw error;
  }
}

/**
 * @param {{ chat: { id: string, createdAt?: string, updatedAt?: string }, messages: any[], setCurrent?: boolean }} params
 */
export async function persistCompletedChat({ chat, messages, setCurrent = true }) {
  await ensureChatStorage();
  const persistedChat = await persistWorldChat({
    id: chat.id,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    messages,
  });

  if (setCurrent) {
    await writeCurrentChatId(chat.id);
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

  await ensureChatStorage();
  const eventsPath = buildWorldChatEventsPath(chat.id);

  await appendJsonl(eventsPath, streamTraceEvents.map((event) => ({
    kind: 'stream_trace',
    chatId: chat.id,
    type: String(event.type ?? ''),
    text: String(event.text ?? ''),
    createdAt: normalizeTimestamp(event.createdAt, new Date().toISOString()),
  })));

  return eventsPath;
}
