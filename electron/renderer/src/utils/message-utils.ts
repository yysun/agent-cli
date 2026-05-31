/**
 * Message Utilities
 *
 * Purpose:
 * - Keep transcript display decisions out of React markup.
 *
 * Recent changes:
 * - 2026-05-31: Added tool-message helpers for the React chat feature.
 */
import type { AgentCliDesktopRuntimeMessage } from '../types/desktop-api';

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

export function resolveToolName(message: AgentCliDesktopRuntimeMessage): string {
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

  return message.role === 'tool' ? 'Tool Result' : 'Tool Request';
}

function formatToolName(toolName: unknown): string {
  return String(toolName || 'tool')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim() || 'Tool';
}