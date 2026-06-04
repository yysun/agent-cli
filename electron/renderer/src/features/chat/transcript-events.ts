/**
 * Transcript Runtime Event Helpers
 *
 * Purpose:
 * - Normalize renderer-only runtime event labels, summaries, and filtering.
 *
 * Key features:
 * - Keeps tool/reasoning transcript behavior deterministic and testable.
 * - Preserves reasoning visibility when tool-message cards are hidden.
 *
 * Recent changes:
 * - 2026-06-03: Extracted runtime event filtering and summaries from `ChatTranscript`.
 */
import type { AgentCliDesktopTurnEvent } from '../../types/desktop-api';

export function compactJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value ?? '');
  }
}

export function truncate(value: string, maxLength = 260): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

export function toolNameFromRecord(record: Record<string, unknown> | undefined, fallback: string): string {
  const name = record?.name ?? record?.toolName;
  return typeof name === 'string' && name.trim() ? name : fallback;
}

export function summarizeToolCall(toolCall: Record<string, unknown> | undefined): string {
  if (!toolCall) {
    return 'Tool call requested.';
  }

  return truncate(String(toolCall.arguments ?? toolCall.args ?? 'No arguments.'));
}

export function summarizeToolResult(toolResult: Record<string, unknown> | undefined): string {
  if (!toolResult) {
    return 'No tool output.';
  }

  return truncate(typeof toolResult.result === 'string' ? toolResult.result : compactJson(toolResult.result));
}

export function summarizeModelResponse(modelResponse: Record<string, unknown> | undefined): string {
  if (!modelResponse) {
    return 'Model response received.';
  }

  const parts = [
    typeof modelResponse.stopKind === 'string' ? `stop=${modelResponse.stopKind}` : '',
    typeof modelResponse.providerStopReason === 'string' ? `reason=${modelResponse.providerStopReason}` : '',
    modelResponse.usage ? `usage=${compactJson(modelResponse.usage)}` : '',
  ].filter(Boolean);

  return parts.join(', ') || 'Model response received.';
}

export function isTurnEventVisible(event: AgentCliDesktopTurnEvent, showToolMessages: boolean): boolean {
  return showToolMessages || (
    event.type !== 'tool_call'
    && event.type !== 'tool_result'
    && event.type !== 'model_response'
  );
}
