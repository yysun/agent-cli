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
import { mkdtemp, mkdir, readFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  createIoCapture,
  createTestRoot,
  removeTestRoot,
  writeAgentConfig,
  writeSystemPrompt,
} from '../helpers/test-root.js';

/** @type {string[]} */
const tempPathsToClean = [];
/** @type {string[]} */
const rootsToClean = [];
const CLI_ENVIRONMENT_KEYS = [
  'LLM_PROVIDER',
  'LLM_MODEL',
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
      streamOff: false,
      verbose: false,
      message: 'Map the terrain',
    });
    expect(parseArguments(['--help'])).toEqual({
      help: true,
      newChat: false,
      streamOff: false,
      verbose: false,
      message: '',
    });
    expect(parseArguments(['--verbose', 'Inspect', 'status'])).toEqual({
      help: false,
      newChat: false,
      streamOff: false,
      verbose: true,
      message: 'Inspect status',
    });
    expect(parseArguments(['--stream-off', 'Inspect', 'status'])).toEqual({
      help: false,
      newChat: false,
      streamOff: true,
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
    expect(io.getStderr()).toContain('Usage: agent-cli [--new-chat] [--verbose] [--stream-off] <message>');
    expect(process.exitCode).toBe(1);

    process.exitCode = originalExitCode;
  });

  it('reports missing runtime environment variables before attempting the turn', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    await mkdir(path.join(rootPath, 'agent', 'skills'), { recursive: true });

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
    await mkdir(path.join(rootPath, 'agent', 'skills'), { recursive: true });
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

  it('prints SSE frames in default streaming mode', async () => {
    applyMinimalRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await mkdir(path.join(rootPath, 'agent', 'skills'), { recursive: true });
    await writeSystemPrompt(rootPath, 'Prompt');

    const { main } = await loadCliModule(rootPath, {
      runChatTurn: vi.fn().mockImplementation(async ({ onStreamChunk }) => {
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

    expect(stdout).toContain('event: chunk\n');
    expect(stdout).toContain('data: {"content":"Hello"}\n\n');
    expect(stdout).toContain('data: {"content":" world"}\n\n');
    expect(stdout).toContain('event: final\n');
    expect(stdout).toContain('data: {"text":"Hello world"}\n\n');
    expect(stdout).toContain('data: [DONE]\n\n');
  });

  it('prints plain text output when --stream-off is set', async () => {
    applyMinimalRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await mkdir(path.join(rootPath, 'agent', 'skills'), { recursive: true });
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

  it('loads provider and model from agent/config.json for verbose diagnostics', async () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeAgentConfig(rootPath, {
      provider: 'openai',
      modal: 'gpt-5-mini',
    });
    await mkdir(path.join(rootPath, 'agent', 'skills'), { recursive: true });
    await writeSystemPrompt(rootPath, 'Prompt');

    const { runCli } = await loadCliModule(rootPath, {
      runChatTurn: vi.fn().mockRejectedValue(new Error('Synthetic turn failure')),
    });
    const io = createIoCapture();
    const originalExitCode = process.exitCode;

    process.exitCode = undefined;
    await runCli(['--verbose', 'hello'], io);

    expect(io.getStdout()).toBe('');
    expect(io.getStderr()).toContain('provider=openai model=gpt-5-mini');
    expect(io.getStderr()).toContain('Synthetic turn failure');
    expect(process.exitCode).toBe(1);

    process.exitCode = originalExitCode;
  });

  it('defaults to loading zero past messages when config does not define pastMessages', async () => {
    applyMinimalRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await mkdir(path.join(rootPath, 'agent', 'skills'), { recursive: true });
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

  it('loads configured number of past messages from agent/config.json', async () => {
    applyMinimalRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeAgentConfig(rootPath, {
      pastMessages: 7,
    });
    await mkdir(path.join(rootPath, 'agent', 'skills'), { recursive: true });
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
        historyMessageLimit: 7,
      }),
    );
  });

  it('does not write partial session files when the runtime setup fails', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    await mkdir(path.join(rootPath, 'agent', 'skills'), { recursive: true });

    process.env.LLM_PROVIDER = 'unsupported-provider';
    delete process.env.LLM_MODEL;

    const { main } = await loadCliModule(rootPath);

    await expect(main(['--new-chat', 'hello'], createIoCapture())).rejects.toThrow(
      'Unsupported LLM provider: unsupported-provider',
    );
    await expect(
      readFile(path.join(rootPath, 'agent', 'sessions', 'current.json'), 'utf8'),
    ).rejects.toThrow();
    await expect(
      readFile(path.join(rootPath, 'agent', 'sessions', 'chats'), 'utf8'),
    ).rejects.toThrow();
  });

  it('prints help without requiring agent runtime files', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { runCli } = await loadCliModule(rootPath);
    const io = createIoCapture();

    await runCli(['--help'], io);

    expect(io.getStdout()).toContain('Usage: agent-cli [--new-chat] [--verbose] [--stream-off] <message>');
    expect(io.getStderr()).toBe('');
  });
});