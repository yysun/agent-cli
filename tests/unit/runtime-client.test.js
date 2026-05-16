// @ts-check
/**
 * Agent CLI Runtime Client Unit Tests
 *
 * Purpose:
 * - Validate runtime provider resolution and chat execution plumbing.
 *
 * Key features:
 * - Keeps provider credentials in environment variables.
 * - Resolves provider/model from runtime config or provider defaults.
 * - Confirms `runChatTurn` forwards normalized options to `llm-runtime`.
 *
 * Recent changes:
 * - 2026-05-16: Added coverage for runtime tool-result callbacks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createLLMEnvironment = vi.fn();
const disposeLLMEnvironment = vi.fn();
const resolveToolsAsync = vi.fn();
const respondWithTools = vi.fn();

vi.mock('llm-runtime', () => ({
  createLLMEnvironment,
  disposeLLMEnvironment,
  resolveToolsAsync,
  respondWithTools,
}));

const ENV_KEYS = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_RESOURCE_NAME',
  'AZURE_OPENAI_API_VERSION',
  'AZURE_OPENAI_DEPLOYMENT_NAME',
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
  createLLMEnvironment.mockReset();
  disposeLLMEnvironment.mockReset();
  resolveToolsAsync.mockReset();
  respondWithTools.mockReset();

  createLLMEnvironment.mockReturnValue({ environmentId: 'env-1' });
  disposeLLMEnvironment.mockResolvedValue(undefined);
  resolveToolsAsync.mockResolvedValue({
    load_skill: {
      execute: vi.fn().mockResolvedValue({ ok: true }),
    },
  });
});

afterEach(() => {
  restoreEnvironment();
});

describe('runtime-client', () => {
  it('defaults to openai/gpt-5 when runtime config omits provider and model', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const { validateRuntimeEnvironment } = await import('../../core/runtime-client.js');
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

    const { validateRuntimeEnvironment } = await import('../../core/runtime-client.js');
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

    const { validateRuntimeEnvironment } = await import('../../core/runtime-client.js');
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

    const { validateRuntimeEnvironment } = await import('../../core/runtime-client.js');

    expect(() => validateRuntimeEnvironment(process.env, {
      provider: 'openai',
      model: 'gpt-5',
    })).toThrow('Missing environment variable: OPENAI_API_KEY');
  });

  it('fails clearly when a provider has no configured model or built-in default', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

    const { validateRuntimeEnvironment } = await import('../../core/runtime-client.js');

    expect(() => validateRuntimeEnvironment(process.env, {
      provider: 'anthropic',
      model: '',
    })).toThrow('Missing LLM model. Set it in runtime.json or pass --model for provider anthropic.');
  });

  it('runs a chat turn through llm-runtime with normalized runtime settings', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    respondWithTools.mockImplementation(async ({ initialState, modelRequest }) => {
      await modelRequest.onChunk?.({ content: 'Hello' });
      await modelRequest.onChunk?.({ content: ' world' });

      return {
        reason: 'stop',
        state: {
          ...initialState,
          finalText: 'Hello world',
          persistedMessages: [
            ...initialState.persistedMessages,
            { role: 'assistant', content: 'Hello world' },
          ],
          conversationMessages: [
            ...initialState.conversationMessages,
            { role: 'assistant', content: 'Hello world' },
          ],
        },
      };
    });

    const { runChatTurn } = await import('../../core/runtime-client.js');
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
      projectSystemPrompt: 'Project prompt',
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

    expect(createLLMEnvironment).toHaveBeenCalledWith(expect.objectContaining({
      providers: {
        openai: {
          apiKey: 'test-openai-key',
        },
      },
      defaults: {
        reasoningEffort: 'medium',
        toolPermission: 'ask',
      },
    }));
    expect(resolveToolsAsync).toHaveBeenCalledWith(expect.objectContaining({
      environment: { environmentId: 'env-1' },
      builtIns: {
        load_skill: true,
      },
    }));
    expect(respondWithTools).toHaveBeenCalledWith(expect.objectContaining({
      modelRequest: expect.objectContaining({
        mode: 'stream',
        environment: { environmentId: 'env-1' },
        provider: 'openai',
        model: 'gpt-5',
        temperature: 0.2,
        maxTokens: 512,
        webSearch: {
          searchContextSize: 'low',
        },
        builtIns: {
          load_skill: true,
        },
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
    expect(disposeLLMEnvironment).toHaveBeenCalledWith({ environmentId: 'env-1' });
  });

  it('forwards tool calls and tool results through runtime callbacks', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const loadSkillExecute = vi.fn().mockResolvedValue({ ok: true, status: 'loaded' });
    resolveToolsAsync.mockResolvedValue({
      load_skill: {
        execute: loadSkillExecute,
      },
    });
    respondWithTools.mockImplementation(async ({ initialState, onToolCallsResponse, onTextResponse }) => {
      const toolStep = await onToolCallsResponse({
        state: initialState,
        response: {
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
      });

      return await onTextResponse({
        state: toolStep.state,
        response: {
          assistantMessage: {
            role: 'assistant',
            content: 'Loaded skill',
          },
        },
        responseText: 'Loaded skill',
      });
    });

    const { runChatTurn } = await import('../../core/runtime-client.js');
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

    expect(loadSkillExecute).toHaveBeenCalledWith({ skillId: 'agent-cli-core' }, expect.objectContaining({
      toolCallId: 'tool-1',
    }));
    expect(onToolCall).toHaveBeenCalledWith({
      id: 'tool-1',
      name: 'load_skill',
      arguments: '{"skillId":"agent-cli-core"}',
    });
    expect(onToolResult).toHaveBeenCalledWith({
      id: 'tool-1',
      name: 'load_skill',
      result: { ok: true, status: 'loaded' },
    });
    expect(result.messages).toContainEqual(expect.objectContaining({
      role: 'tool',
      tool_call_id: 'tool-1',
      content: '{\n  "ok": true,\n  "status": "loaded"\n}',
    }));
    expect(result.assistantText).toBe('Loaded skill');
  });
});
