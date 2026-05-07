// @ts-check
/**
 * Agent CLI End-to-End Tests
 *
 * Purpose:
 * - Exercise the CLI entrypoint against isolated on-disk fixtures and the real `llm-runtime` provider path.
 *
 * Key features:
 * - Calls a live LLM only when explicitly enabled for the test run.
 * - Verifies persisted session files rather than only internal helper behavior.
 * - Retains CLI error-path coverage for local filesystem and configuration failures.
 *
 * Recent changes:
 * - 2026-05-07: Switched e2e coverage from a mocked runtime to live LLM-backed turns.
 * - 2026-05-07: Made live-provider coverage opt-in and aligned provider selection with runtime validation.
 */
import 'dotenv/config';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  createIoCapture,
  createTestRoot,
  readJson,
  removeTestRoot,
  writeSystemPrompt,
} from '../helpers/test-root.js';
import { validateRuntimeEnvironment } from '../../lib/runtime-client.js';

const RUNTIME_ENVIRONMENT_KEYS = [
  'LLM_PROVIDER',
  'LLM_MODEL',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'XAI_API_KEY',
  'OPENAI_COMPATIBLE_API_KEY',
  'OPENAI_COMPATIBLE_BASE_URL',
  'OLLAMA_BASE_URL',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_RESOURCE_NAME',
  'AZURE_OPENAI_DEPLOYMENT_NAME',
  'AZURE_OPENAI_DEPLOYMENT',
  'AZURE_OPENAI_API_VERSION',
];

/** @type {string[]} */
const rootsToClean = [];

const LIVE_E2E_ENABLED = /^(1|true|yes)$/i.test(String(process.env.AGENT_CLI_ENABLE_LIVE_E2E ?? '').trim());
const FALLBACK_LIVE_MODELS = {
  openai: 'gpt-5-mini',
  google: 'gemini-2.5-flash',
  anthropic: 'claude-sonnet-4-20250514',
  xai: 'grok-3-mini',
};

const originalRuntimeEnvironment = captureRuntimeEnvironment();
const liveRuntimeConfig = resolveLiveRuntimeConfig(originalRuntimeEnvironment);
const liveIt = LIVE_E2E_ENABLED ? it : it.skip;

function captureRuntimeEnvironment() {
  return Object.fromEntries(RUNTIME_ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]));
}

/** @param {NodeJS.ProcessEnv | Record<string, string | undefined>} environment */
function readEnvironmentValue(environment, key) {
  return String(environment[key] ?? '').trim();
}

/**
 * @param {string} provider
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} environment
 * @param {string} [model]
 */
function createRuntimeConfiguration(provider, environment, model = '') {
  const candidateEnvironment = {
    ...environment,
    LLM_PROVIDER: provider,
  };

  if (String(model).trim()) {
    candidateEnvironment.LLM_MODEL = String(model).trim();
  } else {
    delete candidateEnvironment.LLM_MODEL;
  }

  let runtimeSettings;

  try {
    runtimeSettings = validateRuntimeEnvironment(candidateEnvironment);
  } catch {
    return null;
  }

  return {
    enabled: true,
    runtimeEnv: {
      LLM_PROVIDER: runtimeSettings.provider,
      LLM_MODEL: runtimeSettings.model,
    },
  };
}

/** @param {NodeJS.ProcessEnv | Record<string, string | undefined>} environment */
function resolveLiveRuntimeConfig(environment) {
  if (!LIVE_E2E_ENABLED) {
    return {
      enabled: false,
      runtimeEnv: {},
    };
  }

  const rawConfiguredProvider = readEnvironmentValue(environment, 'LLM_PROVIDER');
  const configuredProvider = rawConfiguredProvider.toLowerCase();
  const configuredModel = readEnvironmentValue(environment, 'LLM_MODEL');

  if (configuredProvider) {
    const explicitConfiguration = createRuntimeConfiguration(configuredProvider, environment, configuredModel);

    if (explicitConfiguration) {
      return explicitConfiguration;
    }
  }

  const fallbackConfigurations = [
    createRuntimeConfiguration('openai', environment, FALLBACK_LIVE_MODELS.openai),
    createRuntimeConfiguration('google', environment, FALLBACK_LIVE_MODELS.google),
    createRuntimeConfiguration('anthropic', environment, FALLBACK_LIVE_MODELS.anthropic),
    createRuntimeConfiguration('xai', environment, FALLBACK_LIVE_MODELS.xai),
    createRuntimeConfiguration('azure', environment, configuredModel),
    createRuntimeConfiguration('openai-compatible', environment, configuredModel),
    createRuntimeConfiguration('ollama', environment, configuredModel),
  ].filter(Boolean);

  if (fallbackConfigurations.length > 0) {
    return fallbackConfigurations[0];
  }

  return {
    enabled: false,
    runtimeEnv: {},
  };
}

/** @param {Record<string, string | undefined>} snapshot */
function restoreRuntimeEnvironment(snapshot) {
  for (const key of RUNTIME_ENVIRONMENT_KEYS) {
    const value = snapshot[key];

    if (typeof value === 'undefined') {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

function applyLiveRuntimeEnvironment() {
  restoreRuntimeEnvironment(originalRuntimeEnvironment);

  for (const [key, value] of Object.entries(liveRuntimeConfig.runtimeEnv)) {
    process.env[key] = value;
  }
}

function applyMinimalRuntimeEnvironment() {
  process.env.LLM_PROVIDER = 'openai';
  process.env.LLM_MODEL = 'gpt-5';
  process.env.OPENAI_API_KEY = 'test-openai-key';
}

/** @param {string} rootPath */
async function loadCli(rootPath) {
  process.env.AGENT_CLI_ROOT = rootPath;
  vi.resetModules();
  return await import('../../bin/agent-cli.js');
}

afterEach(async () => {
  delete process.env.AGENT_CLI_ROOT;
  restoreRuntimeEnvironment(originalRuntimeEnvironment);

  while (rootsToClean.length > 0) {
    const rootPath = rootsToClean.pop();

    if (!rootPath) {
      break;
    }

    await removeTestRoot(rootPath);
  }
});

describe('agent-cli CLI', () => {
  liveIt('creates a new current chat from a live LLM turn without persisting the system prompt', async () => {
    applyLiveRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(
      rootPath,
      'You are a terse test assistant. Reply in a single plain sentence without markdown.',
    );
    await mkdir(path.join(rootPath, 'agent', 'skills'), { recursive: true });

    const { main } = await loadCli(rootPath);
    const io = createIoCapture();
    const userMessage = 'Acknowledge that the live e2e test reached the language model.';

    await main(['--new-chat', userMessage], io);

    const assistantText = io.getStdout().trim();

    expect(assistantText.length).toBeGreaterThan(0);

    const current = await readJson(path.join(rootPath, 'agent', 'sessions', 'current.json'));
    const chatFilePath = path.join(rootPath, 'agent', 'sessions', 'chats', `${current.chatId}.json`);
    const chat = await readJson(chatFilePath);
    const rawChatFile = await readFile(chatFilePath, 'utf8');

    expect(chat.messages[0]).toMatchObject({ role: 'user', content: userMessage });
    expect(chat.messages.at(-1)).toMatchObject({ role: 'assistant', content: assistantText });
    expect(rawChatFile).not.toContain('You are a terse test assistant.');
  });

  liveIt('reuses the current chat on follow-up live LLM turns', async () => {
    applyLiveRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'You are a terse test assistant. Keep responses under 20 words.');
    await mkdir(path.join(rootPath, 'agent', 'skills'), { recursive: true });

    const { main } = await loadCli(rootPath);

    await main(['--new-chat', 'Say hello briefly.'], createIoCapture());
    const firstCurrent = await readJson(path.join(rootPath, 'agent', 'sessions', 'current.json'));

    const secondIo = createIoCapture();
    await main(['Now say goodbye briefly.'], secondIo);

    const secondCurrent = await readJson(path.join(rootPath, 'agent', 'sessions', 'current.json'));
    const chat = await readJson(path.join(rootPath, 'agent', 'sessions', 'chats', `${secondCurrent.chatId}.json`));
    const userMessages = chat.messages.filter((message) => message.role === 'user').map((message) => message.content);

    expect(secondCurrent.chatId).toBe(firstCurrent.chatId);
    expect(userMessages).toEqual(['Say hello briefly.', 'Now say goodbye briefly.']);
    expect(String(secondIo.getStdout()).trim().length).toBeGreaterThan(0);
    expect(chat.messages.at(-1)?.role).toBe('assistant');
  });

  liveIt('starts a new chat when the current chat is missing', async () => {
    applyLiveRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'You are a terse test assistant. Reply in one short sentence.');
    await mkdir(path.join(rootPath, 'agent', 'skills'), { recursive: true });

    const { main } = await loadCli(rootPath);
    const io = createIoCapture();

    await main(['follow up'], io);

    const current = await readJson(path.join(rootPath, 'agent', 'sessions', 'current.json'));
    const chat = await readJson(path.join(rootPath, 'agent', 'sessions', 'chats', `${current.chatId}.json`));

    expect(String(io.getStdout()).trim().length).toBeGreaterThan(0);
    expect(chat.messages[0]).toMatchObject({ role: 'user', content: 'follow up' });
    expect(chat.messages.at(-1)?.role).toBe('assistant');
  });

  it('reports missing messages through the CLI error path', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { runCli } = await loadCli(rootPath);
    const io = createIoCapture();
    const originalExitCode = process.exitCode;

    process.exitCode = undefined;
    await runCli([], io);

    expect(io.getStdout()).toBe('');
    expect(io.getStderr()).toContain('Missing user message.');
    expect(io.getStderr()).toContain('Usage: agent-cli [--new-chat] [--verbose] <message>');
    expect(process.exitCode).toBe(1);

    process.exitCode = originalExitCode;
  });

  it('reports missing runtime environment variables before attempting the turn', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    await mkdir(path.join(rootPath, 'agent', 'skills'), { recursive: true });

    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.LLM_PROVIDER = 'openai';
    delete process.env.LLM_MODEL;

    const { runCli } = await loadCli(rootPath);
    const io = createIoCapture();
    const originalExitCode = process.exitCode;

    process.exitCode = undefined;
    await runCli(['hello'], io);

    expect(io.getStdout()).toBe('');
    expect(io.getStderr()).toContain('Missing environment variable: OPENAI_API_KEY');
    expect(process.exitCode).toBe(1);

    process.exitCode = originalExitCode;

    if (typeof originalApiKey === 'undefined') {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  it('logs startup diagnostics only in verbose mode', async () => {
    applyMinimalRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await mkdir(path.join(rootPath, 'agent', 'skills'), { recursive: true });

    const { runCli } = await loadCli(rootPath);
    const io = createIoCapture();
    const originalExitCode = process.exitCode;

    process.exitCode = undefined;
    await runCli(['--verbose', 'hello'], io);

    expect(io.getStdout()).toBe('');
    expect(io.getStderr()).toContain(`Agent CLI starting in ${process.cwd()}`);
    expect(io.getStderr()).toContain('provider=openai model=gpt-5');
    expect(io.getStderr()).toContain('Missing system prompt');
    expect(process.exitCode).toBe(1);

    process.exitCode = originalExitCode;
  });

  it('fails clearly when the system prompt is missing', async () => {
    applyMinimalRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await mkdir(path.join(rootPath, 'agent', 'skills'), { recursive: true });

    const { main } = await loadCli(rootPath);

    await expect(main(['--new-chat', 'hello'], createIoCapture())).rejects.toThrow('Missing system prompt');
  });

  it('fails clearly when the skills root is missing', async () => {
    applyMinimalRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    await mkdir(path.join(rootPath, 'agent'), { recursive: true });
    await writeFile(path.join(rootPath, 'agent', 'system.md'), 'Prompt\n', 'utf8');

    const { main } = await loadCli(rootPath);

    await expect(main(['--new-chat', 'hello'], createIoCapture())).rejects.toThrow('Missing skills root');
  });

  it('does not write partial session files when the runtime setup fails', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    await mkdir(path.join(rootPath, 'agent', 'skills'), { recursive: true });

    process.env.LLM_PROVIDER = 'unsupported-provider';
    delete process.env.LLM_MODEL;

    const { main } = await loadCli(rootPath);

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

    const { runCli } = await loadCli(rootPath);
    const io = createIoCapture();

    await runCli(['--help'], io);

    expect(io.getStdout()).toContain('Usage: agent-cli [--new-chat] [--verbose] <message>');
    expect(io.getStderr()).toBe('');
  });
});