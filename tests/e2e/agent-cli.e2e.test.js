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
 * - 2026-05-07: Switched e2e coverage from a mocked runtime to live LLM-backed turns.
 * - 2026-05-07: Made `test:e2e` require a usable live provider and moved deterministic CLI checks to unit tests.
 */
import 'dotenv/config';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  createIoCapture,
  createTestRoot,
  readJson,
  removeTestRoot,
  writeSkill,
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

const FALLBACK_LIVE_MODELS = {
  openai: 'gpt-5-mini',
  google: 'gemini-2.5-flash',
  anthropic: 'claude-sonnet-4-20250514',
  xai: 'grok-3-mini',
};

const originalRuntimeEnvironment = captureRuntimeEnvironment();
const liveRuntimeConfig = resolveRequiredLiveRuntimeConfig(originalRuntimeEnvironment);

function captureRuntimeEnvironment() {
  return Object.fromEntries(RUNTIME_ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]));
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} environment
 * @param {string} key
 */
function readEnvironmentValue(environment, key) {
  return String(environment[key] ?? '').trim();
}

/**
 * @param {string} provider
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} environment
 * @param {string} [model]
 */
function createRuntimeConfiguration(provider, environment, model = '') {
  /** @type {Record<string, string | undefined>} */
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

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} environment
 * @returns {{ enabled: boolean, runtimeEnv: Record<string, string> }}
 */
function resolveRequiredLiveRuntimeConfig(environment) {
  const rawConfiguredProvider = readEnvironmentValue(environment, 'LLM_PROVIDER');
  const configuredProvider = rawConfiguredProvider.toLowerCase();
  const configuredModel = readEnvironmentValue(environment, 'LLM_MODEL');

  if (configuredProvider) {
    const explicitConfiguration = createRuntimeConfiguration(configuredProvider, environment, configuredModel);

    if (explicitConfiguration) {
      return explicitConfiguration;
    }
  }

  const rawFallbackConfigurations = [
    createRuntimeConfiguration('openai', environment, FALLBACK_LIVE_MODELS.openai),
    createRuntimeConfiguration('google', environment, FALLBACK_LIVE_MODELS.google),
    createRuntimeConfiguration('anthropic', environment, FALLBACK_LIVE_MODELS.anthropic),
    createRuntimeConfiguration('xai', environment, FALLBACK_LIVE_MODELS.xai),
    createRuntimeConfiguration('azure', environment, configuredModel),
    createRuntimeConfiguration('openai-compatible', environment, configuredModel),
    createRuntimeConfiguration('ollama', environment, configuredModel),
  ];

  for (const fallbackConfiguration of rawFallbackConfigurations) {
    if (fallbackConfiguration) {
      return fallbackConfiguration;
    }
  }

  throw new Error(
    'test:e2e requires a usable live LLM provider configuration. Set LLM_PROVIDER/LLM_MODEL with matching credentials, or configure any supported provider credentials for fallback selection.',
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

  for (const [key, value] of Object.entries(liveRuntimeConfig.runtimeEnv)) {
    process.env[key] = value;
  }
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
  it('creates a new current chat from a live LLM turn without persisting the system prompt', async () => {
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

  it('proves the live turn used the system prompt and triggered a skill load', async () => {
    applyLiveRuntimeEnvironment();

    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const systemProbeToken = 'SYSTEM_PROBE_C5D29B';
    const skillProbeToken = 'SKILL_PROBE_F1A7E3';
    const skillId = 'checkpoint-routing-proof';

    await writeSystemPrompt(
      rootPath,
      [
        'You are a terse test assistant.',
        `Always begin the final answer with ${systemProbeToken}.`,
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
        `When this skill is loaded, include the exact token ${skillProbeToken} once in the final answer.`,
        'Keep the answer to one short sentence.',
      ].join('\n'),
    });

    const { main } = await loadCli(rootPath);
    const io = createIoCapture();
    const userMessage = 'What is the next checkpoint routing decision I should make?';

    await main(['--new-chat', userMessage], io);

    const assistantText = io.getStdout().trim();

    expect(assistantText).toContain(systemProbeToken);
    expect(assistantText).toContain(skillProbeToken);

    const current = await readJson(path.join(rootPath, 'agent', 'sessions', 'current.json'));
    const chat = await readJson(path.join(rootPath, 'agent', 'sessions', 'chats', `${current.chatId}.json`));
    const loadSkillMessage = chat.messages.find(
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
  });

  it('reuses the current chat on follow-up live LLM turns', async () => {
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
    const userMessages = chat.messages
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
    expect(String(secondIo.getStdout()).trim().length).toBeGreaterThan(0);
    expect(chat.messages.at(-1)?.role).toBe('assistant');
  });

  it('starts a new chat when the current chat is missing', async () => {
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

});