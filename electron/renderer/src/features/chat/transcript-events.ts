/**
 * Transcript Runtime Event Helpers
 *
 * Purpose:
 * - Normalize renderer-only runtime event labels, summaries, and filtering.
 *
 * Key features:
 * - Keeps tool/reasoning transcript behavior deterministic and testable.
 * - Gates reasoning and runtime diagnostics behind Electron verbose mode.
 *
 * Recent changes:
 * - 2026-06-10: Grouped Electron tool call/result events into one compact trace item.
 * - 2026-06-04: Added reasoning-event accumulation so thinking streams render as one card.
 * - 2026-06-04: Preserved raw verbose tool call/result body text when expanded.
 * - 2026-06-04: Hid reasoning with other runtime diagnostics when verbose mode is disabled.
 * - 2026-06-04: Reused browser-safe CLI-style diagnostic formatting for Electron tool-card titles.
 * - 2026-06-04: Accepted nested tool-call records when deriving CLI-like tool titles.
 * - 2026-06-03: Extracted runtime event filtering and summaries from `ChatTranscript`.
 */
import type { AgentCliDesktopTurnEvent } from '../../types/desktop-api';
import { formatToolCallTitle, formatToolResultTitle } from '../../utils/tool-title-format.js';

export function appendTurnEvent(events: AgentCliDesktopTurnEvent[], event: AgentCliDesktopTurnEvent): AgentCliDesktopTurnEvent[] {
  const lastEvent = events.at(-1);
  if (lastEvent?.type === 'reasoning' && event.type === 'reasoning') {
    return [
      ...events.slice(0, -1),
      {
        ...lastEvent,
        text: `${lastEvent.text ?? ''}${event.text ?? ''}`,
      },
    ];
  }

  return [...events, event];
}

export function accumulateTurnEvents(events: AgentCliDesktopTurnEvent[]): AgentCliDesktopTurnEvent[] {
  return events.reduce<AgentCliDesktopTurnEvent[]>((accumulatedEvents, event) => appendTurnEvent(accumulatedEvents, event), []);
}

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
  const nestedFunction = record?.function && typeof record.function === 'object' ? record.function as Record<string, unknown> : undefined;
  const name = record?.name ?? record?.toolName ?? nestedFunction?.name;
  return typeof name === 'string' && name.trim() ? name : fallback;
}

export function toolCallTitleFromRecord(toolCall: Record<string, unknown> | undefined): string {
  if (!toolCall) {
    return 'tool';
  }

  const name = toolNameFromRecord(toolCall, 'tool');
  return formatToolCallTitle(name, typeof toolCall.arguments === 'string' ? toolCall.arguments : typeof toolCall.args === 'string' ? toolCall.args : undefined);
}

export function toolResultTitleFromRecord(toolResult: Record<string, unknown> | undefined): string {
  if (!toolResult) {
    return 'tool result';
  }

  const name = toolNameFromRecord(toolResult, 'tool result');
  const durationMs = typeof toolResult.durationMs === 'number' ? toolResult.durationMs : undefined;
  return formatToolResultTitle(name, 'result' in toolResult ? toolResult.result : toolResult, durationMs);
}

export function summarizeToolCall(toolCall: Record<string, unknown> | undefined): string {
  if (!toolCall) {
    return 'Tool call requested.';
  }

  return String(toolCall.arguments ?? toolCall.args ?? 'No arguments.');
}

export function summarizeToolResult(toolResult: Record<string, unknown> | undefined): string {
  if (!toolResult) {
    return 'No tool output.';
  }

  return typeof toolResult.result === 'string' ? toolResult.result : compactJson(toolResult.result);
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
    event.type !== 'reasoning'
    && event.type !== 'tool_call'
    && event.type !== 'tool_result'
    && event.type !== 'model_response'
  );
}

export type ToolTraceStatus = 'completed' | 'error' | 'requested';

export type ToolTraceDetail = {
  body: string;
  label: string;
};

export type ToolTraceSection = {
  key: string;
  request?: ToolTraceDetail;
  response?: ToolTraceDetail;
  status: ToolTraceStatus;
  title: string;
};

export type TranscriptTurnEventItem =
  | { event: AgentCliDesktopTurnEvent; key: string; kind: 'event' }
  | { key: string; kind: 'tool_trace'; trace: ToolTraceSection };

function toolTraceId(record: Record<string, unknown> | undefined): string {
  const id = record?.id ?? record?.toolCallId ?? record?.tool_call_id;
  return typeof id === 'string' && id.trim() ? id : '';
}

function isErrorBody(body: string): boolean {
  return /error|failed|exception/i.test(body);
}

function eventFallbackKey(event: AgentCliDesktopTurnEvent, index: number): string {
  return `event:${event.createdAt}:${index}:${event.type}`;
}

export function groupTurnEventsForTranscript(events: AgentCliDesktopTurnEvent[]): TranscriptTurnEventItem[] {
  const items: TranscriptTurnEventItem[] = [];
  const toolTracesById = new Map<string, ToolTraceSection>();

  events.forEach((event, index) => {
    if (event.type !== 'tool_call' && event.type !== 'tool_result') {
      items.push({
        event,
        key: eventFallbackKey(event, index),
        kind: 'event',
      });
      return;
    }

    const record = event.type === 'tool_call' ? event.toolCall : event.toolResult;
    const id = toolTraceId(record);
    const key = id ? `turn-tool:${id}` : eventFallbackKey(event, index);
    let trace = id ? toolTracesById.get(id) : undefined;

    if (!trace) {
      trace = {
        key,
        status: event.type === 'tool_call' ? 'requested' : 'completed',
        title: event.type === 'tool_call' ? toolCallTitleFromRecord(event.toolCall) : toolResultTitleFromRecord(event.toolResult),
      };
      if (id) {
        toolTracesById.set(id, trace);
      }
      items.push({
        key,
        kind: 'tool_trace',
        trace,
      });
    }

    if (event.type === 'tool_call') {
      trace.title = toolCallTitleFromRecord(event.toolCall);
      trace.request = {
        body: summarizeToolCall(event.toolCall),
        label: 'Request',
      };
      if (!trace.response) {
        trace.status = 'requested';
      }
      return;
    }

    const responseBody = summarizeToolResult(event.toolResult);
    trace.response = {
      body: responseBody,
      label: 'Response',
    };
    trace.status = isErrorBody(responseBody) ? 'error' : 'completed';
    if (!trace.request) {
      trace.title = toolResultTitleFromRecord(event.toolResult);
    }
  });

  return items;
}
