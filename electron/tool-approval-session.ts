/**
 * Electron Tool Approval Session
 *
 * Purpose:
 * - Own pending tool-approval request lifecycles for the Electron main process.
 *
 * Key features:
 * - Sends structured approval requests to the renderer and resolves the decision back to the runtime.
 * - Denies by default: absent, destroyed, failing, and timed-out renderers never auto-approve.
 * - Leaves host-owned human-input tools ungated so they produce one prompt, not two.
 *
 * Recent changes:
 * - 2026-07-28: Migrated Electron approval sessions to explicit 0.7 decisions.
 * - 2026-07-27: Added the Electron approval session so `ask` tool permission actually prompts.
 */
import type { LLMRuntimeToolApprovalResponse } from 'llm-runtime';
import { isHumanInputToolName } from '../cli/src/human-input-ui.js';
import {
  PendingRequestSessionManager,
  type PendingRequestRenderer,
} from './pending-request-session.js';

export type PendingToolApprovalRequest = {
  requestId: string;
  toolCallId: string;
  toolName: string;
  argumentsSummary: string;
};

export type ToolApprovalAnswer = { requestId: string } & LLMRuntimeToolApprovalResponse;

export type ToolApprovalRenderer = PendingRequestRenderer<PendingToolApprovalRequest>;

export type ToolApprovalSessionOptions = {
  requestChannel: string;
  timeoutMs: number;
  createRequestId?: () => string;
};

const MAX_ARGUMENTS_SUMMARY_WIDTH = 400;
const RENDERER_UNAVAILABLE_MESSAGE = 'Electron renderer is unavailable for tool approval.';
const TIMEOUT_MESSAGE = 'Timed out waiting for tool approval.';

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  const allowed = new Set(allowedKeys);
  return Reflect.ownKeys(value).every((key) => typeof key === 'string' && allowed.has(key));
}

export function normalizeToolApprovalAnswer(value: unknown): ToolApprovalAnswer | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const answer = value as Record<string, unknown>;
  const requestId = String(answer.requestId ?? '').trim();
  if (!requestId || (answer.decision !== 'approve' && answer.decision !== 'cancel')) {
    return null;
  }

  if (answer.decision === 'approve') {
    if (!hasOnlyKeys(answer, ['requestId', 'decision'])) {
      return null;
    }
    return { requestId, decision: 'approve' };
  }
  if (
    (
      answer.reason !== 'rejected'
      && answer.reason !== 'dismissed'
      && answer.reason !== 'timeout'
    )
    || !hasOnlyKeys(answer, ['requestId', 'decision', 'reason', 'message'])
  ) {
    return null;
  }

  return {
    requestId,
    decision: 'cancel',
    reason: answer.reason,
    ...(typeof answer.message === 'string' && answer.message.trim()
      ? { message: answer.message }
      : {}),
  };
}

export function deniedToolApprovalAnswer(
  request: PendingToolApprovalRequest,
  message: string,
  fallbackReason: 'unavailable' | 'timeout',
): ToolApprovalAnswer {
  return {
    requestId: request.requestId,
    decision: 'cancel',
    reason: fallbackReason === 'timeout' ? 'timeout' : 'dismissed',
    message,
  };
}

export function summarizeToolApprovalArguments(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  let serialized: string;

  try {
    serialized = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return '';
  }

  const normalized = String(serialized ?? '').replace(/\s+/g, ' ').trim();

  return normalized.length > MAX_ARGUMENTS_SUMMARY_WIDTH
    ? `${normalized.slice(0, MAX_ARGUMENTS_SUMMARY_WIDTH - 1)}…`
    : normalized;
}

export class ToolApprovalSessionManager {
  private readonly sessions: PendingRequestSessionManager<PendingToolApprovalRequest, ToolApprovalAnswer>;

  constructor(options: ToolApprovalSessionOptions) {
    this.sessions = new PendingRequestSessionManager({
      requestChannel: options.requestChannel,
      timeoutMs: options.timeoutMs,
      ...(options.createRequestId ? { createRequestId: options.createRequestId } : {}),
      normalizeAnswer: normalizeToolApprovalAnswer,
      buildFallbackAnswer: deniedToolApprovalAnswer,
      rendererUnavailableMessage: RENDERER_UNAVAILABLE_MESSAGE,
      timeoutMessage: TIMEOUT_MESSAGE,
    });
  }

  get pendingCount(): number {
    return this.sessions.pendingCount;
  }

  /**
   * Builds the approval gate handed to `runChatTurn`. Core only consults it when
   * the resolved tool permission is `ask`, so this never runs for `auto`/`read`.
   */
  createApprovalGate(renderer: ToolApprovalRenderer | undefined) {
    return {
      requestApproval: async (request: Record<string, unknown>) => {
        const toolName = String(request?.toolName ?? '').trim() || 'unknown_tool';

        // Handled by the main-process `handleToolCall` hook, which renders its
        // own prompt. Gating here would ask the user twice for one interaction.
        if (isHumanInputToolName(toolName)) {
          return { decision: 'approve' } satisfies LLMRuntimeToolApprovalResponse;
        }

        const answer = await this.sessions.request(renderer, {
          requestId: String(request?.toolCallId ?? '').trim(),
          toolCallId: String(request?.toolCallId ?? '').trim(),
          toolName,
          argumentsSummary: summarizeToolApprovalArguments(request?.arguments),
        });

        const { requestId: _requestId, ...decision } = answer;
        return decision;
      },
    };
  }

  resolveAnswer(rawAnswer: unknown): { ok: boolean } {
    return this.sessions.resolveAnswer(rawAnswer);
  }
}
