// @ts-check
/**
 * Agent CLI Session Store Unit Tests
 *
 * Purpose:
 * - Validate persisted chat and current-pointer behavior without touching the real repo state.
 *
 * Key features:
 * - Covers new chat creation, persistence, reload, and error cases.
 * - Verifies tool metadata survives serialization.
 *
 * Recent changes:
 * - 2026-05-07: Added targeted Vitest coverage for session persistence.
 * - 2026-05-13: Added chat list and explicit selection coverage for remote multi-client flows.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createTestRoot, readJson, removeTestRoot } from '../helpers/test-root.js';

/** @type {string[]} */
const rootsToClean = [];

/** @param {string} rootPath */
async function loadSessionStore(rootPath) {
  process.env.AGENT_CLI_ROOT = rootPath;
  vi.resetModules();
  return await import('../../lib/session-store.js');
}

afterEach(async () => {
  delete process.env.AGENT_CLI_ROOT;

  while (rootsToClean.length > 0) {
    await removeTestRoot(rootsToClean.pop());
  }
});

describe('session-store', () => {
  it('creates a new in-memory chat shell for --new-chat', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { loadRequestedChat } = await loadSessionStore(rootPath);
    const chat = await loadRequestedChat({ newChat: true });

    expect(chat.id).toMatch(/Z-/);
    expect(chat.messages).toEqual([]);
    expect(chat.createdAt).toBe(chat.updatedAt);
  });

  it('persists completed chats and reloads the current chat', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { loadRequestedChat, persistCompletedChat } = await loadSessionStore(rootPath);
    const chat = await loadRequestedChat({ newChat: true });

    await persistCompletedChat({
      chat,
      messages: [
        {
          role: 'user',
          content: 'Hello',
          createdAt: '2026-05-07T12:00:00.000Z',
        },
        {
          role: 'assistant',
          content: 'Hi',
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: {
                name: 'load_skill',
                arguments: '{}',
              },
            },
          ],
        },
      ],
    });

    const current = await readJson(path.join(rootPath, '.chats', 'current.json'));
    expect(current).toEqual({ chatId: chat.id });

    const storedChat = await readJson(
      path.join(rootPath, '.chats', chat.id, 'messages.json'),
    );
    expect(storedChat.id).toBe(chat.id);

    const reloaded = await loadRequestedChat({ newChat: false });
    expect(reloaded.id).toBe(chat.id);
    expect(reloaded.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'Hello' }),
      expect.objectContaining({ role: 'assistant', content: 'Hi' }),
    ]);
    expect(reloaded.messages[1].tool_calls).toHaveLength(1);
  });

  it('creates a new in-memory chat shell when there is no current chat', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { loadRequestedChat } = await loadSessionStore(rootPath);
    const chat = await loadRequestedChat({ newChat: false });

    expect(chat.id).toMatch(/Z-/);
    expect(chat.messages).toEqual([]);
    expect(chat.createdAt).toBe(chat.updatedAt);
  });

  it('creates a new in-memory chat shell when the current chat file is missing', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { loadRequestedChat, persistCompletedChat } = await loadSessionStore(rootPath);
    const chat = await loadRequestedChat({ newChat: true });

    await persistCompletedChat({
      chat,
      messages: [
        {
          role: 'user',
          content: 'Hello',
        },
      ],
    });

    const current = await readJson(path.join(rootPath, '.chats', 'current.json'));
    await removeTestRoot(path.join(rootPath, '.chats', current.chatId));

    const recoveredChat = await loadRequestedChat({ newChat: false });

    expect(recoveredChat.id).not.toBe(chat.id);
    expect(recoveredChat.messages).toEqual([]);
  });

  it('persists stream trace events json when requested', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { loadRequestedChat, persistCompletedChat, persistStreamTraceEvents } = await loadSessionStore(rootPath);
    const chat = await loadRequestedChat({ newChat: true });

    await persistCompletedChat({
      chat,
      messages: [
        {
          role: 'user',
          content: 'Hello',
        },
        {
          role: 'assistant',
          content: 'Hi',
        },
      ],
    });

    await persistStreamTraceEvents({
      chat,
      streamTraceEvents: [
        {
          type: 'warning',
          text: 'webSearch ignored',
          createdAt: '2026-05-07T12:00:00.000Z',
        },
        {
          type: 'text',
          text: 'Hi',
          createdAt: '2026-05-07T12:00:01.000Z',
        },
      ],
    });

    const eventsPath = path.join(rootPath, '.chats', chat.id, 'events.json');
    const eventsData = JSON.parse(await readFile(eventsPath, 'utf8'));

    expect(eventsData.chatId).toBe(chat.id);
    expect(Array.isArray(eventsData.events)).toBe(true);
    expect(eventsData.events).toHaveLength(2);
    expect(eventsData.events[0]).toMatchObject({ type: 'warning', text: 'webSearch ignored' });
    expect(eventsData.events[1]).toMatchObject({ type: 'text', text: 'Hi' });
  });

  it('persists remote session metadata for the active chat', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { loadRequestedChat, persistCompletedChat, persistRemoteSessionState } = await loadSessionStore(rootPath);
    const chat = await loadRequestedChat({ newChat: true });

    await persistCompletedChat({
      chat,
      messages: [
        {
          role: 'user',
          content: 'Hello',
        },
      ],
    });

    await persistRemoteSessionState({
      chat,
      remoteSession: {
        sessionId: 'relay-session-1',
        clientConnectionUrl: 'http://127.0.0.1:8787/pair?sessionId=relay-session-1',
      },
    });

    const remoteData = JSON.parse(await readFile(path.join(rootPath, '.chats', chat.id, 'remote.json'), 'utf8'));

    expect(remoteData.chatId).toBe(chat.id);
    expect(remoteData.remoteSession).toMatchObject({
      sessionId: 'relay-session-1',
      clientConnectionUrl: 'http://127.0.0.1:8787/pair?sessionId=relay-session-1',
    });
  });

  it('lists persisted chats and marks the current chat', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const {
      createPersistedChat,
      listPersistedChats,
      loadRequestedChat,
      persistCompletedChat,
    } = await loadSessionStore(rootPath);
    const activeChat = await loadRequestedChat({ newChat: true });

    await persistCompletedChat({
      chat: activeChat,
      messages: [
        { role: 'user', content: 'Current chat message' },
      ],
    });

    const inactiveChat = await createPersistedChat({ setCurrent: false });
    await persistCompletedChat({
      chat: inactiveChat,
      messages: [
        { role: 'assistant', content: 'Inactive chat message' },
      ],
      setCurrent: false,
    });

    const chats = await listPersistedChats();

    expect(chats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: activeChat.id,
        messageCount: 1,
        isCurrent: true,
      }),
      expect.objectContaining({
        id: inactiveChat.id,
        messageCount: 1,
        isCurrent: false,
      }),
    ]));
  });

  it('loads chats by id and can switch the current chat explicitly', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const {
      createPersistedChat,
      loadChatById,
      loadRequestedChat,
      persistCompletedChat,
      setCurrentChat,
    } = await loadSessionStore(rootPath);
    const firstChat = await loadRequestedChat({ newChat: true });

    await persistCompletedChat({
      chat: firstChat,
      messages: [
        { role: 'user', content: 'First chat' },
      ],
    });

    const secondChat = await createPersistedChat({ setCurrent: false });
    await persistCompletedChat({
      chat: secondChat,
      messages: [
        { role: 'assistant', content: 'Second chat' },
      ],
      setCurrent: false,
    });

    const loadedSecondChat = await loadChatById(secondChat.id);
    expect(loadedSecondChat.messages).toEqual([
      expect.objectContaining({ role: 'assistant', content: 'Second chat' }),
    ]);

    await setCurrentChat(secondChat.id);

    const current = await loadRequestedChat({ newChat: false });
    expect(current.id).toBe(secondChat.id);
    expect(current.messages).toEqual([
      expect.objectContaining({ role: 'assistant', content: 'Second chat' }),
    ]);
  });

  it('acquires and releases the remote host lock for the current root', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const {
      acquireRemoteHostLock,
      loadRequestedChat,
      releaseRemoteHostLock,
    } = await loadSessionStore(rootPath);
    const chat = await loadRequestedChat({ newChat: true });

    await acquireRemoteHostLock({ chat });

    const remoteLock = await readJson(path.join(rootPath, '.chats', 'remote-host.lock.json'));
    expect(remoteLock).toMatchObject({
      chatId: chat.id,
      pid: process.pid,
    });

    await expect(releaseRemoteHostLock()).resolves.toBe(true);
    await expect(readFile(path.join(rootPath, '.chats', 'remote-host.lock.json'), 'utf8')).rejects.toBeTruthy();
  });

  it('updates the remote host lock when the active chat changes', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const {
      acquireRemoteHostLock,
      loadRequestedChat,
      releaseRemoteHostLock,
      updateRemoteHostLock,
    } = await loadSessionStore(rootPath);
    const chat = await loadRequestedChat({ newChat: true });

    await acquireRemoteHostLock({ chat });
    await expect(updateRemoteHostLock({ chatId: 'chat-switched-1' })).resolves.toBe(true);

    const remoteLock = await readJson(path.join(rootPath, '.chats', 'remote-host.lock.json'));
    expect(remoteLock).toMatchObject({
      chatId: 'chat-switched-1',
      pid: process.pid,
    });

    await expect(releaseRemoteHostLock()).resolves.toBe(true);
  });

  it('rejects when a live remote host lock already exists', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { assertNoActiveRemoteHost } = await loadSessionStore(rootPath);
    await mkdir(path.join(rootPath, '.chats'), { recursive: true });
    await writeFile(
      path.join(rootPath, '.chats', 'remote-host.lock.json'),
      JSON.stringify({ chatId: 'chat-remote-1', pid: process.pid }, null, 2),
      'utf8',
    );

    await expect(assertNoActiveRemoteHost()).rejects.toThrow(
      `Remote mode already active for this project root (chat chat-remote-1, pid ${process.pid}).`,
    );
  });

  it('clears a stale remote host lock before continuing', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { assertNoActiveRemoteHost } = await loadSessionStore(rootPath);
    await mkdir(path.join(rootPath, '.chats'), { recursive: true });
    const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      const error = new Error('ESRCH');
      // @ts-expect-error test-only process error shape
      error.code = 'ESRCH';
      throw error;
    });

    await writeFile(
      path.join(rootPath, '.chats', 'remote-host.lock.json'),
      JSON.stringify({ chatId: 'chat-stale-1', pid: 999999 }, null, 2),
      'utf8',
    );

    await expect(assertNoActiveRemoteHost()).resolves.toBeNull();
    await expect(readFile(path.join(rootPath, '.chats', 'remote-host.lock.json'), 'utf8')).rejects.toBeTruthy();

    processKillSpy.mockRestore();
  });
});