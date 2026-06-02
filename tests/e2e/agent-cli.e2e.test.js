// @ts-check
/**
 * Agent CLI End-to-End Tests
 *
 * Purpose:
 * - Exercise the CLI entrypoint against isolated on-disk fixtures and the real `llm-runtime` provider path.
 *
 * Key features:
 * - Always calls a live LLM-backed provider for each end-to-end scenario.
 * - Verifies persisted session files rather than only internal helper behavior.
 *
 * Recent changes:
 * - 2026-05-29: Restricted live e2e provider selection to Gemini.
 * - 2026-05-26: Moved live runtime fixture setup from world.json to environment defaults.
 * - 2026-05-07: Switched e2e coverage from a mocked runtime to live LLM-backed turns.
 * - 2026-05-07: Made `test:e2e` require a usable live provider and moved deterministic CLI checks to unit tests.
 */
import 'dotenv/config';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  createIoCapture,
  createTestRoot,
  ensureSkillsRoot,
  readJson,
  removeTestRoot,
  writeSkill,
  writeSystemPrompt,
} from '../helpers/test-root.js';
import { validateRuntimeEnvironment } from '../../core/agent-runtime.js';

const RUNTIME_ENVIRONMENT_KEYS = [
  'GOOGLE_API_KEY',
  'AGENT_CLI_PROVIDER',
  'AGENT_CLI_MODEL',
];

/** @type {string[]} */
const rootsToClean = [];

const GEMINI_LIVE_MODEL = 'gemini-2.5-flash';
const LIVE_E2E_TIMEOUT_MS = 30000;
const originalCwd = process.cwd();

const originalRuntimeEnvironment = captureRuntimeEnvironment();
const liveRuntimeConfig = resolveRequiredLiveRuntimeConfig(originalRuntimeEnvironment);

/**
 * @typedef {{
 *   main: (argv?: string[], io?: import('../../cli/src/turn-executor.js').CliIo, options?: any) => Promise<any>,
 * }} AgentCliModule
 */

function captureRuntimeEnvironment() {
  return Object.fromEntries(RUNTIME_ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]));
}

/**
 * @param {string} provider
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} environment
 * @param {string} [model]
 */
function createRuntimeConfiguration(provider, environment, model = '') {
  let runtimeSettings;

  try {
    runtimeSettings = validateRuntimeEnvironment(environment, {
      provider,
      ...(String(model).trim() ? { model: String(model).trim() } : {}),
    });
  } catch {
    return null;
  }

  return {
    enabled: true,
    runtimeConfig: {
      provider: runtimeSettings.provider,
      model: runtimeSettings.model,
    },
  };
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} environment
 * @returns {{ enabled: boolean, runtimeConfig: Record<string, string> }}
 */
function resolveRequiredLiveRuntimeConfig(environment) {
  const geminiConfiguration = createRuntimeConfiguration('google', environment, GEMINI_LIVE_MODEL);

  if (geminiConfiguration) {
    return geminiConfiguration;
  }

  throw new Error(
    'test:e2e requires Gemini live provider configuration. Set GOOGLE_API_KEY.',
  );
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
}

function applyLiveRuntimeConfig() {
  process.env.AGENT_CLI_PROVIDER = liveRuntimeConfig.runtimeConfig.provider;
  process.env.AGENT_CLI_MODEL = liveRuntimeConfig.runtimeConfig.model;
}

/** @param {string} filePath */
async function readJsonl(filePath) {
  const content = await readFile(filePath, 'utf8');
  return content.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

/**
 * @param {string} stdout
 */
function extractAssistantTextFromCliStdout(stdout) {
  const output = String(stdout ?? '').trim();

  if (!output) {
    return '';
  }

  const lines = output.split(/\r?\n/);
  let currentEvent = '';
  let finalText = '';

  for (const line of lines) {
    if (line.startsWith('event:')) {
      currentEvent = line.slice('event:'.length).trim();
      continue;
    }

    if (!line.startsWith('data:')) {
      continue;
    }

    if (currentEvent !== 'final') {
      continue;
    }

    const dataPayload = line.slice('data:'.length).trim();

    try {
      const parsedPayload = JSON.parse(dataPayload);

      if (parsedPayload && typeof parsedPayload.text === 'string') {
        finalText = parsedPayload.text;
      }
    } catch {
      // Ignore malformed frames and fall back to plain output handling below.
    }
  }

  if (finalText.trim()) {
    return finalText.trim();
  }

  const cleanedHumanReadableStream = output
    .split(/\r?\n/)
    .filter((line) => !/^(warning|reasoning|tool):\s/.test(line))
    .join('\n')
    .trim();

  return cleanedHumanReadableStream || output;
}

/**
 * @param {string} rootPath
 * @returns {Promise<AgentCliModule>}
 */
async function loadCli(rootPath) {
  process.chdir(rootPath);
  vi.resetModules();
  return /** @type {AgentCliModule} */ (await import('../../bin/agent-cli.js'));
}

afterEach(async () => {
  process.chdir(originalCwd);
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
  it('creates a new current chat from a live LLM turn without persisting the system prompt', async () => {
    applyLiveRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    await writeSystemPrompt(
      rootPath,
      'You are a terse test assistant. Reply in a single plain sentence without markdown.',
    );
    await ensureSkillsRoot(rootPath);
    applyLiveRuntimeConfig();

    const { main } = await loadCli(rootPath);
    const io = /** @type {import('../../cli/src/turn-executor.js').CliIo} */ (createIoCapture());
    const userMessage = 'Acknowledge that the live e2e test reached the language model.';

    await main(['--new-chat', userMessage], io);

    const assistantText = extractAssistantTextFromCliStdout(io.getStdout());

    expect(assistantText.length).toBeGreaterThan(0);

    const current = await readJson(path.join(rootPath, '.agent-world', 'chats', 'current.json'));
    const chatFilePath = path.join(rootPath, '.agent-world', 'chats', current.chatId, 'messages.jsonl');
    const chatMessages = await readJsonl(chatFilePath);
    const rawChatFile = await readFile(chatFilePath, 'utf8');

    expect(chatMessages[0]).toMatchObject({ role: 'user', content: userMessage });
    expect(chatMessages.at(-1)).toMatchObject({ role: 'assistant', content: assistantText });
    expect(rawChatFile).not.toContain('You are a terse test assistant.');
  }, LIVE_E2E_TIMEOUT_MS);

  it('proves the live turn triggered a skill load', async () => {
    applyLiveRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const skillId = 'checkpoint-routing-proof';

    await writeSystemPrompt(
      rootPath,
      [
        'You are a terse test assistant.',
        'If the user asks about checkpoint routing, load the relevant skill before answering.',
        'Reply in one plain sentence without markdown.',
      ].join(' '),
    );
    await writeSkill(rootPath, 'checkpoint-routing', {
      name: skillId,
      description: 'Use this skill when the user asks about checkpoint routing decisions.',
      body: [
        '# Checkpoint Routing Proof',
        '',
        'Keep the answer to one short sentence.',
      ].join('\n'),
    });
    applyLiveRuntimeConfig();

    const { main } = await loadCli(rootPath);
    const io = /** @type {import('../../cli/src/turn-executor.js').CliIo} */ (createIoCapture());
    const userMessage = 'What is the next checkpoint routing decision I should make?';

    await main(['--new-chat', userMessage], io);

    expect(extractAssistantTextFromCliStdout(io.getStdout()).length).toBeGreaterThan(0);

    const current = await readJson(path.join(rootPath, '.agent-world', 'chats', 'current.json'));
    const chatMessages = await readJsonl(path.join(rootPath, '.agent-world', 'chats', current.chatId, 'messages.jsonl'));
    const loadSkillMessage = chatMessages.find(
      /** @param {{ role?: string, tool_calls?: Array<{ function?: { name?: string, arguments?: string } }> }} message */
      (message) => message.role === 'assistant'
        && Array.isArray(message.tool_calls)
        && message.tool_calls.some(
          /** @param {{ function?: { name?: string, arguments?: string } }} toolCall */
          (toolCall) => toolCall?.function?.name === 'load_skill'
            && String(toolCall?.function?.arguments ?? '').includes(skillId),
        ),
    );

    expect(loadSkillMessage).toBeTruthy();
  }, LIVE_E2E_TIMEOUT_MS);

  it('reuses the current chat on follow-up live LLM turns', async () => {
    applyLiveRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'You are a terse test assistant. Keep responses under 20 words.');
    await ensureSkillsRoot(rootPath);
    applyLiveRuntimeConfig();

    const { main } = await loadCli(rootPath);

    await main(
      ['--new-chat', 'Say hello briefly.'],
      /** @type {import('../../cli/src/turn-executor.js').CliIo} */(createIoCapture()),
    );
    const firstCurrent = await readJson(path.join(rootPath, '.agent-world', 'chats', 'current.json'));

    const secondIo = /** @type {import('../../cli/src/turn-executor.js').CliIo} */ (createIoCapture());
    await main(['Now say goodbye briefly.'], secondIo);

    const secondCurrent = await readJson(path.join(rootPath, '.agent-world', 'chats', 'current.json'));
    const chatMessages = await readJsonl(path.join(rootPath, '.agent-world', 'chats', secondCurrent.chatId, 'messages.jsonl'));
    const secondAssistantText = extractAssistantTextFromCliStdout(secondIo.getStdout());
    const userMessages = chatMessages
      .filter(
        /** @param {{ role?: string }} message */
        (message) => message.role === 'user',
      )
      .map(
        /** @param {{ content?: string }} message */
        (message) => message.content,
      );

    expect(secondCurrent.chatId).toBe(firstCurrent.chatId);
    expect(userMessages).toEqual(['Say hello briefly.', 'Now say goodbye briefly.']);
    expect(secondAssistantText.length).toBeGreaterThan(0);
    expect(chatMessages.at(-1)?.role).toBe('assistant');
  }, LIVE_E2E_TIMEOUT_MS);

  it('starts a new chat when the current chat is missing', async () => {
    applyLiveRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'You are a terse test assistant. Reply in one short sentence.');
    await ensureSkillsRoot(rootPath);
    applyLiveRuntimeConfig();

    const { main } = await loadCli(rootPath);
    const io = /** @type {import('../../cli/src/turn-executor.js').CliIo} */ (createIoCapture());

    await main(['Say that a new chat was started.'], io);

    const current = await readJson(path.join(rootPath, '.agent-world', 'chats', 'current.json'));
    const chatMessages = await readJsonl(path.join(rootPath, '.agent-world', 'chats', current.chatId, 'messages.jsonl'));
    const assistantText = extractAssistantTextFromCliStdout(io.getStdout());

    expect(assistantText.length).toBeGreaterThan(0);
    expect(chatMessages[0]).toMatchObject({ role: 'user', content: 'Say that a new chat was started.' });
    expect(chatMessages.at(-1)?.role).toBe('assistant');
  }, LIVE_E2E_TIMEOUT_MS);

});
