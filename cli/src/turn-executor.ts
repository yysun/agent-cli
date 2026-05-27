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
  parseHumanInputRequest,
} from './human-input-ui.js';
import { createPendingDisplay } from './pending-display.js';
import {
  formatModelResponseDiagnostic,
  formatToolCallDiagnostic,
  formatToolResultDiagnostic,
} from './tool-trace-renderer.js';

const ANSI_GRAY = '\u001b[90m';
const ANSI_RESET = '\u001b[0m';

export interface WritableSink {
  isTTY?: boolean;
  write(chunk: string): void;
}

export interface CliIo {
  stdout: WritableSink;
  stderr?: WritableSink;
}

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

function writeTypeTransitionSeparator(
  stdout: WritableSink,
  previousType: string | null,
  nextType: string,
): void {
  if (previousType && previousType !== nextType) {
    stdout.write('\n');
  }
}

function writeDiagnostic(stderr: WritableSink, kind: string, text: string): void {
  stderr.write(`${kind}: ${text}\n`);
}

function grayForTerminal(stderr: WritableSink, text: string): string {
  return stderr.isTTY ? `${ANSI_GRAY}${text}${ANSI_RESET}` : text;
}

function stripLeadingLineBreaks(text: string): string {
  return text.replace(/^\n+/, '');
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
    let lastStreamType: string | null = null;
    let reasoningDiagnosticOpen = false;
    let heldAssistantText = '';
    const pendingDisplay = createPendingDisplay(options.io.stdout);
    const pastMessages = Number(options.agentConfig.pastMessages);
    const historyMessageLimit = Number.isInteger(pastMessages) && pastMessages >= 0
      ? pastMessages
      : 0;

    function beginReasoningDiagnostic(): void {
      if (reasoningDiagnosticOpen) {
        return;
      }

      pendingDisplay.clear();
      writeTypeTransitionSeparator(stderr, lastStreamType, 'reasoning');
      stderr.write(stderr.isTTY ? ANSI_GRAY : '');
      reasoningDiagnosticOpen = true;
      lastStreamType = 'reasoning';
    }

    function writeReasoningDiagnostic(text: string): void {
      beginReasoningDiagnostic();
      stderr.write(text);
    }

    function closeReasoningDiagnostic(): boolean {
      if (!reasoningDiagnosticOpen) {
        return false;
      }

      stderr.write(stderr.isTTY ? `${ANSI_RESET}\n\n` : '\n\n');
      reasoningDiagnosticOpen = false;
      lastStreamType = 'reasoning';
      return true;
    }

    function writeAssistantText(text: string): void {
      pendingDisplay.writeText(text);
      void onAssistantChunk?.(text);
    }

    function flushHeldAssistantText(): void {
      if (!heldAssistantText) {
        return;
      }

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
                const closedReasoning = closeReasoningDiagnostic();
                if (!closedReasoning) {
                  writeTypeTransitionSeparator(stderr, lastStreamType, 'warning');
                }
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

              if (options.verbose) {
                pendingDisplay.clear();
                const closedReasoning = closeReasoningDiagnostic();
                if (!closedReasoning) {
                  writeTypeTransitionSeparator(stderr, lastStreamType, 'error');
                }
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
              if (options.verbose) {
                writeReasoningDiagnostic(reasoningText);
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
              const closedReasoning = closeReasoningDiagnostic();
              if (!closedReasoning && options.verbose && lastStreamType === 'tool_result') {
                options.io.stdout.write('\n');
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
        onModelResponse: options.streamOff
          ? undefined
          : (response: { stopKind?: unknown; providerStopReason?: unknown; usage?: unknown }) => {
            if (streamTraceEnabled) {
              annotatePendingTextTraceEvents(response);
            }

            if (options.verbose) {
              pendingDisplay.clear();
              const closedReasoning = closeReasoningDiagnostic();
              const diagnostic = formatModelResponseDiagnostic(response);
              if (diagnostic) {
                stderr.write(grayForTerminal(stderr, closedReasoning ? stripLeadingLineBreaks(diagnostic) : diagnostic));
              }
            }
          },
        onToolCall: options.streamOff
          ? undefined
          : (toolCall) => {
            pendingDisplay.clear();
            const humanInputRequest = parseHumanInputRequest(
              toolCall.name,
              toolCall.arguments,
              toolCall.id,
            );

            if (humanInputRequest) {
              heldAssistantText = '';
            } else {
              flushHeldAssistantText();
            }

            if (options.verbose) {
              const closedReasoning = closeReasoningDiagnostic();
              const diagnostic = formatToolCallDiagnostic(toolCall);
              const displayDiagnostic = humanInputRequest ? `${diagnostic}\n\n` : diagnostic;
              const outputDiagnostic = closedReasoning ? stripLeadingLineBreaks(displayDiagnostic) : displayDiagnostic;
              stderr.write(humanInputRequest ? grayForTerminal(stderr, outputDiagnostic) : outputDiagnostic);
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
        onToolResult: options.streamOff
          ? undefined
          : (toolResult) => {
            pendingDisplay.clear();

            if (options.verbose) {
              const closedReasoning = closeReasoningDiagnostic();
              const diagnostic = formatToolResultDiagnostic(toolResult);
              stderr.write(grayForTerminal(stderr, closedReasoning ? stripLeadingLineBreaks(diagnostic) : diagnostic));
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
          const result = await collectHumanInputAnswer(request, inputPrompt, options.io.stdout);
          if (!options.streamOff) {
            pendingDisplay.start();
          }

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

      closeReasoningDiagnostic();
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
        options.io.stdout.write(`${turnResult.assistantText}\n`);
      } else if (pendingDisplay.hasWrittenText()) {
        pendingDisplay.clear();
        options.io.stdout.write('\n');
      } else {
        pendingDisplay.clear();
      }

      return turnResult;
    } catch (error) {
      closeReasoningDiagnostic();
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
