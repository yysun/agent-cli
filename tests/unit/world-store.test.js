// @ts-check
/**
 * Agent CLI World Store Unit Tests
 *
 * Purpose:
 * - Validate world-backed chat persistence without touching the real repo state.
 *
 * Key features:
 * - Covers world bootstrap, current-chat selection, and agent-scoped trace/state files.
 * - Covers named-agent creation and selection.
 * - Verifies tool metadata survives JSONL serialization.
 * - Verifies default-world storage under `.agent-world/worlds/default`.
 *
 * Recent changes:
 * - 2026-05-24: Confirmed named-agent runtime settings stay in agent.json.
 * - 2026-05-23: Updated fixtures for multi-world storage paths.
 * - 2026-05-20: Added named-agent selection coverage.
 * - 2026-05-14: Reworked coverage for `.agent-world` storage.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createTestRoot, readJson, removeTestRoot } from '../helpers/test-root.js';

/** @type {string[]} */
const rootsToClean = [];
const originalCwd = process.cwd();

/** @param {string} rootPath */
async function loadWorldStore(rootPath) {
  process.chdir(rootPath);
  vi.resetModules();
  return await import('../../core/world-store.js');
}

/** @param {string} filePath */
async function readJsonl(filePath) {
  const content = await readFile(filePath, 'utf8');
  return content.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

afterEach(async () => {
  process.chdir(originalCwd);

  while (rootsToClean.length > 0) {
    await removeTestRoot(rootsToClean.pop());
  }
});

describe('world-store', () => {
  it('creates a new in-memory chat shell for --new-chat', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { loadRequestedChat } = await loadWorldStore(rootPath);
    const chat = await loadRequestedChat({ newChat: true });

    expect(chat.id).toMatch(/Z-/);
    expect(chat.messages).toEqual([]);
    expect(chat.createdAt).toBe(chat.updatedAt);
  });

  it('bootstraps .agent-world and persists completed chats under chats/{chatId}', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { loadRequestedChat, persistCompletedChat } = await loadWorldStore(rootPath);
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

    const world = await readJson(path.join(rootPath, '.agent-world', 'worlds', 'default', 'world.json'));
    expect(world.defaultAgentId).toBe('default');
    expect(world.currentChatId).toBe(chat.id);

    const agent = await readJson(path.join(rootPath, '.agent-world', 'worlds', 'default', 'agents', 'default', 'agent.json'));
    expect(agent).toMatchObject({
      id: 'default',
      provider: 'openai',
      model: 'gpt-5',
    });

    const storedChat = await readJson(path.join(rootPath, '.agent-world', 'worlds', 'default', 'chats', chat.id, 'chat.json'));
    expect(storedChat).toMatchObject({
      id: chat.id,
      agentId: 'default',
      messageCount: 2,
    });

    const storedMessages = await readJsonl(path.join(rootPath, '.agent-world', 'worlds', 'default', 'chats', chat.id, 'messages.jsonl'));
    expect(storedMessages).toHaveLength(2);
    expect(storedMessages[0]).toMatchObject({ role: 'user', content: 'Hello' });
    expect(storedMessages[1]).toMatchObject({ role: 'assistant', content: 'Hi' });
    expect(storedMessages[1].tool_calls).toHaveLength(1);

    await expect(readFile(path.join(rootPath, '.agent-world', 'worlds', 'default', 'chats', chat.id, 'summary.md'), 'utf8')).resolves.toBe('');
  });

  it('creates and selects a named agent with runtime settings in agent.json', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { ensureAgentSelection } = await loadWorldStore(rootPath);

    await ensureAgentSelection({
      agentId: 'research',
      name: 'Research Agent',
      provider: 'ollama',
      model: 'gemma4:e4b',
    });

    const world = await readJson(path.join(rootPath, '.agent-world', 'worlds', 'default', 'world.json'));
    const agent = await readJson(path.join(rootPath, '.agent-world', 'worlds', 'default', 'agents', 'research', 'agent.json'));

    expect(world.defaultAgentId).toBe('research');
    expect(world.currentChatId).toBe('');
    expect(agent).toMatchObject({
      id: 'research',
      name: 'Research Agent',
      provider: 'ollama',
      model: 'gemma4:e4b',
    });
    await expect(readFile(path.join(rootPath, '.agent-world', 'worlds', 'default', 'agents', 'research', 'runtime.json'), 'utf8')).rejects.toThrow();
    await expect(readFile(path.join(rootPath, '.agent-world', 'research', 'agent.json'), 'utf8')).rejects.toThrow();
  });

  it('reloads the current chat from world.json.currentChatId', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { loadRequestedChat, persistCompletedChat } = await loadWorldStore(rootPath);
    const chat = await loadRequestedChat({ newChat: true });

    await persistCompletedChat({
      chat,
      messages: [
        { role: 'user', content: 'Hello' },
      ],
    });

    const reloaded = await loadRequestedChat({ newChat: false });
    expect(reloaded.id).toBe(chat.id);
    expect(reloaded.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'Hello' }),
    ]);
  });

  it('creates a new in-memory chat shell when there is no current chat', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { loadRequestedChat } = await loadWorldStore(rootPath);
    const chat = await loadRequestedChat({ newChat: false });

    expect(chat.id).toMatch(/Z-/);
    expect(chat.messages).toEqual([]);
    expect(chat.createdAt).toBe(chat.updatedAt);
  });

  it('creates a new in-memory chat shell when the selected chat is missing', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    await mkdir(path.join(rootPath, '.agent-world', 'worlds', 'default'), { recursive: true });
    await writeFile(
      path.join(rootPath, '.agent-world', 'worlds', 'default', 'world.json'),
      `${JSON.stringify({
        id: 'world-1',
        name: 'Test World',
        defaultAgentId: 'default',
        currentChatId: 'missing-chat',
      }, null, 2)}\n`,
      'utf8',
    );

    const { loadRequestedChat } = await loadWorldStore(rootPath);
    const recoveredChat = await loadRequestedChat({ newChat: false });

    expect(recoveredChat.id).toMatch(/Z-/);
    expect(recoveredChat.messages).toEqual([]);
  });

  it('persists stream trace events to the default agent events jsonl', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { loadRequestedChat, persistCompletedChat, persistStreamTraceEvents } = await loadWorldStore(rootPath);
    const chat = await loadRequestedChat({ newChat: true });

    await persistCompletedChat({
      chat,
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ],
    });

    await persistStreamTraceEvents({
      chat,
      streamTraceEvents: [
        { type: 'warning', text: 'webSearch ignored', createdAt: '2026-05-07T12:00:00.000Z' },
        { type: 'text', text: 'Hi', createdAt: '2026-05-07T12:00:01.000Z' },
      ],
    });

    const events = await readJsonl(path.join(rootPath, '.agent-world', 'worlds', 'default', 'agents', 'default', 'events.jsonl'));
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: 'stream_trace', chatId: chat.id, type: 'warning' });
    expect(events[1]).toMatchObject({ kind: 'stream_trace', chatId: chat.id, type: 'text', text: 'Hi' });
  });

  it('lists persisted chats and marks the current chat', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const {
      createPersistedChat,
      listPersistedChats,
      loadRequestedChat,
      persistCompletedChat,
    } = await loadWorldStore(rootPath);
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
    } = await loadWorldStore(rootPath);
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

    const world = await readJson(path.join(rootPath, '.agent-world', 'worlds', 'default', 'world.json'));
    expect(world.currentChatId).toBe(secondChat.id);

    const current = await loadRequestedChat({ newChat: false });
    expect(current.id).toBe(secondChat.id);
  });

  it('starts fresh when only legacy .chats data exists', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    await mkdir(path.join(rootPath, '.chats', 'legacy-chat-1'), { recursive: true });
    await writeFile(
      path.join(rootPath, '.chats', 'legacy-chat-1', 'messages.json'),
      `${JSON.stringify({
        id: 'legacy-chat-1',
        createdAt: '2026-05-13T10:00:00.000Z',
        updatedAt: '2026-05-13T10:05:00.000Z',
        messages: [
          { role: 'user', content: 'legacy question', createdAt: '2026-05-13T10:00:00.000Z' },
        ],
      }, null, 2)}\n`,
      'utf8',
    );
    await writeFile(path.join(rootPath, '.chats', 'current.json'), `${JSON.stringify({ chatId: 'legacy-chat-1' }, null, 2)}\n`, 'utf8');

    const { listPersistedChats, loadRequestedChat } = await loadWorldStore(rootPath);
    const current = await loadRequestedChat({ newChat: false });
    expect(current.id).not.toBe('legacy-chat-1');
    expect(current.messages).toEqual([]);

    const chats = await listPersistedChats();
    expect(chats).toEqual([]);
  });

});
