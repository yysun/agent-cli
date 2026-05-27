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
 * - 2026-05-27: Covered stream-off `complete(...)` routing and provider metadata forwarding.
 * - 2026-05-27: Covered shared runtime selection separately from credential validation.
 * - 2026-05-26: Covered runtime skill roots for opt-in global skill loading.
 * - 2026-05-26: Updated missing-model guidance for `.env` runtime defaults.
 * - 2026-05-16: Added coverage for runtime tool-result callbacks.
 * - 2026-05-23: Added coverage for CLI-handled tool-call results.
 * - 2026-05-16: Migrated agent-runtime coverage to the `llm-runtime` 0.5.0 loop API.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

const createRuntime = vi.fn();
const complete = vi.fn();
const streamComplete = vi.fn();
const runtimeDispose = vi.fn();

vi.mock('llm-runtime', () => ({
  complete,
  createRuntime,
  streamComplete,
}));

function eventStream(events) {
  return (async function* () {
    for (const event of events) {
      yield event;
    }
  })();
}

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
  complete.mockReset();
  createRuntime.mockReset();
  streamComplete.mockReset();
  runtimeDispose.mockReset();

  runtimeDispose.mockResolvedValue(undefined);
  createRuntime.mockReturnValue({
    runtimeId: 'runtime-1',
    dispose: runtimeDispose,
  });
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

  it('resolves startup runtime selection without credential validation', async () => {
    process.env.AZURE_OPENAI_DEPLOYMENT_NAME = 'gpt-5-enterprise';

    const { resolveRuntimeSelection } = await import('../../core/agent-runtime.js');

    expect(resolveRuntimeSelection(process.env, { provider: 'azure' })).toEqual({
      provider: 'azure',
      model: 'gpt-5-enterprise',
    });
    expect(resolveRuntimeSelection(process.env, {})).toEqual({
      provider: 'openai',
      model: 'gpt-5',
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

    streamComplete.mockImplementation(() => eventStream([
      { type: 'model_start', iteration: 1 },
      { type: 'text_delta', delta: 'Hello', iteration: 1 },
      { type: 'reasoning_delta', delta: 'Thinking', iteration: 1 },
      { type: 'text_delta', delta: ' world', iteration: 1 },
      {
        type: 'assistant_message',
        message: { role: 'assistant', content: '', tool_calls: [{ id: 'fa-1', function: { name: 'final_answer', arguments: '{"answer":"Hello world"}' } }] },
        iteration: 1,
      },
      {
        type: 'completed',
        iteration: 1,
        result: { status: 'completed', output: 'Hello world', messages: [] },
      },
    ]));

    const { runChatTurn } = await import('../../core/agent-runtime.js');
    const onStreamChunk = vi.fn();
    const onModelResponse = vi.fn();

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
      onModelResponse,
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
    expect(streamComplete).toHaveBeenCalledWith(expect.objectContaining({
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
    }));
    expect(onStreamChunk).toHaveBeenCalledTimes(3);
    expect(onStreamChunk).toHaveBeenNthCalledWith(2, { reasoningContent: 'Thinking' });
    expect(onModelResponse).toHaveBeenCalledWith(expect.objectContaining({ type: 'tool_calls' }));
    expect(result.assistantText).toBe('Hello world');
    expect(result.messages.at(-1)).toEqual(expect.objectContaining({ role: 'assistant', content: 'Hello world' }));
    expect(runtimeDispose).toHaveBeenCalledTimes(1);
  });

  it('forwards provider response metadata from runtime completion events', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    streamComplete.mockImplementation(() => eventStream([
      {
        type: 'completed',
        iteration: 1,
        result: {
          status: 'completed',
          output: 'Hello world',
          messages: [],
          raw: {
            type: 'text',
            stopKind: 'natural_stop',
            providerStopReason: 'stop',
            usage: {
              inputTokens: 8,
              outputTokens: 2,
              totalTokens: 10,
            },
          },
        },
      },
    ]));

    const { runChatTurn } = await import('../../core/agent-runtime.js');
    const onModelResponse = vi.fn();

    await runChatTurn({
      chat: { id: 'chat-1', messages: [] },
      userMessage: 'hello',
      stream: true,
      builtInSystemPrompt: 'System prompt',
      skillInventory: [],
      agentConfig: {
        provider: 'openai',
        model: 'gpt-5',
      },
      onModelResponse,
    });

    expect(onModelResponse).toHaveBeenCalledWith({
      type: 'text',
      stopKind: 'natural_stop',
      providerStopReason: 'stop',
      usage: {
        inputTokens: 8,
        outputTokens: 2,
        totalTokens: 10,
      },
    });
  });

  it('uses complete instead of streamComplete when streaming is disabled', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    complete.mockResolvedValue({
      status: 'completed',
      output: 'Done',
      messages: [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'hello' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'final-1', function: { name: 'final_answer', arguments: '{"answer":"Done"}' } },
          ],
        },
        { role: 'assistant', content: 'Done' },
      ],
      raw: {
        type: 'text',
        stopKind: 'natural_stop',
        providerStopReason: 'stop',
      },
    });

    const { runChatTurn } = await import('../../core/agent-runtime.js');
    const onModelResponse = vi.fn();
    const onToolCall = vi.fn();

    const result = await runChatTurn({
      chat: { id: 'chat-1', messages: [] },
      userMessage: 'hello',
      stream: false,
      builtInSystemPrompt: 'System prompt',
      skillInventory: [],
      agentConfig: {
        provider: 'openai',
        model: 'gpt-5',
      },
      onModelResponse,
      onToolCall,
    });

    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      environment: expect.objectContaining({ runtimeId: 'runtime-1' }),
      provider: 'openai',
      model: 'gpt-5',
      builtIns: 'all',
    }));
    expect(streamComplete).not.toHaveBeenCalled();
    expect(onToolCall).not.toHaveBeenCalled();
    expect(onModelResponse).toHaveBeenCalledWith(expect.objectContaining({
      type: 'text',
      stopKind: 'natural_stop',
      providerStopReason: 'stop',
    }));
    expect(result.assistantText).toBe('Done');
    expect(result.messages.at(-1)).toEqual(expect.objectContaining({ role: 'assistant', content: 'Done' }));
  });

  it('forwards tool calls and tool results from streamComplete events', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const toolCall = {
      id: 'tool-1',
      function: {
        name: 'load_skill',
        arguments: '{"skillId":"agent-cli-core"}',
      },
    };
    streamComplete.mockImplementation(() => eventStream([
      { type: 'model_start', iteration: 1 },
      { type: 'assistant_message', message: { role: 'assistant', content: '', tool_calls: [toolCall] }, iteration: 1 },
      { type: 'tool_start', toolCall, args: { skillId: 'agent-cli-core' }, iteration: 1 },
      { type: 'tool_result', toolCall, result: { ok: true, status: 'loaded' }, iteration: 1 },
      { type: 'model_start', iteration: 2 },
      {
        type: 'assistant_message',
        message: { role: 'assistant', content: '', tool_calls: [{ id: 'fa-1', function: { name: 'final_answer', arguments: '{"answer":"Loaded skill"}' } }] },
        iteration: 2,
      },
      { type: 'completed', iteration: 2, result: { status: 'completed', output: 'Loaded skill', messages: [] } },
    ]));

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

  it('forwards approval denials to the runtime via onToolApproval', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    let receivedOnToolApproval;
    streamComplete.mockImplementation(({ onToolApproval }) => {
      receivedOnToolApproval = onToolApproval;
      return eventStream([
        { type: 'completed', iteration: 1, result: { status: 'completed', output: 'Denied', messages: [] } },
      ]);
    });

    const { runChatTurn } = await import('../../core/agent-runtime.js');
    const approvalGate = {
      requestApproval: vi.fn().mockResolvedValue({ approved: false, reason: 'Nope' }),
    };

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
    });

    expect(typeof receivedOnToolApproval).toBe('function');
    const decision = await receivedOnToolApproval({
      toolCall: { id: 'tool-1', function: { name: 'load_skill', arguments: '{"skillId":"agent-cli-core"}' } },
      toolName: 'load_skill',
      parsedArguments: { skillId: 'agent-cli-core' },
    });
    expect(approvalGate.requestApproval).toHaveBeenCalledWith({
      toolCallId: 'tool-1',
      toolName: 'load_skill',
      arguments: { skillId: 'agent-cli-core' },
    });
    expect(decision).toEqual({ approved: false, reason: 'Nope' });
    expect(result.assistantText).toBe('Denied');
  });

  it('forwards CLI tool-call handlers to the runtime via onToolCall', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    let receivedOnToolCall;
    streamComplete.mockImplementation(({ onToolCall }) => {
      receivedOnToolCall = onToolCall;
      return eventStream([
        { type: 'completed', iteration: 1, result: { status: 'completed', output: 'Answered', messages: [] } },
      ]);
    });

    const { runChatTurn } = await import('../../core/agent-runtime.js');
    const callOrder = [];
    const onToolCall = vi.fn(() => {
      callOrder.push('onToolCall');
    });
    const handleToolCall = vi.fn().mockImplementation(async () => {
      callOrder.push('handleToolCall');
      return {
        handled: true,
        result: { ok: true, status: 'answered' },
      };
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
      onToolCall,
      handleToolCall,
    });

    expect(typeof receivedOnToolCall).toBe('function');
    const handlerOutcome = await receivedOnToolCall({
      toolCall: { id: 'tool-input-1', function: { name: 'ask_user_input', arguments: '{"question":"Choose","options":["A","B"]}' } },
      toolName: 'ask_user_input',
      parsedArguments: { question: 'Choose', options: ['A', 'B'] },
      context: { workingDirectory: '/tmp' },
      executeDefault: async () => ({ ok: false }),
    });
    expect(handleToolCall).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'ask_user_input',
      parsedArguments: { question: 'Choose', options: ['A', 'B'] },
      executeDefault: expect.any(Function),
    }));
    expect(onToolCall).toHaveBeenCalledWith({
      id: 'tool-input-1',
      name: 'ask_user_input',
      arguments: '{"question":"Choose","options":["A","B"]}',
    });
    expect(callOrder).toEqual(['onToolCall', 'handleToolCall']);
    expect(handlerOutcome).toEqual({ handled: true, result: { ok: true, status: 'answered' } });
    expect(result.assistantText).toBe('Answered');
  });
});
