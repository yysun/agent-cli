// @ts-check
/**
 * Agent World CLI Interactive Flow Matrix Live E2E Tests
 *
 * Purpose:
 * - Mirror the Electron chat-flow matrix at the CLI boundary with a spawned interactive process.
 *
 * Key features:
 * - Calls a real LLM provider through the built `agent-world-cli` binary.
 * - Drives the interactive shell through stdin and observes stdout/stderr state transitions.
 * - Covers loaded-current, switched, and new-chat send/edit/delete/HITL flows without queue cases.
 *
 * Recent changes:
 * - 2026-05-23: Added live interactive CLI flow-matrix coverage derived from the Electron E2E suite.
 */
import 'dotenv/config';

import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateRuntimeEnvironment } from '../../core/agent-runtime.js';
import { createTestRoot, removeTestRoot, writeSystemPrompt } from '../helpers/test-root.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const agentWorldCliBin = path.join(repoRoot, 'bin', 'agent-world-cli.js');
const OUTPUT_TIMEOUT_MS = 60000;
const CLOSE_TIMEOUT_MS = 1500;
const LIVE_FLOW_TIMEOUT_MS = 180000;
const PRESENTATION_CLARIFY_QUESTION = 'Which audience, length, and format should this presentation use?';
const RUNTIME_ENVIRONMENT_KEYS = [
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
  'AZURE_OPENAI_API_VERSION',
];
const FALLBACK_LIVE_MODELS = {
  openai: 'gpt-5-mini',
  google: 'gemini-2.5-flash',
  anthropic: 'claude-sonnet-4-20250514',
  xai: 'grok-3-mini',
};

/**
 * @typedef {import('node:child_process').ChildProcessWithoutNullStreams & import('node:events').EventEmitter} EventedInteractiveCliProcess
 */

/**
 * @typedef {{
 *   childProcess: EventedInteractiveCliProcess,
 *   stdout: string,
 *   stderr: string,
 * }} InteractiveCliSession
 */

/** @type {InteractiveCliSession[]} */
const activeSessions = [];
/** @type {string[]} */
const rootsToClean = [];
const originalRuntimeEnvironment = captureRuntimeEnvironment();
const liveRuntimeConfig = resolveRequiredLiveRuntimeConfig(originalRuntimeEnvironment);

afterEach(async () => {
  while (activeSessions.length > 0) {
    await stopInteractiveCli(activeSessions.pop());
  }

  while (rootsToClean.length > 0) {
    const rootPath = rootsToClean.pop();
    if (rootPath) {
      await removeTestRoot(rootPath);
    }
  }
});

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
    runtimeConfig: {
      provider: runtimeSettings.provider,
      model: runtimeSettings.model,
    },
  };
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} environment
 */
function resolveRequiredLiveRuntimeConfig(environment) {
  const rawFallbackConfigurations = [
    createRuntimeConfiguration('openai', environment, FALLBACK_LIVE_MODELS.openai),
    createRuntimeConfiguration('google', environment, FALLBACK_LIVE_MODELS.google),
    createRuntimeConfiguration('anthropic', environment, FALLBACK_LIVE_MODELS.anthropic),
    createRuntimeConfiguration('xai', environment, FALLBACK_LIVE_MODELS.xai),
    createRuntimeConfiguration('azure', environment),
    createRuntimeConfiguration('openai-compatible', environment),
    createRuntimeConfiguration('ollama', environment),
  ];

  for (const fallbackConfiguration of rawFallbackConfigurations) {
    if (fallbackConfiguration) {
      return fallbackConfiguration;
    }
  }

  throw new Error(
    'agent-world-cli flow-matrix e2e requires a usable live LLM provider configuration.',
  );
}

/** @param {string} rootPath */
async function writeLiveRuntimeConfig(rootPath) {
  await writeFile(path.join(rootPath, 'runtime.json'), `${JSON.stringify({
    schemaVersion: 1,
    ...liveRuntimeConfig.runtimeConfig,
  }, null, 2)}\n`, 'utf8');
}

/** @param {string} rootPath */
async function writeFlowSystemPrompt(rootPath) {
  await writeSystemPrompt(rootPath, [
    'You are running an Agent World CLI live flow matrix.',
    'Follow these rules exactly.',
    'If the user message contains "success token TOKEN", reply exactly "FLOW_OK:TOKEN".',
    'If the user message starts with "HITL_FLOW:TOKEN", call ask_user_input exactly once with requestId "hitl-TOKEN", type "single-select", allowSkip false, and one question asking "Approve TOKEN?" with options [{ "id": "approve", "label": "Approve" }, { "id": "reject", "label": "Reject" }]. After the tool result, reply exactly "HITL_DONE:TOKEN".',
    `If the user message starts with "PRESENTATION_CLARIFY:", reply exactly "${PRESENTATION_CLARIFY_QUESTION}" and do not call tools.`,
    'Do not call tools for any other message.',
  ].join(' '));
}

/**
 * @param {string} rootPath
 * @returns {Promise<InteractiveCliSession>}
 */
async function startInteractiveCli(rootPath) {
  const childProcess = /** @type {EventedInteractiveCliProcess} */ (spawn(process.execPath, [agentWorldCliBin], {
    cwd: rootPath,
    env: {
      ...process.env,
      ...originalRuntimeEnvironment,
      AGENT_CLI_WORKSPACE: '',
      AGENT_CLI_ROOT: '',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  }));

  const session = {
    childProcess,
    stdout: '',
    stderr: '',
  };

  childProcess.stdout.setEncoding('utf8');
  childProcess.stderr.setEncoding('utf8');
  childProcess.stdout.on('data', (chunk) => {
    session.stdout += String(chunk);
  });
  childProcess.stderr.on('data', (chunk) => {
    session.stderr += String(chunk);
  });
  activeSessions.push(session);

  await waitForStdout(session, /agent-world-cli interactive/);
  await waitForStdout(session, /agent-world> /);
  await sendLineAndWaitForStdout(
    session,
    `/agents create default --name Default --provider ${liveRuntimeConfig.runtimeConfig.provider} --model ${liveRuntimeConfig.runtimeConfig.model} --default`,
    new RegExp(`"provider": "${liveRuntimeConfig.runtimeConfig.provider}"`),
  );
  return session;
}

/**
 * @param {InteractiveCliSession | undefined} session
 */
async function stopInteractiveCli(session) {
  if (!session) {
    return;
  }

  const index = activeSessions.indexOf(session);
  if (index >= 0) {
    activeSessions.splice(index, 1);
  }

  if (session.childProcess.exitCode !== null || session.childProcess.signalCode !== null) {
    return;
  }

  session.childProcess.stdin.end('/exit\n');
  const stopped = await Promise.race([
    once(session.childProcess, 'exit').then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), CLOSE_TIMEOUT_MS)),
  ]);

  if (stopped || session.childProcess.exitCode !== null || session.childProcess.signalCode !== null) {
    return;
  }

  session.childProcess.kill('SIGKILL');
  await once(session.childProcess, 'exit');
}

/**
 * @param {InteractiveCliSession} session
 * @param {RegExp} pattern
 * @param {number} [fromIndex]
 */
async function waitForStdout(session, pattern, fromIndex = 0) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < OUTPUT_TIMEOUT_MS) {
    const output = session.stdout.slice(fromIndex);
    if (pattern.test(output)) {
      return session.stdout.length;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for stdout pattern ${pattern}.\nstdout:\n${session.stdout}\nstderr:\n${session.stderr}`);
}

/**
 * @param {InteractiveCliSession} session
 * @param {RegExp} pattern
 * @param {number} [fromIndex]
 */
async function waitForStderr(session, pattern, fromIndex = 0) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < OUTPUT_TIMEOUT_MS) {
    const output = session.stderr.slice(fromIndex);
    if (pattern.test(output)) {
      return session.stderr.length;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for stderr pattern ${pattern}.\nstdout:\n${session.stdout}\nstderr:\n${session.stderr}`);
}

/**
 * @param {InteractiveCliSession} session
 * @param {RegExp[]} patterns
 * @param {number} [fromIndex]
 */
async function waitForStdoutAny(session, patterns, fromIndex = 0) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < OUTPUT_TIMEOUT_MS) {
    const output = session.stdout.slice(fromIndex);
    const pattern = patterns.find((candidate) => candidate.test(output));
    if (pattern) {
      return pattern;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for stdout patterns ${patterns.join(', ')}.\nstdout:\n${session.stdout}\nstderr:\n${session.stderr}`);
}

/**
 * @param {InteractiveCliSession} session
 * @param {string} line
 * @param {RegExp} pattern
 */
async function sendLineAndWaitForStdout(session, line, pattern) {
  const cursor = session.stdout.length;
  session.childProcess.stdin.write(`${line}\n`);
  return await waitForStdout(session, pattern, cursor);
}

/**
 * @param {InteractiveCliSession} session
 * @param {string} line
 * @param {RegExp} [pattern]
 */
async function sendLineAndWaitForCompletion(session, line, pattern = /"assistantText":/) {
  const targetPattern = pattern;
  let cursor = session.stdout.length;
  session.childProcess.stdin.write(`${line}\n`);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const matchedPattern = await waitForStdoutAny(session, [
      targetPattern,
      /Enter 0 to exit UI:/,
    ], cursor);

    if (matchedPattern === targetPattern) {
      return session.stdout.length;
    }

    cursor = session.stdout.length;
    session.childProcess.stdin.write('Please continue and answer the original request.\n');
  }

  return await waitForStdout(session, targetPattern, cursor);
}

/**
 * @param {InteractiveCliSession} session
 * @param {string} line
 * @param {RegExp} pattern
 */
async function sendLineAndWaitForStderr(session, line, pattern) {
  const cursor = session.stderr.length;
  session.childProcess.stdin.write(`${line}\n`);
  return await waitForStderr(session, pattern, cursor);
}

/**
 * @param {InteractiveCliSession} session
 * @param {string} token
 */
async function sendHitlAndApprove(session, token) {
  const cursor = session.stdout.length;
  session.childProcess.stdin.write(`/send HITL_FLOW:${token}. You must call ask_user_input before answering. Ask "Approve ${token}?" with Approve and Reject options.\n`);
  await waitForStdout(session, new RegExp(`Approve ${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?`), cursor);
  return await sendLineAndWaitForStdout(session, '1', /"assistantText":/);
}

/**
 * @param {InteractiveCliSession} session
 * @param {string} chatId
 * @param {string} messageId
 * @param {string} token
 */
async function editHitlAndApprove(session, chatId, messageId, token) {
  const cursor = session.stdout.length;
  session.childProcess.stdin.write(`/edit ${chatId} ${messageId} HITL_FLOW:${token}. You must call ask_user_input before answering. Ask "Approve ${token}?" with Approve and Reject options.\n`);
  await waitForStdout(session, new RegExp(`Approve ${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?`), cursor);
  return await sendLineAndWaitForStdout(session, '1', /"assistantText":/);
}

async function createHarness() {
  const rootPath = await createTestRoot();
  rootsToClean.push(rootPath);
  await writeLiveRuntimeConfig(rootPath);
  await writeFlowSystemPrompt(rootPath);
  const session = await startInteractiveCli(rootPath);
  return { rootPath, session };
}

/** @param {string} filePath */
async function readJsonl(filePath) {
  const content = await readFile(filePath, 'utf8');
  return content.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

/**
 * @param {string} rootPath
 * @param {string} chatId
 */
async function readDefaultMemory(rootPath, chatId) {
  const rows = await readJsonl(path.join(rootPath, '.agent-world', 'agents', 'default', 'memory.jsonl'));
  return rows.filter((row) => String(row.chatId ?? '') === chatId);
}

/**
 * @param {string} rootPath
 * @param {string} chatId
 */
async function latestUserMessageId(rootPath, chatId) {
  const messages = await readDefaultMemory(rootPath, chatId);
  const message = messages.filter((row) => row.role === 'user').at(-1);
  const messageId = String(message?.messageId ?? '').trim();
  if (!messageId) {
    throw new Error(`No user message ID found for chat ${chatId}.`);
  }
  return messageId;
}

/**
 * @param {InteractiveCliSession} session
 * @param {string} label
 */
async function createChat(session, label) {
  await sendLineAndWaitForStdout(session, '/new', /"chatId": "[^"]+"/);
  const match = session.stdout.match(/"chatId": "([^"]+)"/gu)?.at(-1)?.match(/"chatId": "([^"]+)"/u);
  const chatId = match?.[1] ?? '';
  if (!chatId) {
    throw new Error(`Unable to create ${label} chat.`);
  }
  return chatId;
}

describe('agent-world-cli live interactive flow matrix without queue flows', () => {
  it('loaded current chat covers send success/error/HITL, edit success/error/HITL, and delete chain', async () => {
    const { rootPath, session } = await createHarness();
    const chatId = await createChat(session, 'loaded current');

    await sendLineAndWaitForCompletion(session, '/send Reply with any non-empty plain text. Do not call tools. Current chat success token current-send-success');
    await sendLineAndWaitForStderr(session, '/send please ask @missing about current-send-error', /(Unknown @mention\(s\): @missing|Inline @mentions do not route messages)/);
    await sendHitlAndApprove(session, 'current-send-hitl');

    let messageId = await latestUserMessageId(rootPath, chatId);
    await sendLineAndWaitForCompletion(session, `/edit ${chatId} ${messageId} Reply with any non-empty plain text. Do not call tools. Edited current chat success token current-edit-success`, /"edited": true/);

    messageId = await latestUserMessageId(rootPath, chatId);
    await sendLineAndWaitForStderr(session, `/edit ${chatId} ${messageId} please ask @missing about current-edit-error`, /(Unknown @mention\(s\): @missing|Inline @mentions do not route messages)/);
    await sendLineAndWaitForCompletion(session, '/send Reply with any non-empty plain text. Do not call tools. Current chat success token current-edit-hitl-setup');
    messageId = await latestUserMessageId(rootPath, chatId);
    await editHitlAndApprove(session, chatId, messageId, 'current-edit-hitl');

    messageId = await latestUserMessageId(rootPath, chatId);
    await sendLineAndWaitForStdout(session, `/delete ${chatId} ${messageId}`, /"deleted": true/);

    const messages = await readDefaultMemory(rootPath, chatId);
    expect(messages.some((message) => String(message.content).includes('current-send-success'))).toBe(true);
    expect(messages.some((message) => String(message.content).includes('current-edit-hitl'))).toBe(false);
  }, LIVE_FLOW_TIMEOUT_MS);

  it('switched chat keeps send/edit/delete and HITL prompts scoped to the owning chat', async () => {
    const { rootPath, session } = await createHarness();
    const currentChatId = await createChat(session, 'current');
    await sendLineAndWaitForCompletion(session, '/send Reply with any non-empty plain text. Do not call tools. Current isolation success token current-isolation-marker');
    const switchedChatId = await createChat(session, 'switched');

    await sendLineAndWaitForCompletion(session, '/send Reply with any non-empty plain text. Do not call tools. Switched chat success token switched-send-success');
    await sendLineAndWaitForStderr(session, '/send please ask @missing about switched-send-error', /(Unknown @mention\(s\): @missing|Inline @mentions do not route messages)/);
    await sendHitlAndApprove(session, 'switched-send-hitl');

    let switchedMessageId = await latestUserMessageId(rootPath, switchedChatId);
    await sendLineAndWaitForCompletion(session, `/edit ${switchedChatId} ${switchedMessageId} Reply with any non-empty plain text. Do not call tools. Edited switched chat success token switched-edit-success`, /"edited": true/);
    switchedMessageId = await latestUserMessageId(rootPath, switchedChatId);
    await sendLineAndWaitForStdout(session, `/delete ${switchedChatId} ${switchedMessageId}`, /"deleted": true/);

    await sendLineAndWaitForStdout(session, `/use ${currentChatId}`, new RegExp(`"chatId": "${currentChatId}"`));
    const currentMessages = await readDefaultMemory(rootPath, currentChatId);
    const switchedMessages = await readDefaultMemory(rootPath, switchedChatId);
    expect(currentMessages.some((message) => String(message.content).includes('current-isolation-marker'))).toBe(true);
    expect(currentMessages.some((message) => String(message.content).includes('switched'))).toBe(false);
    expect(switchedMessages.some((message) => String(message.content).includes('switched-edit-success'))).toBe(false);

    await sendLineAndWaitForStdout(session, `/use ${switchedChatId}`, new RegExp(`"chatId": "${switchedChatId}"`));
    await sendHitlAndApprove(session, 'switched-return-hitl');
    const returnedMessages = await readDefaultMemory(rootPath, switchedChatId);
    expect(returnedMessages.some((message) => String(message.content).includes('switched-return-hitl'))).toBe(true);
  }, LIVE_FLOW_TIMEOUT_MS);

  it('new chat covers create/send/edit/delete/HITL and keeps presentation fallback to one assistant turn', async () => {
    const { rootPath, session } = await createHarness();
    const chatId = await createChat(session, 'new');

    await sendLineAndWaitForCompletion(session, '/send Reply with any non-empty plain text. Do not call tools. New chat success token new-send-success');
    await sendHitlAndApprove(session, 'new-send-hitl');

    let messageId = await latestUserMessageId(rootPath, chatId);
    await sendLineAndWaitForCompletion(session, `/edit ${chatId} ${messageId} Reply with any non-empty plain text. Do not call tools. Edited new chat success token new-edit-success`, /"edited": true/);
    messageId = await latestUserMessageId(rootPath, chatId);
    await sendLineAndWaitForStdout(session, `/delete ${chatId} ${messageId}`, /"deleted": true/);

    await sendLineAndWaitForCompletion(session, '/send PRESENTATION_CLARIFY: create a presentation for this project.');
    const messages = await readDefaultMemory(rootPath, chatId);
    const presentationUserIndex = messages.findIndex((message) => (
      message.role === 'user'
      && String(message.content).includes('PRESENTATION_CLARIFY')
    ));
    const presentationTail = messages.slice(presentationUserIndex + 1);
    const assistantClarifications = presentationTail.filter((message) => message.role === 'assistant');

    expect(presentationUserIndex).toBeGreaterThanOrEqual(0);
    expect(assistantClarifications).toHaveLength(1);
  }, LIVE_FLOW_TIMEOUT_MS);
});
