// @ts-check
/**
 * Agent CLI Entrypoint Unit Tests
 *
 * Purpose:
 * - Validate argument parsing, runtime precedence, and CLI execution behavior.
 *
 * Key features:
 * - Verifies symlinked binaries still execute the CLI module.
 * - Confirms runtime.json plus agent runtime overrides are honored.
 * - Confirms env remains limited to provider credentials and relay configuration.
 *
 * Recent changes:
 * - 2026-05-16: Added coverage for structured verbose tool-call and tool-result rendering.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  createIoCapture,
  createTestRoot,
  ensureSkillsRoot,
  readJson,
  removeTestRoot,
  writeSystemPrompt,
} from '../helpers/test-root.js';

/** @type {string[]} */
const tempPathsToClean = [];
/** @type {string[]} */
const rootsToClean = [];
const originalCwd = process.cwd();
const CLI_ENVIRONMENT_KEYS = [
  'AGENT_CLI_ROOT',
  'AGENT_CLI_RELAY_SERVER_URL',
  'GOOGLE_API_KEY',
  'OPENAI_API_KEY',
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
  process.env.OPENAI_API_KEY = 'test-openai-key';
}

/** @param {string} filePath */
async function readJsonl(filePath) {
  const content = await readFile(filePath, 'utf8');
  return content.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

/**
 * @param {string} rootPath
 * @param {Record<string, unknown>} runtimeConfig
 */
async function writeRootRuntimeConfig(rootPath, runtimeConfig) {
  await writeFile(path.join(rootPath, 'runtime.json'), `${JSON.stringify({ schemaVersion: 1, ...runtimeConfig }, null, 2)}\n`, 'utf8');
}

/**
 * @param {string} rootPath
 * @param {string} agentId
 * @param {Record<string, unknown>} runtimeConfig
 */
async function writeAgentRuntimeConfig(rootPath, agentId, runtimeConfig) {
  await mkdir(path.join(rootPath, '.agent-world', 'agents', agentId), { recursive: true });
  await writeFile(path.join(rootPath, '.agent-world', 'world.json'), `${JSON.stringify({
    id: 'world-1',
    name: 'Test World',
    defaultAgentId: agentId,
    currentChatId: 'chat-1',
  }, null, 2)}\n`, 'utf8');
  await writeFile(path.join(rootPath, '.agent-world', 'agents', agentId, 'runtime.json'), `${JSON.stringify({ schemaVersion: 1, ...runtimeConfig }, null, 2)}\n`, 'utf8');
}

/**
 * @param {string} [rootPath]
 * @param {{
 *   runtimeClient?: Record<string, unknown> | ((actual: Record<string, unknown>) => Record<string, unknown>),
 *   remoteControl?: Record<string, unknown> | ((actual: Record<string, unknown>) => Record<string, unknown>),
 * }} [moduleOverrides]
 */
async function loadCliModule(rootPath, moduleOverrides = {}) {
  if (rootPath) {
    process.chdir(rootPath);
  }

  vi.resetModules();

  if (moduleOverrides.runtimeClient) {
    vi.doMock('../../core/runtime-client.js', async () => {
      const actual = /** @type {Record<string, unknown>} */ (await vi.importActual('../../core/runtime-client.js'));
      const overrides = typeof moduleOverrides.runtimeClient === 'function'
        ? moduleOverrides.runtimeClient(actual)
        : moduleOverrides.runtimeClient;

      return {
        ...actual,
        ...overrides,
      };
    });
  } else {
    vi.doUnmock('../../core/runtime-client.js');
  }

  if (moduleOverrides.remoteControl) {
    vi.doMock('../../core/remote-control.js', async () => {
      const actual = /** @type {Record<string, unknown>} */ (await vi.importActual('../../core/remote-control.js'));
      const overrides = typeof moduleOverrides.remoteControl === 'function'
        ? moduleOverrides.remoteControl(actual)
        : moduleOverrides.remoteControl;

      return {
        ...actual,
        ...overrides,
      };
    });
  } else {
    vi.doUnmock('../../core/remote-control.js');
  }

  return await import('../../cli/src/index.ts');
}

afterEach(async () => {
  process.chdir(originalCwd);
  restoreCliEnvironment(originalCliEnvironment);
  vi.doUnmock('../../core/runtime-client.js');
  vi.doUnmock('../../core/remote-control.js');

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
      remoteControl: false,
      runtimeOverrides: {},
      streamOff: false,
      verbose: false,
      message: 'Map the terrain',
    });
    expect(parseArguments(['--help'])).toEqual({
      help: true,
      newChat: false,
      remoteControl: false,
      runtimeOverrides: {},
      streamOff: false,
      verbose: false,
      message: '',
    });
    expect(parseArguments(['--verbose', 'Inspect', 'status'])).toEqual({
      help: false,
      newChat: false,
      remoteControl: false,
      runtimeOverrides: {},
      streamOff: false,
      verbose: true,
      message: 'Inspect status',
    });
    expect(parseArguments(['--stream-off', 'Inspect', 'status'])).toEqual({
      help: false,
      newChat: false,
      remoteControl: false,
      runtimeOverrides: {},
      streamOff: true,
      verbose: false,
      message: 'Inspect status',
    });
    expect(parseArguments(['--remote'])).toEqual({
      help: false,
      newChat: false,
      remoteControl: true,
      runtimeOverrides: {},
      streamOff: false,
      verbose: false,
      message: '',
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
      remoteControl: false,
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

  it('starts remote host mode from AGENT_CLI_RELAY_SERVER_URL and persists remote metadata under the default agent state', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    await ensureSkillsRoot(rootPath);
    process.env.AGENT_CLI_RELAY_SERVER_URL = 'http://127.0.0.1:8787';

    /** @type {((value?: unknown) => void) | undefined} */
    let resolveSessionReady;
    const sessionReady = new Promise((resolve) => {
      resolveSessionReady = resolve;
    });
    /** @type {((value?: unknown) => void) | undefined} */
    let resolveRemoteSession;
    const remoteSessionComplete = new Promise((resolve) => {
      resolveRemoteSession = resolve;
    });

    const relaySession = {
      sessionId: 'relay-session-1',
      clientConnectionUrl: 'http://127.0.0.1:8787/pair?sessionId=relay-session-1',
      pairingToken: 'pair-token',
      expiresAt: '2026-05-11T12:15:00.000Z',
    };
    const runRemoteControlSession = vi.fn().mockImplementation(async (params) => {
      await params.onSessionReady?.(relaySession);
      resolveSessionReady?.();
      await remoteSessionComplete;
      return relaySession;
    });

    const { main } = await loadCliModule(rootPath, {
      remoteControl: {
        runRemoteControlSession,
      },
    });

    const mainPromise = main(['--new-chat', '--remote'], createIoCapture());

    await sessionReady;

    expect(runRemoteControlSession).toHaveBeenCalledWith(expect.objectContaining({
      relayServer: 'http://127.0.0.1:8787',
      initialMessage: undefined,
    }));

    const world = await readJson(path.join(rootPath, '.agent-world', 'world.json'));
    const remoteState = await readJson(path.join(rootPath, '.agent-world', 'agents', 'default', 'state.json'));

    expect(world.currentChatId).toBeTruthy();
    expect(remoteState.currentChatId).toBe(world.currentChatId);
    expect(remoteState.remoteSession).toMatchObject({
      sessionId: 'relay-session-1',
      clientConnectionUrl: 'http://127.0.0.1:8787/pair?sessionId=relay-session-1',
    });

    resolveRemoteSession?.();
    await mainPromise;
  });

  it('fails clearly when --remote is used without AGENT_CLI_RELAY_SERVER_URL', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { runCli } = await loadCliModule(rootPath);
    const io = createIoCapture();
    const originalExitCode = process.exitCode;

    delete process.env.AGENT_CLI_RELAY_SERVER_URL;
    process.exitCode = undefined;
    await runCli(['--remote'], io);

    expect(io.getStderr()).toContain('Missing environment variable: AGENT_CLI_RELAY_SERVER_URL');
    expect(process.exitCode).toBe(1);

    process.exitCode = originalExitCode;
  });

  it('rejects any CLI invocation when remote mode is already active for the root', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    await mkdir(path.join(rootPath, '.agent-world'), { recursive: true });
    await writeFile(
      path.join(rootPath, '.agent-world', 'remote-host.lock.json'),
      `${JSON.stringify({ chatId: 'chat-remote-1', pid: process.pid }, null, 2)}\n`,
      'utf8',
    );

    const { runCli } = await loadCliModule(rootPath);
    const io = createIoCapture();
    const originalExitCode = process.exitCode;

    process.exitCode = undefined;
    await runCli(['Inspect', 'status'], io);

    expect(io.getStderr()).toContain('Remote mode already active for this project root');
    expect(process.exitCode).toBe(1);

    process.exitCode = originalExitCode;
  });

  it('loads runtime.json defaults, applies the default-agent override, and lets CLI flags win', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    await ensureSkillsRoot(rootPath);
    await writeRootRuntimeConfig(rootPath, {
      provider: 'openai',
      model: 'gpt-5',
      toolPermission: 'ask',
      pastMessages: 20,
      stream: true,
      streamTrace: false,
    });
    await writeAgentRuntimeConfig(rootPath, 'agent-7', {
      model: 'gpt-5-mini',
      stream: false,
    });

    process.env.OPENAI_API_KEY = 'test-openai-key';

    const runChatTurn = vi.fn().mockResolvedValue({
      assistantText: 'ok',
      messages: [
        { role: 'user', content: 'Inspect status' },
        { role: 'assistant', content: 'ok' },
      ],
      streamEvents: [],
    });

    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });

    await main(['--temperature', '0.1', 'Inspect', 'status'], createIoCapture());

    expect(runChatTurn).toHaveBeenCalledWith(expect.objectContaining({
      stream: false,
      historyMessageLimit: 20,
      agentConfig: expect.objectContaining({
        provider: 'openai',
        model: 'gpt-5-mini',
        temperature: 0.1,
        toolPermission: 'ask',
        pastMessages: 20,
        stream: false,
        streamTrace: false,
      }),
    }));
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

  it('prints help even when runtime.json is malformed', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeFile(path.join(rootPath, 'runtime.json'), '{\n  "schemaVersion": 1,\n  "maxTokens": "not-a-number"\n}\n', 'utf8');

    const { main } = await loadCliModule(rootPath);
    const io = createIoCapture();

    await expect(main(['--help'], io)).resolves.toBeNull();
    expect(io.getStdout()).toContain('Usage: agent-cli [--new-chat] [--verbose] [--stream-off] [runtime options] <message>');
  });

  it('reports missing messages before validating malformed runtime.json', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeFile(path.join(rootPath, 'runtime.json'), '{\n  "schemaVersion": 1,\n  "maxTokens": "not-a-number"\n}\n', 'utf8');

    const { runCli } = await loadCliModule(rootPath);
    const io = createIoCapture();
    const originalExitCode = process.exitCode;

    process.exitCode = undefined;
    await runCli([], io);

    expect(io.getStderr()).toContain('Missing user message.');
    expect(io.getStderr()).not.toContain('Invalid agent config value for maxTokens');
    expect(process.exitCode).toBe(1);

    process.exitCode = originalExitCode;
  });

  it('reports missing runtime environment variables before attempting the turn', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    await ensureSkillsRoot(rootPath);
    await writeRootRuntimeConfig(rootPath, {
      provider: 'openai',
      model: 'gpt-5',
    });

    delete process.env.OPENAI_API_KEY;

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
    await ensureSkillsRoot(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');

    const { runCli } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn: vi.fn().mockRejectedValue(new Error('Synthetic turn failure')),
      },
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

  it('loads .env from AGENT_CLI_ROOT and uses that root in startup diagnostics', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeFile(path.join(rootPath, '.env'), 'GOOGLE_API_KEY=dotenv-google-key\n', 'utf8');

    delete process.env.GOOGLE_API_KEY;
    process.env.AGENT_CLI_ROOT = rootPath;

    const { startupText } = await loadCliModule();

    expect(process.env.GOOGLE_API_KEY).toBe('dotenv-google-key');
    expect(startupText()).toBe(`Agent CLI starting in ${rootPath}`);
  });

  it('applies CLI runtime overrides over runtime.json defaults', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await ensureSkillsRoot(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    await writeRootRuntimeConfig(rootPath, {
      provider: 'openai',
      model: 'gpt-5',
      toolPermission: 'ask',
    });
    delete process.env.OPENAI_API_KEY;
    process.env.GOOGLE_API_KEY = 'test-google-key';

    const runChatTurn = vi.fn().mockRejectedValue(new Error('Synthetic turn failure'));
    const { runCli } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
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
    await ensureSkillsRoot(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');

    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn: vi.fn().mockImplementation(async ({ onStreamChunk, onToolCall, onToolResult }) => {
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
          onToolResult?.({ id: 'tool-1', name: 'load_skill', result: { ok: true, status: 'loaded' } });
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
      },
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
    expect(stdout).not.toContain('tool.call:');
    expect(stdout).not.toContain('tool.result:');
  });

  it('prints streaming diagnostics to stderr in verbose mode', async () => {
    applyMinimalRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await ensureSkillsRoot(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');

    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn: vi.fn().mockImplementation(async ({ onStreamChunk, onToolCall, onToolResult }) => {
          onStreamChunk?.({ warnings: [{ message: 'web search is disabled' }] });
          onStreamChunk?.({ reasoningContent: 'thinking...' });
          onToolCall?.({ id: 'tool-1', name: 'load_skill', arguments: '{"skillId":"agent-cli-core"}' });
          onToolResult?.({ id: 'tool-1', name: 'load_skill', result: { ok: true, status: 'loaded' } });
          onToolCall?.({ id: 'tool-2', name: 'read_file', arguments: '{"filePath":"/tmp/demo.md"}' });
          onToolResult?.({ id: 'tool-2', name: 'read_file', result: 'alpha\nbeta\n' });
          onStreamChunk?.({ content: 'Hello' });

          return {
            assistantText: 'Hello',
            messages: [
              { role: 'user', content: 'hello' },
              { role: 'assistant', content: 'Hello' },
            ],
          };
        }),
      },
    });
    const io = createIoCapture();

    await main(['--new-chat', '--verbose', 'hello'], io);

    expect(io.getStderr()).toContain('warning: web search is disabled\n');
    expect(io.getStderr()).toContain('reasoning: "thinking..."\n');
    expect(io.getStderr()).toContain('tool.call: load_skill agent-cli-core\n');
    expect(io.getStderr()).toContain('tool.result: load_skill ok loaded\n');
    expect(io.getStderr()).toContain('tool.call: read_file /tmp/demo.md\n');
    expect(io.getStderr()).toContain('tool.result: read_file ok 2 lines\n');
    expect(io.getStderr()).toContain('  alpha\n');
    expect(io.getStderr()).toContain('  beta\n');
    expect(io.getStdout()).toContain('Hello\n');
  });

  it('prints plain text output when --stream-off is set', async () => {
    applyMinimalRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await ensureSkillsRoot(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');

    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn: vi.fn().mockResolvedValue({
          assistantText: 'Hello world',
          messages: [
            { role: 'user', content: 'hello' },
            { role: 'assistant', content: 'Hello world' },
          ],
        }),
      },
    });
    const io = createIoCapture();

    await main(['--new-chat', '--stream-off', 'hello'], io);

    expect(io.getStdout()).toBe('Hello world\n');
  });

  it('persists stream trace events jsonl on the default agent when streamTrace is enabled', async () => {
    applyMinimalRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await ensureSkillsRoot(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');

    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
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
      },
    });

    await main(['--new-chat', '--stream-trace', 'hello'], createIoCapture());

    const world = await readJson(path.join(rootPath, '.agent-world', 'world.json'));
    const events = await readJsonl(path.join(rootPath, '.agent-world', 'agents', 'default', 'events.jsonl'));

    expect(events.every((event) => event.chatId === world.currentChatId)).toBe(true);
    expect(events.some((event) => event.type === 'warning')).toBe(true);
    expect(events.some((event) => event.type === 'error')).toBe(true);
    expect(events.some((event) => event.type === 'reasoning')).toBe(true);
    expect(events.some((event) => event.type === 'tool')).toBe(true);
    expect(events.some((event) => event.type === 'text')).toBe(true);
  });

  it('persists an error stream trace event when runChatTurn fails', async () => {
    applyMinimalRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await ensureSkillsRoot(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');

    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn: vi.fn().mockRejectedValue(new Error('Synthetic turn failure')),
      },
    });

    await expect(main(['--new-chat', '--stream-trace', 'hello'], createIoCapture())).rejects.toThrow('Synthetic turn failure');

    const events = await readJsonl(path.join(rootPath, '.agent-world', 'agents', 'default', 'events.jsonl'));

    expect(events.some((event) => event.type === 'error')).toBe(true);
    expect(events.some((event) => String(event.text).includes('Synthetic turn failure'))).toBe(true);
  });

  it('defaults to loading zero past messages when config does not define pastMessages', async () => {
    applyMinimalRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await ensureSkillsRoot(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');

    const runChatTurnMock = vi.fn().mockResolvedValue({
      assistantText: 'ok',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'ok' },
      ],
    });

    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn: runChatTurnMock,
      },
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
    await ensureSkillsRoot(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');

    const runChatTurnMock = vi.fn().mockResolvedValue({
      assistantText: 'ok',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'ok' },
      ],
    });

    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn: runChatTurnMock,
      },
    });

    await main(['--new-chat', '--past-messages', '7', 'hello'], createIoCapture());

    expect(runChatTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        historyMessageLimit: 7,
      }),
    );
  });

  it('does not persist chat files when runtime validation fails before the turn completes', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    await ensureSkillsRoot(rootPath);
    await writeRootRuntimeConfig(rootPath, {
      provider: 'unsupported-provider',
      model: 'model-x',
    });

    const { main } = await loadCliModule(rootPath);

    await expect(main(['--new-chat', 'hello'], createIoCapture())).rejects.toThrow(
      'Unsupported LLM provider: unsupported-provider',
    );
    await expect(
      readFile(path.join(rootPath, '.agent-world', 'chats'), 'utf8'),
    ).rejects.toThrow();
    await expect(
      readFile(path.join(rootPath, '.agent-world', 'world.json'), 'utf8'),
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
