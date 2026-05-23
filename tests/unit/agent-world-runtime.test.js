// @ts-check
/**
 * Agent World Runtime Unit Tests
 *
 * Purpose:
 * - Validate the lean world API runtime without live provider calls.
 *
 * Key features:
 * - Covers default sends, mention routing, inline mention suppression, durable queues, and restart resume.
 * - Verifies agent-level memory receives chat-scoped records.
 *
 * Recent changes:
 * - 2026-05-23: Added initial world API runtime coverage.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { createTestRoot, readJson, removeTestRoot } from '../helpers/test-root.js';

/** @type {string[]} */
const rootsToClean = [];
const originalCwd = process.cwd();

/** @param {string} filePath */
async function readJsonl(filePath) {
  const content = await readFile(filePath, 'utf8');
  return content.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

function createDeferred() {
  /** @type {(value: unknown) => void} */
  let resolve = () => {};
  /** @type {(error: unknown) => void} */
  let reject = () => {};
  const promise = new Promise((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate, timeoutMs = 1000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for condition.');
}

/**
 * @param {string} rootPath
 * @param {(params: any) => Promise<any>} runChatTurn
 */
async function loadRuntime(rootPath, runChatTurn) {
  process.chdir(rootPath);
  vi.resetModules();
  vi.doMock('../../core/agent-runtime.js', async () => {
    const actual = await vi.importActual('../../core/agent-runtime.js');
    return {
      ...actual,
      runChatTurn,
    };
  });
  return await import('../../core/agent-world-runtime.ts');
}

afterEach(async () => {
  process.chdir(originalCwd);
  vi.doUnmock('../../core/agent-runtime.js');

  while (rootsToClean.length > 0) {
    await removeTestRoot(rootsToClean.pop());
  }
});

describe('agent-world-runtime', () => {
  it('sends through the default agent and persists agent-level memory', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    const runChatTurn = vi.fn(async ({ chat, userMessage, onStreamChunk }) => {
      await onStreamChunk?.({ content: 'hello' });
      return {
        assistantText: 'hello',
        messages: [
          ...chat.messages,
          { role: 'user', content: userMessage, createdAt: '2026-05-23T10:00:00.000Z' },
          { role: 'assistant', content: 'hello', createdAt: '2026-05-23T10:00:01.000Z' },
        ],
      };
    });
    const { createAgentWorldRuntime } = await loadRuntime(rootPath, runChatTurn);
    const runtime = createAgentWorldRuntime({ autoResume: false });
    const observed = [];
    runtime.events.onEvent((event) => observed.push(event));

    const result = await runtime.messages.send({ content: 'hi', stream: true });

    expect(result.agentIds).toEqual(['default']);
    expect(runChatTurn.mock.calls[0][0].historyMessageLimit).toBe(0);
    expect(runChatTurn.mock.calls[0][0].workspaceSystemPrompt).toContain('World runtime context:');
    expect(observed.map((event) => event.type)).toContain('assistant_chunk');
    const memory = await readJsonl(path.join(rootPath, '.agent-world', 'worlds', 'default', 'agents', 'default', 'memory.jsonl'));
    expect(memory).toEqual([
      expect.objectContaining({ role: 'user', content: 'hi', agentId: 'default', chatId: result.chatId }),
      expect.objectContaining({ role: 'assistant', content: 'hello', agentId: 'default', chatId: result.chatId }),
    ]);
  });

  it('routes paragraph-beginning mentions without changing the default agent', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    const runChatTurn = vi.fn(async ({ chat, userMessage }) => ({
      assistantText: 'routed',
      messages: [
        ...chat.messages,
        { role: 'user', content: userMessage, createdAt: '2026-05-23T10:00:00.000Z' },
        { role: 'assistant', content: 'routed', createdAt: '2026-05-23T10:00:01.000Z' },
      ],
    }));
    const { createAgentWorldRuntime } = await loadRuntime(rootPath, runChatTurn);
    const runtime = createAgentWorldRuntime({ autoResume: false });
    await runtime.agents.create({
      agentId: 'second-agent',
      name: 'Second Agent',
      provider: 'openai',
      model: 'gpt-5',
      setDefault: false,
    });

    const result = await runtime.messages.send({ content: '@second-agent summarize this' });

    expect(result.agentIds).toEqual(['second-agent']);
    const world = await readJson(path.join(rootPath, '.agent-world', 'worlds', 'default', 'world.json'));
    expect(world.defaultAgentId).toBe('default');
    const routedMemory = await readJsonl(path.join(rootPath, '.agent-world', 'worlds', 'default', 'agents', 'second-agent', 'memory.jsonl'));
    expect(routedMemory).toEqual([
      expect.objectContaining({ content: '@second-agent summarize this', agentId: 'second-agent' }),
      expect.objectContaining({ content: 'routed', agentId: 'second-agent' }),
    ]);
  });

  it('routes unmentioned user messages to mainAgent when configured', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    const runChatTurn = vi.fn(async ({ chat, userMessage }) => ({
      assistantText: 'main',
      messages: [
        ...chat.messages,
        { role: 'user', content: userMessage, createdAt: '2026-05-23T10:00:00.000Z' },
        { role: 'assistant', content: 'main', createdAt: '2026-05-23T10:00:01.000Z' },
      ],
    }));
    const { createAgentWorldRuntime } = await loadRuntime(rootPath, runChatTurn);
    const runtime = createAgentWorldRuntime({ autoResume: false });
    await runtime.agents.create({
      agentId: 'main-agent',
      name: 'Main Agent',
      provider: 'openai',
      model: 'gpt-5',
      setDefault: false,
    });
    await runtime.world.update({ mainAgent: 'Main Agent' });

    const result = await runtime.messages.send({ content: 'handle this' });

    expect(result.agentIds).toEqual(['main-agent']);
    const world = await readJson(path.join(rootPath, '.agent-world', 'worlds', 'default', 'world.json'));
    expect(world.defaultAgentId).toBe('default');
  });

  it('runs multiple paragraph mentions sequentially in first-seen order', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    const runChatTurn = vi.fn(async ({ chat, userMessage, agentConfig }) => ({
      assistantText: `from:${agentConfig.model}`,
      messages: [
        ...chat.messages,
        { role: 'user', content: userMessage, createdAt: new Date().toISOString() },
        { role: 'assistant', content: `from:${agentConfig.model}`, createdAt: new Date().toISOString() },
      ],
    }));
    const { createAgentWorldRuntime } = await loadRuntime(rootPath, runChatTurn);
    const runtime = createAgentWorldRuntime({ autoResume: false });
    await runtime.agents.create({ agentId: 'alpha', provider: 'openai', model: 'alpha-model', setDefault: false });
    await runtime.agents.create({ agentId: 'beta', provider: 'openai', model: 'beta-model', setDefault: false });

    const result = await runtime.messages.send({ content: '@alpha first\n@beta second\n@alpha duplicate' });

    expect(result.agentIds).toEqual(['alpha', 'beta']);
    expect(runChatTurn).toHaveBeenCalledTimes(2);
    expect(runChatTurn.mock.calls[0][0].agentConfig.model).toBe('alpha-model');
    expect(runChatTurn.mock.calls[1][0].agentConfig.model).toBe('beta-model');
  });

  it('rejects inline mentions instead of falling back to broadcast', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    const runChatTurn = vi.fn();
    const { createAgentWorldRuntime } = await loadRuntime(rootPath, runChatTurn);
    const runtime = createAgentWorldRuntime({ autoResume: false });

    await expect(runtime.messages.send({ content: 'please ask @default about this' })).rejects.toThrow(
      'Inline @mentions do not route messages',
    );
    expect(runChatTurn).not.toHaveBeenCalled();
  });

  it('does not route agent-originated messages without paragraph mentions', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    const runChatTurn = vi.fn();
    const { createAgentWorldRuntime } = await loadRuntime(rootPath, runChatTurn);
    const runtime = createAgentWorldRuntime({ autoResume: false });

    await expect(runtime.messages.send({ content: 'status update', sender: 'default' })).rejects.toThrow(
      'Agent-originated messages require a paragraph-beginning @mention',
    );
    await expect(runtime.messages.send({ content: '@default status update', sender: 'default' })).rejects.toThrow(
      'Agent self-messages do not trigger that same agent',
    );
    expect(runChatTurn).not.toHaveBeenCalled();
  });

  it('queues steering messages while a chat is processing and dispatches them after completion', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    const firstTurn = createDeferred();
    const runChatTurn = vi.fn(async ({ chat, userMessage }) => {
      if (runChatTurn.mock.calls.length === 1) {
        await firstTurn.promise;
      }
      return {
        assistantText: `answer:${userMessage}`,
        messages: [
          ...chat.messages,
          { role: 'user', content: userMessage, createdAt: new Date().toISOString() },
          { role: 'assistant', content: `answer:${userMessage}`, createdAt: new Date().toISOString() },
        ],
      };
    });
    const { createAgentWorldRuntime } = await loadRuntime(rootPath, runChatTurn);
    const runtime = createAgentWorldRuntime({ autoResume: false });
    const firstSend = runtime.messages.send({ content: 'first' });
    await waitFor(() => Promise.resolve(runChatTurn.mock.calls.length === 1));

    const queued = await runtime.messages.send({ content: 'second' });
    expect(queued.queued).toBe(true);
    expect(queued.queueMessage?.status).toBe('queued');

    firstTurn.resolve(null);
    await firstSend;
    await waitFor(() => Promise.resolve(runChatTurn.mock.calls.length === 2));
    await waitFor(async () => (await runtime.queue.list(queued.chatId)).length === 0);
  });

  it('supports queue pause, resume, and stop controls', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    const runChatTurn = vi.fn(async ({ chat, userMessage }) => ({
      assistantText: `answer:${userMessage}`,
      messages: [
        ...chat.messages,
        { role: 'user', content: userMessage, createdAt: new Date().toISOString() },
        { role: 'assistant', content: `answer:${userMessage}`, createdAt: new Date().toISOString() },
      ],
    }));
    const { createAgentWorldRuntime } = await loadRuntime(rootPath, runChatTurn);
    const runtime = createAgentWorldRuntime({ autoResume: false });
    const { chatId } = await runtime.chats.create();

    await runtime.queue.pause(chatId);
    const pausedRow = await runtime.queue.add('wait here', 'human', chatId);
    expect(pausedRow.status).toBe('queued');
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(runChatTurn).not.toHaveBeenCalled();

    await runtime.queue.resume(chatId);
    await waitFor(() => Promise.resolve(runChatTurn.mock.calls.length === 1));
    await waitFor(async () => (await runtime.queue.list(chatId)).length === 0);

    await runtime.queue.pause(chatId);
    await runtime.queue.add('cancel me', 'human', chatId);
    await runtime.queue.stop(chatId);
    const rows = await runtime.queue.list(chatId);
    expect(rows).toEqual([expect.objectContaining({ content: 'cancel me', status: 'cancelled' })]);
  });

  it('auto-resumes durable queued rows on hard restart without duplicating completed sending rows', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    const runChatTurn = vi.fn(async ({ chat, userMessage }) => ({
      assistantText: `resumed:${userMessage}`,
      messages: [
        ...chat.messages,
        { role: 'user', content: userMessage, createdAt: new Date().toISOString() },
        { role: 'assistant', content: `resumed:${userMessage}`, createdAt: new Date().toISOString() },
      ],
    }));
    const { createAgentWorldRuntime } = await loadRuntime(rootPath, runChatTurn);
    const { addQueuedMessage } = await import('../../core/world-store.js');
    const setupRuntime = createAgentWorldRuntime({ autoResume: false });
    const { chatId } = await setupRuntime.chats.create();

    await setupRuntime.messages.send({ chatId, content: 'already completed' });
    await waitFor(() => Promise.resolve(runChatTurn.mock.calls.length === 1));
    await addQueuedMessage({
      chatId,
      content: 'already completed',
      sender: 'human',
      status: 'sending',
    });
    createAgentWorldRuntime({ autoResume: true });
    await waitFor(async () => (await setupRuntime.queue.list(chatId)).length === 0, 3000);
    expect(runChatTurn).toHaveBeenCalledTimes(1);

    await addQueuedMessage({
      chatId,
      content: 'queued after restart',
      sender: 'human',
      status: 'queued',
    });
    createAgentWorldRuntime({ autoResume: true });
    await waitFor(() => Promise.resolve(runChatTurn.mock.calls.length === 2));
    await waitFor(async () => (await setupRuntime.queue.list(chatId)).length === 0);
  });

  it('keeps restart sending rows blocked when the persisted assistant is waiting on tool results', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    const runChatTurn = vi.fn(async ({ chat, userMessage }) => ({
      assistantText: `unexpected:${userMessage}`,
      messages: [
        ...chat.messages,
        { role: 'user', content: userMessage, createdAt: new Date().toISOString() },
        { role: 'assistant', content: `unexpected:${userMessage}`, createdAt: new Date().toISOString() },
      ],
    }));
    const { createAgentWorldRuntime } = await loadRuntime(rootPath, runChatTurn);
    const {
      addQueuedMessage,
      persistCompletedChat,
    } = await import('../../core/world-store.js');
    const setupRuntime = createAgentWorldRuntime({ autoResume: false });
    const { chatId } = await setupRuntime.chats.create();

    await persistCompletedChat({
      chat: {
        id: chatId,
        createdAt: '2026-05-23T10:00:00.000Z',
        updatedAt: '2026-05-23T10:00:01.000Z',
      },
      messages: [
        { role: 'user', content: 'needs tool', createdAt: '2026-05-23T10:00:00.000Z' },
        {
          role: 'assistant',
          content: '',
          createdAt: '2026-05-23T10:00:01.000Z',
          tool_calls: [{ id: 'tool-1', type: 'function', function: { name: 'lookup', arguments: '{}' } }],
        },
      ],
    });
    await addQueuedMessage({
      chatId,
      content: 'needs tool',
      sender: 'human',
      status: 'sending',
    });

    createAgentWorldRuntime({ autoResume: true });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const rows = await setupRuntime.queue.list(chatId);
    expect(rows).toEqual([expect.objectContaining({ content: 'needs tool', status: 'sending' })]);
    expect(runChatTurn).not.toHaveBeenCalled();
  });
});
