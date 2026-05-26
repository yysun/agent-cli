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
 * - 2026-05-26: Removed world, agent selection, and persisted `agent.json` runtime config.
 * - 2026-05-26: Removed remote relay hosting and kept `agent-cli` as the sole CLI surface.
 * - 2026-05-23: Uses shared core workspace environment preparation across CLI surfaces.
 * - 2026-05-23: Added --workspace and AGENT_CLI_WORKSPACE as canonical root selectors while preserving project aliases.
 * - 2026-05-23: Passed interactive prompts into local turns for ask_user_input handling.
 * - 2026-05-20: Added startup root output and cwd .env fallback.
 */
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { normalizeAgentConfig } from '../../core/agent-config.js';
import {
  flattenSkillInventoryByPrecedence,
  loadSkillInventoryByScope,
  loadWorkspaceSystemPrompt,
} from '../../core/agent-files.js';
import {
  WORKSPACE_ROOT,
  WORKSPACE_ROOT_ENV_KEY,
} from '../../core/paths.js';
import { prepareWorkspaceEnvironment } from '../../core/workspace-environment.js';
import { ensureWorkspaceWorld } from '../../core/workspace-store.js';
import {
  createPersistedChat,
  loadRequestedChat,
  listPersistedChats,
  setCurrentChat,
} from '../../core/world-store.js';
import {
  type CliIo,
  createTurnExecutor,
  resolveEffectiveAgentConfig,
} from './turn-executor.js';

export const WORKSPACE_ENV_KEY = WORKSPACE_ROOT_ENV_KEY;

export interface ParsedArguments {
  help: boolean;
  newChat: boolean;
  runtimeOverrides: Record<string, unknown>;
  workspaceRoot?: string;
  projectRoot?: string;
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
): string {
  const lines = [
    `Agent CLI starting in ${cwd}`,
  ];

  if (runtimeSettings) {
    lines.push(runtimeSelectionText(runtimeSettings));
  }

  if (scopedSkills) {
    lines.push(skillStartupText(scopedSkills));
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

function formatSkillIds(skills: Array<{ skillId: string }>): string {
  if (skills.length === 0) {
    return 'none';
  }

  return skills.map((skill) => skill.skillId).sort((left, right) => left.localeCompare(right)).join(', ');
}

export function skillStartupText(scopedSkills: SkillScopesForStartup): string {
  return [
    'Skills available:',
    `  user: ${formatSkillIds(scopedSkills.user)}`,
    `  project: ${formatSkillIds(scopedSkills.project)}`,
  ].join('\n');
}

function createDefaultInteractivePrompt(): InteractivePrompt {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  });
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
  let projectRoot: string | undefined;
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

      if (flagName === 'workspace' || flagName === 'project') {
        const result = readFlagValue(argv, index, inlineValue, flagName);
        workspaceRoot = String(result.value);
        if (flagName === 'project') {
          projectRoot = String(result.value);
        }
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
    ...(projectRoot !== undefined ? { projectRoot } : {}),
    runtimeOverrides: normalizeAgentConfig(runtimeOverrides),
    streamOff,
    verbose,
    message: messageParts.join(' ').trim(),
  };
}

/** @param {unknown} value */
function normalizeOptionalText(value): string {
  return String(value ?? '').trim();
}

function defaultModelForProvider(provider: string): string {
  return provider.trim().toLowerCase() === 'openai' ? 'gpt-5' : '';
}

function runtimeSettingsForStartup(agentConfig: Record<string, unknown>): { provider: string; model: string } {
  const provider = (normalizeOptionalText(agentConfig.provider) || 'openai').toLowerCase();
  const model = normalizeOptionalText(agentConfig.model) || defaultModelForProvider(provider);

  return { provider, model };
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

      if (input === '/new' || input === '/clear') {
        chat = await createPersistedChat();
        io.stdout.write(input === '/clear' ? 'history cleared\n\n' : `new chat ${chat.id}\n\n`);
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

      try {
        await executeTurn({
          chat,
          message: input,
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
    projectRoot,
    runtimeOverrides,
    streamOff,
    verbose,
    message,
  } = parseArguments(argv);
  prepareWorkspaceEnvironment(workspaceRoot ?? projectRoot);
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

  const [workspaceSystemPrompt, scopedSkillInventory, chat] = await Promise.all([
    loadWorkspaceSystemPrompt(),
    loadSkillInventoryByScope(),
    loadRequestedChat({ newChat }),
  ]);
  const skillInventory = flattenSkillInventoryByPrecedence(scopedSkillInventory);

  if (options.startupDiagnostics) {
    (io.stderr ?? process.stderr).write(
      `${startupText(
        WORKSPACE_ROOT,
        runtimeSettingsForStartup(agentConfig),
        scopedSkillInventory,
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
      message,
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
    prepareWorkspaceEnvironment(parsed.workspaceRoot ?? parsed.projectRoot);
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
