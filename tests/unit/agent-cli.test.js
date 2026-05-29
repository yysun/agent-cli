// @ts-nocheck
/**
 * Agent CLI Entrypoint Unit Tests
 *
 * Purpose:
 * - Validate local CLI parsing, env-backed runtime config, AGENTS.md prompt loading, and chat persistence.
 *
 * Recent changes:
 * - 2026-05-28: Covered verbose pending dots as a waiting-for-assistant-text indicator.
 * - 2026-05-26: Covered workspace-local `.env` loading and `.env.example` creation.
 * - 2026-05-26: Asserted generated initial `.env.example` exactly matches the checked-in example.
 * - 2026-05-26: Added coverage for omitting empty startup skill scopes.
 * - 2026-05-26: Added `.env` and startup coverage for opt-in global skill loading.
 * - 2026-05-26: Removed world and agent selection tests after flattening storage.
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
  writeSkill,
  writeSystemPrompt,
} from '../helpers/test-root.js';

/** @type {string[]} */
const tempPathsToClean = [];
/** @type {string[]} */
const rootsToClean = [];
const originalCwd = process.cwd();
const CLI_ENVIRONMENT_KEYS = [
  'AGENT_CLI_WORKSPACE',
  'AGENT_CLI_PROVIDER',
  'AGENT_CLI_MODEL',
  'AGENT_CLI_TEMPERATURE',
  'AGENT_CLI_MAX_TOKENS',
  'AGENT_CLI_TOOL_PERMISSION',
  'AGENT_CLI_REASONING_EFFORT',
  'AGENT_CLI_PAST_MESSAGES',
  'AGENT_CLI_STREAM',
  'AGENT_CLI_STREAM_TRACE',
  'AGENT_CLI_WEB_SEARCH',
  'AGENT_CLI_GLOBAL_SKILLS',
  'AZURE_OPENAI_DEPLOYMENT_NAME',
  'GOOGLE_API_KEY',
  'HOME',
  'OLLAMA_BASE_URL',
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

const countOccurrences = /** @type {(value: string, pattern: string) => number} */ ((value, pattern) => {
  return value.split(pattern).length - 1;
});

const verboseToolPairExamples = [
  {
    name: 'shell_cmd',
    arguments: JSON.stringify({ command: 'npm', parameters: ['test'] }),
    result: { exitCode: 0, stdout: 'ok\n' },
  },
  {
    name: 'load_skill',
    arguments: JSON.stringify({ skill_id: 'agent-world-skill' }),
    result: '<skill_context id="agent-world-skill">Loaded</skill_context>',
  },
  {
    name: 'path_exists',
    arguments: JSON.stringify({ path: 'README.md' }),
    result: { ok: true, exists: true, path: 'README.md', type: 'file' },
  },
  {
    name: 'search_files',
    arguments: JSON.stringify({ query: 'README' }),
    result: { ok: true, matches: ['README.md'] },
  },
  {
    name: 'list_files',
    arguments: JSON.stringify({ path: '.' }),
    result: { ok: true, entries: ['README.md'] },
  },
  {
    name: 'read_file',
    arguments: JSON.stringify({ filePath: 'README.md' }),
    result: { ok: true, content: '# Agent CLI\n' },
  },
  {
    name: 'write_file',
    arguments: JSON.stringify({ filePath: 'notes.md', content: 'hello' }),
    result: { ok: true, bytesWritten: 5 },
  },
  {
    name: 'create_directory',
    arguments: JSON.stringify({ path: 'tmp/example' }),
    result: { ok: true, status: 'created' },
  },
  {
    name: 'api_request',
    arguments: JSON.stringify({ url: 'https://example.test' }),
    result: { ok: true, status: 'completed' },
  },
  {
    name: 'resolve_object',
    arguments: JSON.stringify({ path: 'README.md' }),
    result: { ok: true, data: [{ displayName: 'README.md', canonicalPath: 'README.md' }] },
  },
  {
    name: 'search_content',
    arguments: JSON.stringify({ query: 'Agent CLI' }),
    result: { ok: true, data: [{ path: 'README.md' }] },
  },
  {
    name: 'list_content',
    arguments: JSON.stringify({ path: '.' }),
    result: { ok: true, data: [{ path: 'README.md' }] },
  },
  {
    name: 'read_content',
    arguments: JSON.stringify({ path: 'README.md' }),
    result: { ok: true, data: { path: 'README.md', contentType: 'text/markdown', content: '# Agent CLI\n' } },
  },
  {
    name: 'write_content',
    arguments: JSON.stringify({ path: 'README.md', content: '# Agent CLI\n' }),
    result: { ok: true, data: { path: 'README.md' } },
  },
  {
    name: 'create_content',
    arguments: JSON.stringify({ path: 'notes.md', content: 'hello' }),
    result: { ok: true, data: { path: 'notes.md', created: true } },
  },
  {
    name: 'delete_content',
    arguments: JSON.stringify({ path: 'old.md' }),
    result: { ok: true, data: { path: 'old.md' } },
  },
  {
    name: 'custom_tool',
    arguments: JSON.stringify({ path: 'custom.txt' }),
    result: { ok: true, status: 'completed' },
  },
];

/** @param {string[]} inputs */
function createScriptedPrompt(inputs) {
  const pendingInputs = [...inputs];

  return {
    question: vi.fn(async () => pendingInputs.shift() ?? '/exit'),
    close: vi.fn(),
  };
}

/** @typedef {{ runtimeClient?: Record<string, unknown> }} CliModuleOverrides */

const loadCliModule = /** @type {(rootPath?: string, moduleOverrides?: CliModuleOverrides) => Promise<any>} */ (async (rootPath, moduleOverrides = {}) => {
  if (rootPath) {
    process.chdir(rootPath);
  }

  vi.resetModules();

  if (moduleOverrides.runtimeClient) {
    vi.doMock('../../core/agent-runtime.js', async () => {
      const actual = /** @type {Record<string, unknown>} */ (await vi.importActual('../../core/agent-runtime.js'));
      return {
        ...actual,
        ...moduleOverrides.runtimeClient,
      };
    });
  } else {
    vi.doUnmock('../../core/agent-runtime.js');
  }

  return await import('../../cli/src/agent-cli.ts');
});

afterEach(async () => {
  process.chdir(originalCwd);
  restoreCliEnvironment(originalCliEnvironment);
  vi.doUnmock('../../core/agent-runtime.js');

  while (rootsToClean.length > 0) {
    const rootPath = rootsToClean.pop();

    if (rootPath) {
      await removeTestRoot(rootPath);
    }
  }

  while (tempPathsToClean.length > 0) {
    const tempPath = tempPathsToClean.pop();

    if (tempPath) {
      await rm(tempPath, { recursive: true, force: true });
    }
  }
});

describe('agent-cli entrypoint', () => {
  it('parses supported flags and rejects deleted world/agent flags', async () => {
    const { parseArguments } = await loadCliModule();

    expect(parseArguments(['--new-chat', 'Map', 'the', 'terrain'])).toEqual({
      help: false,
      newChat: true,
      runtimeOverrides: {},
      streamOff: false,
      verbose: false,
      message: 'Map the terrain',
    });
    expect(parseArguments(['--workspace', '/tmp/workspace-a', 'Inspect', 'status'])).toEqual({
      help: false,
      newChat: false,
      workspaceRoot: '/tmp/workspace-a',
      runtimeOverrides: {},
      streamOff: false,
      verbose: false,
      message: 'Inspect status',
    });
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
    ])).toMatchObject({
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
      message: 'Inspect',
    });

    expect(() => parseArguments(['--world', 'research'])).toThrow('Unknown flag: --world');
    expect(() => parseArguments(['--agent-id', 'research'])).toThrow('Unknown flag: --agent-id');
    expect(() => parseArguments(['--new-agent', 'research'])).toThrow('Unknown flag: --new-agent');
  });

  it('passes AGENTS.md prompt, skill inventory, and env runtime defaults into the turn', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Workspace prompt');
    await ensureSkillsRoot(rootPath);
    await writeSkill(rootPath, 'core', {
      name: 'core-skill',
      description: 'Core skill.',
    });
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.AGENT_CLI_PROVIDER = 'openai';
    process.env.AGENT_CLI_MODEL = 'gpt-5';

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

    await main(['Inspect', 'status'], createIoCapture());

    expect(runChatTurn).toHaveBeenCalledWith(expect.objectContaining({
      userMessage: 'Inspect status',
      builtInSystemPrompt: expect.stringContaining('You are Agent CLI.'),
      workspaceSystemPrompt: 'Workspace prompt',
      skillInventory: expect.arrayContaining([
        expect.objectContaining({ skillId: 'core-skill', description: 'Core skill.' }),
      ]),
      agentConfig: expect.objectContaining({
        provider: 'openai',
        model: 'gpt-5',
      }),
    }));
  });

  it('lets CLI runtime flags override .env provider and model', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.AGENT_CLI_PROVIDER = 'openai';
    process.env.AGENT_CLI_MODEL = 'gpt-5-mini';

    const runChatTurn = vi.fn().mockResolvedValue({
      assistantText: 'ok',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'ok' },
      ],
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });

    await main(['--model', 'gpt-5', 'hello'], createIoCapture());

    expect(runChatTurn).toHaveBeenCalledWith(expect.objectContaining({
      agentConfig: expect.objectContaining({
        provider: 'openai',
        model: 'gpt-5',
      }),
    }));
  });

  it('streams verbose reasoning chunks into one readable diagnostic block', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const runChatTurn = vi.fn().mockImplementation(async ({ onStreamChunk }) => {
      await onStreamChunk?.({ reasoning: 'The' });
      await onStreamChunk?.({ reasoning: ' user' });
      await onStreamChunk?.({ reasoning: ' is' });
      await onStreamChunk?.({ reasoning: ' asking' });
      await onStreamChunk?.({ content: 'done' });

      return {
        assistantText: 'done',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'done' },
        ],
      };
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });
    const stdoutChunks = /** @type {string[]} */ ([]);
    const stderrChunks = /** @type {string[]} */ ([]);
    /** @param {unknown} chunk */
    const writeStdout = (chunk) => stdoutChunks.push(String(chunk));
    /** @param {unknown} chunk */
    const writeStderr = (chunk) => stderrChunks.push(String(chunk));
    const io = {
      stdout: {
        write: vi.fn(writeStdout),
      },
      stderr: {
        write: vi.fn(writeStderr),
      },
    };

    await main(['--verbose', 'hello'], io);

    expect(stderrChunks).toEqual(expect.arrayContaining([
      'The',
      ' user',
      ' is',
      ' asking',
      '\n\n',
    ]));
    expect(stderrChunks.join('')).toContain('The user is asking\n\n');
    expect(stderrChunks.join('')).not.toContain('reasoning:');
    expect(stderrChunks.join('')).not.toContain('"The"');
    expect(stdoutChunks.join('')).toContain('done\n');
  });

  it('persists text stream trace response metadata and usage', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.AGENT_CLI_STREAM_TRACE = 'true';

    const runChatTurn = vi.fn().mockImplementation(async ({ onStreamChunk, onModelResponse }) => {
      await onStreamChunk?.({ content: 'done' });
      await onModelResponse?.({
        type: 'text',
        content: 'done',
        assistantMessage: { role: 'assistant', content: 'done' },
        stopKind: 'natural_stop',
        providerStopReason: 'stop',
        usage: {
          inputTokens: 8,
          outputTokens: 2,
          totalTokens: 10,
        },
      });

      return {
        assistantText: 'done',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'done' },
        ],
      };
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });

    const io = createIoCapture();
    await main(['--verbose', 'hello'], io);

    const chatRoot = path.join(rootPath, '.agent-world', 'chats');
    const chatIds = (await readdir(chatRoot)).filter((entry) => entry !== 'current.json');
    const events = (await readFile(path.join(chatRoot, chatIds[0], 'events.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    expect(events).toContainEqual(expect.objectContaining({
      kind: 'stream_trace',
      type: 'text',
      text: 'done',
      stopKind: 'natural_stop',
      finishReason: 'stop',
      usage: {
        inputTokens: 8,
        outputTokens: 2,
        totalTokens: 10,
      },
    }));
    expect(io.getStderr()).toContain(
      '✓ model.response stopKind=natural_stop · finish_reason=stop · tokens input=8 output=2 total=10',
    );
  });

  it('clears restarted pending dots before ending a streamed turn', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const runChatTurn = vi.fn().mockImplementation(async ({ onStreamChunk, handleToolCall }) => {
      await onStreamChunk?.({ content: 'partial' });
      await handleToolCall?.({
        toolCall: { id: 'input-1' },
        toolName: 'ask_user_input',
        arguments: JSON.stringify({
          question: 'Continue?',
          options: ['Yes'],
          allowFreeformInput: false,
        }),
      });

      return {
        assistantText: 'partial',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'partial' },
        ],
      };
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });
    const io = createIoCapture({ stdoutIsTTY: true });
    const inputPrompt = createScriptedPrompt(['1']);

    await main(['hello'], io, { interactivePrompt: inputPrompt });

    expect(io.getStdout()).toContain('partial');
    expect(io.getStdout()).toContain('0. Exit UI\n\n...');
    expect(io.getStdout()).toMatch(/\r\u001b\[2K {3}\r\u001b\[2K\n$/);
    expect(io.getStdout()).not.toMatch(/\.\.\.\n$/);
  });

  it('suppresses streamed prompt text when structured user input follows', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const runChatTurn = vi.fn().mockImplementation(async ({ onStreamChunk, handleToolCall }) => {
      await onStreamChunk?.({
        content: 'Please select one workflow pattern.\n\n1. linear\n2. router\n3. supervisor\n4. review-loop\n5. multi-review\n6. parallel-fanout\n7. map-reduce\n8. state-machine\n9. single-agent\n',
      });
      await handleToolCall?.({
        toolCall: { id: 'input-1' },
        toolName: 'ask_user_input',
        arguments: JSON.stringify({
          type: 'single-select',
          question: 'Select exactly one Agent World workflow pattern to initialize:',
          options: [
            'linear',
            'router',
            'supervisor',
            'review-loop',
            'multi-review',
            'parallel-fanout',
            'map-reduce',
            'state-machine',
            'single-agent',
          ],
          allowFreeformInput: false,
        }),
      });

      return {
        assistantText: '',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: '' },
        ],
      };
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });
    const io = createIoCapture();
    const inputPrompt = createScriptedPrompt(['9']);

    await main(['hello'], io, { interactivePrompt: inputPrompt });

    expect(io.getStdout()).not.toContain('Please select one workflow pattern.');
    expect(io.getStdout()).not.toContain('assistant needs input:');
    expect(io.getStdout()).toContain('Select exactly one Agent World workflow pattern to initialize:');
    expect(io.getStdout()).toContain('9. single-agent');
  });

  it('clears pending dots before verbose tool diagnostics', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const runChatTurn = vi.fn().mockImplementation(async ({ onToolCall, onToolResult }) => {
      onToolCall?.({
        id: 'tool-1',
        name: 'load_skill',
        arguments: '{"skill_id":"agent-world-skill"}',
      });
      onToolResult?.({
        id: 'tool-1',
        name: 'load_skill',
        result: 'Loaded',
        durationMs: 7,
      });

      return {
        assistantText: '',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: '' },
        ],
      };
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });
    const io = createIoCapture({ stdoutIsTTY: true, stderrIsTTY: true });

    await main(['--verbose', 'hello'], io);

    expect(io.getStdout()).toBe('...\r\u001b[2K   \r\u001b[2K...\r\u001b[2K   \r\u001b[2K');
    expect(io.getStderr()).toContain('\u001b[90m\n  ↳ load_skill {"skill_id":"agent-world-skill"}\u001b[0m');
    expect(io.getStderr()).toContain('\u001b[90m\n  ✓ load_skill 7ms · Loaded\n\u001b[0m');
  });

  it('does not restart pending dots between a verbose tool call and result', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const runChatTurn = vi.fn().mockImplementation(async ({ onToolCall, onToolResult }) => {
      onToolCall?.({
        id: 'tool-1',
        name: 'load_skill',
        arguments: '{"skill_id":"agent-world-skill"}',
      });
      onToolResult?.({
        id: 'tool-1',
        name: 'load_skill',
        result: 'Loaded',
        durationMs: 7,
      });

      return {
        assistantText: '',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: '' },
        ],
      };
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });
    const chunks = [];
    const terminal = {
      isTTY: true,
      write(chunk) {
        chunks.push(String(chunk));
      },
    };

    await main(['--verbose', 'hello'], {
      stdout: terminal,
      stderr: terminal,
    });

    const output = chunks.join('');
    const callIndex = output.indexOf('↳ load_skill {"skill_id":"agent-world-skill"}');
    const resultIndex = output.indexOf('✓ load_skill 7ms · Loaded');
    expect(callIndex).toBeGreaterThanOrEqual(0);
    expect(resultIndex).toBeGreaterThan(callIndex);
    expect(output.slice(callIndex, resultIndex)).not.toContain('\r\u001b[2K');
    expect(output.slice(callIndex, resultIndex)).not.toContain('...');
  });

  it('prints one visible verbose call/result pair for every tool kind', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const runChatTurn = vi.fn().mockImplementation(async ({ onToolCall, onToolResult }) => {
      verboseToolPairExamples.forEach((tool, index) => {
        const id = `tool-${index + 1}`;
        onToolCall?.({
          id,
          name: tool.name,
          arguments: tool.arguments,
        });
        onToolResult?.({
          id,
          name: tool.name,
          arguments: tool.arguments,
          result: tool.result,
          durationMs: index + 1,
        });
      });

      return {
        assistantText: 'done',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'done' },
        ],
      };
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });
    const chunks = [];
    const terminal = {
      isTTY: true,
      write(chunk) {
        chunks.push(String(chunk));
      },
    };

    await main(['--verbose', 'hello'], {
      stdout: terminal,
      stderr: terminal,
    });

    const output = chunks.join('');
    for (const tool of verboseToolPairExamples) {
      const callPattern = `↳ ${tool.name}`;
      const resultPattern = `✓ ${tool.name}`;
      const callIndex = output.indexOf(callPattern);
      const resultIndex = output.indexOf(resultPattern);

      expect(countOccurrences(output, callPattern)).toBe(1);
      expect(countOccurrences(output, resultPattern)).toBe(1);
      expect(callIndex).toBeGreaterThanOrEqual(0);
      expect(resultIndex).toBeGreaterThan(callIndex);
      expect(output.slice(callIndex, resultIndex)).not.toContain('\r\u001b[2K');
      expect(output.slice(callIndex, resultIndex)).not.toContain('...');
    }
  });

  it('prints exactly one verbose call row before each write_file result', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const runChatTurn = vi.fn().mockImplementation(async ({ onToolCall, onToolResult }) => {
      onToolResult?.({
        id: 'write-1',
        name: 'write_file',
        arguments: '{"filePath":"notes.md","content":"hello"}',
        result: { ok: true, bytesWritten: 5 },
        durationMs: 2,
      });
      onToolCall?.({
        id: 'write-2',
        name: 'write_file',
        arguments: '{"filePath":"summary.md","content":"done"}',
      });
      onToolCall?.({
        id: 'write-2',
        name: 'write_file',
        arguments: '{"filePath":"summary.md","content":"done"}',
      });
      onToolResult?.({
        id: 'write-2',
        name: 'write_file',
        arguments: '{"filePath":"summary.md","content":"done"}',
        result: { ok: true, bytesWritten: 4 },
        durationMs: 3,
      });

      return {
        assistantText: 'done',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'done' },
        ],
      };
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });
    const io = createIoCapture({ stderrIsTTY: true });

    await main(['--verbose', '--stream-off', 'hello'], io);

    const stderr = io.getStderr();
    expect(countOccurrences(stderr, '↳ write_file notes.md')).toBe(1);
    expect(countOccurrences(stderr, '✓ write_file 2ms · 5 B written')).toBe(1);
    expect(countOccurrences(stderr, '↳ write_file summary.md')).toBe(1);
    expect(countOccurrences(stderr, '✓ write_file 3ms · 4 B written')).toBe(1);
    expect(stderr).not.toContain('↳ write_file notes.md\u001b[0m\u001b[90m\n  ↳ write_file notes.md');
    expect(io.getStdout()).toBe('\ndone\n');
  });

  it('restarts pending dots after verbose model continuation diagnostics', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const runChatTurn = vi.fn().mockImplementation(async ({ onModelResponse }) => {
      onModelResponse?.({
        stopKind: 'tool_use',
        providerStopReason: 'tool_calls',
      });

      return {
        assistantText: '',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: '' },
        ],
      };
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });
    const io = createIoCapture({ stdoutIsTTY: true, stderrIsTTY: true });

    await main(['--verbose', 'hello'], io);

    expect(io.getStdout().match(/\.\.\./g)).toHaveLength(2);
    expect(io.getStdout()).toBe('...\r\u001b[2K   \r\u001b[2K...\r\u001b[2K   \r\u001b[2K');
    expect(io.getStderr()).toContain('✓ model.response stopKind=tool_use · finish_reason=tool_calls');
  });

  it('does not restart pending dots after verbose natural-stop diagnostics', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const runChatTurn = vi.fn().mockImplementation(async ({ onStreamChunk, onModelResponse }) => {
      await onStreamChunk?.({ content: 'done' });
      onModelResponse?.({
        stopKind: 'natural_stop',
        providerStopReason: 'stop',
      });

      return {
        assistantText: 'done',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'done' },
        ],
      };
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });
    const io = createIoCapture({ stdoutIsTTY: true, stderrIsTTY: true });

    await main(['--verbose', 'hello'], io);

    expect(io.getStdout().match(/\.\.\./g)).toHaveLength(1);
    expect(io.getStdout()).toContain('done\n');
    expect(io.getStderr()).toContain('✓ model.response stopKind=natural_stop · finish_reason=stop');
  });

  it('keeps pending dots visible during non-verbose tool calls before assistant text', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const runChatTurn = vi.fn().mockImplementation(async ({ onToolCall, onToolResult, onStreamChunk }) => {
      onToolCall?.({
        id: 'tool-1',
        name: 'load_skill',
        arguments: '{"skill_id":"agent-world-skill"}',
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 320);
      });
      onToolResult?.({
        id: 'tool-1',
        name: 'load_skill',
        result: 'Loaded',
        durationMs: 320,
      });
      await onStreamChunk?.({ content: 'done' });

      return {
        assistantText: 'done',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'done' },
        ],
      };
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });
    const io = createIoCapture({ stdoutIsTTY: true });

    await main(['hello'], io);

    expect(io.getStdout()).toMatch(/^\.\.\.\r\u001b\[2K\./);
    expect(io.getStdout()).toContain('done\n');
    expect(io.getStderr()).toBe('');
  });

  it('shows pending dots instead of non-verbose model and tool diagnostics after assistant text', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const runChatTurn = vi.fn().mockImplementation(async ({ onStreamChunk, onModelResponse, onToolCall, onToolResult }) => {
      await onStreamChunk?.({ content: 'I will load context.' });
      onModelResponse?.({
        stopKind: 'tool_use',
        providerStopReason: 'tool_calls',
      });
      onToolCall?.({
        id: 'tool-1',
        name: 'load_skill',
        arguments: '{"skill_id":"agent-world-skill"}',
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 320);
      });
      onToolResult?.({
        id: 'tool-1',
        name: 'load_skill',
        result: 'Loaded',
        durationMs: 320,
      });
      await onStreamChunk?.({ content: ' Done.' });

      return {
        assistantText: 'I will load context. Done.',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'I will load context. Done.' },
        ],
      };
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });
    const io = createIoCapture({ stdoutIsTTY: true });

    await main(['hello'], io);

    expect(io.getStdout()).toContain('I will load context.\n...');
    expect(io.getStdout()).toContain(' Done.\n');
    expect(io.getStdout()).not.toContain('model.response');
    expect(io.getStdout()).not.toContain('load_skill');
    expect(io.getStderr()).toBe('');
  });

  it('keeps verbose model and tool diagnostics when assistant text streaming is off', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const runChatTurn = vi.fn().mockImplementation(async ({ onModelResponse, onToolCall, onToolResult, onStreamChunk }) => {
      expect(onStreamChunk).toBeUndefined();
      onModelResponse?.({
        stopKind: 'tool_use',
        providerStopReason: 'tool_calls',
      });
      onToolCall?.({
        id: 'skill-1',
        name: 'load_skill',
        arguments: '{"skill_id":"agent-world-skill"}',
      });
      onToolResult?.({
        id: 'skill-1',
        name: 'load_skill',
        result: '<skill_context id="agent-world-skill">Loaded</skill_context>',
        durationMs: 4,
      });
      onToolCall?.({
        id: 'read-1',
        name: 'read_file',
        arguments: '{"filePath":"README.md"}',
      });
      onToolResult?.({
        id: 'read-1',
        name: 'read_file',
        arguments: '{"filePath":"README.md"}',
        result: {
          ok: true,
          filePath: 'README.md',
          content: '# Agent CLI\n\nUseful docs.',
        },
        durationMs: 3,
      });

      return {
        assistantText: 'done',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'done' },
        ],
      };
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });
    const io = createIoCapture({ stderrIsTTY: true });

    await main(['--verbose', '--stream-off', 'hello'], io);

    expect(io.getStderr()).toContain('✓ model.response stopKind=tool_use · finish_reason=tool_calls');
    expect(io.getStderr()).toContain('↳ load_skill {"skill_id":"agent-world-skill"}');
    expect(io.getStderr()).toContain('✓ load_skill 4ms');
    expect(io.getStderr()).toContain('↳ read_file README.md');
    expect(io.getStderr()).toContain('✓ read_file 3ms');
    expect(io.getStdout()).toBe('\ndone\n');
  });

  it('observes model and tool lifecycle in non-verbose stream-off mode without displaying diagnostics', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    process.env.OPENAI_API_KEY = 'test-openai-key';
    const observed = {
      modelResponse: false,
      toolCall: false,
      toolResult: false,
    };

    const runChatTurn = vi.fn().mockImplementation(async ({ onModelResponse, onToolCall, onToolResult, onStreamChunk }) => {
      expect(onStreamChunk).toBeUndefined();
      expect(onModelResponse).toEqual(expect.any(Function));
      expect(onToolCall).toEqual(expect.any(Function));
      expect(onToolResult).toEqual(expect.any(Function));

      onModelResponse?.({
        stopKind: 'tool_use',
        providerStopReason: 'tool_calls',
      });
      observed.modelResponse = true;
      onToolCall?.({
        id: 'tool-1',
        name: 'load_skill',
        arguments: '{"skill_id":"agent-world-skill"}',
      });
      observed.toolCall = true;
      onToolResult?.({
        id: 'tool-1',
        name: 'load_skill',
        result: 'Loaded',
        durationMs: 2,
      });
      observed.toolResult = true;

      return {
        assistantText: 'done',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'done' },
        ],
      };
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });
    const io = createIoCapture({ stdoutIsTTY: true, stderrIsTTY: true });

    await main(['--stream-off', 'hello'], io);

    expect(observed).toEqual({
      modelResponse: true,
      toolCall: true,
      toolResult: true,
    });
    expect(io.getStdout()).toBe('done\n');
    expect(io.getStderr()).toBe('');
  });

  it('colors verbose reasoning and tool results gray on TTY stderr', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const runChatTurn = vi.fn().mockImplementation(async ({ onStreamChunk, onToolResult }) => {
      await onStreamChunk?.({ reasoning: 'Thinking' });
      onToolResult?.({
        id: 'tool-1',
        name: 'load_skill',
        result: 'Loaded',
        durationMs: 4,
      });
      await onStreamChunk?.({ content: 'done' });

      return {
        assistantText: 'done',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'done' },
        ],
      };
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });
    const io = createIoCapture({ stderrIsTTY: true });

    await main(['--verbose', 'hello'], io);

    expect(io.getStderr()).toContain('\u001b[90mThinking\u001b[0m\n\n');
    expect(io.getStderr()).not.toContain('reasoning:');
    expect(io.getStderr()).toContain('\u001b[90m  ↳ load_skill\u001b[0m');
    expect(io.getStderr()).toContain('\u001b[90m\n  ✓ load_skill 4ms · Loaded\n\u001b[0m');
    expect(io.getStdout()).toContain('\ndone\n');
  });

  it('separates verbose diagnostics from adjacent assistant text with blank lines', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const runChatTurn = vi.fn().mockImplementation(async ({ onStreamChunk, onToolCall, onToolResult }) => {
      await onStreamChunk?.({ content: 'before' });
      onToolCall?.({
        id: 'tool-1',
        name: 'load_skill',
        arguments: '{"skill_id":"agent-world-skill"}',
      });
      onToolResult?.({
        id: 'tool-1',
        name: 'load_skill',
        result: 'Loaded',
        durationMs: 4,
      });
      await onStreamChunk?.({ content: 'after' });

      return {
        assistantText: 'beforeafter',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'beforeafter' },
        ],
      };
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });
    const chunks = /** @type {string[]} */ ([]);
    const io = {
      stdout: {
        /** @param {unknown} chunk */
        write(chunk) {
          chunks.push(String(chunk));
        },
      },
      stderr: {
        isTTY: true,
        /** @param {unknown} chunk */
        write(chunk) {
          chunks.push(String(chunk));
        },
      },
    };

    await main(['--verbose', 'hello'], io);

    const output = chunks.join('');
    expect(output).toContain('before\u001b[90m\n\n  ↳ load_skill {"skill_id":"agent-world-skill"}');
    expect(output).toContain('✓ load_skill 4ms · Loaded\n\u001b[0m\nafter');
  });

  it('keeps a blank line above create_directory diagnostics after model metadata', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const runChatTurn = vi.fn().mockImplementation(async ({ onStreamChunk, onModelResponse, onToolCall, onToolResult }) => {
      await onStreamChunk?.({ content: 'I will create the directory.' });
      onModelResponse?.({
        stopKind: 'tool_use',
        providerStopReason: 'tool_calls',
      });
      onToolCall?.({
        id: 'tool-1',
        name: 'create_directory',
        arguments: '{"path":"/tmp/example"}',
      });
      onToolResult?.({
        id: 'tool-1',
        name: 'create_directory',
        result: { ok: true, status: 'created' },
        durationMs: 1,
      });

      return {
        assistantText: 'I will create the directory.',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'I will create the directory.' },
        ],
      };
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });
    const chunks = /** @type {string[]} */ ([]);
    const io = {
      stdout: {
        /** @param {unknown} chunk */
        write(chunk) {
          chunks.push(String(chunk));
        },
      },
      stderr: {
        isTTY: true,
        /** @param {unknown} chunk */
        write(chunk) {
          chunks.push(String(chunk));
        },
      },
    };

    await main(['--verbose', 'hello'], io);

    const output = chunks.join('');
    expect(output).toContain('I will create the directory.\u001b[90m\n\n  ✓ model.response stopKind=tool_use');
    expect(output).toContain('tool_calls\n\u001b[0m\u001b[90m\n  ↳ create_directory /tmp/example');
    expect(output).not.toContain('tool_calls\n\u001b[0m\u001b[90m\n\n  ↳ create_directory');
  });

  it('colors verbose ask_user_input calls gray and leaves a blank line after', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const inputArgs = JSON.stringify({
      type: 'single-select',
      question: 'Continue?',
      options: ['Yes'],
      allowFreeformInput: false,
    });
    const runChatTurn = vi.fn().mockImplementation(async ({ onToolCall, handleToolCall }) => {
      onToolCall?.({
        id: 'input-1',
        name: 'ask_user_input',
        arguments: inputArgs,
      });
      await handleToolCall?.({
        toolCall: { id: 'input-1' },
        toolName: 'ask_user_input',
        arguments: inputArgs,
      });

      return {
        assistantText: '',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: '' },
        ],
      };
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });
    const io = createIoCapture({ stderrIsTTY: true });
    const interactivePrompt = createScriptedPrompt(['1']);

    await main(['--verbose', 'hello'], io, { interactivePrompt });

    expect(io.getStderr()).toMatch(/\u001b\[90m\n  ↳ ask_user_input \{.*\n\n\u001b\[0m\nContinue\?/s);
    expect(io.getStdout()).not.toContain('assistant needs input:');
    expect(io.getStderr()).toContain('Continue?');
  });

  it('separates malformed ask_user_input diagnostics from assistant text', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const inputArgs = JSON.stringify({
      questions: '[{"header":"Workflow Setup","id":"workflow-pattern","question":"What next?"}]',
    });
    const runChatTurn = vi.fn().mockImplementation(async ({ onStreamChunk, onToolCall, onToolResult }) => {
      await onStreamChunk?.({ content: 'Choose a workflow.' });
      onToolCall?.({
        id: 'input-1',
        name: 'ask_user_input',
        arguments: inputArgs,
      });
      onToolResult?.({
        id: 'input-1',
        name: 'ask_user_input',
        result: {
          ok: false,
          status: 'error',
          errorType: 'tool_parameter_validation_failed',
        },
        durationMs: 0,
      });

      return {
        assistantText: 'Choose a workflow.',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'Choose a workflow.' },
        ],
      };
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });
    const chunks = /** @type {string[]} */ ([]);
    const io = {
      stdout: {
        /** @param {unknown} chunk */
        write(chunk) {
          chunks.push(String(chunk));
        },
      },
      stderr: {
        isTTY: true,
        /** @param {unknown} chunk */
        write(chunk) {
          chunks.push(String(chunk));
        },
      },
    };

    await main(['--verbose', 'hello'], io);

    const output = chunks.join('');
    expect(output).toContain('Choose a workflow.\u001b[90m\n\n  ↳ ask_user_input');
    expect(output).toContain('\n\n\u001b[0m\u001b[90m\n  ✗ ask_user_input 0ms ·');
  });

  it('stores workspace state under --workspace instead of the process cwd', async () => {
    const rootPath = await createTestRoot();
    const cwdRoot = await createTestRoot();
    rootsToClean.push(rootPath, cwdRoot);
    await writeSystemPrompt(rootPath, 'Prompt');
    process.env.AGENT_CLI_WORKSPACE = cwdRoot;
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const runChatTurn = vi.fn().mockResolvedValue({
      assistantText: 'ok',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'ok' },
      ],
      streamEvents: [],
    });
    const { main } = await loadCliModule(cwdRoot, {
      runtimeClient: {
        runChatTurn,
      },
    });

    await main(['--workspace', rootPath, '--new-chat', 'hello'], createIoCapture());

    expect(await readdir(path.join(rootPath, '.agent-world'))).toEqual(
      expect.arrayContaining(['chats', 'skills']),
    );
    await expect(readdir(path.join(cwdRoot, '.agent-world'))).rejects.toThrow();
  });

  it('starts interactive mode when no message is provided', async () => {
    applyMinimalRuntimeEnvironment();
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');

    const runChatTurn = vi.fn().mockImplementation(async ({ onStreamChunk }) => {
      onStreamChunk?.({ content: 'interactive ok' });

      return {
        assistantText: 'interactive ok',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'interactive ok' },
        ],
      };
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });
    const io = createIoCapture();
    const interactivePrompt = createScriptedPrompt(['hello', '/exit']);

    await main([], io, { interactivePrompt });

    expect(interactivePrompt.question).toHaveBeenCalledWith('> ');
    expect(interactivePrompt.close).toHaveBeenCalled();
    expect(runChatTurn).toHaveBeenCalledWith(expect.objectContaining({
      userMessage: 'hello',
    }));
    expect(io.getStdout()).toContain('Agent CLI interactive mode.');
    expect(io.getStdout()).toContain('interactive ok\n\n');
    expect(io.getStderr()).toBe('');
  });

  it('normalizes numbered replies to the previous assistant option label', async () => {
    applyMinimalRuntimeEnvironment();
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    const patternPrompt = [
      'Please select one of the following nine supported patterns:',
      '',
      '1. **linear** - Fixed sequential agents.',
      '2. **router** - A router agent decides.',
      '3. **supervisor** - A supervisor delegates.',
      '4. **review-loop** - Worker with reviewer feedback.',
      '5. **multi-review** - Worker with multiple reviewers.',
      '6. **parallel-fanout** - Parallel agents then aggregate.',
      '7. **map-reduce** - Map chunks then reduce.',
      '8. **state-machine** - Explicit transitions.',
      '9. **single-agent** - One agent handles everything.',
      '',
      'Reply with the exact pattern name.',
    ].join('\n');

    const runChatTurn = vi.fn().mockImplementation(async ({ chat, userMessage, onStreamChunk }) => {
      if (userMessage === 'init') {
        onStreamChunk?.({ content: patternPrompt });

        return {
          assistantText: patternPrompt,
          messages: [
            ...chat.messages,
            { role: 'user', content: userMessage },
            { role: 'assistant', content: patternPrompt },
          ],
        };
      }

      return {
        assistantText: 'ok',
        messages: [
          ...chat.messages,
          { role: 'user', content: userMessage },
          { role: 'assistant', content: 'ok' },
        ],
      };
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });
    const io = createIoCapture();
    const interactivePrompt = createScriptedPrompt(['init', '9', '/exit']);

    await main([], io, { interactivePrompt });

    expect(runChatTurn).toHaveBeenCalledTimes(2);
    expect(runChatTurn.mock.calls[1][0]).toEqual(expect.objectContaining({
      userMessage: 'single-agent',
    }));
  });

  it('handles interactive chat commands without running a model turn', async () => {
    applyMinimalRuntimeEnvironment();
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');

    const runChatTurn = vi.fn().mockResolvedValue({
      assistantText: 'unused',
      messages: [],
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });
    const io = createIoCapture();
    const interactivePrompt = createScriptedPrompt([
      '/new',
      '/chats',
      '/clear',
      '/use missing-chat',
      '/exit',
    ]);

    await main([], io, { interactivePrompt });

    expect(runChatTurn).not.toHaveBeenCalled();
    expect(io.getStdout()).toContain('new chat ');
    expect(io.getStdout()).toContain('history cleared');
    expect(io.getStdout()).toContain('messages');
    expect(io.getStderr()).toContain('command failed: Missing chat session file: ');
  });

  it('clears the current chat without creating a new chat', async () => {
    applyMinimalRuntimeEnvironment();
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    process.env.AGENT_CLI_STREAM_TRACE = 'true';

    const runChatTurn = vi.fn().mockImplementation(async ({ chat, userMessage, onStreamChunk }) => {
      await onStreamChunk?.({ content: 'ok' });

      return {
        assistantText: 'ok',
        messages: [
          ...chat.messages,
          { role: 'user', content: userMessage },
          { role: 'assistant', content: 'ok' },
        ],
      };
    });
    const { main } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });
    const io = createIoCapture();
    const interactivePrompt = createScriptedPrompt(['hello', '/clear', '/exit']);

    await main([], io, { interactivePrompt });

    const chatDirectories = (await readdir(path.join(rootPath, '.agent-world', 'chats'), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const current = await readJson(path.join(rootPath, '.agent-world', 'chats', 'current.json'));
    const messagesFile = await readFile(
      path.join(rootPath, '.agent-world', 'chats', current.chatId, 'messages.jsonl'),
      'utf8',
    );
    const eventsFile = await readFile(
      path.join(rootPath, '.agent-world', 'chats', current.chatId, 'events.jsonl'),
      'utf8',
    );

    expect(chatDirectories).toEqual([current.chatId]);
    expect(messagesFile).toBe('');
    expect(eventsFile).toBe('');
    expect(io.getStdout()).toContain('history cleared');
  });

  it('reports missing runtime environment variables before attempting the turn', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');

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

  it('omits empty skill scopes from startup diagnostics', async () => {
    const { skillStartupText, startupText } = await loadCliModule();

    expect(skillStartupText({
      user: [],
      project: [
        { skillId: 'zeta-skill' },
        { skillId: 'alpha-skill' },
      ],
    })).toBe(['Skills available:', '  project: alpha-skill, zeta-skill'].join('\n'));
    expect(skillStartupText({
      user: [
        { skillId: 'user-skill' },
      ],
      project: [],
    })).toBe(['Skills available:', '  user: user-skill'].join('\n'));
    expect(skillStartupText({ user: [], project: [] })).toBe('');
    expect(startupText('/tmp/workspace', undefined, { user: [], project: [] })).toBe('Agent CLI starting in /tmp/workspace');
  });

  it('logs workspace root, runtime, and scoped skills on startup', async () => {
    applyMinimalRuntimeEnvironment();

    const rootPath = await createTestRoot();
    const homeRoot = await createTestRoot();
    rootsToClean.push(rootPath, homeRoot);
    process.env.HOME = homeRoot;
    await writeSystemPrompt(rootPath, 'Prompt');
    await writeSkill(rootPath, 'project-tool', {
      name: 'project-skill',
      description: 'Project skill.',
    });
    await mkdir(path.join(homeRoot, '.agent-world', 'skills', 'user-tool'), { recursive: true });
    await writeFile(
      path.join(homeRoot, '.agent-world', 'skills', 'user-tool', 'SKILL.md'),
      ['---', 'name: user-skill', 'description: User skill.', '---', '', '# User', ''].join('\n'),
      'utf8',
    );
    process.env.AGENT_CLI_GLOBAL_SKILLS = 'true';

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
    expect(io.getStderr()).toContain('Runtime: provider=openai, model=gpt-5');
    expect(io.getStderr()).toContain('Skills available:');
    expect(io.getStderr()).toContain('  user: user-skill');
    expect(io.getStderr()).toContain('  project: project-skill');
    expect(io.getStderr()).toContain('Synthetic turn failure');
    expect(process.exitCode).toBe(1);

    process.exitCode = originalExitCode;
  });

  it('uses core runtime selection for startup diagnostics', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    process.env.AGENT_CLI_PROVIDER = 'azure';
    process.env.AZURE_OPENAI_DEPLOYMENT_NAME = 'gpt-5-enterprise';

    const { runCli } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn: vi.fn().mockRejectedValue(new Error('Synthetic turn failure')),
      },
    });
    const io = createIoCapture();
    const originalExitCode = process.exitCode;

    process.exitCode = undefined;
    await runCli(['--verbose', 'hello'], io);

    expect(io.getStderr()).toContain('Runtime: provider=azure, model=gpt-5-enterprise');
    expect(process.exitCode).toBe(1);

    process.exitCode = originalExitCode;
  });

  it('logs workflow and agents from workspace world json on startup', async () => {
    applyMinimalRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    await mkdir(path.join(rootPath, '.agent-world'), { recursive: true });
    await writeFile(
      path.join(rootPath, '.agent-world', 'world.json'),
      JSON.stringify({
        $schema: 'https://agent-world.local/world.schema.json',
        world: {
          id: 'demo',
          name: 'Demo World',
        },
        workflow: {
          type: 'sequential-pipeline',
          entry: 'planner',
          entryAgent: 'planner',
          nodes: {
            planner: {
              agent: 'planner',
            },
            reviewer: {
              agent: 'reviewer',
              requires: ['planner'],
            },
            executor: {
              agent: 'executor',
              requires: ['reviewer'],
            },
          },
          edges: {
            planner: ['reviewer'],
            reviewer: ['executor'],
            executor: [],
          },
        },
        agents: {
          planner: {
            name: 'Planner',
            role: 'planning',
            promptPath: 'prompts/planner.md',
          },
          reviewer: {
            name: 'Reviewer',
            promptPath: 'prompts/reviewer.md',
          },
          executor: {
            role: 'executor',
            promptPath: 'prompts/executor.md',
          },
        },
      }, null, 2),
      'utf8',
    );

    const { runCli } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn: vi.fn().mockRejectedValue(new Error('Synthetic turn failure')),
      },
    });
    const io = createIoCapture();
    const originalExitCode = process.exitCode;

    process.exitCode = undefined;
    await runCli(['hello'], io);

    expect(io.getStderr()).toContain('Agent world:');
    expect(io.getStderr()).toContain('  workflow: sequential-pipeline');
    expect(io.getStderr()).toContain('  agents: planner, reviewer, executor');
    expect(process.exitCode).toBe(1);

    process.exitCode = originalExitCode;
  });

  it('warns and continues when workspace world json does not match the bundled schema', async () => {
    applyMinimalRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    await mkdir(path.join(rootPath, '.agent-world'), { recursive: true });
    await writeFile(
      path.join(rootPath, '.agent-world', 'world.json'),
      JSON.stringify({
        workflow: {
          type: 'broadcast',
        },
        agents: [],
      }, null, 2),
      'utf8',
    );

    const runChatTurn = vi.fn().mockResolvedValue({
      assistantText: 'continued',
      messages: [],
    });
    const { runCli } = await loadCliModule(rootPath, {
      runtimeClient: {
        runChatTurn,
      },
    });
    const io = createIoCapture();
    const originalExitCode = process.exitCode;

    process.exitCode = undefined;
    await runCli(['hello'], io);

    expect(io.getStdout()).toBe('');
    expect(io.getStderr()).toContain('Invalid Agent World config:');
    expect(io.getStderr()).toContain('$.world is required');
    expect(io.getStderr()).toContain('$.agents must be object');
    expect(runChatTurn).toHaveBeenCalledOnce();
    expect(process.exitCode).toBeUndefined();

    process.exitCode = originalExitCode;
  });

  it('loads .env from the workspace and creates a workspace .env.example when missing', async () => {
    const rootPath = await createTestRoot();
    const cwdRoot = await createTestRoot();
    const emptyWorkspaceRoot = await createTestRoot();
    rootsToClean.push(rootPath, cwdRoot, emptyWorkspaceRoot);
    await writeFile(
      path.join(cwdRoot, '.env'),
      [
        'AGENT_CLI_PROVIDER=anthropic',
        'AGENT_CLI_MODEL=claude-sonnet-4-5',
        'GOOGLE_API_KEY=cwd-google-key',
        '',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      path.join(rootPath, '.env'),
      [
        'AGENT_CLI_PROVIDER=google',
        'AGENT_CLI_MODEL=gemini-2.5-pro',
        'AGENT_CLI_TEMPERATURE=0.3',
        'AGENT_CLI_MAX_TOKENS=1234',
        'AGENT_CLI_TOOL_PERMISSION=read',
        'AGENT_CLI_REASONING_EFFORT=low',
        'AGENT_CLI_PAST_MESSAGES=9',
        'AGENT_CLI_STREAM=false',
        'AGENT_CLI_STREAM_TRACE=true',
        'AGENT_CLI_WEB_SEARCH=medium',
        'AGENT_CLI_GLOBAL_SKILLS=true',
        'GOOGLE_API_KEY=dotenv-google-key',
        '',
      ].join('\n'),
      'utf8',
    );

    delete process.env.AGENT_CLI_WORKSPACE;
    delete process.env.AGENT_CLI_PROVIDER;
    delete process.env.AGENT_CLI_MODEL;
    delete process.env.AGENT_CLI_TEMPERATURE;
    delete process.env.AGENT_CLI_MAX_TOKENS;
    delete process.env.AGENT_CLI_TOOL_PERMISSION;
    delete process.env.AGENT_CLI_REASONING_EFFORT;
    delete process.env.AGENT_CLI_PAST_MESSAGES;
    delete process.env.AGENT_CLI_STREAM;
    delete process.env.AGENT_CLI_STREAM_TRACE;
    delete process.env.AGENT_CLI_WEB_SEARCH;
    delete process.env.AGENT_CLI_GLOBAL_SKILLS;
    delete process.env.GOOGLE_API_KEY;

    const { main, startupText } = await loadCliModule(cwdRoot);
    await main(['--workspace', rootPath, '--help'], createIoCapture());

    expect(process.env.GOOGLE_API_KEY).toBe('dotenv-google-key');
    expect(process.env.AGENT_CLI_PROVIDER).toBe('google');
    expect(process.env.AGENT_CLI_MODEL).toBe('gemini-2.5-pro');
    expect(process.env.AGENT_CLI_TEMPERATURE).toBe('0.3');
    expect(process.env.AGENT_CLI_MAX_TOKENS).toBe('1234');
    expect(process.env.AGENT_CLI_TOOL_PERMISSION).toBe('read');
    expect(process.env.AGENT_CLI_REASONING_EFFORT).toBe('low');
    expect(process.env.AGENT_CLI_PAST_MESSAGES).toBe('9');
    expect(process.env.AGENT_CLI_STREAM).toBe('false');
    expect(process.env.AGENT_CLI_STREAM_TRACE).toBe('true');
    expect(process.env.AGENT_CLI_WEB_SEARCH).toBe('medium');
    expect(process.env.AGENT_CLI_GLOBAL_SKILLS).toBe('true');
    expect(process.env.AGENT_CLI_WORKSPACE).toBe(rootPath);
    expect(startupText()).toBe(`Agent CLI starting in ${rootPath}`);
    expect(await readdir(path.join(rootPath, '.agent-world'))).toEqual(
      expect.arrayContaining(['chats', 'skills']),
    );
    await expect(readdir(path.join(cwdRoot, '.agent-world'))).rejects.toThrow();

    const { main: missingEnvMain } = await loadCliModule(cwdRoot);
    await missingEnvMain(['--workspace', emptyWorkspaceRoot, '--help'], createIoCapture());
    const example = await readFile(path.join(emptyWorkspaceRoot, '.env.example'), 'utf8');
    const checkedInExample = await readFile(path.join(originalCwd, '.env.example'), 'utf8');
    expect(example).toBe(checkedInExample);
    await expect(readFile(path.join(cwdRoot, '.env.example'), 'utf8')).rejects.toThrow();
  });

  it('does not use AGENT_CLI_WORKSPACE from workspace .env as a root selector', async () => {
    const rootPath = await createTestRoot();
    const redirectedRoot = await createTestRoot();
    rootsToClean.push(rootPath, redirectedRoot);
    await writeFile(
      path.join(rootPath, '.env'),
      [
        `AGENT_CLI_WORKSPACE=${redirectedRoot}`,
        'AGENT_CLI_PROVIDER=google',
        'AGENT_CLI_MODEL=gemini-2.5-pro',
        'GOOGLE_API_KEY=dotenv-google-key',
        '',
      ].join('\n'),
      'utf8',
    );

    delete process.env.AGENT_CLI_WORKSPACE;
    delete process.env.AGENT_CLI_PROVIDER;
    delete process.env.AGENT_CLI_MODEL;
    delete process.env.GOOGLE_API_KEY;

    const { main, startupText } = await loadCliModule(rootPath);
    const resolvedRootPath = process.cwd();
    await main(['--help'], createIoCapture());

    expect(process.env.AGENT_CLI_WORKSPACE).toBe(resolvedRootPath);
    expect(startupText()).toBe(`Agent CLI starting in ${resolvedRootPath}`);
    expect(await readdir(path.join(rootPath, '.agent-world'))).toEqual(
      expect.arrayContaining(['chats', 'skills']),
    );
    await expect(readdir(path.join(redirectedRoot, '.agent-world'))).rejects.toThrow();
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
});
