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
 */
import 'dotenv/config';

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadSkillInventory, loadSystemPrompt } from '../lib/agent-files.js';
import { loadRequestedChat, persistCompletedChat } from '../lib/session-store.js';
import { runChatTurn } from '../lib/runtime-client.js';

export function usageText() {
  return [
    'Usage: agent-cli [--new-chat] <message>',
    '',
    'Examples:',
    '  agent-cli --new-chat "Map my next financial move"',
    '  agent-cli "What should I do first?"',
  ].join('\n');
}

/**
 * @param {string[]} argv
 */
export function parseArguments(argv) {
  let newChat = false;
  let help = false;
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

    if (arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg}`);
    }

    messageParts.push(arg);
  }

  return {
    help,
    newChat,
    message: messageParts.join(' ').trim(),
  };
}

/**
 * @param {string[]} [argv]
 * @param {{ stdout: { write(chunk: string): void } }} [io]
 */
export async function main(argv = process.argv.slice(2), io = { stdout: process.stdout }) {
  const { help, newChat, message } = parseArguments(argv);

  if (help) {
    io.stdout.write(`${usageText()}\n`);
    return null;
  }

  if (!message) {
    throw new Error(`Missing user message.\n\n${usageText()}`);
  }

  const [systemPrompt, skillInventory, chat] = await Promise.all([
    loadSystemPrompt(),
    loadSkillInventory(),
    loadRequestedChat({ newChat }),
  ]);

  const turnResult = await runChatTurn({
    chat,
    userMessage: message,
    systemPrompt,
    skillInventory,
  });

  await persistCompletedChat({
    chat,
    messages: turnResult.messages,
  });

  io.stdout.write(`${turnResult.assistantText}\n`);
  return turnResult;
}

/**
 * @param {string[]} [argv]
 * @param {{ stdout: { write(chunk: string): void }, stderr: { write(chunk: string): void } }} [io]
 */
export async function runCli(argv = process.argv.slice(2), io = { stdout: process.stdout, stderr: process.stderr }) {
  try {
    await main(argv, io);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`${message.trim()}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;

if (invokedPath && import.meta.url === invokedPath) {
  await runCli();
}