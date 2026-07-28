// @ts-check
/**
 * Agent CLI Path Resolution Unit Tests
 *
 * Purpose:
 * - Validate workspace root and flat `.agent-world` path resolution.
 *
 * Recent changes:
 * - 2026-07-27: Added chat-id containment coverage for traversal, separators, and absolute paths.
 * - 2026-05-26: Added expectations for both global skill roots.
 * - 2026-05-26: Removed world-id path expectations and switched workspace skills to `.agent-world/skills`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';

const originalCwd = process.cwd();

afterEach(() => {
  vi.resetModules();
  process.chdir(originalCwd);
});

describe('paths', () => {
  it('uses the current working directory as the default workspace root', async () => {
    const cwdRoot = path.join(originalCwd, 'tests');
    process.chdir(cwdRoot);

    const paths = await import('../../core/paths.js');
    paths.configureWorkspaceRoot();

    expect(paths.WORKSPACE_ROOT).toBe(cwdRoot);
    expect(paths.REPO_ROOT).toBe(cwdRoot);
    expect(paths.SYSTEM_PROMPT_PATH).toBe(path.join(cwdRoot, 'AGENTS.md'));
    expect(paths.USER_SKILLS_ROOT).toBe(path.join(os.homedir(), '.agent-world', 'skills'));
    expect(paths.AGENTS_SKILLS_ROOT).toBe(path.join(os.homedir(), '.agents', 'skills'));
    expect(paths.GLOBAL_SKILLS_ROOTS).toEqual([
      path.join(os.homedir(), '.agent-world', 'skills'),
      path.join(os.homedir(), '.agents', 'skills'),
    ]);
    expect(paths.AGENT_WORLD_ROOT).toBe(path.join(cwdRoot, '.agent-world'));
    expect(paths.SKILLS_ROOT).toBe(path.join(cwdRoot, '.agent-world', 'skills'));
    expect(paths.AGENT_WORLD_CHATS_ROOT).toBe(path.join(cwdRoot, '.agent-world', 'chats'));
    expect(paths.CURRENT_CHAT_PATH).toBe(path.join(cwdRoot, '.agent-world', 'chats', 'current.json'));
  });

  it('prefers an explicit workspace root over the current working directory', async () => {
    const overrideRoot = path.join(originalCwd, 'agent');
    const cwdRoot = path.join(originalCwd, 'tests');

    process.chdir(cwdRoot);

    const paths = await import('../../core/paths.js');
    paths.configureWorkspaceRoot(overrideRoot);

    expect(paths.WORKSPACE_ROOT).toBe(overrideRoot);
    expect(paths.REPO_ROOT).toBe(overrideRoot);
    expect(paths.SYSTEM_PROMPT_PATH).toBe(path.join(overrideRoot, 'AGENTS.md'));
    expect(paths.USER_SKILLS_ROOT).toBe(path.join(os.homedir(), '.agent-world', 'skills'));
    expect(paths.AGENTS_SKILLS_ROOT).toBe(path.join(os.homedir(), '.agents', 'skills'));
    expect(paths.SKILLS_ROOT).toBe(path.join(overrideRoot, '.agent-world', 'skills'));
    expect(paths.AGENT_WORLD_CHATS_ROOT).toBe(path.join(overrideRoot, '.agent-world', 'chats'));
  });

  it('uses cwd when an explicit workspace root is empty', async () => {
    const cwdRoot = path.join(originalCwd, 'tests');

    process.chdir(cwdRoot);

    const paths = await import('../../core/paths.js');
    paths.configureWorkspaceRoot('');

    expect(paths.WORKSPACE_ROOT).toBe(cwdRoot);
    expect(paths.REPO_ROOT).toBe(cwdRoot);
  });
});

describe('chat id containment', () => {
  const unsafeChatIds = [
    ['a parent traversal', '../../victim'],
    ['a single parent segment', '..'],
    ['a current-directory segment', '.'],
    ['a posix separator', 'nested/chat'],
    ['a windows separator', 'nested\\chat'],
    ['an absolute posix path', '/etc/passwd'],
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['a null byte', 'chat\0id'],
  ];

  it.each(unsafeChatIds)('rejects %s', async (_label, chatId) => {
    const paths = await import('../../core/paths.js');
    paths.configureWorkspaceRoot(path.join(originalCwd, 'tests'));

    expect(paths.isSafeChatId(chatId)).toBe(false);
    expect(() => paths.assertSafeChatId(chatId)).toThrow();
    expect(() => paths.buildWorldChatDirectoryPath(chatId)).toThrow();
  });

  it('accepts a generated chat id and contains it under the chats root', async () => {
    const workspaceRoot = path.join(originalCwd, 'tests');
    const paths = await import('../../core/paths.js');
    paths.configureWorkspaceRoot(workspaceRoot);

    const chatId = '20260727T120000Z-a1b2c3d4';

    expect(paths.isSafeChatId(chatId)).toBe(true);
    expect(paths.assertSafeChatId(chatId)).toBe(chatId);
    expect(paths.buildWorldChatDirectoryPath(chatId))
      .toBe(path.join(workspaceRoot, '.agent-world', 'chats', chatId));
  });

  it('keeps derived chat file paths inside the chats root', async () => {
    const workspaceRoot = path.join(originalCwd, 'tests');
    const paths = await import('../../core/paths.js');
    paths.configureWorkspaceRoot(workspaceRoot);

    const chatsRoot = path.join(workspaceRoot, '.agent-world', 'chats');
    const chatId = '20260727T120000Z-a1b2c3d4';

    for (const buildPath of [
      paths.buildWorldChatMetadataPath,
      paths.buildWorldChatMessagesPath,
      paths.buildWorldChatSummaryPath,
      paths.buildWorldChatEventsPath,
    ]) {
      expect(buildPath(chatId).startsWith(`${chatsRoot}${path.sep}`)).toBe(true);
      expect(() => buildPath('../../victim')).toThrow();
    }
  });
});
