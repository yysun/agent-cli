/**
 * Message Utilities
 *
 * Purpose:
 * - Keep transcript display decisions out of React markup.
 *
 * Recent changes:
 * - 2026-06-10: Grouped persisted assistant tool calls and tool responses into one trace item.
 * - 2026-06-04: Reused browser-safe CLI-style diagnostic formatting for persisted Electron tool-card titles.
 * - 2026-06-04: Kept tool titles in CLI-like raw form for Electron transcript cards.
 * - 2026-05-31: Added tool-message helpers for the React chat feature.
 */
import type { AgentCliDesktopRuntimeMessage } from '../types/desktop-api';
import type { ToolTraceSection } from '../features/chat/transcript-events';
import { formatToolCallTitle, formatToolResultTitle } from './tool-title-format.js';

export type ToolCallMetadata = {
  arguments?: string;
  name: string;
};

export function isToolRelatedMessage(message: AgentCliDesktopRuntimeMessage): boolean {
  if (message.role === 'tool') {
    return true;
  }
  if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
    return true;
  }
  if (message.tool_call_id || message.toolCallId) {
    return true;
  }
  return /^calling tool\s*:/i.test(String(message.content || '').trim());
}

export function messageRoleLabel(message: AgentCliDesktopRuntimeMessage): string {
  if (message.role === 'user') {
    return 'You';
  }
  if (message.role === 'tool') {
    return 'Tool';
  }
  return 'Agent';
}

export function resolveToolStatus(message: AgentCliDesktopRuntimeMessage): 'completed' | 'error' | 'requested' {
  if (message.role === 'tool') {
    return /error|failed|exception/i.test(String(message.content || '')) ? 'error' : 'completed';
  }
  return 'requested';
}

export function resolveToolName(message: AgentCliDesktopRuntimeMessage, toolNamesById: ReadonlyMap<string, string> = new Map()): string {
  const toolCallId = message.tool_call_id || message.toolCallId;
  if (toolCallId) {
    const toolName = toolNamesById.get(toolCallId);
    if (toolName) {
      return formatToolName(toolName);
    }
  }

  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const firstToolCall = toolCalls.find(Boolean) as Record<string, any> | undefined;
  const functionName = firstToolCall?.function?.name || firstToolCall?.name || firstToolCall?.toolName;
  if (functionName) {
    return formatToolName(functionName);
  }

  const contentMatch = String(message.content || '').match(/calling tool\s*:\s*([^\n]+)/i);
  if (contentMatch?.[1]) {
    return formatToolName(contentMatch[1]);
  }

  return message.role === 'tool' ? 'tool result' : 'tool request';
}

function formatToolName(toolName: unknown): string {
  return String(toolName || 'tool').trim() || 'tool';
}

export function resolveToolTitle(message: AgentCliDesktopRuntimeMessage, toolCallsById: ReadonlyMap<string, ToolCallMetadata> = new Map()): string {
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const firstToolCall = toolCalls.find(Boolean) as Record<string, any> | undefined;
  const callName = firstToolCall?.function?.name || firstToolCall?.name || firstToolCall?.toolName;
  if (callName) {
    const name = formatToolName(callName);
    return formatToolCallTitle(name, typeof firstToolCall?.function?.arguments === 'string' ? firstToolCall.function.arguments : undefined);
  }

  const toolCallId = message.tool_call_id || message.toolCallId;
  const metadata = toolCallId ? toolCallsById.get(toolCallId) : undefined;
  if (metadata) {
    return formatToolResultTitle(metadata.name, String(message.content || ''));
  }

  const name = resolveToolName(message);
  if (message.role === 'tool') {
    return formatToolResultTitle(name, String(message.content || ''));
  }

  return name;
}

export type TranscriptMessageItem =
  | { index: number; key: string; kind: 'message'; message: AgentCliDesktopRuntimeMessage }
  | { key: string; kind: 'tool_trace'; trace: ToolTraceSection };

function toolCallIdFromRecord(record: Record<string, any> | undefined): string {
  const id = record?.id ?? record?.toolCallId ?? record?.tool_call_id;
  return typeof id === 'string' && id.trim() ? id : '';
}

function toolCallArgumentsFromRecord(record: Record<string, any> | undefined): string | undefined {
  const args = record?.function?.arguments ?? record?.arguments ?? record?.args;
  return typeof args === 'string' ? args : undefined;
}

function toolCallNameFromRecord(record: Record<string, any> | undefined): string {
  return formatToolName(record?.function?.name ?? record?.name ?? record?.toolName);
}

function toolTraceStatusFromContent(content: string): 'completed' | 'error' {
  return /error|failed|exception/i.test(content) ? 'error' : 'completed';
}

export function groupMessagesForTranscript(
  messages: AgentCliDesktopRuntimeMessage[],
  showToolMessages: boolean,
): TranscriptMessageItem[] {
  const items: TranscriptMessageItem[] = [];
  const toolTracesById = new Map<string, ToolTraceSection>();

  messages.forEach((message, index) => {
    if (!isToolRelatedMessage(message)) {
      items.push({
        index,
        key: `message:${index}:${message.id || message.role || 'message'}`,
        kind: 'message',
        message,
      });
      return;
    }

    if (!showToolMessages) {
      return;
    }

    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (toolCalls.length > 0) {
      toolCalls.forEach((toolCall, toolCallIndex) => {
        if (!toolCall || typeof toolCall !== 'object') {
          return;
        }

        const record = toolCall as Record<string, any>;
        const id = toolCallIdFromRecord(record) || `${index}:${toolCallIndex}`;
        const name = toolCallNameFromRecord(record);
        const args = toolCallArgumentsFromRecord(record);
        const key = `message-tool:${id}`;
        const trace: ToolTraceSection = {
          key,
          request: {
            body: args || 'No arguments.',
            label: 'Request',
          },
          status: 'requested',
          title: formatToolCallTitle(name, args),
        };

        toolTracesById.set(id, trace);
        items.push({
          key,
          kind: 'tool_trace',
          trace,
        });
      });
      return;
    }

    const toolCallId = message.tool_call_id || message.toolCallId || '';
    const content = String(message.content || '').trim() || 'No tool output.';
    const existingTrace = toolCallId ? toolTracesById.get(toolCallId) : undefined;
    if (existingTrace) {
      existingTrace.response = {
        body: content,
        label: 'Response',
      };
      existingTrace.status = toolTraceStatusFromContent(content);
      return;
    }

    const key = `message-tool:${toolCallId || index}`;
    items.push({
      key,
      kind: 'tool_trace',
      trace: {
        key,
        response: {
          body: content,
          label: 'Response',
        },
        status: toolTraceStatusFromContent(content),
        title: resolveToolTitle(message),
      },
    });
  });

  return items;
}
