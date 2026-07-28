// @ts-check
/**
 * Agent CLI Chat Store Unit Tests
 *
 * Purpose:
 * - Validate flat `.agent-world/chats` persistence.
 *
 * Recent changes:
 * - 2026-07-27: Added unsafe chat-id rejection and poisoned current-pointer coverage.
 * - 2026-06-02: Removed environment-based workspace root setup.
 * - 2026-05-26: Removed world and agent metadata expectations.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createTestRoot, readJson, removeTestRoot } from '../helpers/test-root.js';

/** @type {string[]} */
const rootsToClean = [];
const originalCwd = process.cwd();

async function loadChatStore(rootPath) {
  process.chdir(rootPath);
  vi.resetModules();
  return await import('../../core/chat-store.js');
}

afterEach(async () => {
  process.chdir(originalCwd);
  vi.resetModules();

  while (rootsToClean.length > 0) {
    const rootPath = rootsToClean.pop();

    if (rootPath) {
      await removeTestRoot(rootPath);
    }
  }
});

describe('chat-store', () => {
  it('persists chats under .agent-world/chats and tracks the current chat there', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { loadRequestedChat, persistCompletedChat } = await loadChatStore(rootPath);
    const chat = await loadRequestedChat({ newChat: true });

    await persistCompletedChat({
      chat,
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ],
    });

    const chatRoot = path.join(rootPath, '.agent-world', 'chats', chat.id);
    const metadata = await readJson(path.join(chatRoot, 'chat.json'));
    const current = await readJson(path.join(rootPath, '.agent-world', 'chats', 'current.json'));
    const messages = (await readFile(path.join(chatRoot, 'messages.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    expect(metadata).toMatchObject({
      id: chat.id,
      messageCount: 2,
    });
    expect(current.chatId).toBe(chat.id);
    expect(messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'Hello' }),
      expect.objectContaining({ role: 'assistant', content: 'Hi' }),
    ]);
    await expect(readFile(path.join(chatRoot, 'summary.md'), 'utf8')).resolves.toBe('');
    await expect(readFile(path.join(rootPath, '.agent-world', 'world.json'), 'utf8')).rejects.toThrow();
    await expect(readFile(path.join(rootPath, '.agent-world', 'agents', 'default', 'agent.json'), 'utf8')).rejects.toThrow();
  });

  it('reloads the selected chat from chats/current.json', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const {
      createPersistedChat,
      loadRequestedChat,
      persistCompletedChat,
      setCurrentChat,
    } = await loadChatStore(rootPath);
    const firstChat = await loadRequestedChat({ newChat: true });
    await persistCompletedChat({
      chat: firstChat,
      messages: [{ role: 'user', content: 'first' }],
    });

    const secondChat = await createPersistedChat({ setCurrent: false });
    await persistCompletedChat({
      chat: secondChat,
      messages: [{ role: 'assistant', content: 'second' }],
      setCurrent: false,
    });

    await setCurrentChat(secondChat.id);

    const loaded = await loadRequestedChat({ newChat: false });
    expect(loaded.id).toBe(secondChat.id);
    expect(loaded.messages).toEqual([
      expect.objectContaining({ role: 'assistant', content: 'second' }),
    ]);
  });

  it('creates a persisted current chat only when requested or when no current chat exists', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { listPersistedChats, loadRequestedChat } = await loadChatStore(rootPath);

    const firstChat = await loadRequestedChat({ newChat: false });
    const firstCurrent = await readJson(path.join(rootPath, '.agent-world', 'chats', 'current.json'));

    expect(firstCurrent.chatId).toBe(firstChat.id);
    expect(await listPersistedChats()).toEqual([
      expect.objectContaining({
        id: firstChat.id,
        isCurrent: true,
        messageCount: 0,
      }),
    ]);

    const loadedCurrent = await loadRequestedChat({ newChat: false });
    expect(loadedCurrent.id).toBe(firstChat.id);
    expect(await listPersistedChats()).toHaveLength(1);

    const secondChat = await loadRequestedChat({ newChat: true });
    const secondCurrent = await readJson(path.join(rootPath, '.agent-world', 'chats', 'current.json'));
    const chats = await listPersistedChats();

    expect(secondChat.id).not.toBe(firstChat.id);
    expect(secondCurrent.chatId).toBe(secondChat.id);
    expect(chats).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: firstChat.id, isCurrent: false }),
      expect.objectContaining({ id: secondChat.id, isCurrent: true }),
    ]));
    expect(chats).toHaveLength(2);
  });

  it('lists persisted chats and marks the current chat', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const {
      createPersistedChat,
      listPersistedChats,
      loadRequestedChat,
      persistCompletedChat,
    } = await loadChatStore(rootPath);
    const activeChat = await loadRequestedChat({ newChat: true });

    await persistCompletedChat({
      chat: activeChat,
      messages: [{ role: 'user', content: 'Current chat message' }],
    });

    const inactiveChat = await createPersistedChat({ setCurrent: false });
    await persistCompletedChat({
      chat: inactiveChat,
      messages: [{ role: 'assistant', content: 'Inactive chat message' }],
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

  it('loads chats by id and deletes the selected chat cleanly', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const {
      deletePersistedChat,
      loadChatById,
      loadRequestedChat,
      persistCompletedChat,
    } = await loadChatStore(rootPath);
    const chat = await loadRequestedChat({ newChat: true });

    await persistCompletedChat({
      chat,
      messages: [{ role: 'user', content: 'hello' }],
    });

    await expect(loadChatById(chat.id)).resolves.toMatchObject({
      id: chat.id,
      messages: [expect.objectContaining({ role: 'user', content: 'hello' })],
    });

    await expect(deletePersistedChat(chat.id)).resolves.toEqual({
      chatId: chat.id,
      deleted: true,
    });
    await expect(readFile(path.join(rootPath, '.agent-world', 'chats', chat.id, 'chat.json'), 'utf8')).rejects.toThrow();
    const replacementChat = await loadRequestedChat({ newChat: false });
    expect(replacementChat.id).not.toBe(chat.id);
    expect(replacementChat).toMatchObject({
      messages: [],
    });
    await expect(readFile(path.join(rootPath, '.agent-world', 'chats', replacementChat.id, 'chat.json'), 'utf8')).resolves.toContain(replacementChat.id);
  });

  it('persists stream trace events inside the chat folder', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { loadRequestedChat, persistCompletedChat, persistStreamTraceEvents } = await loadChatStore(rootPath);
    const chat = await loadRequestedChat({ newChat: true });
    await persistCompletedChat({ chat, messages: [] });

    await persistStreamTraceEvents({
      chat,
      streamTraceEvents: [
        {
          type: 'text',
          text: 'done',
          createdAt: '2026-05-07T12:00:00.000Z',
          stopKind: 'natural_stop',
          finishReason: 'stop',
          usage: {
            inputTokens: 7,
            outputTokens: 3,
            totalTokens: 10,
          },
        },
      ],
    });

    const eventLine = (await readFile(path.join(rootPath, '.agent-world', 'chats', chat.id, 'events.jsonl'), 'utf8')).trim();
    expect(JSON.parse(eventLine)).toMatchObject({
      kind: 'stream_trace',
      chatId: chat.id,
      type: 'text',
      text: 'done',
      stopKind: 'natural_stop',
      finishReason: 'stop',
      usage: {
        inputTokens: 7,
        outputTokens: 3,
        totalTokens: 10,
      },
    });
  });

  it('starts fresh when only legacy .chats data exists', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    await mkdir(path.join(rootPath, '.chats', 'legacy-chat-1'), { recursive: true });
    await writeFile(
      path.join(rootPath, '.chats', 'legacy-chat-1', 'messages.json'),
      `${JSON.stringify({
        id: 'legacy-chat-1',
        messages: [{ role: 'user', content: 'legacy question' }],
      }, null, 2)}\n`,
      'utf8',
    );
    await writeFile(path.join(rootPath, '.chats', 'current.json'), `${JSON.stringify({ chatId: 'legacy-chat-1' }, null, 2)}\n`, 'utf8');

    const { listPersistedChats, loadRequestedChat } = await loadChatStore(rootPath);
    const current = await loadRequestedChat({ newChat: false });
    expect(current.id).not.toBe('legacy-chat-1');
    expect(current.messages).toEqual([]);

    const chats = await listPersistedChats();
    expect(chats).toEqual([
      expect.objectContaining({
        id: current.id,
        isCurrent: true,
        messageCount: 0,
      }),
    ]);
  });

  it('rejects chat ids that escape the chats root before touching the filesystem', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const victimRoot = path.join(rootPath, 'victim');
    await mkdir(victimRoot, { recursive: true });
    await writeFile(path.join(victimRoot, 'important.txt'), 'do not delete', 'utf8');

    const {
      deletePersistedChat,
      loadChatById,
      persistCompletedChat,
      setCurrentChat,
    } = await loadChatStore(rootPath);

    const unsafeChatIds = ['../../victim', '..', '.', 'nested/chat', 'nested\\chat', '/etc/passwd', '', '   '];

    for (const chatId of unsafeChatIds) {
      await expect(loadChatById(chatId)).rejects.toThrow(/chat ID/i);
      await expect(setCurrentChat(chatId)).rejects.toThrow(/chat ID/i);
      await expect(deletePersistedChat(chatId)).rejects.toThrow(/chat ID/i);
      await expect(persistCompletedChat({ chat: { id: chatId }, messages: [] })).rejects.toThrow(/chat ID/i);
    }

    await expect(readFile(path.join(victimRoot, 'important.txt'), 'utf8')).resolves.toBe('do not delete');
  });

  it('ignores an unsafe current chat pointer instead of failing startup', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    await mkdir(path.join(rootPath, '.agent-world', 'chats'), { recursive: true });
    await writeFile(
      path.join(rootPath, '.agent-world', 'chats', 'current.json'),
      `${JSON.stringify({ chatId: '../../victim' }, null, 2)}\n`,
      'utf8',
    );

    const { loadRequestedChat } = await loadChatStore(rootPath);
    const chat = await loadRequestedChat({ newChat: false });

    expect(chat.id).not.toBe('../../victim');
    expect(chat.messages).toEqual([]);
  });
});
