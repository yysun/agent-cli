/**
 * Agent CLI Tool Approval UI
 *
 * Purpose:
 * - Turn runtime tool-approval requests into terminal prompts when tool permission is `ask`.
 *
 * Key features:
 * - Renders the tool name plus a bounded argument summary so a prompt cannot dump a full payload.
 * - Denies by default: an unanswerable prompt returns a denial reason instead of blocking the turn.
 * - Leaves host-owned human-input tools ungated so they produce one prompt, not two.
 *
 * Recent changes:
 * - 2026-07-27: Added the CLI approval gate so `--tool-permission ask` actually prompts.
 */
import { isHumanInputToolName } from './human-input-ui.js';
import { summarizeToolCall } from './tool-trace-renderer.js';

export interface ToolApprovalPrompt {
  question(query: string): Promise<string>;
}

export interface ToolApprovalOutput {
  write(chunk: string): void;
}

export interface ToolApprovalRequest {
  toolCallId?: unknown;
  toolName?: unknown;
  arguments?: unknown;
}

export interface ToolApprovalDecision {
  approved: boolean;
  reason?: string;
}

export interface CreateCliApprovalGateOptions {
  prompt?: ToolApprovalPrompt;
  output: ToolApprovalOutput;
  beforePrompt?: () => void;
  afterPrompt?: () => void;
}

const APPROVE_TOKENS = new Set(['y', 'yes', 'a', 'approve']);
const DENY_TOKENS = new Set(['n', 'no', 'd', 'deny', '']);

export function readToolApprovalName(request: ToolApprovalRequest): string {
  const toolName = String(request?.toolName ?? '').trim();
  return toolName || 'unknown_tool';
}

export function formatToolApprovalCheckpoint(request: ToolApprovalRequest): string {
  const toolName = readToolApprovalName(request);
  const view = summarizeToolCall(toolName, request?.arguments);
  const summary = String(view.summary ?? '').trim();

  return [
    '',
    `Approve tool call: ${toolName}`,
    ...(summary ? [`  ${summary}`] : []),
    '',
  ].join('\n');
}

export function createToolApprovalPromptText(request: ToolApprovalRequest): string {
  return `Approve ${readToolApprovalName(request)}? [y/N]: `;
}

/**
 * Builds the approval gate the CLI hands to `runChatTurn`. Core only consults it
 * when the resolved tool permission is `ask`, so this never runs for `auto`/`read`.
 */
export function createCliApprovalGate(options: CreateCliApprovalGateOptions) {
  return {
    async requestApproval(request: ToolApprovalRequest): Promise<ToolApprovalDecision> {
      const toolName = readToolApprovalName(request);

      // These are handled by the host `handleToolCall` hook, which runs its own
      // prompt. Gating them here would ask the user twice for one interaction.
      if (isHumanInputToolName(toolName)) {
        return { approved: true };
      }

      if (!options.prompt) {
        return {
          approved: false,
          reason: `Tool execution denied: interactive approval is unavailable for ${toolName}.`,
        };
      }

      options.beforePrompt?.();

      try {
        options.output.write(formatToolApprovalCheckpoint(request));

        while (true) {
          const rawAnswer = await options.prompt.question(createToolApprovalPromptText(request));
          const answer = rawAnswer.trim().toLowerCase();

          if (APPROVE_TOKENS.has(answer)) {
            return { approved: true };
          }

          if (DENY_TOKENS.has(answer)) {
            return {
              approved: false,
              reason: `Tool execution denied by user: ${toolName}.`,
            };
          }

          options.output.write('Answer y to approve or n to deny.\n');
        }
      } finally {
        options.afterPrompt?.();
      }
    },
  };
}
