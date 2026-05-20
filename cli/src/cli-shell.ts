import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config as loadDotEnvConfig } from 'dotenv';

import { normalizeAgentConfig } from '../../core/agent-config.js';
import { loadProjectSystemPrompt, loadSkillInventory } from '../../core/agent-files.js';
import { configureProjectRoot, REPO_ROOT } from '../../core/paths.js';
import {
  acquireRemoteHostLock,
  assertNoActiveRemoteHost,
  createPersistedChat,
  loadChatById,
  loadRequestedChat,
  listPersistedChats,
  persistCompletedChat,
  persistRemoteSessionState,
  releaseRemoteHostLock,
  setCurrentChat,
  updateRemoteHostLock,
} from '../../core/session-store.js';
import * as relayClient from '../../core/relay-client.js';
import { runRemoteControlSession } from '../../core/remote-control.js';
import { validateRuntimeEnvironment } from '../../core/runtime-client.js';
import {
  type CliIo,
  createTurnExecutor,
  resolveEffectiveAgentConfig,
} from './agent-runtime.js';

export const REMOTE_RELAY_SERVER_ENV_KEY = 'AGENT_CLI_RELAY_SERVER_URL';

const DOTENV_ALLOWED_ENV_KEYS = new Set([
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
]);

export interface ParsedArguments {
  help: boolean;
  newChat: boolean;
  remoteControl: boolean;
  runtimeOverrides: Record<string, unknown>;
  projectRoot?: string;
  streamOff: boolean;
  verbose: boolean;
  message: string;
}

export interface MainOptions {
  agentConfig?: Record<string, unknown>;
  agentId?: string;
}

function loadAllowedDotEnvEnvironment(): void {
  const parsed = loadDotEnvConfig({
    processEnv: {},
    path: path.join(REPO_ROOT, '.env'),
  }).parsed ?? {};

  for (const [key, value] of Object.entries(parsed)) {
    if (!DOTENV_ALLOWED_ENV_KEYS.has(key)) {
      continue;
    }

    if (typeof process.env[key] === 'string' && process.env[key].trim()) {
      continue;
    }

    process.env[key] = value;
  }
}

function prepareProjectEnvironment(projectRoot?: string): void {
  configureProjectRoot(projectRoot);
  loadAllowedDotEnvEnvironment();
}

export function usageText(): string {
  return [
    'Usage: agent-cli [--project <path>] [--new-chat] [--verbose] [--stream-off] [runtime options] <message>',
    '       agent-cli [--project <path>] --remote [--new-chat] [initial message]',
    '',
    'Runtime options override runtime.json defaults when provided:',
    '  --provider <name>                 --model <name>',
    '  --temperature <number>            --max-tokens <number>',
    '  --tool-permission <auto|ask|read> --reasoning-effort <level>',
    '  --past-messages <count>           --stream-trace <true|false>',
    '  --web-search <true|false|low|medium|high>',
    '  --project <path>',
    '  --remote',
    '',
    `Remote mode requires ${REMOTE_RELAY_SERVER_ENV_KEY} in the environment.`,
    '',
    'Examples:',
    '  agent-cli --new-chat "Map my next financial move"',
    '  agent-cli "What should I do first?"',
    '  agent-cli --verbose "What should I do first?"',
    '  agent-cli --stream-off "What should I do first?"',
    '  agent-cli --project /path/to/project "Summarize this repo"',
    '  agent-cli --provider google --model gemini-2.5-pro "Summarize this repo"',
    '  AGENT_CLI_RELAY_SERVER_URL=http://127.0.0.1:8787 agent-cli --remote',
  ].join('\n');
}

export function startupText(cwd = REPO_ROOT): string {
  return `Agent CLI starting in ${cwd}`;
}

export function runtimeSelectionText(runtimeSettings: { provider: string; model: string }): string {
  return `provider=${runtimeSettings.provider} model=${runtimeSettings.model}`;
}

export function readRemoteRelayServerUrl(
  environment: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): string {
  const relayServer = String(environment[REMOTE_RELAY_SERVER_ENV_KEY] ?? '').trim();

  if (!relayServer) {
    throw new Error(`Missing environment variable: ${REMOTE_RELAY_SERVER_ENV_KEY}`);
  }

  return relayClient.normalizeRelayServerUrl(relayServer);
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
  let remoteControl = false;
  let verbose = false;
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

    if (arg === '--remote') {
      remoteControl = true;
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

      if (flagName === 'project') {
        const result = readFlagValue(argv, index, inlineValue, flagName);
        projectRoot = String(result.value);
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
    ...(projectRoot !== undefined ? { projectRoot } : {}),
    remoteControl,
    runtimeOverrides: normalizeAgentConfig(runtimeOverrides),
    streamOff,
    verbose,
    message: messageParts.join(' ').trim(),
  };
}

export async function main(
  argv: string[] = process.argv.slice(2),
  io: CliIo = { stdout: process.stdout, stderr: process.stderr },
  options: MainOptions = {},
) {
  const {
    help,
    newChat,
    projectRoot,
    remoteControl,
    runtimeOverrides,
    streamOff,
    verbose,
    message,
  } = parseArguments(argv);
  prepareProjectEnvironment(projectRoot);

  if (help) {
    io.stdout.write(`${usageText()}\n`);
    return null;
  }

  if (!message && !remoteControl) {
    throw new Error(`Missing user message.\n\n${usageText()}`);
  }

  const agentConfig = await resolveEffectiveAgentConfig({
    optionAgentConfig: options.agentConfig,
    runtimeOverrides,
    agentId: options.agentId,
  });
  const effectiveStreamOff = streamOff || agentConfig.stream === false;

  if (!remoteControl) {
    await assertNoActiveRemoteHost();
  }

  const [projectSystemPrompt, skillInventory, chat] = await Promise.all([
    loadProjectSystemPrompt(),
    loadSkillInventory(),
    loadRequestedChat({ newChat }),
  ]);
  const executeTurn = createTurnExecutor({
    io,
    verbose,
    streamOff: effectiveStreamOff,
    agentConfig,
    projectSystemPrompt,
    skillInventory,
  });

  if (remoteControl) {
    await acquireRemoteHostLock({ chat });
    const relayServer = readRemoteRelayServerUrl(process.env);

    try {
      await persistCompletedChat({
        chat,
        messages: chat.messages,
      });

      const relaySession = await runRemoteControlSession({
        relayServer,
        chat,
        chatStore: {
          listChats: listPersistedChats,
          loadChatById,
          createChat: createPersistedChat,
          setCurrentChat,
          persistRemoteSessionState,
          updateRemoteHostLock,
        },
        io,
        initialMessage: message || undefined,
        onSessionReady: async (startedRelaySession) => {
          await persistRemoteSessionState({
            remoteSession: startedRelaySession,
          });
        },
        executeTurn,
        relayClient,
      });

      await persistRemoteSessionState({
        remoteSession: relaySession,
      });

      return relaySession;
    } finally {
      await releaseRemoteHostLock();
    }
  }

  return await executeTurn({
    chat,
    message,
  });
}

export async function runCli(
  argv: string[] = process.argv.slice(2),
  io: Required<CliIo> = { stdout: process.stdout, stderr: process.stderr },
): Promise<void> {
  try {
    const parsed = parseArguments(argv);
    prepareProjectEnvironment(parsed.projectRoot);

    if (parsed.verbose && !parsed.help) {
      io.stderr.write(`${startupText()}\n`);

      if (parsed.message) {
        const agentConfig = await resolveEffectiveAgentConfig({
          runtimeOverrides: parsed.runtimeOverrides,
        });
        io.stderr.write(`${runtimeSelectionText(validateRuntimeEnvironment(process.env, agentConfig))}\n`);
      }
    }

    await main(argv, io);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`${message.trim()}\n`);
    process.exitCode = 1;
  }
}
