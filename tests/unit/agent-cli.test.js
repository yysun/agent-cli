// @ts-check
/**
 * Agent CLI Entrypoint Unit Tests
 *
 * Purpose:
 * - Validate local CLI parsing, env-backed runtime config, AGENTS.md prompt loading, and chat persistence.
 *
 * Recent changes:
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

/** @param {string[]} inputs */
function createScriptedPrompt(inputs) {
  const pendingInputs = [...inputs];

  return {
    question: vi.fn(async () => pendingInputs.shift() ?? '/exit'),
    close: vi.fn(),
  };
}

async function loadCliModule(rootPath, moduleOverrides = {}) {
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
}

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
    const stdoutChunks = [];
    const stderrChunks = [];
    const io = {
      stdout: {
        write: vi.fn((chunk) => stdoutChunks.push(String(chunk))),
      },
      stderr: {
        write: vi.fn((chunk) => stderrChunks.push(String(chunk))),
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
    expect(io.getStderr()).toContain('\u001b[90m  ✓ load_skill 4ms · Loaded\n\u001b[0m');
    expect(io.getStdout()).toContain('\ndone\n');
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
