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
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
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

    const current = await readJson(path.join(rootPath, 'agent', 'sessions', 'current.json'));
    expect(current).toEqual({ chatId: chat.id });

    const reloaded = await loadRequestedChat({ newChat: false });
    expect(reloaded.id).toBe(chat.id);
    expect(reloaded.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'Hello' }),
      expect.objectContaining({ role: 'assistant', content: 'Hi' }),
    ]);
    expect(reloaded.messages[1].tool_calls).toHaveLength(1);
  });

  it('fails clearly when there is no current chat', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { loadRequestedChat } = await loadSessionStore(rootPath);

    await expect(loadRequestedChat({ newChat: false })).rejects.toThrow(
      'Missing current chat. Start one with --new-chat.',
    );
  });
});