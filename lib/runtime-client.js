// @ts-check
/**
 * Agent CLI LLM Runtime Client
 *
 * Purpose:
 * - Bridge Agent CLI chat state into `llm-runtime` using its environment and turn-loop conventions.
 *
 * Key features:
 * - Resolves provider settings from environment variables.
 * - Uses `respondWithTools(...)` so `load_skill` executes through the package's tool flow.
 * - Keeps the system prompt outside persisted chats while preserving conversation and tool messages.
 *
 * Recent changes:
 * - 2026-05-07: Added `llm-runtime` orchestration for the CLI.
 */
import {
  createLLMEnvironment,
  disposeLLMEnvironment,
  resolveToolsAsync,
  respondWithTools,
} from 'llm-runtime';

import { buildSkillInventoryMessage } from './agent-files.js';
import { REPO_ROOT, SKILLS_ROOT } from './paths.js';

const SUPPORTED_PROVIDERS = new Set([
  'openai',
  'anthropic',
  'google',
  'azure',
  'xai',
  'openai-compatible',
  'ollama',
]);

const DEFAULT_MODELS = {
  openai: 'gpt-5',
};

/**
 * @param {{ reasoningEffort?: string, toolPermission?: string }} agentConfig
 */
function buildEnvironmentDefaults(agentConfig = {}) {
  const defaults = {};

  if (agentConfig.reasoningEffort) {
    defaults.reasoningEffort = agentConfig.reasoningEffort;
  }

  if (agentConfig.toolPermission) {
    defaults.toolPermission = agentConfig.toolPermission;
  }

  return defaults;
}

/**
 * @param {{ reasoningEffort?: string, toolPermission?: string }} agentConfig
 */
function buildExecutionContext(agentConfig = {}) {
  const context = {
    workingDirectory: REPO_ROOT,
  };

  if (agentConfig.reasoningEffort) {
    context.reasoningEffort = agentConfig.reasoningEffort;
  }

  if (agentConfig.toolPermission) {
    context.toolPermission = agentConfig.toolPermission;
  }

  return context;
}

/**
 * @param {NodeJS.ProcessEnv} environment
 * @param {string} variableName
 */
function requireEnvironmentVariable(environment, variableName) {
  const value = String(environment[variableName] ?? '').trim();

  if (!value) {
    throw new Error(`Missing environment variable: ${variableName}`);
  }

  return value;
}

/**
 * @param {NodeJS.ProcessEnv} environment
 * @param {string[]} variableNames
 */
function requireAnyEnvironmentVariable(environment, variableNames) {
  for (const variableName of variableNames) {
    const value = String(environment[variableName] ?? '').trim();

    if (value) {
      return value;
    }
  }

  throw new Error(`Missing environment variable: ${variableNames[0]}`);
}

/**
 * @param {string} provider
 * @param {NodeJS.ProcessEnv} environment
 */
function resolveProviderConfig(provider, environment) {
  switch (provider) {
    case 'openai':
      return {
        apiKey: requireEnvironmentVariable(environment, 'OPENAI_API_KEY'),
      };
    case 'anthropic':
      return {
        apiKey: requireEnvironmentVariable(environment, 'ANTHROPIC_API_KEY'),
      };
    case 'google':
      return {
        apiKey: requireEnvironmentVariable(environment, 'GOOGLE_API_KEY'),
      };
    case 'xai':
      return {
        apiKey: requireEnvironmentVariable(environment, 'XAI_API_KEY'),
      };
    case 'openai-compatible':
      return {
        apiKey: requireEnvironmentVariable(environment, 'OPENAI_COMPATIBLE_API_KEY'),
        baseUrl: requireEnvironmentVariable(environment, 'OPENAI_COMPATIBLE_BASE_URL'),
      };
    case 'ollama':
      return {
        baseUrl: requireEnvironmentVariable(environment, 'OLLAMA_BASE_URL'),
      };
    case 'azure':
      return {
        apiKey: requireEnvironmentVariable(environment, 'AZURE_OPENAI_API_KEY'),
        resourceName: requireEnvironmentVariable(environment, 'AZURE_OPENAI_RESOURCE_NAME'),
        deployment: requireAnyEnvironmentVariable(environment, [
          'AZURE_OPENAI_DEPLOYMENT_NAME',
          'AZURE_OPENAI_DEPLOYMENT',
        ]),
        ...(String(environment.AZURE_OPENAI_API_VERSION ?? '').trim()
          ? { apiVersion: String(environment.AZURE_OPENAI_API_VERSION).trim() }
          : {}),
      };
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

/**
 * @param {NodeJS.ProcessEnv} [environment]
 * @param {{ provider?: string, model?: string }} [agentConfig]
 */
export function validateRuntimeEnvironment(environment = process.env, agentConfig = {}) {
  const configuredProvider = String(agentConfig.provider ?? environment.LLM_PROVIDER ?? 'openai').trim();
  const provider = configuredProvider.toLowerCase();

  if (!SUPPORTED_PROVIDERS.has(provider)) {
    throw new Error(`Unsupported LLM provider: ${configuredProvider}`);
  }

  const providerConfig = resolveProviderConfig(provider, environment);
  const model = String(
    agentConfig.model
    ?? environment.LLM_MODEL
    ?? (provider === 'azure' ? providerConfig.deployment : undefined)
    ?? DEFAULT_MODELS[provider]
    ?? '',
  ).trim();

  if (!model) {
    throw new Error(`Missing LLM model. Set LLM_MODEL for provider ${provider}.`);
  }

  return {
    provider,
    model,
    providers: {
      [provider]: providerConfig,
    },
  };
}

/**
 * @param {string} systemPrompt
 * @param {Array<{ skillId: string, description?: string }>} skillInventory
 */
function buildBaseSystemMessages(systemPrompt, skillInventory) {
  /** @type {Array<{ role: 'system', content: string }>} */
  const messages = [
    {
      role: 'system',
      content: systemPrompt,
    },
  ];

  const skillInventoryMessage = buildSkillInventoryMessage(skillInventory);

  if (skillInventoryMessage) {
    messages.push({
      role: 'system',
      content: skillInventoryMessage,
    });
  }

  return messages;
}

/**
 * @param {string} argumentsText
 */
function parseToolArguments(argumentsText) {
  if (!argumentsText || !String(argumentsText).trim()) {
    return {};
  }

  try {
    return JSON.parse(argumentsText);
  } catch {
    return {
      __raw: argumentsText,
    };
  }
}

/**
 * @param {{ id: string, function?: { name?: string, arguments?: string } }} toolCall
 * @param {Record<string, { execute?: (args: Record<string, unknown>, context?: Record<string, unknown>) => Promise<unknown> | unknown }>} tools
 * @param {Record<string, unknown>} executionContext
 */
async function executeToolCall(toolCall, tools, executionContext) {
  const toolName = toolCall.function?.name;
  const tool = toolName ? tools[toolName] : undefined;

  if (!toolName || !tool || typeof tool.execute !== 'function') {
    return {
      ok: false,
      status: 'error',
      errorType: 'unknown_tool',
      message: `Tool is not executable: ${toolName}`,
    };
  }

  const parsedArguments = parseToolArguments(toolCall.function?.arguments ?? '{}');

  try {
    return await tool.execute(parsedArguments, {
      ...executionContext,
      toolCallId: toolCall.id,
    });
  } catch (error) {
    return {
      ok: false,
      status: 'error',
      errorType: 'tool_execution_failed',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * @param {unknown} result
 */
function serializeToolResult(result) {
  if (typeof result === 'string') {
    return result;
  }

  return JSON.stringify(result ?? null, null, 2);
}

/**
 * @param {any[]} messages
 * @param {number | undefined} historyMessageLimit
 */
function selectContextMessages(messages, historyMessageLimit) {
  if (!Number.isInteger(historyMessageLimit) || historyMessageLimit < 0) {
    return messages;
  }

  if (historyMessageLimit === 0) {
    return [];
  }

  return messages.slice(-historyMessageLimit);
}

/**
 * @param {{
 *   chat: { id: string, messages: any[], createdAt?: string, updatedAt?: string },
 *   userMessage: string,
 *   stream?: boolean,
 *   onStreamChunk?: (chunk: { content?: string, reasoningContent?: string, warnings?: unknown[] }) => void,
 *   historyMessageLimit?: number,
 *   systemPrompt: string,
 *   skillInventory: Array<{ skillId: string, description?: string }>,
 *   agentConfig?: {
 *     provider?: string,
 *     model?: string,
 *     temperature?: number,
 *     maxTokens?: number,
 *     toolPermission?: string,
 *     reasoningEffort?: string,
 *     webSearch?: boolean | { searchContextSize?: 'low' | 'medium' | 'high' },
 *   }
 * }} params
 */
export async function runChatTurn({
  chat,
  userMessage,
  stream = true,
  onStreamChunk,
  historyMessageLimit,
  systemPrompt,
  skillInventory,
  agentConfig = {},
}) {
  const runtimeSettings = validateRuntimeEnvironment(process.env, agentConfig);
  const environmentDefaults = buildEnvironmentDefaults(agentConfig);
  const executionContext = buildExecutionContext(agentConfig);
  const environment = createLLMEnvironment({
    providers: runtimeSettings.providers,
    skillRoots: [SKILLS_ROOT],
    ...(Object.keys(environmentDefaults).length > 0 ? { defaults: environmentDefaults } : {}),
  });

  /** @type {Record<string, { execute?: (args: Record<string, unknown>, context?: Record<string, unknown>) => Promise<unknown> | unknown }>} */
  const tools = await resolveToolsAsync({
    environment,
    builtIns: {
      load_skill: true,
    },
  });

  const pendingUserMessage = {
    role: 'user',
    content: userMessage,
    createdAt: new Date().toISOString(),
  };
  const contextMessages = selectContextMessages(chat.messages, historyMessageLimit);

  try {
    const result = await respondWithTools({
      initialState: {
        conversationMessages: [...contextMessages, pendingUserMessage],
        persistedMessages: [...chat.messages, pendingUserMessage],
        finalText: '',
      },
      emptyTextRetryLimit: 0,
      rejectedTextRetryLimit: 0,
      modelRequest: {
        mode: stream ? 'stream' : 'generate',
        environment,
        provider: runtimeSettings.provider,
        model: runtimeSettings.model,
        ...(stream && typeof onStreamChunk === 'function' ? { onChunk: onStreamChunk } : {}),
        ...(typeof agentConfig.temperature === 'number' ? { temperature: agentConfig.temperature } : {}),
        ...(typeof agentConfig.maxTokens === 'number' ? { maxTokens: agentConfig.maxTokens } : {}),
        ...(agentConfig.webSearch !== undefined ? { webSearch: agentConfig.webSearch } : {}),
        builtIns: {
          load_skill: true,
        },
        context: executionContext,
      },
      buildMessages: async ({ state, transientInstruction }) => {
        const baseMessages = [
          ...buildBaseSystemMessages(systemPrompt, skillInventory),
          ...state.conversationMessages,
        ];

        if (!transientInstruction) {
          return baseMessages;
        }

        return [
          ...baseMessages,
          {
            role: 'system',
            content: transientInstruction,
          },
        ];
      },
      onToolCallsResponse: async ({ state, response }) => {
        const nextConversationMessages = [...state.conversationMessages, response.assistantMessage];
        const nextPersistedMessages = [...state.persistedMessages, response.assistantMessage];

        for (const toolCall of response.tool_calls ?? []) {
          const toolResult = await executeToolCall(toolCall, tools, executionContext);
          const toolMessage = {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: serializeToolResult(toolResult),
            createdAt: new Date().toISOString(),
          };

          nextConversationMessages.push(toolMessage);
          nextPersistedMessages.push(toolMessage);
        }

        return {
          state: {
            ...state,
            conversationMessages: nextConversationMessages,
            persistedMessages: nextPersistedMessages,
          },
          next: {
            control: 'continue',
          },
        };
      },
      onTextResponse: async ({ state, response, responseText }) => ({
        state: {
          ...state,
          conversationMessages: [...state.conversationMessages, response.assistantMessage],
          persistedMessages: [...state.persistedMessages, response.assistantMessage],
          finalText: responseText,
        },
      }),
    });

    if (!result.state.finalText.trim()) {
      throw new Error(`LLM turn ended without a final text response. Stop reason: ${result.reason}`);
    }

    return {
      assistantText: result.state.finalText.trim(),
      messages: result.state.persistedMessages ?? result.state.conversationMessages,
    };
  } finally {
    await disposeLLMEnvironment(environment);
  }
}