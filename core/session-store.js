// @ts-check
/**
 * Agent CLI Session Store
 *
 * Purpose:
 * - Persist durable world, chat, and agent state under `./.agent-world`.
 *
 * Key features:
 * - Bootstraps `world.json`, default-agent records, and chat directories on demand.
 * - Creates and selects named agents under `.agent-world/agents/{agentId}`.
 * - Keeps the exported chat-store API stable for the CLI and remote host.
 *
 * Recent changes:
 * - 2026-05-20: Added named-agent selection and metadata/runtime initialization.
 * - 2026-05-07: Added file-backed chat persistence for the CLI.
 * - 2026-05-13: Added chat listing and explicit selection helpers for remote multi-client flows.
 * - 2026-05-14: Moved durable storage to `./.agent-world`.
 */
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadPersistedRuntimeConfig } from './agent-config.js';
import { AGENT_WORLD_AGENTS_ROOT, AGENT_WORLD_CHATS_ROOT, AGENT_WORLD_ROOT, buildAgentEventsPath, buildAgentInboxPath, buildAgentMemoryPath, buildAgentMetadataPath, buildAgentRuntimeConfigPath, buildAgentStatePath, buildWorldChatMessagesPath, buildWorldChatMetadataPath, buildWorldChatSummaryPath, REMOTE_HOST_LOCK_PATH, REPO_ROOT, WORLD_STATE_PATH, } from './paths.js';
const DEFAULT_AGENT_ID = 'default';
function defaultWorldName() {
    return path.basename(REPO_ROOT) || 'agent-world';
}
/** @param {string | undefined | null} agentId */
function normalizeAgentId(agentId) {
    const normalizedAgentId = String(agentId ?? '').trim();
    if (!normalizedAgentId) {
        return DEFAULT_AGENT_ID;
    }
    return normalizedAgentId;
}
/**
 * @param {Date} [now]
 */
function createChatId(now = new Date()) {
    const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    return `${timestamp}-${randomUUID().slice(0, 8)}`;
}
function createWorldId() {
    return randomUUID();
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
 * @param {string} text
 */
async function writeTextAtomic(filePath, text) {
    const directoryPath = path.dirname(filePath);
    const fileName = path.basename(filePath);
    const temporaryPath = path.join(directoryPath, `.${fileName}.${process.pid}.${Date.now()}.tmp`);
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
/**
 * @param {string} filePath
 * @param {string} missingMessage
 * @param {string} invalidMessage
 */
async function readJson(filePath, missingMessage, invalidMessage) {
    let rawContent;
    try {
        rawContent = await fs.readFile(filePath, 'utf8');
    }
    catch {
        throw new Error(missingMessage);
    }
    try {
        return JSON.parse(rawContent);
    }
    catch {
        throw new Error(invalidMessage);
    }
}
/** @param {string} filePath */
async function readJsonIfPresent(filePath) {
    try {
        return JSON.parse(await fs.readFile(filePath, 'utf8'));
    }
    catch (error) {
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
    }
    catch {
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
    }
    catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            throw new Error(`Missing chat session file: ${filePath}`);
        }
        throw error;
    }
    const lines = rawContent.split(/\r?\n/u).filter(Boolean);
    try {
        return lines.map((line) => JSON.parse(line));
    }
    catch {
        throw new Error(`Invalid chat session file: ${filePath}`);
    }
}
async function ensureRemoteHostLockDirectory() {
    await fs.mkdir(path.dirname(REMOTE_HOST_LOCK_PATH), { recursive: true });
}
async function ensureAgentWorldDirectories() {
    await Promise.all([
        fs.mkdir(AGENT_WORLD_ROOT, { recursive: true }),
        fs.mkdir(AGENT_WORLD_CHATS_ROOT, { recursive: true }),
        fs.mkdir(AGENT_WORLD_AGENTS_ROOT, { recursive: true }),
    ]);
}
/** @param {number} pid */
function isProcessRunning(pid) {
    if (!Number.isInteger(pid) || pid < 1) {
        return false;
    }
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return Boolean(error
            && typeof error === 'object'
            && 'code' in error
            && error.code === 'EPERM');
    }
}
/** @param {unknown} remoteLock */
function isActiveRemoteHostLock(remoteLock) {
    if (!remoteLock || typeof remoteLock !== 'object') {
        return false;
    }
    return isProcessRunning(Number(remoteLock.pid));
}
/** @param {unknown} remoteLock */
function buildRemoteHostConflictError(remoteLock) {
    const chatId = String(remoteLock && typeof remoteLock === 'object' && 'chatId' in remoteLock
        ? remoteLock.chatId ?? ''
        : '').trim();
    const pid = Number(remoteLock && typeof remoteLock === 'object' && 'pid' in remoteLock
        ? remoteLock.pid
        : NaN);
    const details = [
        chatId ? `chat ${chatId}` : null,
        Number.isInteger(pid) && pid > 0 ? `pid ${pid}` : null,
    ].filter(Boolean).join(', ');
    return new Error(details
        ? `Remote mode already active for this project root (${details}).`
        : 'Remote mode already active for this project root.');
}
async function readRemoteHostLock() {
    try {
        return JSON.parse(await fs.readFile(REMOTE_HOST_LOCK_PATH, 'utf8'));
    }
    catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            return null;
        }
        return null;
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
/** @param {string} agentId */
async function inferDefaultAgentRuntime(agentId) {
    const runtimeConfig = await loadPersistedRuntimeConfig({ agentId });
    const provider = String(runtimeConfig.provider ?? 'openai').trim() || 'openai';
    const model = String(runtimeConfig.model ?? (provider === 'openai' ? 'gpt-5' : '')).trim();
    return {
        provider,
        model,
    };
}
/**
 * @param {string} agentId
 * @param {{ name?: string, provider?: string, model?: string }} [metadata]
 */
async function ensureDefaultAgentFiles(agentId, metadata = {}) {
    const now = new Date().toISOString();
    const existingAgentMetadata = await readJsonIfPresent(buildAgentMetadataPath(agentId));
    const inferredRuntime = await inferDefaultAgentRuntime(agentId);
    const name = String(metadata.name ?? existingAgentMetadata?.name ?? `${defaultWorldName()} agent`).trim()
        || `${defaultWorldName()} agent`;
    const provider = String(metadata.provider ?? existingAgentMetadata?.provider ?? inferredRuntime.provider).trim()
        || inferredRuntime.provider;
    const model = String(metadata.model ?? existingAgentMetadata?.model ?? inferredRuntime.model).trim()
        || inferredRuntime.model;
    await writeJsonAtomic(buildAgentMetadataPath(agentId), {
        id: agentId,
        name,
        provider,
        model,
        createdAt: String(existingAgentMetadata?.createdAt ?? now),
        updatedAt: now,
    });
    if (metadata.provider || metadata.model || !(await pathExists(buildAgentRuntimeConfigPath(agentId)))) {
        await writeJsonAtomic(buildAgentRuntimeConfigPath(agentId), {
            schemaVersion: 1,
            provider,
            model,
        });
    }
    if (!await pathExists(buildAgentStatePath(agentId))) {
        await writeJsonAtomic(buildAgentStatePath(agentId), {
            id: agentId,
            updatedAt: now,
        });
    }
    await ensureTextFile(buildAgentEventsPath(agentId));
    await ensureTextFile(buildAgentInboxPath(agentId));
    await ensureTextFile(buildAgentMemoryPath(agentId));
}
async function readWorldState() {
    const world = await readJsonIfPresent(WORLD_STATE_PATH);
    if (!world || typeof world !== 'object') {
        return null;
    }
    return world;
}
/** @param {{ world: any, updates: Record<string, unknown> }} params */
async function writeWorldState({ world, updates }) {
    const nextWorld = {
        ...world,
        ...updates,
        updatedAt: new Date().toISOString(),
    };
    await writeJsonAtomic(WORLD_STATE_PATH, nextWorld);
    return nextWorld;
}
/**
 * @param {{ id: string, createdAt?: string, updatedAt?: string, messages: any[] }} chat
 * @param {string} agentId
 */
async function persistWorldChat(chat, agentId) {
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
        agentId,
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
async function ensureWorldBootstrap() {
    await ensureAgentWorldDirectories();
    let world = await readWorldState();
    let changed = false;
    if (!world) {
        const now = new Date().toISOString();
        world = {
            id: createWorldId(),
            name: defaultWorldName(),
            defaultAgentId: DEFAULT_AGENT_ID,
            currentChatId: '',
            createdAt: now,
            updatedAt: now,
        };
        changed = true;
    }
    if (!String(world.defaultAgentId ?? '').trim()) {
        world.defaultAgentId = DEFAULT_AGENT_ID;
        changed = true;
    }
    await ensureDefaultAgentFiles(String(world.defaultAgentId));
    if (changed) {
        world = await writeWorldState({ world, updates: {} });
    }
    return /** @type {{ id: string, name: string, defaultAgentId: string, currentChatId: string, createdAt?: string, updatedAt?: string }} */ (world);
}
/** @param {string} agentId */
export async function loadAgentMetadata(agentId) {
    const normalizedAgentId = normalizeAgentId(agentId);
    const metadata = await readJsonIfPresent(buildAgentMetadataPath(normalizedAgentId));
    return metadata && typeof metadata === 'object' ? metadata : null;
}
/**
 * @param {{
 *   agentId?: string,
 *   name?: string,
 *   provider?: string,
 *   model?: string,
 *   setDefault?: boolean,
 * }} [options]
 */
export async function ensureAgentSelection(options = {}) {
    const agentId = normalizeAgentId(options.agentId);
    const world = await ensureWorldBootstrap();
    await ensureDefaultAgentFiles(agentId, {
        name: options.name,
        provider: options.provider,
        model: options.model,
    });
    if (options.setDefault !== false && String(world.defaultAgentId ?? '') !== agentId) {
        await writeWorldState({
            world,
            updates: {
                defaultAgentId: agentId,
                currentChatId: '',
            },
        });
    }
    return await loadAgentMetadata(agentId);
}
/** @param {string} chatId */
async function loadWorldChatMetadata(chatId) {
    return await readJson(buildWorldChatMetadataPath(chatId), `Missing chat session file: ${buildWorldChatMessagesPath(chatId)}`, `Invalid chat session file: ${buildWorldChatMetadataPath(chatId)}`);
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
    await ensureRemoteHostLockDirectory();
    const now = new Date().toISOString();
    const remoteLock = {
        chatId: chat.id,
        pid: process.pid,
        startedAt: now,
        updatedAt: now,
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            await fs.writeFile(REMOTE_HOST_LOCK_PATH, `${JSON.stringify(remoteLock, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
            return remoteLock;
        }
        catch (error) {
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
 * @param {string} chatId
 */
export async function loadChatById(chatId) {
    await ensureWorldBootstrap();
    const normalizedChatId = String(chatId ?? '').trim();
    if (!normalizedChatId) {
        throw new Error('Missing chat ID.');
    }
    return await loadWorldChatById(normalizedChatId);
}
export async function listPersistedChats() {
    const world = await ensureWorldBootstrap();
    const currentChatId = String(world.currentChatId ?? '').trim();
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
/**
 * @param {string} chatId
 */
export async function setCurrentChat(chatId) {
    const world = await ensureWorldBootstrap();
    const chat = await loadChatById(chatId);
    await writeWorldState({
        world,
        updates: {
            currentChatId: chat.id,
        },
    });
    return chat;
}
/**
 * @param {{ newChat: boolean, agentId?: string }} params
 */
export async function loadRequestedChat({ newChat, agentId }) {
    if (newChat) {
        return createEmptyChat();
    }
    const world = await ensureWorldBootstrap();
    const selectedAgentId = normalizeAgentId(agentId ?? world.defaultAgentId);
    const chatId = String(world.currentChatId ?? '').trim();
    if (!chatId) {
        return createEmptyChat();
    }
    try {
        const metadata = await loadWorldChatMetadata(chatId);
        const chatAgentId = String(metadata.agentId ?? '').trim();
        if (chatAgentId && chatAgentId !== selectedAgentId) {
            return createEmptyChat();
        }
        return await loadChatById(chatId);
    }
    catch (error) {
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
    const world = await ensureWorldBootstrap();
    const persistedChat = await persistWorldChat({
        id: chat.id,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        messages,
    }, String(world.defaultAgentId));
    if (setCurrent) {
        await writeWorldState({
            world,
            updates: {
                currentChatId: chat.id,
            },
        });
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
    const world = await ensureWorldBootstrap();
    const eventsPath = buildAgentEventsPath(String(world.defaultAgentId));
    await appendJsonl(eventsPath, streamTraceEvents.map((event) => ({
        kind: 'stream_trace',
        chatId: chat.id,
        type: String(event.type ?? ''),
        text: String(event.text ?? ''),
        createdAt: normalizeTimestamp(event.createdAt, new Date().toISOString()),
    })));
    return eventsPath;
}
/**
 * @param {{
 *   chatId?: string,
 *   remoteSession: Record<string, unknown>,
 * }} params
 */
export async function persistRemoteSessionState({ chatId, remoteSession }) {
    const world = await ensureWorldBootstrap();
    const statePath = buildAgentStatePath(String(world.defaultAgentId));
    const existingState = await readJsonIfPresent(statePath);
    const currentChatId = String(chatId ?? world.currentChatId ?? '').trim();
    await writeJsonAtomic(statePath, {
        ...(existingState && typeof existingState === 'object' ? existingState : {}),
        id: String(world.defaultAgentId),
        currentChatId,
        updatedAt: new Date().toISOString(),
        remoteSession,
    });
    return statePath;
}
