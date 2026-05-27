// @ts-check
/**
 * Agent CLI Chat Store Unit Tests
 *
 * Purpose:
 * - Validate flat `.agent-world/chats` persistence.
 *
 * Recent changes:
 * - 2026-05-26: Covered post-import `AGENT_CLI_WORKSPACE` changes before storage creation.
 * - 2026-05-26: Removed world and agent metadata expectations.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createTestRoot, readJson, removeTestRoot } from '../helpers/test-root.js';

/** @type {string[]} */
const rootsToClean = [];
const originalCwd = process.cwd();

async function loadChatStore(rootPath) {
  process.chdir(rootPath);
  process.env.AGENT_CLI_WORKSPACE = rootPath;
  vi.resetModules();
  return await import('../../core/chat-store.js');
}

afterEach(async () => {
  process.chdir(originalCwd);
  delete process.env.AGENT_CLI_WORKSPACE;
  vi.resetModules();

  while (rootsToClean.length > 0) {
    const rootPath = rootsToClean.pop();

    if (rootPath) {
      await removeTestRoot(rootPath);
    }
  }
});

describe('chat-store', () => {
  it('creates .agent-world under AGENT_CLI_WORKSPACE even when the env var changes after import', async () => {
    const cwdRoot = await createTestRoot();
    const workspaceRoot = await createTestRoot();
    rootsToClean.push(cwdRoot, workspaceRoot);
    process.chdir(cwdRoot);
    delete process.env.AGENT_CLI_WORKSPACE;
    vi.resetModules();

    const { loadRequestedChat } = await import('../../core/chat-store.js');
    process.env.AGENT_CLI_WORKSPACE = workspaceRoot;

    await loadRequestedChat({ newChat: true });

    expect(await readdir(path.join(workspaceRoot, '.agent-world'))).toEqual(
      expect.arrayContaining(['chats', 'skills']),
    );
    await expect(readdir(path.join(cwdRoot, '.agent-world'))).rejects.toThrow();
  });

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
        { type: 'warning', text: 'ignored', createdAt: '2026-05-07T12:00:00.000Z' },
      ],
    });

    const eventLine = (await readFile(path.join(rootPath, '.agent-world', 'chats', chat.id, 'events.jsonl'), 'utf8')).trim();
    expect(JSON.parse(eventLine)).toMatchObject({
      kind: 'stream_trace',
      chatId: chat.id,
      type: 'warning',
      text: 'ignored',
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
});
