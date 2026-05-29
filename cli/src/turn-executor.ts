/**
 * Agent CLI Turn Executor
 *
 * Purpose:
 * - Connect CLI I/O to streamed runtime events and persisted chat updates.
 *
 * Key features:
 * - Streams assistant text to stdout while keeping diagnostics on stderr.
 * - Persists completed chats and optional stream-trace events.
 * - Formats verbose tool activity through a dedicated trace renderer.
 *
 * Recent changes:
 * - 2026-05-28: Restored pending dots after verbose continuation diagnostics while waiting for assistant text.
 * - 2026-05-26: Removed agent-id-specific persisted runtime config and chat persistence.
 * - 2026-05-23: Renamed from agent-runtime to clarify this is the CLI turn executor.
 * - 2026-05-23: Renamed root prompt option from project to workspace terminology.
 * - 2026-05-16: Added structured verbose tool-call and tool-result rendering.
 * - 2026-05-23: Added TTY pending animation and ask_user_input terminal prompts.
 */
import { loadPersistedRuntimeConfig } from '../../core/agent-config.js';
import { getBuiltInSystemPrompt } from '../../core/agent-files.js';
import {
  persistCompletedChat,
  persistStreamTraceEvents,
} from '../../core/chat-store.js';
import { runChatTurn } from '../../core/agent-runtime.js';
import {
  collectHumanInputAnswer,
  type HumanInputPrompt,
  isHumanInputToolName,
  parseHumanInputRequest,
} from './human-input-ui.js';
import { createPendingDisplay } from './pending-display.js';
import {
  formatModelResponseDiagnostic,
  formatToolCallDiagnostic,
  formatToolResultDiagnostic,
} from './tool-trace-renderer.js';
import type { CliIo } from './terminal-io.js';
import { createVerboseDisplay } from './verbose-display.js';

export type { CliIo, WritableSink } from './terminal-io.js';

export interface SkillInventoryItem {
  skillId: string;
  description?: string;
}

export interface PersistedMessage extends Record<string, unknown> {
  role?: string;
  content?: string;
  createdAt?: string;
}

export interface PersistedChat {
  id: string;
  messages: PersistedMessage[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ApprovalGate {
  requestApproval?: (
    request: Record<string, unknown>,
  ) => Promise<{ approved?: boolean; reason?: string }>;
}

export interface StreamTraceEvent {
  type: string;
  text: string;
  createdAt: string;
  stopKind?: string;
  finishReason?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface ResolveEffectiveAgentConfigOptions {
  optionAgentConfig?: Record<string, unknown>;
  runtimeOverrides?: Record<string, unknown>;
}

export interface CreateTurnExecutorOptions {
  io: CliIo;
  verbose: boolean;
  streamOff: boolean;
  agentConfig: Record<string, unknown>;
  workspaceSystemPrompt?: string;
  projectSystemPrompt?: string;
  skillInventory: SkillInventoryItem[];
}

export interface ExecuteTurnParams {
  chat: PersistedChat;
  message: string;
  approvalGate?: ApprovalGate;
  abortSignal?: AbortSignal;
  onAssistantChunk?: (chunkText: string) => Promise<void> | void;
  inputPrompt?: HumanInputPrompt;
}

function shouldHoldPotentialHumanInputPrompt(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trimStart().toLowerCase();
  if (!normalized) {
    return false;
  }

  const promptPrefixes = [
    'please select',
    'select',
    'please choose',
    'choose',
    'reply with',
    'answer with',
  ];

  return promptPrefixes.some((prefix) => (
    prefix.startsWith(normalized) || normalized.startsWith(prefix)
  ));
}

function normalizeStreamTraceUsage(value: unknown): StreamTraceEvent['usage'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const usage = value as Record<string, unknown>;
  const normalizedUsage: NonNullable<StreamTraceEvent['usage']> = {};

  for (const key of ['inputTokens', 'outputTokens', 'totalTokens'] as const) {
    if (typeof usage[key] === 'number' && Number.isFinite(usage[key])) {
      normalizedUsage[key] = usage[key];
    }
  }

  return Object.keys(normalizedUsage).length > 0 ? normalizedUsage : undefined;
}

function isToolContinuationModelResponse(response: {
  stopKind?: unknown;
  providerStopReason?: unknown;
}): boolean {
  const stopKind = typeof response.stopKind === 'string' ? response.stopKind.toLowerCase() : '';
  const finishReason = typeof response.providerStopReason === 'string' ? response.providerStopReason.toLowerCase() : '';

  return stopKind.includes('tool') || finishReason.includes('tool');
}

export async function resolveEffectiveAgentConfig(
  options: ResolveEffectiveAgentConfigOptions = {},
): Promise<Record<string, unknown>> {
  const persistedAgentConfig = loadPersistedRuntimeConfig();
  const baseAgentConfig = {
    ...persistedAgentConfig,
    ...(options.optionAgentConfig ?? {}),
  };

  return {
    ...baseAgentConfig,
    ...(options.runtimeOverrides ?? {}),
  };
}

export function createTurnExecutor(options: CreateTurnExecutorOptions) {
  const builtInSystemPrompt = getBuiltInSystemPrompt();
  const stderr = options.io.stderr ?? process.stderr;

  return async function executeTurn({
    chat,
    message,
    approvalGate,
    abortSignal,
    onAssistantChunk,
    inputPrompt,
  }: ExecuteTurnParams) {
    const streamTraceEnabled = options.agentConfig.streamTrace === true;
    const streamTraceEvents: StreamTraceEvent[] = [];
    const pendingTextTraceEvents: StreamTraceEvent[] = [];
    const displayedVerboseToolCallIds = new Set<string>();
    let lastStreamType: string | null = null;
    let heldAssistantText = '';
    const pendingDisplay = createPendingDisplay(options.io.stdout);
    const verboseDisplay = createVerboseDisplay({
      stdout: options.io.stdout,
      stderr,
      clearPending: () => pendingDisplay.clear(),
      enabled: options.verbose,
    });
    const pastMessages = Number(options.agentConfig.pastMessages);
    const historyMessageLimit = Number.isInteger(pastMessages) && pastMessages >= 0
      ? pastMessages
      : 0;

    function writeAssistantText(text: string): void {
      pendingDisplay.writeText(text);
      verboseDisplay.noteAssistantText(text);
      void onAssistantChunk?.(text);
    }

    function flushHeldAssistantText(): void {
      if (!heldAssistantText) {
        return;
      }

      pendingDisplay.clear();
      verboseDisplay.beforeAssistantText(lastStreamType);
      writeAssistantText(heldAssistantText);
      heldAssistantText = '';
    }

    function annotatePendingTextTraceEvents(response: {
      stopKind?: unknown;
      providerStopReason?: unknown;
      usage?: unknown;
    }): void {
      if (pendingTextTraceEvents.length === 0) {
        return;
      }

      const stopKind = typeof response.stopKind === 'string' && response.stopKind.trim()
        ? response.stopKind
        : undefined;
      const finishReason = typeof response.providerStopReason === 'string' && response.providerStopReason.trim()
        ? response.providerStopReason
        : undefined;
      const usage = normalizeStreamTraceUsage(response.usage);

      for (const event of pendingTextTraceEvents) {
        if (stopKind) {
          event.stopKind = stopKind;
        }

        if (finishReason) {
          event.finishReason = finishReason;
        }

        if (usage) {
          event.usage = usage;
        }
      }

      pendingTextTraceEvents.length = 0;
    }

    function resumePendingAssistantText(): void {
      if (!options.streamOff) {
        pendingDisplay.start({ separateFromText: true });
      }
    }

    try {
      if (!options.streamOff) {
        pendingDisplay.start();
      }

      const turnResult = await runChatTurn({
        chat,
        userMessage: message,
        stream: !options.streamOff,
        approvalGate,
        abortSignal,
        onStreamChunk: options.streamOff
          ? undefined
          : async (chunk) => {
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

              if (options.verbose) {
                pendingDisplay.clear();
                const diagnostic = `warning: ${warningText}\n`;
                verboseDisplay.writeDiagnostic(diagnostic, 'warning');
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

              if (options.verbose) {
                pendingDisplay.clear();
                const diagnostic = `error: ${errorText}\n`;
                verboseDisplay.writeDiagnostic(diagnostic, 'error');
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
              if (options.verbose) {
                verboseDisplay.writeReasoning(reasoningText, lastStreamType);
                lastStreamType = 'reasoning';
              }

              if (streamTraceEnabled) {
                streamTraceEvents.push({
                  type: 'reasoning',
                  text: reasoningText,
                  createdAt: new Date().toISOString(),
                });
              }

              if (!options.verbose) {
                lastStreamType = 'reasoning';
              }
            }

            if (chunk.content) {
              const closedReasoning = verboseDisplay.closeReasoning();
              if (!closedReasoning) {
                pendingDisplay.clear();
                verboseDisplay.beforeAssistantText(lastStreamType);
              }

              if (heldAssistantText || shouldHoldPotentialHumanInputPrompt(chunk.content)) {
                heldAssistantText += chunk.content;
              } else {
                writeAssistantText(chunk.content);
              }

              if (streamTraceEnabled) {
                const textTraceEvent: StreamTraceEvent = {
                  type: 'text',
                  text: chunk.content,
                  createdAt: new Date().toISOString(),
                };

                streamTraceEvents.push(textTraceEvent);
                pendingTextTraceEvents.push(textTraceEvent);
              }

              lastStreamType = 'text';
            }
          },
        onModelResponse: (response: { stopKind?: unknown; providerStopReason?: unknown; usage?: unknown }) => {
            if (streamTraceEnabled) {
              annotatePendingTextTraceEvents(response);
            }

            if (options.verbose) {
              pendingDisplay.clear();
              const diagnostic = formatModelResponseDiagnostic(response);
              if (diagnostic) {
                verboseDisplay.writeDiagnostic(diagnostic, 'model_response');
                lastStreamType = 'model_response';
              }
              if (isToolContinuationModelResponse(response)) {
                resumePendingAssistantText();
              }
            } else if (!options.streamOff && isToolContinuationModelResponse(response)) {
              resumePendingAssistantText();
            }
          },
        onToolCall: (toolCall) => {
            const humanInputRequest = parseHumanInputRequest(
              toolCall.name,
              toolCall.arguments,
              toolCall.id,
            );
            const humanInputToolCall = isHumanInputToolName(toolCall.name);

            if (humanInputRequest) {
              heldAssistantText = '';
            } else {
              flushHeldAssistantText();
            }

            if (options.verbose || humanInputRequest) {
              pendingDisplay.clear();
            } else if (!options.streamOff) {
              resumePendingAssistantText();
            }

            if (options.verbose) {
              if (!displayedVerboseToolCallIds.has(toolCall.id)) {
                displayedVerboseToolCallIds.add(toolCall.id);
                const diagnostic = formatToolCallDiagnostic(toolCall);
                const displayDiagnostic = humanInputToolCall ? `${diagnostic}\n\n` : diagnostic;
                verboseDisplay.writeDiagnostic(displayDiagnostic, 'tool_call');
              }
              if (!humanInputRequest) {
                resumePendingAssistantText();
              }
            }

            if (streamTraceEnabled) {
              streamTraceEvents.push({
                type: 'tool',
                text: toolCall.arguments ? `${toolCall.name} ${toolCall.arguments}` : toolCall.name,
                createdAt: new Date().toISOString(),
              });
            }

            lastStreamType = 'tool_call';
          },
        onToolResult: (toolResult) => {
            if (options.verbose) {
              pendingDisplay.clear();
              if (!displayedVerboseToolCallIds.has(toolResult.id)) {
                displayedVerboseToolCallIds.add(toolResult.id);
                verboseDisplay.writeDiagnostic(formatToolCallDiagnostic(toolResult), 'tool_call');
              }
              const diagnostic = formatToolResultDiagnostic(toolResult);
              verboseDisplay.writeDiagnostic(diagnostic, 'tool_result');
              resumePendingAssistantText();
            } else if (!options.streamOff) {
              resumePendingAssistantText();
            }

            lastStreamType = 'tool_result';
          },
        historyMessageLimit,
        handleToolCall: async ({ toolCall, toolName, arguments: toolArguments }) => {
          const request = parseHumanInputRequest(toolName, toolArguments, toolCall.id);
          if (!request) {
            return { handled: false };
          }

          heldAssistantText = '';
          pendingDisplay.clear();
          const humanInputOutput = options.verbose ? stderr : options.io.stdout;
          const result = await collectHumanInputAnswer(request, inputPrompt, humanInputOutput);
          pendingDisplay.noteExternalOutput();
          resumePendingAssistantText();

          return {
            handled: true,
            result,
          };
        },
        builtInSystemPrompt,
        workspaceSystemPrompt: options.workspaceSystemPrompt ?? options.projectSystemPrompt,
        projectSystemPrompt: options.projectSystemPrompt,
        skillInventory: options.skillInventory,
        agentConfig: options.agentConfig,
      });

      verboseDisplay.closeReasoning();
      flushHeldAssistantText();

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

      chat.messages = turnResult.messages;

      if (options.streamOff) {
        pendingDisplay.clear();
        verboseDisplay.beforeAssistantText(lastStreamType);
        options.io.stdout.write(`${turnResult.assistantText}\n`);
      } else if (pendingDisplay.hasWrittenText()) {
        pendingDisplay.clear();
        options.io.stdout.write('\n');
      } else {
        pendingDisplay.clear();
      }

      return turnResult;
    } catch (error) {
      verboseDisplay.closeReasoning();
      pendingDisplay.clear();
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
  };
}
