#!/usr/bin/env node
// @ts-check
/**
 * Agent CLI Entrypoint
 *
 * Purpose:
 * - Parse CLI flags and route a single user message through the persisted Agent CLI chat.
 *
 * Key features:
 * - Supports current-chat reuse and `--new-chat` creation.
 * - Loads prompt and skills from `./agent` using `llm-runtime` conventions.
 * - Persists completed turns under `./agent/sessions`.
 *
 * Recent changes:
 * - 2026-05-07: Added the initial `llm-runtime`-backed CLI implementation.
 * - 2026-05-07: Exported the CLI entry functions so Vitest can exercise them directly.
 * - 2026-05-07: Moved startup diagnostics behind `--verbose` so stdout stays machine-friendly.
 */
import 'dotenv/config';

import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadAgentConfig } from '../lib/agent-config.js';
import { loadSkillInventory, loadSystemPrompt } from '../lib/agent-files.js';
import { loadRequestedChat, persistCompletedChat } from '../lib/session-store.js';
import { runChatTurn, validateRuntimeEnvironment } from '../lib/runtime-client.js';

export function usageText() {
  return [
    'Usage: agent-cli [--new-chat] [--verbose] [--stream-off] <message>',
    '',
    'Examples:',
    '  agent-cli --new-chat "Map my next financial move"',
    '  agent-cli "What should I do first?"',
    '  agent-cli --verbose "What should I do first?"',
    '  agent-cli --stream-off "What should I do first?"',
  ].join('\n');
}

export function startupText(cwd = process.cwd()) {
  return `Agent CLI starting in ${cwd}`;
}

/**
 * @param {{ write(chunk: string): void }} stdout
 * @param {string} eventName
 * @param {unknown} payload
 */
function writeSseEvent(stdout, eventName, payload) {
  stdout.write(`event: ${eventName}\n`);
  stdout.write(`data: ${JSON.stringify(payload ?? null)}\n\n`);
}

/**
 * @param {{ provider: string, model: string }} runtimeSettings
 */
export function runtimeSelectionText(runtimeSettings) {
  return `provider=${runtimeSettings.provider} model=${runtimeSettings.model}`;
}

/**
 * @param {string | undefined} argvPath
 * @param {string} moduleUrl
 */
export function isCliEntrypoint(argvPath = process.argv[1], moduleUrl = import.meta.url) {
  if (!argvPath) {
    return false;
  }

  try {
    return realpathSync(argvPath) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return pathToFileURL(path.resolve(argvPath)).href === moduleUrl;
  }
}

/**
 * @param {string[]} argv
 */
export function parseArguments(argv) {
  let newChat = false;
  let streamOff = false;
  let help = false;
  let verbose = false;
  const messageParts = [];

  for (const arg of argv) {
    if (arg === '--new-chat') {
      newChat = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }

    if (arg === '--verbose' || arg === '-v') {
      verbose = true;
      continue;
    }

    if (arg === '--stream-off') {
      streamOff = true;
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg}`);
    }

    messageParts.push(arg);
  }

  return {
    help,
    newChat,
    streamOff,
    verbose,
    message: messageParts.join(' ').trim(),
  };
}

/**
 * @param {string[]} [argv]
 * @param {{ stdout: { write(chunk: string): void } }} [io]
 * @param {{ agentConfig?: Record<string, unknown> }} [options]
 */
export async function main(argv = process.argv.slice(2), io = { stdout: process.stdout }, options = {}) {
  const { help, newChat, streamOff, message } = parseArguments(argv);
  const agentConfig = options.agentConfig ?? await loadAgentConfig();

  if (help) {
    io.stdout.write(`${usageText()}\n`);
    return null;
  }

  if (!message) {
    throw new Error(`Missing user message.\n\n${usageText()}`);
  }

  validateRuntimeEnvironment(process.env, agentConfig);

  const [systemPrompt, skillInventory, chat] = await Promise.all([
    loadSystemPrompt(),
    loadSkillInventory(),
    loadRequestedChat({ newChat }),
  ]);

  const historyMessageLimit = Number.isInteger(agentConfig.pastMessages) && agentConfig.pastMessages >= 0
    ? agentConfig.pastMessages
    : 0;

  const turnResult = await runChatTurn({
    chat,
    userMessage: message,
    stream: !streamOff,
    onStreamChunk: streamOff
      ? undefined
      : (chunk) => {
        writeSseEvent(io.stdout, 'chunk', chunk);
      },
    historyMessageLimit,
    systemPrompt,
    skillInventory,
    agentConfig,
  });

  await persistCompletedChat({
    chat,
    messages: turnResult.messages,
  });

  if (streamOff) {
    io.stdout.write(`${turnResult.assistantText}\n`);
  } else {
    writeSseEvent(io.stdout, 'final', {
      text: turnResult.assistantText,
    });
    io.stdout.write('data: [DONE]\n\n');
  }

  return turnResult;
}

/**
 * @param {string[]} [argv]
 * @param {{ stdout: { write(chunk: string): void }, stderr: { write(chunk: string): void } }} [io]
 */
export async function runCli(argv = process.argv.slice(2), io = { stdout: process.stdout, stderr: process.stderr }) {
  try {
    const parsed = parseArguments(argv);
    const agentConfig = parsed.help ? {} : await loadAgentConfig();

    if (parsed.verbose && !parsed.help) {
      io.stderr.write(`${startupText()}\n`);

      if (parsed.message) {
        io.stderr.write(`${runtimeSelectionText(validateRuntimeEnvironment(process.env, agentConfig))}\n`);
      }
    }

    await main(argv, io, { agentConfig });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`${message.trim()}\n`);
    process.exitCode = 1;
  }
}

if (isCliEntrypoint()) {
  await runCli();
}