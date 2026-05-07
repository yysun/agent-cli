// @ts-check
/**
 * Agent CLI Runtime Client Unit Tests
 *
 * Purpose:
 * - Validate the `llm-runtime` integration boundary without live provider calls.
 *
 * Key features:
 * - Verifies provider config wiring, load_skill tool execution, and final turn shaping.
 * - Ensures the runtime environment is disposed even when the turn does not finish cleanly.
 *
 * Recent changes:
 * - 2026-05-07: Added targeted Vitest coverage for the runtime client.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestRoot, removeTestRoot } from '../helpers/test-root.js';

const runtimeMock = vi.hoisted(() => ({
  createLLMEnvironment: vi.fn(),
  disposeLLMEnvironment: vi.fn(),
  resolveToolsAsync: vi.fn(),
  respondWithTools: vi.fn(),
  loadSkillExecute: vi.fn(),
}));

vi.mock('llm-runtime', () => ({
  createLLMEnvironment: runtimeMock.createLLMEnvironment,
  disposeLLMEnvironment: runtimeMock.disposeLLMEnvironment,
  resolveToolsAsync: runtimeMock.resolveToolsAsync,
  respondWithTools: runtimeMock.respondWithTools,
}));

/** @type {string[]} */
const rootsToClean = [];

/** @param {string} rootPath */
async function loadRuntimeClient(rootPath) {
  process.env.AGENT_CLI_ROOT = rootPath;
  vi.resetModules();
  return await import('../../lib/runtime-client.js');
}

beforeEach(() => {
  runtimeMock.createLLMEnvironment.mockImplementation((options) => ({
    kind: 'environment',
    options,
  }));
  runtimeMock.disposeLLMEnvironment.mockResolvedValue(undefined);
  runtimeMock.loadSkillExecute.mockResolvedValue({ loaded: 'agent-cli-core' });
  runtimeMock.resolveToolsAsync.mockResolvedValue({
    load_skill: {
      execute: runtimeMock.loadSkillExecute,
    },
  });

  process.env.LLM_PROVIDER = 'openai';
  process.env.LLM_MODEL = 'gpt-5';
  process.env.OPENAI_API_KEY = 'test-openai-key';
});

afterEach(async () => {
  delete process.env.AGENT_CLI_ROOT;
  delete process.env.LLM_PROVIDER;
  delete process.env.LLM_MODEL;
  delete process.env.OPENAI_API_KEY;

  while (rootsToClean.length > 0) {
    await removeTestRoot(rootsToClean.pop());
  }
});

describe('runtime-client', () => {
  it('executes a tool-capable turn and returns the completed conversation', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    runtimeMock.respondWithTools.mockImplementation(async (options) => {
      const builtMessages = await options.buildMessages({
        state: options.initialState,
        emptyTextRetryCount: 0,
      });

      expect(builtMessages[0]).toMatchObject({ role: 'system', content: 'System prompt' });
      expect(builtMessages[1].content).toContain('agent-cli-core');
      expect(builtMessages.at(-1)).toMatchObject({ role: 'user', content: 'Use the skill' });

      const toolCall = {
        id: 'tool-call-1',
        type: 'function',
        function: {
          name: 'load_skill',
          arguments: '{"skillId":"agent-cli-core"}',
        },
      };

      const afterToolCalls = await options.onToolCallsResponse({
        state: options.initialState,
        response: {
          type: 'tool_calls',
          content: '',
          tool_calls: [toolCall],
          assistantMessage: {
            role: 'assistant',
            content: '',
            tool_calls: [toolCall],
          },
        },
        messages: builtMessages,
        iteration: 1,
      });

      const afterText = await options.onTextResponse({
        state: afterToolCalls.state,
        response: {
          type: 'text',
          content: 'Final answer',
          assistantMessage: {
            role: 'assistant',
            content: 'Final answer',
          },
        },
        responseText: 'Final answer',
        messages: builtMessages,
        iteration: 2,
      });

      return {
        state: afterText.state,
        reason: 'text_response',
      };
    });

    const { runChatTurn } = await loadRuntimeClient(rootPath);
    const result = await runChatTurn({
      chat: {
        id: 'chat-1',
        createdAt: '2026-05-07T12:00:00.000Z',
        updatedAt: '2026-05-07T12:00:00.000Z',
        messages: [],
      },
      userMessage: 'Use the skill',
      systemPrompt: 'System prompt',
      skillInventory: [
        {
          skillId: 'agent-cli-core',
          description: 'Core Agent CLI framing.',
        },
      ],
    });

    expect(result.assistantText).toBe('Final answer');
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0]).toMatchObject({ role: 'user', content: 'Use the skill' });
    expect(result.messages[2]).toMatchObject({
      role: 'tool',
      tool_call_id: 'tool-call-1',
    });
    expect(result.messages[2].content).toContain('agent-cli-core');
    expect(runtimeMock.createLLMEnvironment).toHaveBeenCalledWith(
      expect.objectContaining({
        skillRoots: [expect.stringMatching(/agent[\\/]skills$/)],
      }),
    );
    expect(runtimeMock.disposeLLMEnvironment).toHaveBeenCalledTimes(1);
  });

  it('fails when the runtime never produces a final text response', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    runtimeMock.respondWithTools.mockResolvedValue({
      state: {
        conversationMessages: [],
        finalText: '   ',
      },
      reason: 'timeout',
    });

    const { runChatTurn } = await loadRuntimeClient(rootPath);

    await expect(
      runChatTurn({
        chat: {
          id: 'chat-1',
          createdAt: '2026-05-07T12:00:00.000Z',
          updatedAt: '2026-05-07T12:00:00.000Z',
          messages: [],
        },
        userMessage: 'Hello',
        systemPrompt: 'System prompt',
        skillInventory: [],
      }),
    ).rejects.toThrow('LLM turn ended without a final text response. Stop reason: timeout');

    expect(runtimeMock.disposeLLMEnvironment).toHaveBeenCalledTimes(1);
  });
});