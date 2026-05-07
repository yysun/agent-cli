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
 * - Loads prompt and skills from codex/copilot paths using `llm-runtime` conventions.
 * - Persists completed turns under `./.chats`.
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

import { normalizeAgentConfig } from '../lib/agent-config.js';
import { loadSkillInventory, loadSystemPrompt } from '../lib/agent-files.js';
import { loadRequestedChat, persistCompletedChat, persistStreamTraceEvents } from '../lib/session-store.js';
import { runChatTurn, validateRuntimeEnvironment } from '../lib/runtime-client.js';

export function usageText() {
  return [
    'Usage: agent-cli [--new-chat] [--verbose] [--stream-off] [runtime options] <message>',
    '',
    'Runtime options override environment defaults when provided:',
    '  --provider <name>                 --model <name>',
    '  --temperature <number>            --max-tokens <number>',
    '  --tool-permission <auto|ask|read> --reasoning-effort <level>',
    '  --past-messages <count>           --stream-trace <true|false>',
    '  --web-search <true|false|low|medium|high>',
    '',
    'Examples:',
    '  agent-cli --new-chat "Map my next financial move"',
    '  agent-cli "What should I do first?"',
    '  agent-cli --verbose "What should I do first?"',
    '  agent-cli --stream-off "What should I do first?"',
    '  agent-cli --provider google --model gemini-2.5-pro "Summarize this repo"',
  ].join('\n');
}

export function startupText(cwd = process.cwd()) {
  return `Agent CLI starting in ${cwd}`;
}

/**
 * @param {{ write(chunk: string): void }} stdout
 * @param {string | null} previousType
 * @param {string} nextType
 */
function writeTypeTransitionSeparator(stdout, previousType, nextType) {
  if (previousType && previousType !== nextType) {
    stdout.write('\n');
  }
}

/**
 * @param {{ write(chunk: string): void }} stderr
 * @param {string} kind
 * @param {string} text
 */
function writeDiagnostic(stderr, kind, text) {
  stderr.write(`${kind}: ${text}\n`);
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
  /** @type {Record<string, unknown>} */
  const runtimeOverrides = {};

  /** @param {string} rawValue */
  const normalizeFlagName = (rawValue) => rawValue.trim().toLowerCase();

  /**
   * @param {string[]} values
   * @param {number} index
   * @param {string | undefined} inlineValue
   * @param {string} flagName
   * @param {{ allowBareTrue?: boolean }} [options]
   */
  const readFlagValue = (values, index, inlineValue, flagName, options = {}) => {
    if (inlineValue !== undefined) {
      return {
        nextIndex: index,
        value: inlineValue,
      };
    }

    const nextValue = values[index + 1];

    if (typeof nextValue === 'string' && !nextValue.startsWith('--')) {
      return {
        nextIndex: index + 1,
        value: nextValue,
      };
    }

    if (options.allowBareTrue) {
      return {
        nextIndex: index,
        value: true,
      };
    }

    throw new Error(`Missing value for flag: --${flagName}`);
  };

  /**
   * @param {string[]} values
   * @param {number} index
   * @param {string | undefined} inlineValue
   * @param {string[]} explicitValues
   */
  const readOptionalFlagValue = (values, index, inlineValue, explicitValues) => {
    if (inlineValue !== undefined) {
      return {
        nextIndex: index,
        value: inlineValue,
      };
    }

    const nextValue = values[index + 1];
    const normalizedNextValue = typeof nextValue === 'string'
      ? nextValue.trim().toLowerCase()
      : '';

    if (explicitValues.includes(normalizedNextValue)) {
      return {
        nextIndex: index + 1,
        value: nextValue,
      };
    }

    return {
      nextIndex: index,
      value: true,
    };
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') {
      messageParts.push(...argv.slice(index + 1));
      break;
    }

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
      const flagBody = arg.slice(2);
      const equalsIndex = flagBody.indexOf('=');
      const rawFlagName = equalsIndex >= 0 ? flagBody.slice(0, equalsIndex) : flagBody;
      const inlineValue = equalsIndex >= 0 ? flagBody.slice(equalsIndex + 1) : undefined;
      const flagName = normalizeFlagName(rawFlagName);

      if (flagName === 'provider') {
        const result = readFlagValue(argv, index, inlineValue, flagName);
        runtimeOverrides.provider = result.value;
        index = result.nextIndex;
        continue;
      }

      if (flagName === 'model') {
        const result = readFlagValue(argv, index, inlineValue, flagName);
        runtimeOverrides.model = result.value;
        index = result.nextIndex;
        continue;
      }

      if (flagName === 'temperature') {
        const result = readFlagValue(argv, index, inlineValue, flagName);
        runtimeOverrides.temperature = result.value;
        index = result.nextIndex;
        continue;
      }

      if (flagName === 'max-tokens' || flagName === 'max-output-tokens') {
        const result = readFlagValue(argv, index, inlineValue, flagName);
        runtimeOverrides['max-tokens'] = result.value;
        index = result.nextIndex;
        continue;
      }

      if (flagName === 'tool-permission' || flagName === 'permission' || flagName === 'permissions') {
        const result = readFlagValue(argv, index, inlineValue, flagName);
        runtimeOverrides['tool-permission'] = result.value;
        index = result.nextIndex;
        continue;
      }

      if (flagName === 'reasoning-effort' || flagName === 'reasoning') {
        const result = readFlagValue(argv, index, inlineValue, flagName);
        runtimeOverrides['reasoning-effort'] = result.value;
        index = result.nextIndex;
        continue;
      }

      if (flagName === 'past-messages' || flagName === 'history-messages') {
        const result = readFlagValue(argv, index, inlineValue, flagName);
        runtimeOverrides['past-messages'] = result.value;
        index = result.nextIndex;
        continue;
      }

      if (flagName === 'stream-trace') {
        const result = readOptionalFlagValue(argv, index, inlineValue, ['true', 'false']);
        runtimeOverrides['stream-trace'] = result.value;
        index = result.nextIndex;
        continue;
      }

      if (flagName === 'no-stream-trace') {
        runtimeOverrides['stream-trace'] = false;
        continue;
      }

      if (flagName === 'web-search') {
        const result = readOptionalFlagValue(argv, index, inlineValue, ['true', 'false', 'low', 'medium', 'high']);
        runtimeOverrides['web-search'] = result.value;
        index = result.nextIndex;
        continue;
      }

      if (flagName === 'no-web-search') {
        runtimeOverrides['web-search'] = false;
        continue;
      }

      throw new Error(`Unknown flag: ${arg}`);
    }

    messageParts.push(arg);
  }

  return {
    help,
    newChat,
    runtimeOverrides: normalizeAgentConfig(runtimeOverrides),
    streamOff,
    verbose,
    message: messageParts.join(' ').trim(),
  };
}

/**
 * @param {string[]} [argv]
 * @param {{ stdout: { write(chunk: string): void }, stderr?: { write(chunk: string): void } }} [io]
 * @param {{ agentConfig?: Record<string, unknown> }} [options]
 */
export async function main(
  argv = process.argv.slice(2),
  io = { stdout: process.stdout, stderr: process.stderr },
  options = {},
) {
  const { help, newChat, runtimeOverrides, streamOff, verbose, message } = parseArguments(argv);

  if (help) {
    io.stdout.write(`${usageText()}\n`);
    return null;
  }

  if (!message) {
    throw new Error(`Missing user message.\n\n${usageText()}`);
  }

  const environmentAgentConfig = normalizeAgentConfig(process.env);
  const baseAgentConfig = {
    ...environmentAgentConfig,
    ...(options.agentConfig ?? {}),
  };
  const agentConfig = {
    ...baseAgentConfig,
    ...runtimeOverrides,
  };
  const stderr = io.stderr ?? process.stderr;
  const streamTraceEnabled = agentConfig.streamTrace === true;
  /** @type {Array<{ type: string, text: string, createdAt: string }>} */
  const streamTraceEvents = [];
  /** @type {string | null} */
  let lastStreamType = null;
  let wroteTextChunk = false;

  validateRuntimeEnvironment(process.env, agentConfig);

  const [systemPrompt, skillInventory, chat] = await Promise.all([
    loadSystemPrompt(),
    loadSkillInventory(),
    loadRequestedChat({ newChat }),
  ]);

  const pastMessages = Number(agentConfig.pastMessages);
  const historyMessageLimit = Number.isInteger(pastMessages) && pastMessages >= 0
    ? pastMessages
    : 0;
  /** @type {{ assistantText: string, messages: any[] } | null} */
  let turnResult = null;

  try {
    turnResult = await runChatTurn({
      chat,
      userMessage: message,
      stream: !streamOff,
      onStreamChunk: streamOff
        ? undefined
        : (chunk) => {
          const reasoningText = [
            chunk.reasoningContent,
            chunk.reasoning,
            chunk.reasoningText,
            chunk.thinking,
          ].find((value) => typeof value === 'string' && value.length > 0);
          const streamErrors = [
            ...(Array.isArray(chunk.errors) ? chunk.errors : []),
            ...(chunk.error ? [chunk.error] : []),
          ];

          for (const warning of chunk.warnings ?? []) {
            const warningText = String(
              warning && typeof warning === 'object' && 'message' in warning
                ? warning.message
                : JSON.stringify(warning ?? null),
            );

            if (verbose) {
              writeTypeTransitionSeparator(stderr, lastStreamType, 'warning');
              writeDiagnostic(stderr, 'warning', warningText);
            }

            if (streamTraceEnabled) {
              streamTraceEvents.push({
                type: 'warning',
                text: warningText,
                createdAt: new Date().toISOString(),
              });
            }

            lastStreamType = 'warning';
          }

          for (const streamError of streamErrors) {
            const errorText = String(
              streamError && typeof streamError === 'object' && 'message' in streamError
                ? streamError.message
                : JSON.stringify(streamError ?? null),
            );

            if (verbose) {
              writeTypeTransitionSeparator(stderr, lastStreamType, 'error');
              writeDiagnostic(stderr, 'error', errorText);
            }

            if (streamTraceEnabled) {
              streamTraceEvents.push({
                type: 'error',
                text: errorText,
                createdAt: new Date().toISOString(),
              });
            }

            lastStreamType = 'error';
          }

          if (reasoningText) {
            if (verbose) {
              writeTypeTransitionSeparator(stderr, lastStreamType, 'reasoning');
              writeDiagnostic(stderr, 'reasoning', JSON.stringify(reasoningText));
            }

            if (streamTraceEnabled) {
              streamTraceEvents.push({
                type: 'reasoning',
                text: reasoningText,
                createdAt: new Date().toISOString(),
              });
            }

            lastStreamType = 'reasoningContent';
          }

          if (chunk.content) {
            io.stdout.write(chunk.content);
            wroteTextChunk = true;

            if (streamTraceEnabled) {
              streamTraceEvents.push({
                type: 'text',
                text: chunk.content,
                createdAt: new Date().toISOString(),
              });
            }

            lastStreamType = 'text';
          }
        },
      onToolCall: streamOff
        ? undefined
        : (toolCall) => {
          if (verbose) {
            writeTypeTransitionSeparator(stderr, lastStreamType, 'tool');
            writeDiagnostic(stderr, 'tool', toolCall.name);
          }

          if (streamTraceEnabled) {
            streamTraceEvents.push({
              type: 'tool',
              text: toolCall.arguments ? `${toolCall.name} ${toolCall.arguments}` : toolCall.name,
              createdAt: new Date().toISOString(),
            });
          }

          lastStreamType = 'tool';
        },
      historyMessageLimit,
      systemPrompt,
      skillInventory,
      agentConfig,
    });
  } catch (error) {
    if (streamTraceEnabled) {
      const errorText = error instanceof Error ? error.message : String(error);

      streamTraceEvents.push({
        type: 'error',
        text: errorText,
        createdAt: new Date().toISOString(),
      });

      await persistStreamTraceEvents({
        chat,
        streamTraceEvents,
      });
    }

    throw error;
  }

  if (!turnResult) {
    throw new Error('Missing turn result.');
  }

  await persistCompletedChat({
    chat,
    messages: turnResult.messages,
  });

  if (streamTraceEnabled) {
    await persistStreamTraceEvents({
      chat,
      streamTraceEvents,
    });
  }

  if (streamOff) {
    io.stdout.write(`${turnResult.assistantText}\n`);
  } else {
    if (wroteTextChunk) {
      io.stdout.write('\n');
    }
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
    const agentConfig = parsed.runtimeOverrides;

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