// @ts-check
/**
 * Electron Transcript Event Unit Tests
 *
 * Purpose:
 * - Validate renderer runtime-event filtering and summaries used by the Electron transcript.
 *
 * Key features:
 * - Covers verbose-mode filtering, ordinary message visibility, and compact runtime summaries.
 *
 * Recent changes:
 * - 2026-06-04: Covered accumulated thinking chunks for one rendered reasoning block.
 * - 2026-06-04: Covered raw expanded verbose tool bodies.
 * - 2026-06-04: Covered Electron verbose-mode gating for reasoning and runtime diagnostics.
 * - 2026-06-04: Covered CLI-like tool title resolution for Electron transcript cards.
 * - 2026-06-03: Added coverage for Electron transcript event helpers.
 */
import { describe, expect, it } from 'vitest';
import {
  accumulateTurnEvents,
  appendTurnEvent,
  isTurnEventVisible,
  summarizeModelResponse,
  summarizeToolCall,
  summarizeToolResult,
  toolCallTitleFromRecord,
  toolNameFromRecord,
  toolResultTitleFromRecord,
} from '../../electron/renderer/src/features/chat/transcript-events.js';
import { isToolRelatedMessage, resolveToolName, resolveToolTitle } from '../../electron/renderer/src/utils/message-utils.js';

describe('transcript event helpers', () => {
  it('accumulates adjacent thinking chunks into one reasoning event', () => {
    const events = accumulateTurnEvents([
      { type: 'reasoning', text: 'The', createdAt: '2026-06-03T00:00:00.000Z' },
      { type: 'reasoning', text: ' user', createdAt: '2026-06-03T00:00:01.000Z' },
      { type: 'reasoning', text: ' is asking', createdAt: '2026-06-03T00:00:02.000Z' },
      { type: 'tool_call', toolCall: { name: 'load_skill' }, createdAt: '2026-06-03T00:00:03.000Z' },
      { type: 'reasoning', text: 'Next thought', createdAt: '2026-06-03T00:00:04.000Z' },
    ]);

    expect(events).toEqual([
      { type: 'reasoning', text: 'The user is asking', createdAt: '2026-06-03T00:00:00.000Z' },
      { type: 'tool_call', toolCall: { name: 'load_skill' }, createdAt: '2026-06-03T00:00:03.000Z' },
      { type: 'reasoning', text: 'Next thought', createdAt: '2026-06-03T00:00:04.000Z' },
    ]);
    expect(appendTurnEvent([], { type: 'reasoning', text: 'Thinking', createdAt: '2026-06-03T00:00:00.000Z' })).toEqual([
      { type: 'reasoning', text: 'Thinking', createdAt: '2026-06-03T00:00:00.000Z' },
    ]);
  });

  it('hides verbose runtime events while preserving warnings and errors when verbose mode is disabled', () => {
    const events = [
      { type: 'reasoning', text: 'thinking', createdAt: '2026-06-03T00:00:00.000Z' },
      { type: 'tool_call', toolCall: { name: 'ask_user_input' }, createdAt: '2026-06-03T00:00:01.000Z' },
      { type: 'tool_result', toolResult: { name: 'ask_user_input' }, createdAt: '2026-06-03T00:00:02.000Z' },
      { type: 'model_response', modelResponse: { stopKind: 'natural_stop' }, createdAt: '2026-06-03T00:00:03.000Z' },
      { type: 'warning', text: 'warn', createdAt: '2026-06-03T00:00:04.000Z' },
      { type: 'error', text: 'error', createdAt: '2026-06-03T00:00:05.000Z' },
    ];

    expect(events.filter((event) => isTurnEventVisible(event, false)).map((event) => event.type)).toEqual(['warning', 'error']);
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
    expect(toolNameFromRecord({ function: { name: 'load_skill' } }, 'tool')).toBe('load_skill');
    expect(toolNameFromRecord(undefined, 'tool')).toBe('tool');
    expect(summarizeToolCall({ arguments: '{"question":"Choose"}' })).toBe('{"question":"Choose"}');
    expect(summarizeToolResult({ result: { ok: true, status: 'answered' } })).toBe('{"ok":true,"status":"answered"}');
    expect(summarizeModelResponse({
      stopKind: 'natural_stop',
      providerStopReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    })).toBe('stop=natural_stop, reason=stop, usage={"inputTokens":1,"outputTokens":2,"totalTokens":3}');
  });

  it('preserves expanded verbose tool call and result bodies without truncating whitespace', () => {
    const longResult = `first line\n${'x'.repeat(320)}\nlast line`;

    expect(summarizeToolCall({ arguments: '{\n  "path": "/tmp/example"\n}' })).toBe('{\n  "path": "/tmp/example"\n}');
    expect(summarizeToolResult({ result: longResult })).toBe(longResult);
  });

  it('keeps persisted tool titles in the raw CLI-like form', () => {
    expect(resolveToolName({
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'tool-1', function: { name: 'ask_user_input' } }],
    })).toBe('ask_user_input');
    expect(resolveToolName({ role: 'assistant', content: 'Calling tool: load_skill\n{"id":"agent-world-skill"}' })).toBe('load_skill');
    expect(resolveToolName(
      { role: 'tool', tool_call_id: 'tool-1', content: '<skill_context id="agent-world-skill">' },
      new Map([['tool-1', 'load_skill']]),
    )).toBe('load_skill');
  });

  it('formats Electron tool titles from the CLI diagnostic row', () => {
    expect(toolCallTitleFromRecord({
      name: 'load_skill',
      arguments: JSON.stringify({ skill_id: 'agent-world-skill' }),
    })).toBe('load_skill {"skill_id":"agent-world-skill"}');
    expect(toolResultTitleFromRecord({
      name: 'load_skill',
      durationMs: 5,
      result: '<skill_context id="agent-world-skill">\nLoaded\n</skill_context>',
    })).toBe('load_skill 5ms · 3 lines');
    expect(resolveToolTitle({
      role: 'tool',
      tool_call_id: 'tool-1',
      content: '<skill_context id="agent-world-skill">\nLoaded\n</skill_context>',
    }, new Map([['tool-1', { name: 'load_skill', arguments: JSON.stringify({ skill_id: 'agent-world-skill' }) }]]))).toBe('load_skill 3 lines');
  });
});
