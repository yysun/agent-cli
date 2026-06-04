// @ts-check
/**
 * Electron Transcript Event Unit Tests
 *
 * Purpose:
 * - Validate renderer runtime-event filtering and summaries used by the Electron transcript.
 *
 * Key features:
 * - Covers hidden tool-message mode, reasoning visibility, and compact runtime summaries.
 *
 * Recent changes:
 * - 2026-06-03: Added coverage for Electron transcript event helpers.
 */
import { describe, expect, it } from 'vitest';
import {
  isTurnEventVisible,
  summarizeModelResponse,
  summarizeToolCall,
  summarizeToolResult,
  toolNameFromRecord,
} from '../../electron/renderer/src/features/chat/transcript-events.js';
import { isToolRelatedMessage } from '../../electron/renderer/src/utils/message-utils.js';

describe('transcript event helpers', () => {
  it('hides tool and model runtime events while preserving reasoning when tool messages are hidden', () => {
    const events = [
      { type: 'reasoning', text: 'thinking', createdAt: '2026-06-03T00:00:00.000Z' },
      { type: 'tool_call', toolCall: { name: 'ask_user_input' }, createdAt: '2026-06-03T00:00:01.000Z' },
      { type: 'tool_result', toolResult: { name: 'ask_user_input' }, createdAt: '2026-06-03T00:00:02.000Z' },
      { type: 'model_response', modelResponse: { stopKind: 'natural_stop' }, createdAt: '2026-06-03T00:00:03.000Z' },
      { type: 'warning', text: 'warn', createdAt: '2026-06-03T00:00:04.000Z' },
      { type: 'error', text: 'error', createdAt: '2026-06-03T00:00:05.000Z' },
    ];

    expect(events.filter((event) => isTurnEventVisible(event, false)).map((event) => event.type)).toEqual([
      'reasoning',
      'warning',
      'error',
    ]);
    expect(events.filter((event) => isTurnEventVisible(event, true)).map((event) => event.type)).toEqual([
      'reasoning',
      'tool_call',
      'tool_result',
      'model_response',
      'warning',
      'error',
    ]);
  });

  it('keeps ordinary user and assistant messages visible when tool messages are hidden', () => {
    expect(isToolRelatedMessage({ role: 'user', content: 'hello' })).toBe(false);
    expect(isToolRelatedMessage({ role: 'assistant', content: 'final answer' })).toBe(false);
    expect(isToolRelatedMessage({ role: 'tool', content: 'tool output' })).toBe(true);
    expect(isToolRelatedMessage({
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'tool-1', function: { name: 'ask_user_input' } }],
    })).toBe(true);
  });

  it('summarizes tool calls, tool results, model responses, and fallback names', () => {
    expect(toolNameFromRecord({ name: 'ask_user_input' }, 'tool')).toBe('ask_user_input');
    expect(toolNameFromRecord(undefined, 'tool')).toBe('tool');
    expect(summarizeToolCall({ arguments: '{"question":"Choose"}' })).toBe('{"question":"Choose"}');
    expect(summarizeToolResult({ result: { ok: true, status: 'answered' } })).toBe('{"ok":true,"status":"answered"}');
    expect(summarizeModelResponse({
      stopKind: 'natural_stop',
      providerStopReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    })).toBe('stop=natural_stop, reason=stop, usage={"inputTokens":1,"outputTokens":2,"totalTokens":3}');
  });
});
