// @ts-check
/**
 * Agent Runtime
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
 * - 2026-05-27: Tightened JSDoc boundary types so editor check-js sees runtime options and callbacks correctly.
 * - 2026-05-27: Passed an explicit built-in tool selection so shell, write, and directory creation tools are available outside read-only mode.
 * - 2026-05-27: Preserved plain-text final responses when the runtime rejects only the missing control-tool wrapper without persisting rejected retry drafts.
 * - 2026-05-27: Let `llm-runtime` own the default completion tool surface so simple chat does not expose mutating tools that require write evidence.
 * - 2026-05-27: Forwarded `final_answer_delta` events as assistant content for improved control-tool answer streaming.
 * - 2026-05-27: Routed stream-off turns through runtime `complete(...)` and preserved provider response metadata for CLI diagnostics.
 * - 2026-05-27: Exposed shared runtime selection so CLI startup diagnostics no longer duplicate provider/model default logic.
 * - 2026-05-27: Switched from `runCompletionLoop` to `complete(...)` so the loop defaults to control-tool termination; added `onFinalAnswerToolCall` / `onNeedUserInputToolCall` / `onBlockedToolCall` handlers that populate `finalText` from the model's control-tool output.
 * - 2026-05-26: Aligned runtime `load_skill` roots with opt-in global skill discovery.
 * - 2026-05-26: Point runtime defaults at `.env` and CLI flags.
 * - 2026-05-23: Renamed workspace root and AGENTS.md prompt parameters while preserving compatibility aliases.
 * - 2026-05-07: Added `llm-runtime` orchestration for the CLI.
 * - 2026-05-11: Layered built-in prompt, AGENTS.md, and skill inventory in explicit order.
 * - 2026-05-20: Added tool-result duration and argument context for richer CLI trace rendering.
 * - 2026-05-16: Migrated the host adapter to the `llm-runtime` 0.5.0 completion loop API.
 * - 2026-05-23: Added a CLI tool-call handler hook for terminal-native user input tools.
 */
import {
  complete,
  createRuntime,
  streamComplete,
} from 'llm-runtime';
import type {
  BuiltInToolSelection,
  LLMChatMessage,
  LLMEnvironmentOptions,
  LLMProviderConfigs,
  LLMProviderName,
  LLMRuntimeCompleteOptions,
  LLMToolExecutionContext,
  ProviderConfig,
  ReasoningEffort,
  ToolPermission,
} from 'llm-runtime';

import { buildSkillInventoryMessage, isGlobalSkillLoadingEnabled } from './agent-files.js';
import { GLOBAL_SKILLS_ROOTS, SKILLS_ROOT, WORKSPACE_ROOT } from './paths.js';

type RuntimeAgentConfig = {
  provider?: LLMProviderName;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  maxToolTurns?: number;
  toolPermission?: ToolPermission;
  reasoningEffort?: ReasoningEffort;
  webSearch?: boolean | { searchContextSize?: 'low' | 'medium' | 'high' };
};

type RuntimeSettings = {
  provider: LLMProviderName;
  model: string;
  providers: LLMProviderConfigs;
};

type RuntimeToolHandlerResult = {
  handled: boolean;
  result?: unknown;
};

type RuntimeToolCallHandler = (request: {
  toolCall: any;
  toolName: string;
  arguments?: string;
  parsedArguments: Record<string, unknown>;
  context: LLMToolExecutionContext;
  executeDefault: () => Promise<unknown>;
}) => Promise<RuntimeToolHandlerResult | undefined> | RuntimeToolHandlerResult | undefined;

type RunChatTurnParams = {
  chat: { id: string; messages: any[]; createdAt?: string; updatedAt?: string };
  userMessage: string;
  stream?: boolean;
  onStreamChunk?: (chunk: {
    content?: string;
    reasoningContent?: string;
    reasoning?: string;
    reasoningText?: string;
    thinking?: string;
    error?: unknown;
    errors?: unknown[];
    warnings?: unknown[];
  }) => void;
  onModelResponse?: (response: {
    type?: string;
    stopKind?: string;
    providerStopReason?: string;
    usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  }) => void;
  onToolCall?: (toolCall: { id: string; name: string; arguments?: string }) => void;
  onToolResult?: (toolResult: { id: string; name: string; result: unknown; arguments?: string; durationMs?: number }) => void;
  handleToolCall?: RuntimeToolCallHandler;
  historyMessageLimit?: number;
  builtInSystemPrompt: string;
  workspaceSystemPrompt?: string;
  projectSystemPrompt?: string;
  skillInventory: Array<{ skillId: string; description?: string }>;
  agentConfig?: RuntimeAgentConfig;
  approvalGate?: { requestApproval?: (request: Record<string, unknown>) => Promise<{ approved?: boolean; reason?: string }> };
  abortSignal?: AbortSignal;
};

const SUPPORTED_PROVIDERS: Set<LLMProviderName> = new Set([
  'openai',
  'anthropic',
  'google',
  'azure',
  'xai',
  'openai-compatible',
  'ollama',
]);

const DEFAULT_MODELS: Partial<Record<LLMProviderName, string>> = {
  openai: 'gpt-5',
};

/**
 * @param {NodeJS.ProcessEnv} [environment]
 * @param {RuntimeAgentConfig} [agentConfig]
 */
export function resolveRuntimeSelection(environment: NodeJS.ProcessEnv = process.env, agentConfig?: RuntimeAgentConfig) {
  const config = agentConfig ?? {};
  const provider = String(config.provider ?? 'openai').trim().toLowerCase();
  const providerDefaultModel = provider === 'azure'
    ? String(environment.AZURE_OPENAI_DEPLOYMENT_NAME ?? '').trim()
    : DEFAULT_MODELS[provider as LLMProviderName];
  const model = String(
    config.model
    ?? providerDefaultModel
    ?? '',
  ).trim();

  return { provider, model };
}

/**
 * @param {{ reasoningEffort?: ReasoningEffort, toolPermission?: ToolPermission }} [agentConfig]
 */
function buildEnvironmentDefaults(agentConfig?: Pick<RuntimeAgentConfig, 'reasoningEffort' | 'toolPermission'>) {
  const config = agentConfig ?? {};
  const defaults: NonNullable<LLMEnvironmentOptions['defaults']> = {};

  if (config.reasoningEffort) {
    defaults.reasoningEffort = config.reasoningEffort;
  }

  if (config.toolPermission) {
    defaults.toolPermission = config.toolPermission;
  }

  return defaults;
}

/**
 * @param {{ reasoningEffort?: ReasoningEffort, toolPermission?: ToolPermission, abortSignal?: AbortSignal }} [agentConfig]
 */
function buildExecutionContext(agentConfig?: Pick<RuntimeAgentConfig, 'reasoningEffort' | 'toolPermission'> & { abortSignal?: AbortSignal }) {
  const config = agentConfig ?? {};
  const context: LLMToolExecutionContext = {
    workingDirectory: WORKSPACE_ROOT,
  };

  if (config.reasoningEffort) {
    context.reasoningEffort = config.reasoningEffort;
  }

  if (config.toolPermission) {
    context.toolPermission = config.toolPermission;
  }

  if (config.abortSignal) {
    context.abortSignal = config.abortSignal;
  }

  return context;
}

/**
 * @param {{ toolPermission?: ToolPermission }} [agentConfig]
 * @returns {BuiltInToolSelection}
 */
function buildRuntimeBuiltIns(agentConfig?: Pick<RuntimeAgentConfig, 'toolPermission'>): BuiltInToolSelection {
  const config = agentConfig ?? {};
  const mutatingToolsEnabled = config.toolPermission !== 'read';

  return {
    load_skill: true,
    ask_user_input: true,
    read_file: true,
    list_files: true,
    search_files: true,
    path_exists: true,
    shell_cmd: mutatingToolsEnabled,
    write_file: mutatingToolsEnabled,
    create_directory: mutatingToolsEnabled,
    web_fetch: false,
  };
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
function resolveProviderConfig(provider: LLMProviderName, environment: NodeJS.ProcessEnv): ProviderConfig {
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
export function validateRuntimeEnvironment(environment: NodeJS.ProcessEnv = process.env, agentConfig: RuntimeAgentConfig = {}): RuntimeSettings {
  const runtimeSelection = resolveRuntimeSelection(environment, agentConfig);
  const configuredProvider = runtimeSelection.provider;
  const normalizedProvider = configuredProvider.toLowerCase();

  if (!SUPPORTED_PROVIDERS.has(normalizedProvider as LLMProviderName)) {
    throw new Error(`Unsupported LLM provider: ${configuredProvider}`);
  }

  const provider = normalizedProvider as LLMProviderName;

  const providerConfig = resolveProviderConfig(provider, environment);
  const model = runtimeSelection.model || (
    provider === 'azure' && 'deployment' in providerConfig
      ? providerConfig.deployment
      : ''
  );

  if (!model) {
    throw new Error(`Missing LLM model. Set AGENT_CLI_MODEL in .env or pass --model for provider ${provider}.`);
  }

  const providers = {
    [provider]: providerConfig,
  } as LLMProviderConfigs;

  return {
    provider,
    model,
    providers,
  };
}

export function buildRuntimeSkillRoots() {
  return [
    ...(isGlobalSkillLoadingEnabled() ? GLOBAL_SKILLS_ROOTS : []),
    SKILLS_ROOT,
  ];
}

/**
 * @param {string} builtInSystemPrompt
 * @param {string | undefined} workspaceSystemPrompt
 * @param {Array<{ skillId: string, description?: string }>} skillInventory
 */
function buildBaseSystemMessages(builtInSystemPrompt, workspaceSystemPrompt, skillInventory) {
  const layers = [builtInSystemPrompt.trim()];

  if (String(workspaceSystemPrompt ?? '').trim()) {
    layers.push(String(workspaceSystemPrompt).trim());
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

const RUNTIME_CONTROL_TOOL_NAMES = new Set(['final_answer', 'need_user_input', 'blocked']);
const REJECTED_TEXT_RESPONSE_PREFIX = 'Assistant response did not complete the task with required evidence:';

/**
 * @param {unknown} value
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} raw
 * @param {string | undefined} fallbackType
 */
function extractModelResponseMetadata(raw: unknown, fallbackType: string | undefined) {
  if (!isRecord(raw)) {
    return fallbackType ? { type: fallbackType } : undefined;
  }

  const response = raw as Record<string, unknown>;
  const metadata: { type?: string; stopKind?: string; providerStopReason?: string; usage?: Record<string, unknown> } = {};

  if (typeof response.type === 'string' && response.type.trim()) {
    metadata.type = response.type;
  } else if (fallbackType) {
    metadata.type = fallbackType;
  }

  if (typeof response.stopKind === 'string' && response.stopKind.trim()) {
    metadata.stopKind = response.stopKind;
  }

  if (typeof response.providerStopReason === 'string' && response.providerStopReason.trim()) {
    metadata.providerStopReason = response.providerStopReason;
  }

  if (isRecord(response.usage)) {
    metadata.usage = response.usage;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

/**
 * @param {((response: {
 *   type?: string,
 *   stopKind?: string,
 *   providerStopReason?: string,
 *   usage?: { inputTokens?: number, outputTokens?: number, totalTokens?: number },
 * }) => void) | undefined} onModelResponse
 * @param {unknown} raw
 * @param {string | undefined} fallbackType
 */
function emitModelResponse(onModelResponse, raw, fallbackType) {
  if (typeof onModelResponse !== 'function') {
    return;
  }

  const metadata = extractModelResponseMetadata(raw, fallbackType);
  if (metadata) {
    onModelResponse(metadata);
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
 * @param {unknown} content
 */
function parseSerializedToolResult(content) {
  if (typeof content !== 'string') {
    return content;
  }

  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

/**
 * @param {unknown} error
 */
function extractRejectedTextResponse(error) {
  const message = String(error ?? '');

  if (!message.startsWith(REJECTED_TEXT_RESPONSE_PREFIX)) {
    return '';
  }

  return message.slice(REJECTED_TEXT_RESPONSE_PREFIX.length).trim();
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
 * @param {any[]} runtimeMessages
 * @param {number} inputMessageCount
 */
function selectNewRuntimeMessages(runtimeMessages, inputMessageCount) {
  return runtimeMessages
    .slice(inputMessageCount)
    .filter((message) => message?.role !== 'system');
}

/**
 * @param {any[]} messages
 * @param {{
 *   onToolCall?: (toolCall: { id: string, name: string, arguments?: string }) => void,
 *   onToolResult?: (toolResult: { id: string, name: string, result: unknown, arguments?: string }) => void,
 * }} callbacks
 */
function emitCompletedToolEvents(messages, callbacks) {
  const toolCallsById = new Map();

  for (const message of messages) {
    if (message?.role !== 'assistant') {
      continue;
    }

    for (const toolCall of message.tool_calls ?? []) {
      const toolName = toolCall.function?.name ?? 'unknown_tool';
      if (RUNTIME_CONTROL_TOOL_NAMES.has(toolName)) {
        continue;
      }

      toolCallsById.set(toolCall.id, toolCall);
      callbacks.onToolCall?.({
        id: toolCall.id,
        name: toolName,
        arguments: toolCall.function?.arguments,
      });
    }
  }

  for (const message of messages) {
    if (message?.role !== 'tool' || !message.tool_call_id) {
      continue;
    }

    const toolCall = toolCallsById.get(message.tool_call_id);
    if (!toolCall) {
      continue;
    }

    callbacks.onToolResult?.({
      id: message.tool_call_id,
      name: toolCall.function?.name ?? 'unknown_tool',
      result: parseSerializedToolResult(message.content),
      arguments: toolCall.function?.arguments,
    });
  }
}

/**
 * @param {RunChatTurnParams} params
 */
export async function runChatTurn({
  chat,
  userMessage,
  stream = true,
  onStreamChunk,
  onModelResponse,
  onToolCall,
  onToolResult,
  handleToolCall,
  historyMessageLimit,
  builtInSystemPrompt,
  workspaceSystemPrompt,
  projectSystemPrompt,
  skillInventory,
  approvalGate,
  agentConfig,
  abortSignal,
}: RunChatTurnParams) {
  const runtimeAgentConfig: RuntimeAgentConfig = agentConfig ?? {};
  const runtimeSettings = validateRuntimeEnvironment(process.env, runtimeAgentConfig);
  const environmentDefaults = buildEnvironmentDefaults(runtimeAgentConfig);
  const executionContext = buildExecutionContext({
    ...runtimeAgentConfig,
    abortSignal,
  });
  const runtime = createRuntime({
    providers: runtimeSettings.providers,
    skillRoots: buildRuntimeSkillRoots(),
    ...(Object.keys(environmentDefaults).length > 0 ? { defaults: environmentDefaults } : {}),
  });

  const pendingUserMessage = {
    role: 'user',
    content: userMessage,
    createdAt: new Date().toISOString(),
  };
  const contextMessages = selectContextMessages(chat.messages, historyMessageLimit);
  const systemMessages = buildBaseSystemMessages(
    builtInSystemPrompt,
    workspaceSystemPrompt ?? projectSystemPrompt,
    skillInventory,
  );

  try {
    const persistedMessages = [...chat.messages, pendingUserMessage];
    const toolStartTimes = new Map();
    const emittedToolCallIds = new Set();
    let finalText = '';
    let streamedAssistantText = '';
    let fallbackRejectedText = '';
    let failureError: string | null = null;

    const completionOptions: LLMRuntimeCompleteOptions = {
      environment: runtime,
      provider: runtimeSettings.provider,
      model: runtimeSettings.model,
      messages: [...systemMessages, ...contextMessages, pendingUserMessage],
      builtIns: buildRuntimeBuiltIns(runtimeAgentConfig),
      context: { ...executionContext, ...(abortSignal ? { abortSignal } : {}) },
      ...(typeof runtimeAgentConfig.temperature === 'number' ? { temperature: runtimeAgentConfig.temperature } : {}),
      ...(typeof runtimeAgentConfig.maxTokens === 'number' ? { maxTokens: runtimeAgentConfig.maxTokens } : {}),
      ...(typeof runtimeAgentConfig.maxToolTurns === 'number' ? { maxConsecutiveToolTurns: runtimeAgentConfig.maxToolTurns } : {}),
      ...(runtimeAgentConfig.webSearch !== undefined ? { webSearch: runtimeAgentConfig.webSearch } : {}),
      onToolApproval: async ({ toolCall, toolName, parsedArguments }) => {
        if (executionContext.toolPermission !== 'ask' || typeof approvalGate?.requestApproval !== 'function') {
          return { approved: true };
        }
        const decision = await approvalGate.requestApproval({
          toolCallId: toolCall.id,
          toolName,
          arguments: parsedArguments,
        });
        if (decision?.approved) {
          return { approved: true };
        }
        return {
          approved: false,
          reason: decision?.reason || `Tool execution rejected: ${toolName}`,
        };
      },
      ...(typeof handleToolCall === 'function'
        ? {
          onToolCall: async ({ toolCall, toolName, parsedArguments, context, executeDefault }) => {
            if (typeof onToolCall === 'function' && !emittedToolCallIds.has(toolCall.id)) {
              emittedToolCallIds.add(toolCall.id);
              toolStartTimes.set(toolCall.id, Date.now());
              onToolCall({
                id: toolCall.id,
                name: toolName,
                arguments: toolCall.function?.arguments,
              });
            }
            const handlerResult = await handleToolCall({
              toolCall,
              toolName,
              arguments: toolCall.function?.arguments,
              parsedArguments,
              context,
              executeDefault,
            });
            return {
              handled: Boolean(handlerResult?.handled),
              result: handlerResult?.result,
            };
          },
        }
        : {}),
    };

    if (!stream) {
      const completionResult = await complete(completionOptions);
      emitModelResponse(onModelResponse, completionResult.raw, undefined);

      if (completionResult.status === 'failed') {
        const rejectedText = extractRejectedTextResponse(completionResult.error);
        if (rejectedText) {
          finalText = rejectedText;
        } else {
          failureError = String(completionResult.error || 'LLM turn failed.');
        }
      } else if (completionResult.status === 'tool_calls') {
        const pendingNames = (completionResult.toolCalls ?? [])
          .map((tc) => tc.function?.name ?? 'unknown_tool')
          .join(', ');
        failureError = `LLM turn paused for host-handled tools (${pendingNames || 'none'}). Provide a handleToolCall handler that resolves them, or pass them as executable extraTools.`;
      } else if (completionResult.status === 'completed' && typeof completionResult.output === 'string') {
        finalText = completionResult.output;
      } else {
        failureError = `LLM turn failed with status ${completionResult.status}.`;
      }

      const runtimeMessages = selectNewRuntimeMessages(
        completionResult.messages ?? [],
        completionOptions.messages.length,
      );
      emitCompletedToolEvents(runtimeMessages, { onToolCall, onToolResult });

      for (const message of runtimeMessages) {
        persistedMessages.push({
          ...message,
          createdAt: new Date().toISOString(),
        });
      }

      if (finalText.trim() && !runtimeMessages.some((message) => (
        message?.role === 'assistant' && String(message.content ?? '') === finalText
      ))) {
        persistedMessages.push({
          role: 'assistant',
          content: finalText,
          createdAt: new Date().toISOString(),
        });
      }
    }

    if (stream) {
      for await (const event of streamComplete(completionOptions)) {
        switch (event.type) {
          case 'text_delta':
            break;
          case 'reasoning_delta':
            if (typeof onStreamChunk === 'function') {
              onStreamChunk({ reasoningContent: event.delta });
            }
            break;
          case 'final_answer_delta':
            streamedAssistantText += event.delta;
            if (typeof onStreamChunk === 'function') {
              onStreamChunk({ content: event.delta });
            }
            break;
          case 'assistant_message':
            emitModelResponse(
              onModelResponse,
              undefined,
              event.message.tool_calls?.length ? 'tool_calls' : 'text',
            );
            if (event.message.tool_calls?.length) {
              persistedMessages.push({
                ...event.message,
                createdAt: new Date().toISOString(),
              });
            }
            break;
          case 'tool_start':
            toolStartTimes.set(event.toolCall.id, Date.now());
            if (typeof onToolCall === 'function' && !emittedToolCallIds.has(event.toolCall.id)) {
              emittedToolCallIds.add(event.toolCall.id);
              onToolCall({
                id: event.toolCall.id,
                name: event.toolCall.function?.name ?? 'unknown_tool',
                arguments: event.toolCall.function?.arguments,
              });
            }
            break;
          case 'tool_result':
          case 'tool_error': {
            const resultValue = event.type === 'tool_result' ? event.result : { error: event.error };
            const toolName = event.toolCall.function?.name ?? 'unknown_tool';
            const startedAt = toolStartTimes.get(event.toolCall.id);
            if (typeof onToolResult === 'function') {
              onToolResult({
                id: event.toolCall.id,
                name: toolName,
                result: resultValue,
                arguments: event.toolCall.function?.arguments,
                ...(typeof startedAt === 'number' ? { durationMs: Date.now() - startedAt } : {}),
              });
            }
            persistedMessages.push({
              role: 'tool',
              tool_call_id: event.toolCall.id,
              content: serializeToolResult(resultValue),
              createdAt: new Date().toISOString(),
            });
            break;
          }
          case 'completed':
            emitModelResponse(onModelResponse, event.result.raw, undefined);
            if (event.result.status === 'completed' && typeof event.result.output === 'string') {
              finalText = event.result.output;
              if (typeof onStreamChunk === 'function') {
                const remainingFinalText = finalText.startsWith(streamedAssistantText)
                  ? finalText.slice(streamedAssistantText.length)
                  : (streamedAssistantText ? '' : finalText);
                if (remainingFinalText) {
                  streamedAssistantText += remainingFinalText;
                  onStreamChunk({ content: remainingFinalText });
                }
              }
              persistedMessages.push({
                role: 'assistant',
                content: event.result.output,
                createdAt: new Date().toISOString(),
              });
            }
            break;
          case 'tool_calls': {
            emitModelResponse(onModelResponse, event.result.raw, undefined);
            const pendingNames = (event.result.toolCalls ?? [])
              .map((tc) => tc.function?.name ?? 'unknown_tool')
              .join(', ');
            failureError = `LLM turn paused for host-handled tools (${pendingNames || 'none'}). Provide a handleToolCall handler that resolves them, or pass them as executable extraTools.`;
            break;
          }
          case 'failed':
            emitModelResponse(onModelResponse, event.result.raw, undefined);
            {
              const rejectedText = extractRejectedTextResponse(event.result.error);
              if (rejectedText) {
                fallbackRejectedText = rejectedText;
              } else {
                failureError = String(event.result.error || `LLM turn failed with status ${event.result.status}.`);
              }
            }
            break;
          default:
            break;
        }
      }
    }

    if (!finalText.trim() && fallbackRejectedText) {
      finalText = fallbackRejectedText;
      if (typeof onStreamChunk === 'function' && !streamedAssistantText) {
        streamedAssistantText = fallbackRejectedText;
        onStreamChunk({ content: fallbackRejectedText });
      }
      persistedMessages.push({
        role: 'assistant',
        content: fallbackRejectedText,
        createdAt: new Date().toISOString(),
      });
    }

    if (failureError) {
      throw new Error(failureError);
    }

    if (!finalText.trim()) {
      throw new Error('LLM turn ended without a final text response.');
    }

    return {
      assistantText: finalText.trim(),
      messages: persistedMessages,
    };
  } finally {
    await runtime.dispose();
  }
}
