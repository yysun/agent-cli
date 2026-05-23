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
} from '../../core/world-store.js';
import { runChatTurn } from '../../core/agent-runtime.js';
import {
  collectHumanInputAnswer,
  type HumanInputPrompt,
  parseHumanInputRequest,
} from './human-input-ui.js';
import { createPendingDisplay } from './pending-display.js';
import {
  formatToolCallDiagnostic,
  formatToolResultDiagnostic,
} from './tool-trace-renderer.js';

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
}

export interface ResolveEffectiveAgentConfigOptions {
  optionAgentConfig?: Record<string, unknown>;
  runtimeOverrides?: Record<string, unknown>;
  agentId?: string;
}

export interface CreateTurnExecutorOptions {
  io: CliIo;
  verbose: boolean;
  streamOff: boolean;
  agentId?: string;
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

export async function resolveEffectiveAgentConfig(
  options: ResolveEffectiveAgentConfigOptions = {},
): Promise<Record<string, unknown>> {
  const persistedAgentConfig = await loadPersistedRuntimeConfig({
    agentId: options.agentId,
  });
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
    let lastStreamType: string | null = null;
    const pendingDisplay = createPendingDisplay(options.io.stdout);
    const pastMessages = Number(options.agentConfig.pastMessages);
    const historyMessageLimit = Number.isInteger(pastMessages) && pastMessages >= 0
      ? pastMessages
      : 0;

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

              if (options.verbose) {
                pendingDisplay.clear();
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
              if (options.verbose) {
                pendingDisplay.clear();
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

              lastStreamType = 'reasoning';
            }

            if (chunk.content) {
              pendingDisplay.writeText(chunk.content);
              await onAssistantChunk?.(chunk.content);

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
        onToolCall: options.streamOff
          ? undefined
          : (toolCall) => {
            if (options.verbose) {
              pendingDisplay.clear();
              stderr.write(formatToolCallDiagnostic(toolCall));
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
        onToolResult: options.streamOff
          ? undefined
          : (toolResult) => {
            if (options.verbose) {
              pendingDisplay.clear();
              stderr.write(formatToolResultDiagnostic(toolResult));
            }

            lastStreamType = 'tool';
          },
        historyMessageLimit,
        handleToolCall: async ({ toolCall, toolName, arguments: toolArguments }) => {
          const request = parseHumanInputRequest(toolName, toolArguments, toolCall.id);
          if (!request) {
            return { handled: false };
          }

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

      await persistCompletedChat({
        chat,
        messages: turnResult.messages,
        agentId: options.agentId,
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
        options.io.stdout.write('\n');
      } else {
        pendingDisplay.clear();
      }

      return turnResult;
    } catch (error) {
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
