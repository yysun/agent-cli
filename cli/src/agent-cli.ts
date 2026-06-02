/**
 * Agent CLI
 *
 * Purpose:
 * - Parse CLI arguments and route execution into one-shot or interactive chat modes.
 *
 * Key features:
 * - Applies workspace-root and runtime overrides before loading workspace-local resources.
 * - Keeps normal message turns and no-argument interactive mode in one shell layer.
 * - Prints startup diagnostics for workspace root and runtime selection.
 *
 * Recent changes:
 * - 2026-05-27: Delegated startup runtime selection to core runtime so the CLI stays a UI shell.
 * - 2026-05-27: Printed optional `.agent-world/world.json` workflow and agents on startup.
 * - 2026-05-26: Renamed chat persistence import to chat-store.
 * - 2026-05-26: Omit empty skill scopes from verbose startup diagnostics.
 * - 2026-05-26: Removed world, agent selection, and persisted `agent.json` runtime config.
 * - 2026-05-26: Removed remote relay hosting and kept `agent-cli` as the sole CLI surface.
 * - 2026-05-23: Uses shared core workspace environment preparation across CLI surfaces.
 * - 2026-06-02: Removed legacy workspace root selectors.
 * - 2026-05-23: Passed interactive prompts into local turns for ask_user_input handling.
 * - 2026-05-20: Added startup root output.
 */
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { normalizeAgentConfig } from '../../core/agent-config.js';
import { resolveRuntimeSelection } from '../../core/agent-runtime.js';
import {
  type AgentWorldStartupSummary,
  agentWorldStartupText,
  loadAgentWorldStartupSummary,
} from '../../core/agent-world-config.js';
import {
  flattenSkillInventoryByPrecedence,
  loadSkillInventoryByScope,
  loadWorkspaceSystemPrompt,
} from '../../core/agent-files.js';
import {
  WORKSPACE_ROOT,
} from '../../core/paths.js';
import { prepareWorkspaceEnvironment } from '../../core/workspace-environment.js';
import { ensureWorkspaceWorld } from '../../core/workspace-store.js';
import {
  clearPersistedChatEvents,
  createPersistedChat,
  loadRequestedChat,
  listPersistedChats,
  persistCompletedChat,
  setCurrentChat,
} from '../../core/chat-store.js';
import {
  type CliIo,
  createTurnExecutor,
  resolveEffectiveAgentConfig,
} from './turn-executor.js';

export interface ParsedArguments {
  help: boolean;
  newChat: boolean;
  runtimeOverrides: Record<string, unknown>;
  workspaceRoot?: string;
  streamOff: boolean;
  verbose: boolean;
  message: string;
}

export interface MainOptions {
  agentConfig?: Record<string, unknown>;
  interactivePrompt?: InteractivePrompt;
  startupDiagnostics?: boolean;
}

export interface InteractivePrompt {
  question(query: string): Promise<string>;
  close?(): void;
}

function readMessageContent(message: unknown): string {
  if (!message || typeof message !== 'object' || !('content' in message)) {
    return '';
  }

  const content = (message as { content?: unknown }).content;
  return typeof content === 'string' ? content : '';
}

function findLastAssistantText(messages: unknown[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== 'object' || (message as { role?: unknown }).role !== 'assistant') {
      continue;
    }

    const content = readMessageContent(message);
    if (content.trim()) {
      return content;
    }
  }

  return '';
}

function asksForNumberedOptionReply(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').toLowerCase();

  return [
    'please select',
    'select one',
    'choose one',
    'reply with the exact',
    'reply with exact',
    'exact pattern name',
    'select a number',
  ].some((phrase) => normalized.includes(phrase));
}

function extractNumberedOptionLabel(rawOptionText: string): string {
  const optionText = rawOptionText.trim();
  const formattedLabel = optionText.match(/^(?:\*\*([^*]+)\*\*|`([^`]+)`)/);
  if (formattedLabel) {
    return String(formattedLabel[1] ?? formattedLabel[2] ?? '').trim();
  }

  const separatedLabel = optionText.match(/^(.+?)(?:\s+[\u2013\u2014-]\s+|\s*:\s+|\s+\(|$)/);
  return String(separatedLabel?.[1] ?? optionText).trim().replace(/^\*\*|\*\*$/g, '').replace(/^`|`$/g, '');
}

function extractNumberedOptionReply(text: string, selectedNumber: number): string | null {
  if (!asksForNumberedOptionReply(text)) {
    return null;
  }

  const optionLinePattern = /^\s*(\d+)[.)]\s+(.+?)\s*$/gm;
  let match: RegExpExecArray | null;

  while ((match = optionLinePattern.exec(text)) !== null) {
    const optionNumber = Number(match[1]);
    if (optionNumber !== selectedNumber) {
      continue;
    }

    const label = extractNumberedOptionLabel(match[2] ?? '');
    return label || null;
  }

  return null;
}

export function normalizeNumberedOptionReply(
  chat: { messages?: unknown[] },
  input: string,
): string {
  const trimmedInput = input.trim();
  if (!/^[1-9]\d*$/.test(trimmedInput)) {
    return input;
  }

  const assistantText = findLastAssistantText(chat.messages ?? []);
  const selectedOption = extractNumberedOptionReply(assistantText, Number(trimmedInput));

  return selectedOption ?? input;
}

export function usageText(): string {
  return [
    'Usage: agent-cli [--workspace <path>] [--new-chat] [--verbose] [--stream-off] [runtime options] <message>',
    '',
    'Runtime options override AGENT_CLI_PROVIDER and AGENT_CLI_MODEL from .env when provided:',
    '  --provider <name>                 --model <name>',
    '  --temperature <number>            --max-tokens <number>',
    '  --tool-permission <auto|ask|read> --reasoning-effort <level>',
    '  --past-messages <count>           --stream-trace <true|false>',
    '  --web-search <true|false|low|medium|high>',
    '  --workspace <path>',
    '',
    'Examples:',
    '  agent-cli --new-chat "Map my next financial move"',
    '  agent-cli "What should I do first?"',
    '  agent-cli --verbose "What should I do first?"',
    '  agent-cli --stream-off "What should I do first?"',
    '  agent-cli --workspace /path/to/workspace "Summarize this repo"',
    '  agent-cli --provider google --model gemini-2.5-pro "Summarize this repo"',
  ].join('\n');
}

export function startupText(
  cwd = WORKSPACE_ROOT,
  runtimeSettings?: { provider: string; model: string },
  scopedSkills?: SkillScopesForStartup,
  agentWorldSummary?: AgentWorldStartupSummary | null,
): string {
  const lines = [
    `Agent CLI starting in ${cwd}`,
  ];

  if (runtimeSettings) {
    lines.push(runtimeSelectionText(runtimeSettings));
  }

  if (scopedSkills) {
    const skillText = skillStartupText(scopedSkills);

    if (skillText) {
      lines.push(skillText);
    }
  }

  const worldText = agentWorldStartupText(agentWorldSummary ?? null);
  if (worldText) {
    lines.push(worldText);
  }

  return lines.join('\n');
}

export function runtimeSelectionText(runtimeSettings: { provider: string; model: string }): string {
  return `Runtime: provider=${runtimeSettings.provider}, model=${runtimeSettings.model}`;
}

type SkillScopesForStartup = {
  user: Array<{ skillId: string }>;
  project: Array<{ skillId: string }>;
};

type AgentWorldStartupLoad = {
  summary: AgentWorldStartupSummary | null;
  warning: string;
};

function formatSkillIds(skills: Array<{ skillId: string }>): string {
  return skills.map((skill) => skill.skillId).sort((left, right) => left.localeCompare(right)).join(', ');
}

export function skillStartupText(scopedSkills: SkillScopesForStartup): string {
  const scopeLines = [
    scopedSkills.user.length > 0 ? `  user: ${formatSkillIds(scopedSkills.user)}` : '',
    scopedSkills.project.length > 0 ? `  project: ${formatSkillIds(scopedSkills.project)}` : '',
  ].filter(Boolean);

  if (scopeLines.length === 0) {
    return '';
  }

  return [
    'Skills available:',
    ...scopeLines,
  ].join('\n');
}

function createDefaultInteractivePrompt(): InteractivePrompt {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function loadAgentWorldStartupForCli(): Promise<AgentWorldStartupLoad> {
  try {
    return {
      summary: await loadAgentWorldStartupSummary(),
      warning: '',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.startsWith('Invalid Agent World config:')) {
      throw error;
    }

    return {
      summary: null,
      warning: message,
    };
  }
}

export function isCliEntrypoint(
  argvPath = process.argv[1],
  moduleUrl = import.meta.url,
): boolean {
  if (!argvPath) {
    return false;
  }

  try {
    return realpathSync(argvPath) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return pathToFileURL(path.resolve(argvPath)).href === moduleUrl;
  }
}

export function parseArguments(argv: string[]): ParsedArguments {
  let newChat = false;
  let streamOff = false;
  let help = false;
  let verbose = false;
  let workspaceRoot: string | undefined;
  const messageParts: string[] = [];
  const runtimeOverrides: Record<string, unknown> = {};

  const normalizeFlagName = (rawValue: string): string => rawValue.trim().toLowerCase();

  const readFlagValue = (
    values: string[],
    index: number,
    inlineValue: string | undefined,
    flagName: string,
    options: { allowBareTrue?: boolean } = {},
  ) => {
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

  const readOptionalFlagValue = (
    values: string[],
    index: number,
    inlineValue: string | undefined,
    explicitValues: string[],
  ) => {
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

      if (flagName === 'workspace') {
        const result = readFlagValue(argv, index, inlineValue, flagName);
        workspaceRoot = String(result.value);
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
    ...(workspaceRoot !== undefined ? { workspaceRoot } : {}),
    runtimeOverrides: normalizeAgentConfig(runtimeOverrides),
    streamOff,
    verbose,
    message: messageParts.join(' ').trim(),
  };
}

function formatChatListItem(chat: {
  id: string,
  messageCount?: number,
  updatedAt?: string,
  createdAt?: string,
  isCurrent?: boolean,
}): string {
  const marker = chat.isCurrent ? '*' : ' ';
  const timestamp = String(chat.updatedAt || chat.createdAt || '').trim();
  const messageCount = Number.isFinite(chat.messageCount) ? Number(chat.messageCount) : 0;

  return `${marker} ${chat.id} (${messageCount} messages)${timestamp ? ` updated ${timestamp}` : ''}`;
}

function isInteractiveExitError(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : '';

  return code === 'ERR_USE_AFTER_CLOSE' || code === 'ABORT_ERR';
}

async function runInteractiveSession({
  prompt,
  executeTurn,
  initialChat,
  io,
}: {
  prompt: InteractivePrompt,
  executeTurn: ReturnType<typeof createTurnExecutor>,
  initialChat: Awaited<ReturnType<typeof loadRequestedChat>>,
  io: CliIo,
}) {
  const stderr = io.stderr ?? process.stderr;
  let chat = initialChat;

  io.stdout.write('Agent CLI interactive mode. Commands: /new, /clear, /chats, /use <chatId>, /exit\n\n');

  try {
    while (true) {
      let input = '';

      try {
        input = (await prompt.question('> ')).trim();
      } catch (error) {
        if (isInteractiveExitError(error)) {
          io.stdout.write('\n');
          break;
        }

        throw error;
      }

      if (!input) {
        continue;
      }

      if (input === '/exit' || input === '/quit') {
        break;
      }

      if (input === '/new') {
        chat = await createPersistedChat();
        io.stdout.write(`new chat ${chat.id}\n\n`);
        continue;
      }

      if (input === '/clear') {
        chat = await persistCompletedChat({
          chat,
          messages: [],
        });
        await clearPersistedChatEvents(chat);
        io.stdout.write('history cleared\n\n');
        continue;
      }

      if (input === '/chats') {
        const chats = await listPersistedChats();
        if (chats.length === 0) {
          io.stdout.write('no chats\n\n');
          continue;
        }

        io.stdout.write(`${chats.map(formatChatListItem).join('\n')}\n\n`);
        continue;
      }

      if (input.startsWith('/use ')) {
        const chatId = input.slice('/use '.length).trim();

        try {
          chat = await setCurrentChat(chatId);
          io.stdout.write(`selected chat ${chat.id}\n\n`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          stderr.write(`command failed: ${message}\n\n`);
        }

        continue;
      }

      if (input.startsWith('/')) {
        stderr.write(`unknown command: ${input}\n\n`);
        continue;
      }

      const normalizedInput = normalizeNumberedOptionReply(chat, input);

      try {
        await executeTurn({
          chat,
          message: normalizedInput,
          inputPrompt: prompt,
        });
        io.stdout.write('\n');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stderr.write(`request failed: ${message}\n\n`);
      }
    }
  } finally {
    prompt.close?.();
  }

  return null;
}

export async function main(
  argv: string[] = process.argv.slice(2),
  io: CliIo = { stdout: process.stdout, stderr: process.stderr },
  options: MainOptions = {},
) {
  const {
    help,
    newChat,
    workspaceRoot,
    runtimeOverrides,
    streamOff,
    verbose,
    message,
  } = parseArguments(argv);
  prepareWorkspaceEnvironment(workspaceRoot);
  await ensureWorkspaceWorld();

  if (help) {
    io.stdout.write(`${usageText()}\n`);
    return null;
  }

  const agentSetupPrompt = options.interactivePrompt;
  let agentSetupPromptPassedToInteractive = false;

  const agentConfig = await resolveEffectiveAgentConfig({
    optionAgentConfig: options.agentConfig,
    runtimeOverrides,
  });
  const effectiveStreamOff = streamOff || agentConfig.stream === false;

  const [workspaceSystemPrompt, scopedSkillInventory, agentWorldStartup] = await Promise.all([
    loadWorkspaceSystemPrompt(),
    loadSkillInventoryByScope(),
    loadAgentWorldStartupForCli(),
  ]);
  const chat = await loadRequestedChat({ newChat });
  const skillInventory = flattenSkillInventoryByPrecedence(scopedSkillInventory);
  if (agentWorldStartup.warning) {
    (io.stderr ?? process.stderr).write(`${agentWorldStartup.warning.trim()}\n`);
  }

  if (options.startupDiagnostics) {
    (io.stderr ?? process.stderr).write(
      `${startupText(
        WORKSPACE_ROOT,
        resolveRuntimeSelection(process.env, agentConfig),
        scopedSkillInventory,
        agentWorldStartup.summary,
      )}\n`,
    );
  }

  const executeTurn = createTurnExecutor({
    io,
    verbose,
    streamOff: effectiveStreamOff,
    agentConfig,
    workspaceSystemPrompt,
    skillInventory,
  });

  if (!message) {
    agentSetupPromptPassedToInteractive = Boolean(agentSetupPrompt);

    return await runInteractiveSession({
      prompt: agentSetupPrompt ?? createDefaultInteractivePrompt(),
      executeTurn,
      initialChat: chat,
      io,
    });
  }

  const oneShotInputPrompt = options.interactivePrompt
    ?? agentSetupPrompt
    ?? (process.stdin.isTTY ? createDefaultInteractivePrompt() : undefined);
  const createdOneShotInputPrompt = !options.interactivePrompt && !agentSetupPrompt
    ? oneShotInputPrompt
    : undefined;

  try {
    return await executeTurn({
      chat,
      message: normalizeNumberedOptionReply(chat, message),
      inputPrompt: oneShotInputPrompt,
    });
  } finally {
    createdOneShotInputPrompt?.close?.();
    if (!options.interactivePrompt && !agentSetupPromptPassedToInteractive) {
      agentSetupPrompt?.close?.();
    }
  }
}

export async function runCli(
  argv: string[] = process.argv.slice(2),
  io: Required<CliIo> = { stdout: process.stdout, stderr: process.stderr },
): Promise<void> {
  try {
    const parsed = parseArguments(argv);
    prepareWorkspaceEnvironment(parsed.workspaceRoot);
    await ensureWorkspaceWorld();

    await main(argv, io, { startupDiagnostics: !parsed.help });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`${message.trim()}\n`);
    process.exitCode = 1;
  }
}

if (isCliEntrypoint()) {
  await runCli();
}
