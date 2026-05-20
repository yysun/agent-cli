// @ts-check
/**
 * Agent CLI LLM Runtime Client
 *
 * Purpose:
 * - Bridge Agent CLI chat state into `llm-runtime` using its environment and turn-loop conventions.
 *
 * Key features:
 * - Resolves provider settings from environment variables.
 * - Uses the `llm-runtime` completion loop while preserving Agent CLI-owned prompt layering.
 * - Keeps the system prompt outside persisted chats while preserving conversation and tool messages.
 *
 * Recent changes:
 * - 2026-05-07: Added `llm-runtime` orchestration for the CLI.
 * - 2026-05-11: Layered built-in prompt, AGENTS.md, and skill inventory in explicit order.
 * - 2026-05-20: Added tool-result duration and argument context for richer CLI trace rendering.
 * - 2026-05-16: Migrated the host adapter to the `llm-runtime` 0.5.0 completion loop API.
 */
import {
  createRuntime,
  executeToolCall as executeRuntimeToolCall,
  executeToolCalls as executeRuntimeToolCalls,
  runCompletionLoop,
} from 'llm-runtime';

import { buildSkillInventoryMessage } from './agent-files.js';
import { REPO_ROOT, SKILLS_ROOT } from './paths.js';

/** @typedef {import('llm-runtime').LLMChatMessage} LLMChatMessage */
/** @typedef {import('llm-runtime').LLMEnvironmentOptions} LLMEnvironmentOptions */
/** @typedef {import('llm-runtime').LLMProviderConfigs} LLMProviderConfigs */
/** @typedef {import('llm-runtime').LLMProviderName} LLMProviderName */
/** @typedef {import('llm-runtime').LLMToolExecutionContext} LLMToolExecutionContext */
/** @typedef {import('llm-runtime').ProviderConfig} ProviderConfig */
/** @typedef {import('llm-runtime').ReasoningEffort} ReasoningEffort */
/** @typedef {import('llm-runtime').ToolPermission} ToolPermission */

/**
 * @typedef {{
 *   provider?: LLMProviderName,
 *   model?: string,
 *   temperature?: number,
 *   maxTokens?: number,
 *   toolPermission?: ToolPermission,
 *   reasoningEffort?: ReasoningEffort,
 *   webSearch?: boolean | { searchContextSize?: 'low' | 'medium' | 'high' },
 * }} RuntimeAgentConfig
 */

/**
 * @typedef {{
 *   provider: LLMProviderName,
 *   model: string,
 *   providers: LLMProviderConfigs,
 * }} RuntimeSettings
 */

/** @type {Set<LLMProviderName>} */
const SUPPORTED_PROVIDERS = new Set([
  'openai',
  'anthropic',
  'google',
  'azure',
  'xai',
  'openai-compatible',
  'ollama',
]);

/** @type {Partial<Record<LLMProviderName, string>>} */
const DEFAULT_MODELS = {
  openai: 'gpt-5',
};

/**
 * @param {{ reasoningEffort?: ReasoningEffort, toolPermission?: ToolPermission }} agentConfig
 */
function buildEnvironmentDefaults(agentConfig = {}) {
  /** @type {NonNullable<LLMEnvironmentOptions['defaults']>} */
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
 * @param {{ reasoningEffort?: ReasoningEffort, toolPermission?: ToolPermission, abortSignal?: AbortSignal }} agentConfig
 */
function buildExecutionContext(agentConfig = {}) {
  /** @type {LLMToolExecutionContext} */
  const context = {
    workingDirectory: REPO_ROOT,
  };

  if (agentConfig.reasoningEffort) {
    context.reasoningEffort = agentConfig.reasoningEffort;
  }

  if (agentConfig.toolPermission) {
    context.toolPermission = agentConfig.toolPermission;
  }

  if (agentConfig.abortSignal) {
    context.abortSignal = agentConfig.abortSignal;
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
 * @param {LLMProviderName} provider
 * @param {NodeJS.ProcessEnv} environment
 * @returns {ProviderConfig}
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
        deployment: requireEnvironmentVariable(environment, 'AZURE_OPENAI_DEPLOYMENT_NAME'),
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
 * @param {RuntimeAgentConfig} [agentConfig]
 * @returns {RuntimeSettings}
 */
export function validateRuntimeEnvironment(environment = process.env, agentConfig = {}) {
  const configuredProvider = String(agentConfig.provider ?? 'openai').trim();
  const normalizedProvider = configuredProvider.toLowerCase();

  if (!SUPPORTED_PROVIDERS.has(/** @type {LLMProviderName} */(normalizedProvider))) {
    throw new Error(`Unsupported LLM provider: ${configuredProvider}`);
  }

  const provider = /** @type {LLMProviderName} */ (normalizedProvider);

  const providerConfig = resolveProviderConfig(provider, environment);
  const providerDefaultModel = provider === 'azure' && 'deployment' in providerConfig
    ? providerConfig.deployment
    : DEFAULT_MODELS[provider];
  const model = String(
    agentConfig.model
    ?? providerDefaultModel
    ?? '',
  ).trim();

  if (!model) {
    throw new Error(`Missing LLM model. Set it in runtime.json or pass --model for provider ${provider}.`);
  }

  const providers = /** @type {LLMProviderConfigs} */ ({
    [provider]: providerConfig,
  });

  return {
    provider,
    model,
    providers,
  };
}

/**
 * @param {string} builtInSystemPrompt
 * @param {string | undefined} projectSystemPrompt
 * @param {Array<{ skillId: string, description?: string }>} skillInventory
 */
function buildBaseSystemMessages(builtInSystemPrompt, projectSystemPrompt, skillInventory) {
  const layers = [builtInSystemPrompt.trim()];

  if (String(projectSystemPrompt ?? '').trim()) {
    layers.push(String(projectSystemPrompt).trim());
  }

  const skillInventoryMessage = buildSkillInventoryMessage(skillInventory);

  if (skillInventoryMessage) {
    layers.push(skillInventoryMessage);
  }

  return [{
    role: 'system',
    content: layers.join('\n\n'),
  }];
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
 * @param {ReturnType<typeof createRuntime>} runtime
 */
function createToolExecutor(runtime) {
  return {
    executeToolCall: async (toolCall, context, options = {}) => executeRuntimeToolCall({
      toolCall,
      environment: runtime,
      builtIns: {
        load_skill: true,
      },
      ...(context ? { context } : {}),
      ...(options.errorMode ? { errorMode: options.errorMode } : {}),
    }),
    executeToolCalls: async (toolCalls, context, options = {}) => executeRuntimeToolCalls({
      toolCalls,
      environment: runtime,
      builtIns: {
        load_skill: true,
      },
      ...(context ? { context } : {}),
      ...(options.errorMode ? { errorMode: options.errorMode } : {}),
    }),
  };
}

/**
 * @param {string} toolCallId
 * @param {string} toolName
 * @param {string} message
 */
function createRejectedToolResult(toolCallId, toolName, message) {
  return {
    ok: false,
    status: 'rejected',
    errorType: 'tool_execution_rejected',
    toolCallId,
    toolName,
    message,
  };
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
  if (typeof historyMessageLimit !== 'number' || !Number.isInteger(historyMessageLimit) || historyMessageLimit < 0) {
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
 *   onStreamChunk?: (chunk: {
 *     content?: string,
 *     reasoningContent?: string,
 *     reasoning?: string,
 *     reasoningText?: string,
 *     thinking?: string,
 *     error?: unknown,
 *     errors?: unknown[],
 *     warnings?: unknown[],
 *   }) => void,
 *   onToolCall?: (toolCall: { id: string, name: string, arguments?: string }) => void,
 *   onToolResult?: (toolResult: { id: string, name: string, result: unknown, arguments?: string, durationMs?: number }) => void,
 *   historyMessageLimit?: number,
 *   builtInSystemPrompt: string,
 *   projectSystemPrompt?: string,
 *   skillInventory: Array<{ skillId: string, description?: string }>,
 *   agentConfig?: RuntimeAgentConfig,
 *   approvalGate?: { requestApproval?: (request: Record<string, unknown>) => Promise<{ approved?: boolean, reason?: string }> },
 *   abortSignal?: AbortSignal,
 * }} params
 */
export async function runChatTurn({
  chat,
  userMessage,
  stream = true,
  onStreamChunk,
  onToolCall,
  onToolResult,
  historyMessageLimit,
  builtInSystemPrompt,
  projectSystemPrompt,
  skillInventory,
  approvalGate,
  agentConfig = {},
  abortSignal,
}) {
  const runtimeSettings = validateRuntimeEnvironment(process.env, agentConfig);
  const environmentDefaults = buildEnvironmentDefaults(agentConfig);
  const executionContext = buildExecutionContext({
    ...agentConfig,
    abortSignal,
  });
  const runtime = createRuntime({
    providers: runtimeSettings.providers,
    skillRoots: [SKILLS_ROOT],
    ...(Object.keys(environmentDefaults).length > 0 ? { defaults: environmentDefaults } : {}),
  });

  const pendingUserMessage = {
    role: 'user',
    content: userMessage,
    createdAt: new Date().toISOString(),
  };
  const contextMessages = selectContextMessages(chat.messages, historyMessageLimit);
  const toolExecutor = createToolExecutor(runtime);

  try {
    const result = await runCompletionLoop({
      initialState: {
        conversationMessages: [...contextMessages, pendingUserMessage],
        persistedMessages: [...chat.messages, pendingUserMessage],
        finalText: '',
      },
      emptyTextRetryLimit: 0,
      rejectedTextRetryLimit: 0,
      modelRequest: {
        mode: stream ? 'stream' : 'generate',
        environment: runtime,
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
      ...(abortSignal ? { abortSignal } : {}),
      buildMessages: async ({ state, transientInstruction }) => {
        const baseMessages = [
          ...buildBaseSystemMessages(builtInSystemPrompt, projectSystemPrompt, skillInventory),
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
      onToolCallsResponse: async ({ state, response, toolExecutor: providedToolExecutor }) => {
        const nextConversationMessages = [...state.conversationMessages, response.assistantMessage];
        const nextPersistedMessages = [...state.persistedMessages, response.assistantMessage];
        const activeToolExecutor = providedToolExecutor ?? toolExecutor;

        for (const toolCall of response.tool_calls ?? []) {
          const toolName = toolCall.function?.name ?? 'unknown_tool';
          const toolArguments = toolCall.function?.arguments;

          if (typeof onToolCall === 'function') {
            onToolCall({
              id: toolCall.id,
              name: toolName,
              arguments: toolArguments,
            });
          }

          let toolResult;
          const toolStartedAt = Date.now();

          if (executionContext.toolPermission === 'ask' && approvalGate?.requestApproval) {
            const approvalDecision = await approvalGate.requestApproval({
              toolCallId: toolCall.id,
              toolName,
              arguments: parseToolArguments(toolArguments ?? '{}'),
            });

            if (!approvalDecision?.approved) {
              toolResult = createRejectedToolResult(
                toolCall.id,
                toolName,
                approvalDecision?.reason || `Tool execution rejected: ${toolName}`,
              );
            }
          }

          if (typeof toolResult === 'undefined') {
            toolResult = await activeToolExecutor.executeToolCall(toolCall, {
              ...executionContext,
              toolCallId: toolCall.id,
            }, {
              errorMode: 'return-artifact',
            });
          }

          if (typeof onToolResult === 'function') {
            onToolResult({
              id: toolCall.id,
              name: toolName,
              result: toolResult,
              arguments: toolArguments,
              durationMs: Date.now() - toolStartedAt,
            });
          }

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
    await runtime.dispose();
  }
}
