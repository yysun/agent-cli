/**
 * Agent World CLI
 *
 * Purpose:
 * - Expose the local Agent World runtime through a small JSON-first command line interface.
 *
 * Key features:
 * - Inspects world, agent, chat, message, and queue state from `.agent-world`.
 * - Mutates agents, chats, selected chat, queued messages, and direct sends through `AgentWorldRuntime`.
 * - Provides an interactive shell that reuses the one-shot command dispatcher.
 * - Keeps queued sends provider-free by enqueueing without dispatching.
 *
 * Recent changes:
 * - 2026-05-23: Added interactive mode for `agent-world-cli`.
 * - 2026-05-23: Implemented the published `agent-world-cli` binary over the world runtime.
 */
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import {
  type AgentWorldRuntime,
  type CreateAgentInput,
  createAgentWorldRuntime,
} from './agent-world-runtime.js';

export interface AgentWorldCliIo {
  stdin?: NodeJS.ReadableStream;
  stdout: Pick<NodeJS.WriteStream, 'write'>;
  stderr: Pick<NodeJS.WriteStream, 'write'>;
}

type ParsedArgs = {
  command: string[];
  flags: Map<string, string | true>;
};

const VALUE_FLAGS = new Set(['workspace', 'name', 'provider', 'model', 'chat', 'agent']);
const BOOLEAN_FLAGS = new Set(['default', 'queue', 'help']);

export function usageText(): string {
  return [
    'agent-world-cli commands:',
    '  help',
    '  interactive',
    '  world [--workspace <path>]',
    '  agents list',
    '  agents create <agentId> [--name <name>] [--provider <provider>] [--model <model>] [--default]',
    '  chats list',
    '  chats new',
    '  chats use <chatId>',
    '  messages list [chatId]',
    '  send [--chat <chatId>] [--agent <agentId>] [--queue] <message...>',
    '  queue list [chatId]',
    '  queue pause|resume|stop|clear [chatId]',
  ].join('\n');
}

export function interactiveHelpText(): string {
  return [
    'agent-world-cli interactive commands:',
    '  /help',
    '  /world',
    '  /agents list',
    '  /agents create <agentId> [--name <name>] [--provider <provider>] [--model <model>] [--default]',
    '  /chats list',
    '  /new',
    '  /use <chatId>',
    '  /messages [chatId]',
    '  /send [--chat <chatId>] [--agent <agentId>] [--queue] <message...>',
    '  /queue [chatId]',
    '  /pause [chatId]',
    '  /resume [chatId]',
    '  /stop [chatId]',
    '  /clear [chatId]',
    '  /exit',
    'Plain text sends a message to the current chat.',
  ].join('\n');
}

function defaultIo(): AgentWorldCliIo {
  return {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  };
}

function writeJson(io: AgentWorldCliIo, value: unknown) {
  io.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function writeText(io: AgentWorldCliIo, value: string) {
  io.stdout.write(`${value}\n`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const command: string[] = [];
  const flags = new Map<string, string | true>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? '';

    if (token === '--') {
      command.push(...argv.slice(index + 1));
      break;
    }

    if (token === '-h') {
      flags.set('help', true);
      continue;
    }

    if (token.startsWith('--')) {
      const flag = token.slice(2);

      if (BOOLEAN_FLAGS.has(flag)) {
        flags.set(flag, true);
        continue;
      }

      if (!VALUE_FLAGS.has(flag)) {
        throw new Error(`Unknown option: --${flag}`);
      }

      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for --${flag}`);
      }

      flags.set(flag, value);
      index += 1;
      continue;
    }

    command.push(token);
  }

  return { command, flags };
}

export function splitCommandLine(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | '' = '';
  let escaping = false;

  for (const character of String(input ?? '')) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }

    if (character === '\\') {
      escaping = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = '';
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (/\s/u.test(character)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += character;
  }

  if (escaping) {
    current += '\\';
  }

  if (quote) {
    throw new Error('Unterminated quoted string.');
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function flagString(flags: Map<string, string | true>, name: string): string | undefined {
  const value = flags.get(name);
  return typeof value === 'string' ? value : undefined;
}

function flagBoolean(flags: Map<string, string | true>, name: string): boolean {
  return flags.get(name) === true;
}

function requireValue(value: string | undefined, label: string): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new Error(`Missing ${label}.`);
  }
  return normalized;
}

async function executeAgentWorldCommand(
  parsed: ParsedArgs,
  io: AgentWorldCliIo,
  runtime: AgentWorldRuntime,
): Promise<number> {
  const [area, action, ...rest] = parsed.command;

  if (!area || area === 'help' || flagBoolean(parsed.flags, 'help')) {
    writeText(io, usageText());
    return 0;
  }

  if (area === 'world') {
    writeJson(io, await runtime.world.get());
    return 0;
  }

  if (area === 'agents') {
    if (action === 'list') {
      writeJson(io, await runtime.agents.list());
      return 0;
    }

    if (action === 'create') {
      const agentId = requireValue(rest[0], 'agent ID');
      const input: CreateAgentInput = {
        agentId,
        setDefault: flagBoolean(parsed.flags, 'default'),
      };
      const name = flagString(parsed.flags, 'name');
      const provider = flagString(parsed.flags, 'provider');
      const model = flagString(parsed.flags, 'model');

      if (name) input.name = name;
      if (provider) input.provider = provider;
      if (model) input.model = model;

      writeJson(io, await runtime.agents.create(input));
      return 0;
    }
  }

  if (area === 'chats') {
    if (action === 'list') {
      writeJson(io, await runtime.chats.list());
      return 0;
    }

    if (action === 'new') {
      writeJson(io, await runtime.chats.create());
      return 0;
    }

    if (action === 'use') {
      writeJson(io, await runtime.chats.select(requireValue(rest[0], 'chat ID')));
      return 0;
    }
  }

  if (area === 'messages' && action === 'list') {
    writeJson(io, await runtime.messages.list(rest[0]));
    return 0;
  }

  if (area === 'send') {
    const content = requireValue([action, ...rest].filter(Boolean).join(' '), 'message');
    const chatId = flagString(parsed.flags, 'chat');

    if (flagBoolean(parsed.flags, 'queue')) {
      const row = await runtime.queue.add(content, 'human', chatId);
      writeJson(io, {
        chatId: row.chatId,
        agentIds: [],
        queued: true,
        queueMessage: row,
      });
      return 0;
    }

    writeJson(io, await runtime.messages.send({
      content,
      ...(chatId ? { chatId } : {}),
      ...(flagString(parsed.flags, 'agent') ? { agentId: flagString(parsed.flags, 'agent') } : {}),
    }));
    return 0;
  }

  if (area === 'queue') {
    if (action === 'list') {
      writeJson(io, await runtime.queue.list(rest[0]));
      return 0;
    }

    if (action === 'pause') {
      await runtime.queue.pause(rest[0]);
      writeJson(io, { paused: true, chatId: rest[0] ?? null });
      return 0;
    }

    if (action === 'resume') {
      await runtime.queue.resume(rest[0]);
      writeJson(io, { resumed: true, chatId: rest[0] ?? null });
      return 0;
    }

    if (action === 'stop') {
      await runtime.queue.stop(rest[0]);
      writeJson(io, { stopped: true, chatId: rest[0] ?? null });
      return 0;
    }

    if (action === 'clear') {
      await runtime.queue.clear(rest[0]);
      writeJson(io, { cleared: true, chatId: rest[0] ?? null });
      return 0;
    }
  }

  throw new Error(`Unknown command: ${parsed.command.join(' ')}`);
}

function toInteractiveArgv(line: string): string[] | null {
  const trimmed = String(line ?? '').trim();
  if (!trimmed) {
    return [];
  }

  if (!trimmed.startsWith('/')) {
    return ['send', trimmed];
  }

  const [command = '', ...rest] = splitCommandLine(trimmed.slice(1));
  switch (command) {
    case 'exit':
    case 'quit':
      return null;
    case 'help':
      return ['interactive-help'];
    case 'world':
      return ['world', ...rest];
    case 'agents':
      return ['agents', ...rest];
    case 'chats':
      return ['chats', ...rest];
    case 'new':
      return ['chats', 'new', ...rest];
    case 'use':
      return ['chats', 'use', ...rest];
    case 'messages':
      return ['messages', 'list', ...rest];
    case 'send':
      return ['send', ...rest];
    case 'queue':
      return ['queue', 'list', ...rest];
    case 'pause':
    case 'resume':
    case 'stop':
    case 'clear':
      return ['queue', command, ...rest];
    default:
      return [command, ...rest];
  }
}

async function buildInteractivePrompt(runtime: AgentWorldRuntime): Promise<string> {
  const currentChat = await runtime.chats.current().catch(() => null);
  return currentChat?.id ? `agent-world:${currentChat.id}> ` : 'agent-world> ';
}

async function executeInteractiveLine(
  line: string,
  runtime: AgentWorldRuntime,
  io: AgentWorldCliIo,
): Promise<boolean> {
  const argv = toInteractiveArgv(line);
  if (argv === null) {
    return false;
  }

  if (argv.length === 0) {
    return true;
  }

  if (argv[0] === 'interactive-help') {
    writeText(io, interactiveHelpText());
    return true;
  }

  try {
    await executeAgentWorldCommand(parseArgs(argv), io, runtime);
  } catch (error) {
    io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  }

  return true;
}

async function runScriptedInteractiveInput(
  input: NodeJS.ReadableStream,
  runtime: AgentWorldRuntime,
  io: AgentWorldCliIo,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let buffer = '';
    let processing = Promise.resolve();
    let stopped = false;
    let resolved = false;

    const cleanup = () => {
      input.off('data', handleData);
      input.off('end', handleEnd);
      input.off('error', handleError);
    };

    const resolveAfterProcessing = () => {
      if (resolved) {
        return;
      }

      resolved = true;
      cleanup();
      processing.then(() => resolve(), reject);
    };

    const stopAfterProcessing = () => {
      stopped = true;
      if (typeof (input as { pause?: () => void }).pause === 'function') {
        (input as { pause: () => void }).pause();
      }
      if (typeof (input as { destroy?: () => void }).destroy === 'function') {
        (input as { destroy: () => void }).destroy();
      }
      resolveAfterProcessing();
    };

    const enqueueLine = (line: string) => {
      processing = processing.then(async () => {
        if (stopped || !line.trim()) {
          return;
        }

        const shouldContinue = await executeInteractiveLine(line, runtime, io);
        if (!shouldContinue) {
          stopAfterProcessing();
          return;
        }

        io.stdout.write(await buildInteractivePrompt(runtime));
      }, reject);
    };

    const handleData = (chunk: Buffer | string) => {
      buffer += String(chunk);
      const lines = buffer.split(/\r?\n/u);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        enqueueLine(line);
      }
    };

    const handleEnd = () => {
      if (buffer.trim()) {
        enqueueLine(buffer);
        buffer = '';
      }

      resolveAfterProcessing();
    };

    const handleError = (error: Error) => {
      stopped = true;
      resolved = true;
      cleanup();
      reject(error);
    };

    input.on('data', handleData);
    input.on('end', handleEnd);
    input.on('error', handleError);
  });
}

export async function runAgentWorldInteractive(
  runtime: AgentWorldRuntime,
  io = defaultIo(),
): Promise<number> {
  const input = io.stdin ?? process.stdin;
  let exitRequested = false;
  const isTerminal = Boolean((input as { isTTY?: boolean }).isTTY);

  writeText(io, 'agent-world-cli interactive. Type /help for commands, /exit to quit.');

  if (!isTerminal) {
    io.stdout.write(await buildInteractivePrompt(runtime));
    await runScriptedInteractiveInput(input, runtime, io);
    return 0;
  }

  const readline = createInterface({
    input,
    output: io.stdout as NodeJS.WritableStream,
    terminal: true,
  });

  readline.on('SIGINT', () => {
    exitRequested = true;
    readline.close();
  });

  try {
    readline.setPrompt(await buildInteractivePrompt(runtime));
    readline.prompt();

    for await (const line of readline) {
      if (exitRequested) {
        break;
      }
      const shouldContinue = await executeInteractiveLine(line, runtime, io);
      if (!shouldContinue) {
        exitRequested = true;
        break;
      }

      readline.setPrompt(await buildInteractivePrompt(runtime));
      readline.prompt();
    }
  } finally {
    readline.close();
  }

  return 0;
}

export async function runAgentWorldCli(argv = process.argv.slice(2), io = defaultIo()): Promise<number> {
  try {
    const parsed = parseArgs(argv);
    const [area] = parsed.command;

    if (area === 'help' || flagBoolean(parsed.flags, 'help')) {
      writeText(io, usageText());
      return 0;
    }

    const runtime = createAgentWorldRuntime({
      workspaceRoot: flagString(parsed.flags, 'workspace'),
      autoResume: false,
    });

    if (!area || area === 'interactive') {
      return await runAgentWorldInteractive(runtime, io);
    }

    return await executeAgentWorldCommand(parsed, io, runtime);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`${message}\n`);
    return 1;
  }
}

export function isAgentWorldCliEntrypoint(argv = process.argv): boolean {
  const entrypoint = argv[1] ? path.resolve(argv[1]) : '';
  if (!entrypoint) {
    return false;
  }

  return entrypoint === fileURLToPath(import.meta.url)
    || path.basename(entrypoint) === 'agent-world-cli.js';
}

export async function main() {
  const exitCode = await runAgentWorldCli();
  process.exitCode = exitCode;
}

if (isAgentWorldCliEntrypoint()) {
  await main();
}
