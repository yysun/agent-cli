// @ts-check
/**
 * Electron Turn Outcome Unit Tests
 *
 * Purpose:
 * - Verify cancellation status and metadata across main-to-renderer outcome helpers.
 *
 * Key features:
 * - Covers approval rejection, invalid/callback failure, and human-input cancellation.
 * - Requires transcript reload and cancellation labeling for every cancelled response.
 *
 * Recent changes:
 * - 2026-07-28: Added deterministic Electron cancellation boundary coverage.
 */
import { describe, expect, it } from 'vitest';
import { serializeElectronTurnOutcome } from '../../electron/turn-outcome.js';
import { resolveRendererTurnOutcome } from '../../electron/renderer/src/features/chat/turn-outcome.js';

const toolCall = {
  id: 'tool-1',
  type: 'function',
  function: { name: 'load_skill', arguments: '{"skillId":"core"}' },
};

describe('Electron turn outcomes', () => {
  it.each(['approval_rejected', 'approval_invalid', 'approval_callback_error'])(
    'preserves %s and requests renderer transcript reload',
    (reason) => {
      const serialized = serializeElectronTurnOutcome({
        status: 'cancelled',
        assistantText: '',
        messages: [],
        cancellation: { kind: 'tool_approval', reason, toolCall },
      });
      const response = {
        chatId: 'chat-1',
        workspaceRoot: '/workspace',
        messages: [],
        streamChunks: [],
        toolCalls: [],
        toolResults: [],
        turnEvents: [],
        ...serialized,
      };

      expect(response).toMatchObject({
        status: 'cancelled',
        assistantText: '',
        cancellation: { kind: 'tool_approval', reason },
      });
      expect(resolveRendererTurnOutcome(response, false)).toEqual({
        reloadTranscript: true,
        message: expect.stringMatching(/^Turn cancelled: tool approval /),
      });
    },
  );

  it('preserves human-input cancellation and does not label it as success or failure', () => {
    const serialized = serializeElectronTurnOutcome({
      status: 'cancelled',
      assistantText: '',
      messages: [],
      cancellation: {
        kind: 'human_input',
        reason: 'timeout',
        toolCallId: 'ask-1',
        toolName: 'ask_user_input',
      },
    });
    const response = {
      chatId: 'chat-1',
      workspaceRoot: '/workspace',
      messages: [],
      streamChunks: [],
      toolCalls: [],
      toolResults: [],
      turnEvents: [],
      ...serialized,
    };
    const outcome = resolveRendererTurnOutcome(response, false);

    expect(outcome).toEqual({
      reloadTranscript: true,
      message: 'Turn cancelled: human input timeout.',
    });
    expect(outcome.message).not.toMatch(/Message sent|Turn failed/);
  });

  it('keeps completed outcomes on the normal success path', () => {
    const serialized = serializeElectronTurnOutcome({
      status: 'completed',
      assistantText: 'Done',
      messages: [],
    });
    const response = {
      chatId: 'chat-1',
      workspaceRoot: '/workspace',
      messages: [],
      streamChunks: [],
      toolCalls: [],
      toolResults: [],
      turnEvents: [],
      ...serialized,
    };

    expect(resolveRendererTurnOutcome(response, true)).toEqual({
      reloadTranscript: false,
      message: 'Edited message resent.',
    });
  });
});
