// @ts-check
/**
 * Agent Runtime Unit Tests
 *
 * Purpose:
 * - Validate runtime provider resolution and chat execution plumbing.
 *
 * Key features:
 * - Keeps provider credentials in environment variables.
 * - Resolves provider/model from agent config or provider defaults.
 * - Confirms `runChatTurn` forwards normalized options to `llm-runtime`.
 *
 * Recent changes:
 * - 2026-05-26: Covered runtime skill roots for opt-in global skill loading.
 * - 2026-05-26: Updated missing-model guidance for `.env` runtime defaults.
 * - 2026-05-16: Added coverage for runtime tool-result callbacks.
 * - 2026-05-23: Added coverage for CLI-handled tool-call results.
 * - 2026-05-16: Migrated agent-runtime coverage to the `llm-runtime` 0.5.0 loop API.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

const createRuntime = vi.fn();
const executeToolCall = vi.fn();
const executeToolCalls = vi.fn();
const runCompletionLoop = vi.fn();
const runtimeDispose = vi.fn();

vi.mock('llm-runtime', () => ({
  createRuntime,
  executeToolCall,
  executeToolCalls,
  runCompletionLoop,
}));

const ENV_KEYS = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_RESOURCE_NAME',
  'AZURE_OPENAI_API_VERSION',
  'AZURE_OPENAI_DEPLOYMENT_NAME',
  'AGENT_CLI_GLOBAL_SKILLS',
];
const originalEnvironment = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function restoreEnvironment() {
  for (const key of ENV_KEYS) {
    const value = originalEnvironment[key];

    if (typeof value === 'undefined') {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

beforeEach(() => {
  createRuntime.mockReset();
  executeToolCall.mockReset();
  executeToolCalls.mockReset();
  runCompletionLoop.mockReset();
  runtimeDispose.mockReset();

  runtimeDispose.mockResolvedValue(undefined);
  createRuntime.mockReturnValue({
    runtimeId: 'runtime-1',
    dispose: runtimeDispose,
  });
  executeToolCall.mockResolvedValue({ ok: true });
  executeToolCalls.mockResolvedValue([{ ok: true }]);
});

afterEach(() => {
  restoreEnvironment();
});

describe('agent-runtime', () => {
  it('defaults to openai/gpt-5 when runtime config omits provider and model', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const { validateRuntimeEnvironment } = await import('../../core/agent-runtime.js');
    const runtime = validateRuntimeEnvironment(process.env, {});

    expect(runtime.provider).toBe('openai');
    expect(runtime.model).toBe('gpt-5');
    expect(runtime.providers).toEqual({
      openai: {
        apiKey: 'test-openai-key',
      },
    });
  });

  it('uses the provider and model from runtime config while still reading credentials from env', async () => {
    process.env.GOOGLE_API_KEY = 'test-google-key';

    const { validateRuntimeEnvironment } = await import('../../core/agent-runtime.js');
    const runtime = validateRuntimeEnvironment(process.env, {
      provider: 'google',
      model: 'gemini-2.5-pro',
    });

    expect(runtime.provider).toBe('google');
    expect(runtime.model).toBe('gemini-2.5-pro');
    expect(runtime.providers).toEqual({
      google: {
        apiKey: 'test-google-key',
      },
    });
  });

  it('uses the Azure deployment as the default model when one is not set explicitly', async () => {
    process.env.AZURE_OPENAI_API_KEY = 'azure-key';
    process.env.AZURE_OPENAI_RESOURCE_NAME = 'example';
    process.env.AZURE_OPENAI_DEPLOYMENT_NAME = 'gpt-5-enterprise';

    const { validateRuntimeEnvironment } = await import('../../core/agent-runtime.js');
    const runtime = validateRuntimeEnvironment(process.env, {
      provider: 'azure',
    });

    expect(runtime.provider).toBe('azure');
    expect(runtime.model).toBe('gpt-5-enterprise');
    expect(runtime.providers).toEqual({
      azure: {
        apiKey: 'azure-key',
        resourceName: 'example',
        deployment: 'gpt-5-enterprise',
      },
    });
  });

  it('fails clearly when the selected provider is missing credentials', async () => {
    delete process.env.OPENAI_API_KEY;

    const { validateRuntimeEnvironment } = await import('../../core/agent-runtime.js');

    expect(() => validateRuntimeEnvironment(process.env, {
      provider: 'openai',
      model: 'gpt-5',
    })).toThrow('Missing environment variable: OPENAI_API_KEY');
  });

  it('fails clearly when a provider has no configured model or built-in default', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

    const { validateRuntimeEnvironment } = await import('../../core/agent-runtime.js');

    expect(() => validateRuntimeEnvironment(process.env, {
      provider: 'anthropic',
      model: '',
    })).toThrow('Missing LLM model. Set AGENT_CLI_MODEL in .env or pass --model for provider anthropic.');
  });

  it('uses the same opt-in global skill roots for load_skill runtime tools', async () => {
    process.env.AGENT_CLI_GLOBAL_SKILLS = 'false';

    const { buildRuntimeSkillRoots } = await import('../../core/agent-runtime.js');

    expect(buildRuntimeSkillRoots()).toEqual([
      expect.stringContaining(path.join('.agent-world', 'skills')),
    ]);

    process.env.AGENT_CLI_GLOBAL_SKILLS = 'true';

    expect(buildRuntimeSkillRoots()).toEqual([
      expect.stringContaining(path.join('.agent-world', 'skills')),
      expect.stringContaining(path.join('.agents', 'skills')),
      expect.stringContaining(path.join('.agent-world', 'skills')),
    ]);
  });

  it('runs a chat turn through llm-runtime with normalized runtime settings', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    runCompletionLoop.mockImplementation(async ({ initialState, modelRequest, onTextResponse }) => {
      await modelRequest.onChunk?.({ content: 'Hello' });
      await modelRequest.onChunk?.({ content: ' world' });

      const textStep = await onTextResponse({
        state: initialState,
        response: {
          type: 'text',
          content: 'Hello world',
          assistantMessage: { role: 'assistant', content: 'Hello world' },
        },
        messages: [],
        iteration: 1,
        responseText: 'Hello world',
      });

      return {
        reason: 'text_response',
        state: textStep.state,
      };
    });

    const { runChatTurn } = await import('../../core/agent-runtime.js');
    const onStreamChunk = vi.fn();

    const result = await runChatTurn({
      chat: {
        id: 'chat-1',
        messages: [],
      },
      userMessage: 'hello',
      stream: true,
      historyMessageLimit: 4,
      builtInSystemPrompt: 'System prompt',
      workspaceSystemPrompt: 'Workspace prompt',
      skillInventory: [
        { skillId: 'agent-cli-core', description: 'Core skill' },
      ],
      agentConfig: {
        provider: 'openai',
        model: 'gpt-5',
        temperature: 0.2,
        maxTokens: 512,
        toolPermission: 'ask',
        reasoningEffort: 'medium',
        webSearch: {
          searchContextSize: 'low',
        },
      },
      onStreamChunk,
    });

    expect(createRuntime).toHaveBeenCalledWith(expect.objectContaining({
      providers: {
        openai: {
          apiKey: 'test-openai-key',
        },
      },
      skillRoots: expect.arrayContaining([
        expect.stringContaining(path.join('.agent-world', 'skills')),
      ]),
      defaults: {
        reasoningEffort: 'medium',
        toolPermission: 'ask',
      },
    }));
    expect(runCompletionLoop).toHaveBeenCalledWith(expect.objectContaining({
      emptyTextRetryLimit: 0,
      rejectedTextRetryLimit: 0,
      modelRequest: expect.objectContaining({
        mode: 'stream',
        environment: expect.objectContaining({ runtimeId: 'runtime-1' }),
        provider: 'openai',
        model: 'gpt-5',
        temperature: 0.2,
        maxTokens: 512,
        webSearch: {
          searchContextSize: 'low',
        },
        builtIns: 'all',
        context: expect.objectContaining({
          workingDirectory: expect.any(String),
          reasoningEffort: 'medium',
          toolPermission: 'ask',
        }),
      }),
    }));
    expect(onStreamChunk).toHaveBeenCalledTimes(2);
    expect(result.assistantText).toBe('Hello world');
    expect(result.messages.at(-1)).toEqual({ role: 'assistant', content: 'Hello world' });
    expect(runtimeDispose).toHaveBeenCalledTimes(1);
  });

  it('forwards tool calls and tool results through runtime callbacks', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const loadSkillExecute = vi.fn().mockResolvedValue({ ok: true, status: 'loaded' });
    runCompletionLoop.mockImplementation(async ({ initialState, onToolCallsResponse, onTextResponse }) => {
      const toolStep = await onToolCallsResponse({
        state: initialState,
        response: {
          type: 'tool_calls',
          content: '',
          assistantMessage: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tool-1',
                function: {
                  name: 'load_skill',
                  arguments: '{"skillId":"agent-cli-core"}',
                },
              },
            ],
          },
          tool_calls: [
            {
              id: 'tool-1',
              function: {
                name: 'load_skill',
                arguments: '{"skillId":"agent-cli-core"}',
              },
            },
          ],
        },
        messages: [],
        iteration: 1,
        toolExecutor: {
          executeToolCall: loadSkillExecute,
        },
      });

      const textStep = await onTextResponse({
        state: toolStep.state,
        response: {
          type: 'text',
          content: 'Loaded skill',
          assistantMessage: {
            role: 'assistant',
            content: 'Loaded skill',
          },
        },
        messages: [],
        iteration: 2,
        responseText: 'Loaded skill',
      });

      return {
        reason: 'text_response',
        state: textStep.state,
      };
    });

    const { runChatTurn } = await import('../../core/agent-runtime.js');
    const onToolCall = vi.fn();
    const onToolResult = vi.fn();

    const result = await runChatTurn({
      chat: {
        id: 'chat-1',
        messages: [],
      },
      userMessage: 'hello',
      stream: true,
      builtInSystemPrompt: 'System prompt',
      skillInventory: [],
      agentConfig: {
        provider: 'openai',
        model: 'gpt-5',
      },
      onToolCall,
      onToolResult,
    });

    expect(loadSkillExecute).toHaveBeenCalledWith({
      id: 'tool-1',
      function: {
        name: 'load_skill',
        arguments: '{"skillId":"agent-cli-core"}',
      },
    }, expect.objectContaining({
      toolCallId: 'tool-1',
    }), {
      errorMode: 'return-artifact',
    });
    expect(onToolCall).toHaveBeenCalledWith({
      id: 'tool-1',
      name: 'load_skill',
      arguments: '{"skillId":"agent-cli-core"}',
    });
    expect(onToolResult).toHaveBeenCalledWith(expect.objectContaining({
      id: 'tool-1',
      name: 'load_skill',
      result: { ok: true, status: 'loaded' },
      arguments: '{"skillId":"agent-cli-core"}',
      durationMs: expect.any(Number),
    }));
    expect(result.messages).toContainEqual(expect.objectContaining({
      role: 'tool',
      tool_call_id: 'tool-1',
      content: '{\n  "ok": true,\n  "status": "loaded"\n}',
    }));
    expect(result.assistantText).toBe('Loaded skill');
  });

  it('returns a rejected tool artifact when approval is denied', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const loadSkillExecute = vi.fn();
    runCompletionLoop.mockImplementation(async ({ initialState, onToolCallsResponse, onTextResponse }) => {
      const toolStep = await onToolCallsResponse({
        state: initialState,
        response: {
          type: 'tool_calls',
          content: '',
          assistantMessage: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tool-1',
                function: {
                  name: 'load_skill',
                  arguments: '{"skillId":"agent-cli-core"}',
                },
              },
            ],
          },
          tool_calls: [
            {
              id: 'tool-1',
              function: {
                name: 'load_skill',
                arguments: '{"skillId":"agent-cli-core"}',
              },
            },
          ],
        },
        messages: [],
        iteration: 1,
        toolExecutor: {
          executeToolCall: loadSkillExecute,
        },
      });

      return {
        reason: 'text_response',
        state: (await onTextResponse({
          state: toolStep.state,
          response: {
            type: 'text',
            content: 'Denied',
            assistantMessage: { role: 'assistant', content: 'Denied' },
          },
          messages: [],
          iteration: 2,
          responseText: 'Denied',
        })).state,
      };
    });

    const { runChatTurn } = await import('../../core/agent-runtime.js');
    const approvalGate = {
      requestApproval: vi.fn().mockResolvedValue({ approved: false, reason: 'Nope' }),
    };
    const onToolResult = vi.fn();

    const result = await runChatTurn({
      chat: { id: 'chat-1', messages: [] },
      userMessage: 'hello',
      builtInSystemPrompt: 'System prompt',
      skillInventory: [],
      agentConfig: {
        provider: 'openai',
        model: 'gpt-5',
        toolPermission: 'ask',
      },
      approvalGate,
      onToolResult,
    });

    expect(approvalGate.requestApproval).toHaveBeenCalledWith({
      toolCallId: 'tool-1',
      toolName: 'load_skill',
      arguments: { skillId: 'agent-cli-core' },
    });
    expect(loadSkillExecute).not.toHaveBeenCalled();
    expect(onToolResult).toHaveBeenCalledWith(expect.objectContaining({
      id: 'tool-1',
      name: 'load_skill',
      result: expect.objectContaining({
        status: 'rejected',
        toolCallId: 'tool-1',
        toolName: 'load_skill',
        message: 'Nope',
      }),
      arguments: '{"skillId":"agent-cli-core"}',
      durationMs: expect.any(Number),
    }));
    expect(result.messages).toContainEqual(expect.objectContaining({
      role: 'tool',
      tool_call_id: 'tool-1',
      content: '{\n  "ok": false,\n  "status": "rejected",\n  "errorType": "tool_execution_rejected",\n  "toolCallId": "tool-1",\n  "toolName": "load_skill",\n  "message": "Nope"\n}',
    }));
  });

  it('uses a CLI tool-call handler result before falling back to runtime tools', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    runCompletionLoop.mockImplementation(async ({ initialState, onToolCallsResponse, onTextResponse }) => {
      const toolStep = await onToolCallsResponse({
        state: initialState,
        response: {
          type: 'tool_calls',
          content: '',
          assistantMessage: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tool-input-1',
                function: {
                  name: 'ask_user_input',
                  arguments: '{"question":"Choose","options":["A","B"]}',
                },
              },
            ],
          },
          tool_calls: [
            {
              id: 'tool-input-1',
              function: {
                name: 'ask_user_input',
                arguments: '{"question":"Choose","options":["A","B"]}',
              },
            },
          ],
        },
        messages: [],
        iteration: 1,
      });

      return {
        reason: 'text_response',
        state: (await onTextResponse({
          state: toolStep.state,
          response: {
            type: 'text',
            content: 'Answered',
            assistantMessage: { role: 'assistant', content: 'Answered' },
          },
          messages: [],
          iteration: 2,
          responseText: 'Answered',
        })).state,
      };
    });

    const { runChatTurn } = await import('../../core/agent-runtime.js');
    const handleToolCall = vi.fn().mockResolvedValue({
      handled: true,
      result: {
        ok: true,
        status: 'answered',
      },
    });

    const result = await runChatTurn({
      chat: { id: 'chat-1', messages: [] },
      userMessage: 'hello',
      builtInSystemPrompt: 'System prompt',
      skillInventory: [],
      agentConfig: {
        provider: 'openai',
        model: 'gpt-5',
      },
      handleToolCall,
    });

    expect(handleToolCall).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'ask_user_input',
      parsedArguments: {
        question: 'Choose',
        options: ['A', 'B'],
      },
      executeDefault: expect.any(Function),
    }));
    expect(executeToolCall).not.toHaveBeenCalled();
    expect(result.messages).toContainEqual(expect.objectContaining({
      role: 'tool',
      tool_call_id: 'tool-input-1',
      content: '{\n  "ok": true,\n  "status": "answered"\n}',
    }));
  });

  it('falls back to the runtime tool executor when the loop does not provide one', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    executeToolCall.mockResolvedValueOnce({ ok: true, status: 'loaded-from-runtime' });
    runCompletionLoop.mockImplementation(async ({ initialState, onToolCallsResponse, onTextResponse }) => {
      const toolStep = await onToolCallsResponse({
        state: initialState,
        response: {
          type: 'tool_calls',
          content: '',
          assistantMessage: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tool-1',
                function: {
                  name: 'load_skill',
                  arguments: '{"skillId":"agent-cli-core"}',
                },
              },
            ],
          },
          tool_calls: [
            {
              id: 'tool-1',
              function: {
                name: 'load_skill',
                arguments: '{"skillId":"agent-cli-core"}',
              },
            },
          ],
        },
        messages: [],
        iteration: 1,
      });

      return {
        reason: 'text_response',
        state: (await onTextResponse({
          state: toolStep.state,
          response: {
            type: 'text',
            content: 'Loaded from runtime',
            assistantMessage: { role: 'assistant', content: 'Loaded from runtime' },
          },
          messages: [],
          iteration: 2,
          responseText: 'Loaded from runtime',
        })).state,
      };
    });

    const { runChatTurn } = await import('../../core/agent-runtime.js');

    const result = await runChatTurn({
      chat: { id: 'chat-1', messages: [] },
      userMessage: 'hello',
      builtInSystemPrompt: 'System prompt',
      skillInventory: [],
      agentConfig: {
        provider: 'openai',
        model: 'gpt-5',
      },
    });

    expect(executeToolCall).toHaveBeenCalledWith({
      toolCall: {
        id: 'tool-1',
        function: {
          name: 'load_skill',
          arguments: '{"skillId":"agent-cli-core"}',
        },
      },
      environment: expect.objectContaining({ runtimeId: 'runtime-1' }),
      builtIns: 'all',
      context: expect.objectContaining({
        toolCallId: 'tool-1',
      }),
      errorMode: 'return-artifact',
    });
    expect(result.assistantText).toBe('Loaded from runtime');
  });
});
