// @ts-check
/**
 * Agent CLI Entrypoint Unit Tests
 *
 * Purpose:
 * - Validate argument parsing and executable-entrypoint detection for direct and linked CLI usage.
 *
 * Key features:
 * - Verifies symlinked binaries still execute the CLI module.
 * - Confirms basic CLI flag parsing stays stable.
 *
 * Recent changes:
 * - 2026-05-07: Added regression coverage for npm-linked CLI execution.
 * - 2026-05-07: Added flag coverage for the verbose CLI diagnostics mode.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  createIoCapture,
  createTestRoot,
  removeTestRoot,
  writeSystemPrompt,
} from '../helpers/test-root.js';

/** @type {string[]} */
const tempPathsToClean = [];
/** @type {string[]} */
const rootsToClean = [];
const CLI_ENVIRONMENT_KEYS = [
  'LLM_PROVIDER',
  'LLM_MODEL',
  'GOOGLE_API_KEY',
  'OPENAI_API_KEY',
  'AGENT_CLI_ROOT',
];
const originalCliEnvironment = Object.fromEntries(CLI_ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]));

/** @param {Record<string, string | undefined>} snapshot */
function restoreCliEnvironment(snapshot) {
  for (const key of CLI_ENVIRONMENT_KEYS) {
    const value = snapshot[key];

    if (typeof value === 'undefined') {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

function applyMinimalRuntimeEnvironment() {
  process.env.LLM_PROVIDER = 'openai';
  process.env.LLM_MODEL = 'gpt-5';
  process.env.OPENAI_API_KEY = 'test-openai-key';
}

/**
 * @param {string} [rootPath]
 * @param {Record<string, unknown> | ((actual: Record<string, unknown>) => Record<string, unknown>)} [runtimeClientOverrides]
 */
async function loadCliModule(rootPath, runtimeClientOverrides) {
  if (rootPath) {
    process.env.AGENT_CLI_ROOT = rootPath;
  }

  vi.resetModules();

  if (runtimeClientOverrides) {
    vi.doMock('../../lib/runtime-client.js', async () => {
      const actual = /** @type {Record<string, unknown>} */ (await vi.importActual('../../lib/runtime-client.js'));
      const overrides = typeof runtimeClientOverrides === 'function'
        ? runtimeClientOverrides(actual)
        : runtimeClientOverrides;

      return {
        ...actual,
        ...overrides,
      };
    });
  } else {
    vi.doUnmock('../../lib/runtime-client.js');
  }

  return await import('../../bin/agent-cli.js');
}

afterEach(async () => {
  restoreCliEnvironment(originalCliEnvironment);
  vi.doUnmock('../../lib/runtime-client.js');

  while (rootsToClean.length > 0) {
    const rootPath = rootsToClean.pop();

    if (!rootPath) {
      break;
    }

    await removeTestRoot(rootPath);
  }

  while (tempPathsToClean.length > 0) {
    const tempPath = tempPathsToClean.pop();

    if (!tempPath) {
      break;
    }

    await rm(tempPath, { recursive: true, force: true });
  }
});

describe('agent-cli entrypoint', () => {
  it('parses the supported flags and message body', async () => {
    const { parseArguments } = await loadCliModule();

    expect(parseArguments(['--new-chat', 'Map', 'the', 'terrain'])).toEqual({
      help: false,
      newChat: true,
      runtimeOverrides: {},
      streamOff: false,
      verbose: false,
      message: 'Map the terrain',
    });
    expect(parseArguments(['--help'])).toEqual({
      help: true,
      newChat: false,
      runtimeOverrides: {},
      streamOff: false,
      verbose: false,
      message: '',
    });
    expect(parseArguments(['--verbose', 'Inspect', 'status'])).toEqual({
      help: false,
      newChat: false,
      runtimeOverrides: {},
      streamOff: false,
      verbose: true,
      message: 'Inspect status',
    });
    expect(parseArguments(['--stream-off', 'Inspect', 'status'])).toEqual({
      help: false,
      newChat: false,
      runtimeOverrides: {},
      streamOff: true,
      verbose: false,
      message: 'Inspect status',
    });
  });

  it('parses CLI runtime overrides and normalizes their values', async () => {
    const { parseArguments } = await loadCliModule();

    expect(parseArguments([
      '--provider', 'google',
      '--model=gemini-2.5-pro',
      '--temperature', '0.1',
      '--max-tokens', '2048',
      '--tool-permission=read',
      '--reasoning-effort', 'low',
      '--past-messages', '12',
      '--stream-trace',
      '--web-search=high',
      'Inspect',
      'status',
    ])).toEqual({
      help: false,
      newChat: false,
      runtimeOverrides: {
        provider: 'google',
        model: 'gemini-2.5-pro',
        temperature: 0.1,
        maxTokens: 2048,
        toolPermission: 'read',
        reasoningEffort: 'low',
        pastMessages: 12,
        streamTrace: true,
        webSearch: {
          searchContextSize: 'high',
        },
      },
      streamOff: false,
      verbose: false,
      message: 'Inspect status',
    });
  });

  it('treats a symlinked bin path as the CLI entrypoint', async () => {
    const { isCliEntrypoint } = await loadCliModule();
    const cliPath = fileURLToPath(new URL('../../bin/agent-cli.js', import.meta.url));
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'agent-cli-bin-'));
    const symlinkPath = path.join(tempDirectory, 'agent-cli');
    tempPathsToClean.push(tempDirectory);

    await symlink(cliPath, symlinkPath);

    expect(isCliEntrypoint(symlinkPath, pathToFileURL(cliPath).href)).toBe(true);
  });

  it('does not treat a different file as the CLI entrypoint', async () => {
    const { isCliEntrypoint } = await loadCliModule();
    const cliPath = fileURLToPath(new URL('../../bin/agent-cli.js', import.meta.url));
    const otherPath = fileURLToPath(new URL('../../package.json', import.meta.url));

    expect(isCliEntrypoint(otherPath, pathToFileURL(cliPath).href)).toBe(false);
  });

  it('reports missing messages through the CLI error path', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { runCli } = await loadCliModule(rootPath);
    const io = createIoCapture();
    const originalExitCode = process.exitCode;

    process.exitCode = undefined;
    await runCli([], io);

    expect(io.getStdout()).toBe('');
    expect(io.getStderr()).toContain('Missing user message.');
    expect(io.getStderr()).toContain('Usage: agent-cli [--new-chat] [--verbose] [--stream-off] [runtime options] <message>');
    expect(process.exitCode).toBe(1);

    process.exitCode = originalExitCode;
  });

  it('reports missing runtime environment variables before attempting the turn', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    await mkdir(path.join(rootPath, '.agents', 'skills'), { recursive: true });

    delete process.env.OPENAI_API_KEY;
    process.env.LLM_PROVIDER = 'openai';
    delete process.env.LLM_MODEL;

    const { runCli } = await loadCliModule(rootPath);
    const io = createIoCapture();
    const originalExitCode = process.exitCode;

    process.exitCode = undefined;
    await runCli(['hello'], io);

    expect(io.getStdout()).toBe('');
    expect(io.getStderr()).toContain('Missing environment variable: OPENAI_API_KEY');
    expect(process.exitCode).toBe(1);

    process.exitCode = originalExitCode;
  });

  it('logs startup diagnostics only in verbose mode', async () => {
    applyMinimalRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await mkdir(path.join(rootPath, '.agents', 'skills'), { recursive: true });
    await writeSystemPrompt(rootPath, 'Prompt');

    const { runCli } = await loadCliModule(rootPath, {
      runChatTurn: vi.fn().mockRejectedValue(new Error('Synthetic turn failure')),
    });
    const io = createIoCapture();
    const originalExitCode = process.exitCode;

    process.exitCode = undefined;
    await runCli(['--verbose', 'hello'], io);

    expect(io.getStdout()).toBe('');
    expect(io.getStderr()).toContain(`Agent CLI starting in ${process.cwd()}`);
    expect(io.getStderr()).toContain('provider=openai model=gpt-5');
    expect(io.getStderr()).toContain('Synthetic turn failure');
    expect(process.exitCode).toBe(1);

    process.exitCode = originalExitCode;
  });

  it('applies CLI runtime overrides over environment defaults', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await mkdir(path.join(rootPath, '.agents', 'skills'), { recursive: true });
    await writeSystemPrompt(rootPath, 'Prompt');
    delete process.env.OPENAI_API_KEY;
    process.env.GOOGLE_API_KEY = 'test-google-key';

    const runChatTurn = vi.fn().mockRejectedValue(new Error('Synthetic turn failure'));
    const { runCli } = await loadCliModule(rootPath, {
      runChatTurn,
    });
    const io = createIoCapture();
    const originalExitCode = process.exitCode;

    process.exitCode = undefined;
    await runCli([
      '--verbose',
      '--provider', 'google',
      '--model', 'gemini-2.5-pro',
      '--past-messages', '9',
      '--stream-trace',
      'hello',
    ], io);

    expect(io.getStderr()).toContain('provider=google model=gemini-2.5-pro');
    expect(runChatTurn).toHaveBeenCalledWith(expect.objectContaining({
      historyMessageLimit: 9,
      agentConfig: expect.objectContaining({
        provider: 'google',
        model: 'gemini-2.5-pro',
        pastMessages: 9,
        streamTrace: true,
      }),
    }));
    expect(process.exitCode).toBe(1);

    delete process.env.GOOGLE_API_KEY;
    process.exitCode = originalExitCode;
  });

  it('does not print streaming diagnostics to stderr unless verbose is enabled', async () => {
    applyMinimalRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await mkdir(path.join(rootPath, '.agents', 'skills'), { recursive: true });
    await writeSystemPrompt(rootPath, 'Prompt');

    const { main } = await loadCliModule(rootPath, {
      runChatTurn: vi.fn().mockImplementation(async ({ onStreamChunk, onToolCall }) => {
        onStreamChunk?.({
          warnings: [
            {
              code: 'web_search_ignored',
              message: 'web search is disabled',
            },
          ],
        });
        onStreamChunk?.({ reasoningContent: 'thinking...' });
        onToolCall?.({ id: 'tool-1', name: 'load_skill', arguments: '{"skillId":"agent-cli-core"}' });
        onStreamChunk?.({ content: 'Hello' });
        onStreamChunk?.({ content: ' world' });

        return {
          assistantText: 'Hello world',
          messages: [
            { role: 'user', content: 'hello' },
            { role: 'assistant', content: 'Hello world' },
          ],
        };
      }),
    });
    const io = createIoCapture();

    await main(['--new-chat', 'hello'], io);

    const stdout = io.getStdout();
    const stderr = io.getStderr();

    expect(stderr).toBe('');
    expect(stdout).toContain('Hello world\n');
    expect(stdout).not.toContain('data: [DONE]');
    expect(stdout).not.toContain('reasoning:');
    expect(stdout).not.toContain('warning:');
    expect(stdout).not.toContain('tool:');
  });

  it('prints streaming diagnostics to stderr in verbose mode', async () => {
    applyMinimalRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await mkdir(path.join(rootPath, '.agents', 'skills'), { recursive: true });
    await writeSystemPrompt(rootPath, 'Prompt');

    const { main } = await loadCliModule(rootPath, {
      runChatTurn: vi.fn().mockImplementation(async ({ onStreamChunk, onToolCall }) => {
        onStreamChunk?.({ warnings: [{ message: 'web search is disabled' }] });
        onStreamChunk?.({ reasoningContent: 'thinking...' });
        onToolCall?.({ id: 'tool-1', name: 'load_skill', arguments: '{"skillId":"agent-cli-core"}' });
        onStreamChunk?.({ content: 'Hello' });

        return {
          assistantText: 'Hello',
          messages: [
            { role: 'user', content: 'hello' },
            { role: 'assistant', content: 'Hello' },
          ],
        };
      }),
    });
    const io = createIoCapture();

    await main(['--new-chat', '--verbose', 'hello'], io);

    expect(io.getStderr()).toContain('warning: web search is disabled\n');
    expect(io.getStderr()).toContain('reasoning: "thinking..."\n');
    expect(io.getStderr()).toContain('tool: load_skill\n');
    expect(io.getStdout()).toContain('Hello\n');
  });

  it('prints plain text output when --stream-off is set', async () => {
    applyMinimalRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await mkdir(path.join(rootPath, '.agents', 'skills'), { recursive: true });
    await writeSystemPrompt(rootPath, 'Prompt');

    const { main } = await loadCliModule(rootPath, {
      runChatTurn: vi.fn().mockResolvedValue({
        assistantText: 'Hello world',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'Hello world' },
        ],
      }),
    });
    const io = createIoCapture();

    await main(['--new-chat', '--stream-off', 'hello'], io);

    expect(io.getStdout()).toBe('Hello world\n');
  });

  it('persists stream trace events json when streamTrace is enabled', async () => {
    applyMinimalRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await mkdir(path.join(rootPath, '.agents', 'skills'), { recursive: true });
    await writeSystemPrompt(rootPath, 'Prompt');

    const { main } = await loadCliModule(rootPath, {
      runChatTurn: vi.fn().mockImplementation(async ({ onStreamChunk, onToolCall }) => {
        onStreamChunk?.({ warnings: [{ message: 'warning message' }] });
        onStreamChunk?.({ errors: [{ message: 'error message' }] });
        onStreamChunk?.({ reasoningContent: 'reasoning text' });
        onToolCall?.({ id: 'tool-1', name: 'load_skill', arguments: '{"skillId":"agent-cli-core"}' });
        onStreamChunk?.({ content: 'Hello' });

        return {
          assistantText: 'Hello',
          messages: [
            { role: 'user', content: 'hello' },
            { role: 'assistant', content: 'Hello' },
          ],
        };
      }),
    });

    await main(['--new-chat', '--stream-trace', 'hello'], createIoCapture());

    const current = JSON.parse(await readFile(path.join(rootPath, '.chats', 'current.json'), 'utf8'));
    const eventsData = JSON.parse(await readFile(
      path.join(rootPath, '.chats', current.chatId, 'events.json'),
      'utf8',
    ));

    expect(eventsData.chatId).toBe(current.chatId);
    expect(Array.isArray(eventsData.events)).toBe(true);
    expect(eventsData.events.some((event) => event.type === 'warning')).toBe(true);
    expect(eventsData.events.some((event) => event.type === 'error')).toBe(true);
    expect(eventsData.events.some((event) => event.type === 'reasoning')).toBe(true);
    expect(eventsData.events.some((event) => event.type === 'tool')).toBe(true);
    expect(eventsData.events.some((event) => event.type === 'text')).toBe(true);
  });

  it('persists an error stream trace event when runChatTurn fails', async () => {
    applyMinimalRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await mkdir(path.join(rootPath, '.agents', 'skills'), { recursive: true });
    await writeSystemPrompt(rootPath, 'Prompt');

    const { main } = await loadCliModule(rootPath, {
      runChatTurn: vi.fn().mockRejectedValue(new Error('Synthetic turn failure')),
    });

    await expect(main(['--new-chat', '--stream-trace', 'hello'], createIoCapture())).rejects.toThrow('Synthetic turn failure');

    const chatRoots = await readdir(path.join(rootPath, '.chats'));
    expect(chatRoots.length).toBe(1);

    const eventsData = JSON.parse(await readFile(
      path.join(rootPath, '.chats', chatRoots[0], 'events.json'),
      'utf8',
    ));

    expect(eventsData.events.some((event) => event.type === 'error')).toBe(true);
    expect(eventsData.events.some((event) => String(event.text).includes('Synthetic turn failure'))).toBe(true);
  });

  it('defaults to loading zero past messages when config does not define pastMessages', async () => {
    applyMinimalRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await mkdir(path.join(rootPath, '.agents', 'skills'), { recursive: true });
    await writeSystemPrompt(rootPath, 'Prompt');

    const runChatTurnMock = vi.fn().mockResolvedValue({
      assistantText: 'ok',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'ok' },
      ],
    });

    const { main } = await loadCliModule(rootPath, {
      runChatTurn: runChatTurnMock,
    });

    await main(['--new-chat', 'hello'], createIoCapture());

    expect(runChatTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        historyMessageLimit: 0,
      }),
    );
  });

  it('applies --past-messages when provided on the command line', async () => {
    applyMinimalRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await mkdir(path.join(rootPath, '.agents', 'skills'), { recursive: true });
    await writeSystemPrompt(rootPath, 'Prompt');

    const runChatTurnMock = vi.fn().mockResolvedValue({
      assistantText: 'ok',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'ok' },
      ],
    });

    const { main } = await loadCliModule(rootPath, {
      runChatTurn: runChatTurnMock,
    });

    await main(['--new-chat', '--past-messages', '7', 'hello'], createIoCapture());

    expect(runChatTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        historyMessageLimit: 7,
      }),
    );
  });

  it('does not write partial session files when the runtime setup fails', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    await mkdir(path.join(rootPath, '.agents', 'skills'), { recursive: true });

    process.env.LLM_PROVIDER = 'unsupported-provider';
    delete process.env.LLM_MODEL;

    const { main } = await loadCliModule(rootPath);

    await expect(main(['--new-chat', 'hello'], createIoCapture())).rejects.toThrow(
      'Unsupported LLM provider: unsupported-provider',
    );
    await expect(
      readFile(path.join(rootPath, '.chats', 'current.json'), 'utf8'),
    ).rejects.toThrow();
    await expect(
      readFile(path.join(rootPath, '.chats'), 'utf8'),
    ).rejects.toThrow();
  });

  it('prints help without requiring agent runtime files', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { runCli } = await loadCliModule(rootPath);
    const io = createIoCapture();

    await runCli(['--help'], io);

    expect(io.getStdout()).toContain('Usage: agent-cli [--new-chat] [--verbose] [--stream-off] [runtime options] <message>');
    expect(io.getStderr()).toBe('');
  });
});