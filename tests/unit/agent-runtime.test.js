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
 * - 2026-07-28: Covered `llm-runtime` 0.7 approval and human-input outcomes.
 * - 2026-06-10: Covered shared rejection for unresolved host-owned tool-call turns.
 * - 2026-06-04: Covered host-provided runtime skill roots for settings-filtered Electron turns.
 * - 2026-05-27: Added check-js annotations for mocked stream events and captured runtime callbacks.
 * - 2026-05-28: Covered omitted default built-ins and streamed `answer_delta` content for `llm-runtime` 0.6.3.
 * - 2026-05-27: Covered plain-text fallback when runtime rejects only the missing control-tool wrapper without persisting retry drafts.
 * - 2026-05-27: Covered explicit built-ins and streamed answer delta content.
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

vi.mock('llm-runtime', async (importOriginal) => ({
  ...await importOriginal(),
  complete,
  createRuntime,
  streamComplete,
}));

/**
 * @param {Array<Record<string, any>>} events
 */
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
  it('allows completed chat turns and rejects unresolved host-owned tool calls', async () => {
    const { assertCompletedChatTurn } = await import('../../core/agent-runtime.js');

    expect(() => assertCompletedChatTurn({
      status: 'completed',
      assistantText: 'Done',
      messages: [],
    })).not.toThrow();

    expect(() => assertCompletedChatTurn({
      status: 'tool_calls',
      toolCalls: [
        { id: 'tool-1', function: { name: 'ask_user_input' } },
        { id: 'tool-2', function: { name: 'custom_lookup' } },
      ],
      assistantText: '',
      messages: [],
    })).toThrow('LLM turn paused with unresolved tool calls: ask_user_input, custom_lookup. Host must handle these tool calls before completing the turn.');
  });

  it('uses an unknown-tool fallback when unresolved tool calls are malformed', async () => {
    const { assertCompletedChatTurn } = await import('../../core/agent-runtime.js');

    expect(() => assertCompletedChatTurn({
      status: 'tool_calls',
      toolCalls: [{ id: 'tool-1', function: {} }],
      assistantText: '',
      messages: [],
    })).toThrow('LLM turn paused with unresolved tool calls: unknown_tool. Host must handle these tool calls before completing the turn.');
  });

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
      context: expect.objectContaining({
        workingDirectory: expect.any(String),
        reasoningEffort: 'medium',
        toolPermission: 'ask',
      }),
    }));
    expect(streamComplete.mock.calls[0][0]).not.toHaveProperty('builtIns');
    expect(onStreamChunk).toHaveBeenCalledTimes(2);
    expect(onStreamChunk).toHaveBeenNthCalledWith(1, { reasoningContent: 'Thinking' });
    expect(onStreamChunk).toHaveBeenNthCalledWith(2, { content: 'Hello world' });
    expect(onModelResponse).toHaveBeenCalledWith(expect.objectContaining({ type: 'tool_calls' }));
    expect(result.assistantText).toBe('Hello world');
    expect(result.messages.at(-1)).toEqual(expect.objectContaining({ role: 'assistant', content: 'Hello world' }));
    expect(runtimeDispose).toHaveBeenCalledTimes(1);
  });

  it('uses caller-provided runtime skill roots when a host filters available skills', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    streamComplete.mockImplementation(() => eventStream([
      { type: 'answer_delta', delta: 'Done', iteration: 1 },
      { type: 'completed', iteration: 1, result: { status: 'completed', output: 'Done', messages: [] } },
    ]));

    const { runChatTurn } = await import('../../core/agent-runtime.js');
    const selectedSkillRoot = path.join(process.cwd(), 'selected-skills', 'agent-world-skill');

    await runChatTurn({
      chat: { id: 'chat-1', messages: [] },
      userMessage: 'hello',
      stream: true,
      builtInSystemPrompt: 'System prompt',
      skillInventory: [
        { skillId: 'agent-world-skill', description: 'Selected skill' },
      ],
      runtimeSkillRoots: [selectedSkillRoot],
      agentConfig: {
        provider: 'openai',
        model: 'gpt-5',
      },
    });

    expect(createRuntime).toHaveBeenCalledWith(expect.objectContaining({
      skillRoots: [selectedSkillRoot],
    }));
  });

  it('streams answer deltas as assistant content', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    streamComplete.mockImplementation(() => eventStream([
      { type: 'model_start', iteration: 1 },
      { type: 'answer_delta', delta: 'Done', iteration: 1 },
      { type: 'completed', iteration: 1, result: { status: 'completed', output: 'Done', messages: [] } },
    ]));

    const { runChatTurn } = await import('../../core/agent-runtime.js');
    const onStreamChunk = vi.fn();

    const result = await runChatTurn({
      chat: { id: 'chat-1', messages: [] },
      userMessage: 'hello',
      stream: true,
      builtInSystemPrompt: 'System prompt',
      skillInventory: [],
      agentConfig: {
        provider: 'openai',
        model: 'gpt-5',
      },
      onStreamChunk,
    });

    expect(onStreamChunk).toHaveBeenCalledWith({ content: 'Done' });
    expect(onStreamChunk).toHaveBeenCalledTimes(1);
    expect(result.assistantText).toBe('Done');
  });

  it('passes read-only tool permission through without overriding runtime built-ins', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    streamComplete.mockImplementation(() => eventStream([
      { type: 'completed', iteration: 1, result: { status: 'completed', output: 'Done', messages: [] } },
    ]));

    const { runChatTurn } = await import('../../core/agent-runtime.js');

    await runChatTurn({
      chat: { id: 'chat-1', messages: [] },
      userMessage: 'hello',
      stream: true,
      builtInSystemPrompt: 'System prompt',
      skillInventory: [],
      agentConfig: {
        provider: 'openai',
        model: 'gpt-5',
        toolPermission: 'read',
      },
    });

    expect(streamComplete.mock.calls[0][0]).not.toHaveProperty('builtIns');
    expect(streamComplete.mock.calls[0][0].context).toMatchObject({
      toolPermission: 'read',
    });
  });

  it('preserves rejected plain-text final responses as a compatibility fallback', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    streamComplete.mockImplementation(() => eventStream([
      { type: 'model_start', iteration: 1 },
      { type: 'assistant_message', message: { role: 'assistant', content: 'Plain answer' }, iteration: 1 },
      {
        type: 'failed',
        iteration: 1,
        result: {
          status: 'failed',
          messages: [],
          error: 'Assistant response did not complete the task with required evidence: Plain answer',
        },
      },
    ]));

    const { runChatTurn } = await import('../../core/agent-runtime.js');

    const onStreamChunk = vi.fn();

    const result = await runChatTurn({
      chat: { id: 'chat-1', messages: [] },
      userMessage: 'hello',
      stream: true,
      builtInSystemPrompt: 'System prompt',
      skillInventory: [],
      agentConfig: {
        provider: 'openai',
        model: 'gpt-5',
      },
      onStreamChunk,
    });

    expect(onStreamChunk).toHaveBeenCalledWith({ content: 'Plain answer' });
    expect(onStreamChunk).toHaveBeenCalledTimes(1);
    expect(result.assistantText).toBe('Plain answer');
    expect(result.messages.at(-1)).toEqual(expect.objectContaining({
      role: 'assistant',
      content: 'Plain answer',
    }));
    expect(result.messages.filter((message) => message.role === 'assistant')).toHaveLength(1);
  });

  it('does not persist rejected retry text after a later completed answer', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    streamComplete.mockImplementation(() => eventStream([
      { type: 'assistant_message', message: { role: 'assistant', content: 'Draft answer' }, iteration: 1 },
      {
        type: 'failed',
        iteration: 1,
        result: {
          status: 'failed',
          messages: [],
          error: 'Assistant response did not complete the task with required evidence: Draft answer',
        },
      },
      { type: 'completed', iteration: 2, result: { status: 'completed', output: 'Final answer', messages: [] } },
    ]));

    const { runChatTurn } = await import('../../core/agent-runtime.js');

    const result = await runChatTurn({
      chat: { id: 'chat-1', messages: [] },
      userMessage: 'hello',
      stream: true,
      builtInSystemPrompt: 'System prompt',
      skillInventory: [],
      agentConfig: {
        provider: 'openai',
        model: 'gpt-5',
      },
    });

    expect(result.assistantText).toBe('Final answer');
    expect(result.messages.at(-1)).toEqual(expect.objectContaining({
      role: 'assistant',
      content: 'Final answer',
    }));
    expect(result.messages).not.toContainEqual(expect.objectContaining({
      role: 'assistant',
      content: 'Draft answer',
    }));
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
    }));
    expect(complete.mock.calls[0][0]).not.toHaveProperty('builtIns');
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

  it('returns host-owned tool_calls from complete without throwing', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const toolCall = {
      id: 'ask-1',
      function: {
        name: 'ask_user_input',
        arguments: '{"questions":[{"header":"Scope","id":"scope","question":"Which scope?","options":[{"id":"all","label":"All"},{"id":"changed","label":"Changed"}]}]}',
      },
    };
    complete.mockResolvedValue({
      status: 'tool_calls',
      toolCalls: [toolCall],
      messages: [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'hello' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [toolCall],
        },
      ],
      raw: {
        type: 'tool_calls',
        providerStopReason: 'tool_calls',
      },
    });

    const { runChatTurn } = await import('../../core/agent-runtime.js');
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
      onToolCall,
    });

    expect(result.status).toBe('tool_calls');
    expect(result.toolCalls).toEqual([toolCall]);
    expect(result.assistantText).toBe('');
    expect(result.messages).toContainEqual(expect.objectContaining({
      role: 'assistant',
      tool_calls: [toolCall],
    }));
    expect(onToolCall).toHaveBeenCalledWith({
      id: 'ask-1',
      name: 'ask_user_input',
      arguments: toolCall.function.arguments,
    });
    expect(streamComplete).not.toHaveBeenCalled();
  });

  it('handles and resumes host-owned tool_calls from complete through the shell callback', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const toolCall = {
      id: 'ask-resume-1',
      function: {
        name: 'ask_user_input',
        arguments: '{"questions":[{"header":"Scope","id":"scope","question":"Which scope?","options":[{"id":"all","label":"All"},{"id":"changed","label":"Changed"}]}]}',
      },
    };

    complete
      .mockResolvedValueOnce({
        status: 'tool_calls',
        toolCalls: [toolCall],
        messages: [
          { role: 'system', content: 'System prompt' },
          { role: 'user', content: 'hello' },
          {
            role: 'assistant',
            content: '',
            tool_calls: [toolCall],
          },
        ],
        raw: {
          type: 'tool_calls',
          providerStopReason: 'tool_calls',
        },
      })
      .mockImplementationOnce(async (request) => {
        expect(request.messages).toContainEqual(expect.objectContaining({
          role: 'tool',
          tool_call_id: 'ask-resume-1',
          content: expect.stringContaining('"answered"'),
        }));
        return {
          status: 'completed',
          output: 'Done',
          messages: [
            ...request.messages,
            { role: 'assistant', content: 'Done' },
          ],
        };
      });

    const { runChatTurn } = await import('../../core/agent-runtime.js');
    const onToolCall = vi.fn();
    const onToolResult = vi.fn();
    const handleToolCall = vi.fn().mockResolvedValue({
      handled: true,
      result: { status: 'answered', answers: { scope: 'all' } },
    });

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
      onToolCall,
      onToolResult,
      handleToolCall,
    });

    expect(result.status).toBe('completed');
    expect(result.assistantText).toBe('Done');
    expect(complete).toHaveBeenCalledTimes(2);
    expect(handleToolCall).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'ask_user_input',
      parsedArguments: expect.objectContaining({
        questions: expect.any(Array),
      }),
    }));
    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(onToolResult).toHaveBeenCalledWith(expect.objectContaining({
      id: 'ask-resume-1',
      name: 'ask_user_input',
      result: { status: 'answered', answers: { scope: 'all' } },
    }));
    expect(result.messages).toContainEqual(expect.objectContaining({
      role: 'tool',
      tool_call_id: 'ask-resume-1',
      content: expect.stringContaining('"answered"'),
    }));
    expect(streamComplete).not.toHaveBeenCalled();
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

  it('returns host-owned tool_calls from streamComplete without throwing', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const toolCall = {
      id: 'ask-stream-1',
      function: {
        name: 'ask_user_input',
        arguments: '{"questions":[{"header":"Format","id":"format","question":"Which format?","options":[{"id":"pdf","label":"PDF"},{"id":"docx","label":"DOCX"}]}]}',
      },
    };
    streamComplete.mockImplementation(() => eventStream([
      { type: 'model_start', iteration: 1 },
      {
        type: 'assistant_message',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [toolCall],
        },
        iteration: 1,
      },
      {
        type: 'tool_calls',
        iteration: 1,
        result: {
          status: 'tool_calls',
          toolCalls: [toolCall],
          messages: [
            { role: 'system', content: 'System prompt' },
            { role: 'user', content: 'hello' },
            {
              role: 'assistant',
              content: '',
              tool_calls: [toolCall],
            },
          ],
          raw: {
            type: 'tool_calls',
            providerStopReason: 'tool_calls',
          },
        },
      },
    ]));

    const { runChatTurn } = await import('../../core/agent-runtime.js');
    const onToolCall = vi.fn();

    const result = await runChatTurn({
      chat: { id: 'chat-1', messages: [] },
      userMessage: 'hello',
      stream: true,
      builtInSystemPrompt: 'System prompt',
      skillInventory: [],
      agentConfig: {
        provider: 'openai',
        model: 'gpt-5',
      },
      onToolCall,
    });

    expect(result.status).toBe('tool_calls');
    expect(result.toolCalls).toEqual([toolCall]);
    expect(result.assistantText).toBe('');
    expect(result.messages).toContainEqual(expect.objectContaining({
      role: 'assistant',
      tool_calls: [toolCall],
    }));
    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(onToolCall).toHaveBeenCalledWith({
      id: 'ask-stream-1',
      name: 'ask_user_input',
      arguments: toolCall.function.arguments,
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it('handles and resumes host-owned tool_calls from streamComplete through the shell callback', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const toolCall = {
      id: 'ask-stream-resume-1',
      function: {
        name: 'ask_user_input',
        arguments: '{"questions":[{"header":"Format","id":"format","question":"Which format?","options":[{"id":"pdf","label":"PDF"},{"id":"docx","label":"DOCX"}]}]}',
      },
    };

    streamComplete
      .mockImplementationOnce(() => eventStream([
        { type: 'model_start', iteration: 1 },
        {
          type: 'assistant_message',
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [toolCall],
          },
          iteration: 1,
        },
        {
          type: 'tool_calls',
          iteration: 1,
          result: {
            status: 'tool_calls',
            toolCalls: [toolCall],
            messages: [
              { role: 'system', content: 'System prompt' },
              { role: 'user', content: 'hello' },
              {
                role: 'assistant',
                content: '',
                tool_calls: [toolCall],
              },
            ],
            raw: {
              type: 'tool_calls',
              providerStopReason: 'tool_calls',
            },
          },
        },
      ]))
      .mockImplementationOnce((request) => {
        expect(request.messages).toContainEqual(expect.objectContaining({
          role: 'tool',
          tool_call_id: 'ask-stream-resume-1',
          content: expect.stringContaining('"answered"'),
        }));
        return eventStream([
          {
            type: 'completed',
            iteration: 2,
            result: {
              status: 'completed',
              output: 'Done streaming',
              messages: [],
            },
          },
        ]);
      });

    const { runChatTurn } = await import('../../core/agent-runtime.js');
    const onToolCall = vi.fn();
    const onToolResult = vi.fn();
    const handleToolCall = vi.fn().mockResolvedValue({
      handled: true,
      result: { status: 'answered', answers: { format: 'pdf' } },
    });

    const result = await runChatTurn({
      chat: { id: 'chat-1', messages: [] },
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
      handleToolCall,
    });

    expect(result.status).toBe('completed');
    expect(result.assistantText).toBe('Done streaming');
    expect(streamComplete).toHaveBeenCalledTimes(2);
    expect(handleToolCall).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'ask_user_input',
      parsedArguments: expect.objectContaining({
        questions: expect.any(Array),
      }),
    }));
    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(onToolResult).toHaveBeenCalledWith(expect.objectContaining({
      id: 'ask-stream-resume-1',
      name: 'ask_user_input',
      result: { status: 'answered', answers: { format: 'pdf' } },
    }));
    expect(result.messages).toContainEqual(expect.objectContaining({
      role: 'tool',
      tool_call_id: 'ask-stream-resume-1',
      content: expect.stringContaining('"answered"'),
    }));
    expect(complete).not.toHaveBeenCalled();
  });

  it('forwards approval denials to the runtime via onToolApproval', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    /** @type {undefined | ((request: Record<string, any>) => Promise<Record<string, any>> | Record<string, any>)} */
    let receivedOnToolApproval;
    streamComplete.mockImplementation(({ onToolApproval }) => {
      receivedOnToolApproval = onToolApproval;
      return eventStream([
        { type: 'completed', iteration: 1, result: { status: 'completed', output: 'Denied', messages: [] } },
      ]);
    });

    const { runChatTurn } = await import('../../core/agent-runtime.js');
    const approvalGate = {
      requestApproval: vi.fn().mockResolvedValue({
        decision: 'cancel',
        reason: 'rejected',
        message: 'Nope',
      }),
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
    if (typeof receivedOnToolApproval !== 'function') {
      throw new Error('streamComplete did not receive onToolApproval');
    }
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
    expect(decision).toEqual({
      decision: 'cancel',
      reason: 'rejected',
      message: 'Nope',
    });
    expect(result.assistantText).toBe('Denied');
  });

  it('fails closed when ask permission has no approval gate', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    /** @type {undefined | ((request: Record<string, any>) => Promise<Record<string, any>> | Record<string, any>)} */
    let receivedOnToolApproval;
    streamComplete.mockImplementation(({ onToolApproval }) => {
      receivedOnToolApproval = onToolApproval;
      return eventStream([
        { type: 'completed', iteration: 1, result: { status: 'completed', output: 'Not executed', messages: [] } },
      ]);
    });

    const { runChatTurn } = await import('../../core/agent-runtime.js');
    await runChatTurn({
      chat: { id: 'chat-1', messages: [] },
      userMessage: 'hello',
      builtInSystemPrompt: 'System prompt',
      skillInventory: [],
      agentConfig: {
        provider: 'openai',
        model: 'gpt-5',
        toolPermission: 'ask',
      },
    });

    expect(typeof receivedOnToolApproval).toBe('function');
    if (typeof receivedOnToolApproval !== 'function') {
      throw new Error('streamComplete did not receive onToolApproval');
    }
    await expect(receivedOnToolApproval({
      toolCall: { id: 'tool-no-gate', function: { name: 'load_skill', arguments: '{}' } },
      toolName: 'load_skill',
      parsedArguments: {},
    })).resolves.toEqual({
      decision: 'cancel',
      reason: 'dismissed',
      message: 'Tool execution denied: approval is unavailable for load_skill.',
    });
  });

  it('returns buffered approval cancellation without requiring final text or retrying', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    const toolCall = {
      id: 'tool-cancel-1',
      type: 'function',
      function: { name: 'load_skill', arguments: '{"skillId":"core"}' },
    };
    complete.mockResolvedValue({
      status: 'cancelled',
      messages: [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: '', tool_calls: [toolCall] },
      ],
      cancellation: {
        kind: 'tool_approval',
        reason: 'approval_rejected',
        toolCall,
        message: 'User rejected the call.',
      },
    });

    const { runChatTurn, selectPersistableMessages } = await import('../../core/agent-runtime.js');
    const result = await runChatTurn({
      chat: { id: 'chat-1', messages: [] },
      userMessage: 'hello',
      stream: false,
      builtInSystemPrompt: 'System prompt',
      skillInventory: [],
      agentConfig: { provider: 'openai', model: 'gpt-5' },
    });

    expect(result).toMatchObject({
      status: 'cancelled',
      assistantText: '',
      cancellation: {
        kind: 'tool_approval',
        reason: 'approval_rejected',
      },
    });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(selectPersistableMessages(result.messages)).toEqual([
      expect.objectContaining({ role: 'user', content: 'hello' }),
    ]);
  });

  it.each(['approval_invalid', 'approval_callback_error'])(
    'preserves streamed %s cancellation as a terminal host outcome',
    async (reason) => {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      const toolCall = {
        id: `tool-${reason}`,
        type: 'function',
        function: { name: 'load_skill', arguments: '{"skillId":"core"}' },
      };
      streamComplete.mockImplementation(() => eventStream([
        { type: 'assistant_message', iteration: 1, message: { role: 'assistant', content: '', tool_calls: [toolCall] } },
        {
          type: 'cancelled',
          iteration: 1,
          result: {
            status: 'cancelled',
            messages: [],
            cancellation: { kind: 'tool_approval', reason, toolCall },
          },
        },
      ]));

      const { runChatTurn } = await import('../../core/agent-runtime.js');
      const result = await runChatTurn({
        chat: { id: 'chat-1', messages: [] },
        userMessage: 'hello',
        stream: true,
        builtInSystemPrompt: 'System prompt',
        skillInventory: [],
        agentConfig: { provider: 'openai', model: 'gpt-5' },
      });

      expect(result).toMatchObject({
        status: 'cancelled',
        assistantText: '',
        cancellation: { kind: 'tool_approval', reason },
      });
      expect(streamComplete).toHaveBeenCalledTimes(1);
      expect(complete).not.toHaveBeenCalled();
    },
  );

  it('cancels human input without a tool result or another completion pass', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    const toolCall = {
      id: 'ask-cancel-1',
      function: {
        name: 'ask_user_input',
        arguments: '{"questions":[{"header":"Scope","id":"scope","question":"Which scope?","options":[{"id":"all","label":"All"},{"id":"changed","label":"Changed"}]}]}',
      },
    };
    streamComplete.mockImplementation(() => eventStream([
      { type: 'assistant_message', iteration: 1, message: { role: 'assistant', content: '', tool_calls: [toolCall] } },
      {
        type: 'tool_calls',
        iteration: 1,
        result: { status: 'tool_calls', toolCalls: [toolCall], messages: [] },
      },
    ]));

    const { runChatTurn } = await import('../../core/agent-runtime.js');
    const onToolResult = vi.fn();
    const result = await runChatTurn({
      chat: { id: 'chat-1', messages: [] },
      userMessage: 'hello',
      stream: true,
      builtInSystemPrompt: 'System prompt',
      skillInventory: [],
      agentConfig: { provider: 'openai', model: 'gpt-5' },
      onToolResult,
      handleToolCall: async () => ({
        handled: true,
        result: { status: 'cancelled', reason: 'skipped' },
      }),
    });

    expect(result).toMatchObject({
      status: 'cancelled',
      assistantText: '',
      cancellation: {
        kind: 'human_input',
        reason: 'skipped',
        toolCallId: 'ask-cancel-1',
      },
    });
    expect(streamComplete).toHaveBeenCalledTimes(1);
    expect(onToolResult).not.toHaveBeenCalled();
    expect(result.messages.some((message) => message.role === 'tool')).toBe(false);
  });

  it('forwards CLI tool-call handlers to the runtime via onToolCall', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    /** @type {undefined | ((request: Record<string, any>) => Promise<Record<string, any>> | Record<string, any>)} */
    let receivedOnToolCall;
    streamComplete.mockImplementation(({ onToolCall }) => {
      receivedOnToolCall = onToolCall;
      return eventStream([
        { type: 'completed', iteration: 1, result: { status: 'completed', output: 'Answered', messages: [] } },
      ]);
    });

    const { runChatTurn } = await import('../../core/agent-runtime.js');
    /** @type {string[]} */
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
    if (typeof receivedOnToolCall !== 'function') {
      throw new Error('streamComplete did not receive onToolCall');
    }
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
