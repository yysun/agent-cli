// @ts-check
/**
 * Human Input Turn Flow Unit Tests
 *
 * Purpose:
 * - Cover the `ask_user_input` request/answer/resume/persist path deterministically.
 *
 * Key features:
 * - Drives `runChatTurn` through the real `HumanInputSessionManager` and a fake renderer,
 *   which is the composition the Electron main process wires up.
 * - Covers the rejected-turn path so a discarded transcript cannot regress.
 *
 * Recent changes:
 * - 2026-07-28: Migrated the deterministic Electron composition to canonical 0.7
 *   answered and cancelled outcomes.
 * - 2026-07-27: Added deterministic coverage replacing reliance on live model behavior.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createRuntime = vi.fn();
const complete = vi.fn();
const streamComplete = vi.fn();

vi.mock('llm-runtime', async (importOriginal) => ({
  ...await importOriginal(),
  complete,
  createRuntime,
  streamComplete,
}));

/** @param {Array<Record<string, any>>} events */
function eventStream(events) {
  return (async function* () {
    for (const event of events) {
      yield event;
    }
  })();
}

function createFakeRenderer() {
  return {
    sent: [],
    destroyed: false,
    isDestroyed() {
      return this.destroyed;
    },
    send(channel, request) {
      this.sent.push({ channel, request });
    },
  };
}

const askUserInputCall = {
  id: 'ask-1',
  function: {
    name: 'ask_user_input',
    arguments: JSON.stringify({
      type: 'single-select',
      allowSkip: true,
      questions: [{
        header: 'E2E',
        id: 'route',
        question: 'Choose the route.',
        options: [
          { id: 'alpha', label: 'Alpha route' },
          { id: 'beta', label: 'Beta route' },
        ],
      }],
    }),
  },
};

const originalOpenAiKey = process.env.OPENAI_API_KEY;

beforeEach(() => {
  complete.mockReset();
  createRuntime.mockReset();
  streamComplete.mockReset();
  createRuntime.mockReturnValue({ dispose: vi.fn() });
  process.env.OPENAI_API_KEY = 'test-openai-key';
});

afterEach(() => {
  vi.resetModules();
  if (typeof originalOpenAiKey === 'undefined') {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
  }
});

describe('ask_user_input turn flow', () => {
  it('sends the request to the renderer, resumes on the answer, and keeps the final assistant text', async () => {
    // First pass returns the host-owned call; second pass completes the turn.
    streamComplete
      .mockImplementationOnce(() => eventStream([
        { type: 'assistant_message', message: { role: 'assistant', content: '', tool_calls: [askUserInputCall] } },
        { type: 'tool_calls', iteration: 1, result: { status: 'tool_calls', toolCalls: [askUserInputCall], messages: [] } },
      ]))
      .mockImplementationOnce(() => eventStream([
        { type: 'completed', iteration: 2, result: { status: 'completed', output: 'Electron input e2e complete.', messages: [] } },
      ]));

    const { runChatTurn } = await import('../../core/agent-runtime.js');
    const { HumanInputSessionManager } = await import('../../electron/human-input-session.js');
    const { parseHumanInputRequest } = await import('../../cli/src/human-input-ui.js');

    const renderer = createFakeRenderer();
    const sessions = new HumanInputSessionManager({
      requestChannel: 'humanInput:request',
      timeoutMs: 5000,
    });

    const turn = runChatTurn({
      chat: { id: 'chat-1', messages: [] },
      userMessage: 'Run ELECTRON_INPUT_E2E now.',
      builtInSystemPrompt: 'System prompt',
      skillInventory: [],
      agentConfig: { provider: 'openai', model: 'gpt-5' },
      handleToolCall: async ({ toolCall, toolName, arguments: toolArguments }) => {
        const request = parseHumanInputRequest(toolName, toolArguments, toolCall.id);
        if (!request) {
          return { handled: false };
        }

        const answer = await sessions.requestInput(renderer, request);
        const { requestId: _requestId, ...outcome } = answer;
        return { handled: true, result: outcome };
      },
    });

    // The renderer receives the prompt, exactly as Electron's IPC would deliver it.
    await vi.waitFor(() => {
      expect(renderer.sent).toHaveLength(1);
    });
    expect(renderer.sent[0].channel).toBe('humanInput:request');
    expect(renderer.sent[0].request.questions[0].question).toBe('Choose the route.');

    expect(sessions.resolveAnswer({
      status: 'answered',
      requestId: renderer.sent[0].request.requestId,
      answers: { route: 'alpha' },
    })).toEqual({ ok: true });

    const result = await turn;

    expect(result.status).toBe('completed');
    expect(result.assistantText).toBe('Electron input e2e complete.');
    expect(result.messages).toContainEqual(expect.objectContaining({
      role: 'tool',
      tool_call_id: 'ask-1',
      content: expect.stringContaining('alpha'),
    }));
    expect(result.messages).toContainEqual(expect.objectContaining({
      role: 'assistant',
      content: 'Electron input e2e complete.',
    }));
  });

  it('cancels dismissed Electron input without a tool result or model retry', async () => {
    streamComplete.mockImplementation(() => eventStream([
      { type: 'assistant_message', message: { role: 'assistant', content: '', tool_calls: [askUserInputCall] } },
      { type: 'tool_calls', iteration: 1, result: { status: 'tool_calls', toolCalls: [askUserInputCall], messages: [] } },
    ]));

    const { runChatTurn, selectPersistableMessages } = await import('../../core/agent-runtime.js');
    const { HumanInputSessionManager } = await import('../../electron/human-input-session.js');
    const { parseHumanInputRequest } = await import('../../cli/src/human-input-ui.js');
    const { serializeElectronTurnOutcome } = await import('../../electron/turn-outcome.js');

    const renderer = createFakeRenderer();
    const sessions = new HumanInputSessionManager({
      requestChannel: 'humanInput:request',
      timeoutMs: 5000,
    });
    const turn = runChatTurn({
      chat: { id: 'chat-1', messages: [] },
      userMessage: 'Run ELECTRON_INPUT_E2E now.',
      builtInSystemPrompt: 'System prompt',
      skillInventory: [],
      agentConfig: { provider: 'openai', model: 'gpt-5' },
      handleToolCall: async ({ toolCall, toolName, arguments: toolArguments }) => {
        const request = parseHumanInputRequest(toolName, toolArguments, toolCall.id);
        if (!request) {
          return { handled: false };
        }

        const answer = await sessions.requestInput(renderer, request);
        const { requestId: _requestId, ...outcome } = answer;
        return { handled: true, result: outcome };
      },
    });

    await vi.waitFor(() => {
      expect(renderer.sent).toHaveLength(1);
    });
    expect(sessions.resolveAnswer({
      status: 'cancelled',
      requestId: renderer.sent[0].request.requestId,
      reason: 'dismissed',
      message: 'User closed the prompt.',
    })).toEqual({ ok: true });

    const result = await turn;
    expect(serializeElectronTurnOutcome(result)).toEqual({
      status: 'cancelled',
      assistantText: '',
      cancellation: {
        kind: 'human_input',
        reason: 'dismissed',
        toolCallId: 'ask-1',
        toolName: 'ask_user_input',
        message: 'User closed the prompt.',
      },
    });
    expect(streamComplete).toHaveBeenCalledTimes(1);
    expect(result.messages.some((message) => message.role === 'tool')).toBe(false);

    const persistable = selectPersistableMessages(result.messages);
    expect(persistable).toContainEqual(expect.objectContaining({
      role: 'user',
      content: 'Run ELECTRON_INPUT_E2E now.',
    }));
    expect(persistable.some((message) => message.role === 'tool')).toBe(false);
    expect(persistable.some((message) => Array.isArray(message.tool_calls))).toBe(false);
  });

  it('keeps the user message when the turn is rejected for an unresolved tool call', async () => {
    const unhandledCall = { id: 'host-1', function: { name: 'some_host_tool', arguments: '{}' } };
    streamComplete.mockImplementation(() => eventStream([
      { type: 'assistant_message', message: { role: 'assistant', content: '', tool_calls: [unhandledCall] } },
      { type: 'tool_calls', iteration: 1, result: { status: 'tool_calls', toolCalls: [unhandledCall], messages: [] } },
    ]));

    const { runChatTurn, assertCompletedChatTurn, selectPersistableMessages } = await import('../../core/agent-runtime.js');

    const result = await runChatTurn({
      chat: { id: 'chat-1', messages: [{ role: 'user', content: 'earlier turn' }] },
      userMessage: 'hello',
      builtInSystemPrompt: 'System prompt',
      skillInventory: [],
      agentConfig: { provider: 'openai', model: 'gpt-5' },
      handleToolCall: async () => ({ handled: false }),
    });

    expect(result.status).toBe('tool_calls');
    expect(() => assertCompletedChatTurn(result)).toThrow(/some_host_tool/);

    // The transcript that must survive the rejection.
    const persistable = selectPersistableMessages(result.messages);
    expect(persistable).toContainEqual(expect.objectContaining({ role: 'user', content: 'earlier turn' }));
    expect(persistable).toContainEqual(expect.objectContaining({ role: 'user', content: 'hello' }));

    // ...without the orphaned tool call that would break the next turn.
    const orphaned = persistable.filter((message) => (
      message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length > 0
    ));
    expect(orphaned).toHaveLength(0);
  });

  it('rejects malformed requests before either host renders a prompt', async () => {
    const { parseHumanInputRequest } = await import('../../cli/src/human-input-ui.js');
    const validOption = { id: 'a', label: 'A' };
    const secondOption = { id: 'b', label: 'B' };
    const validQuestion = {
      header: 'Input',
      id: 'scope',
      question: 'Choose.',
      options: [validOption, secondOption],
    };
    const invalidPayloads = [
      { question: 'Flat?', options: [validOption, secondOption] },
      { type: 'invalid', questions: [validQuestion] },
      { questions: [{ ...validQuestion, id: '' }] },
      { questions: [validQuestion, validQuestion] },
      { questions: [{ ...validQuestion, options: [validOption] }] },
      { questions: [{ ...validQuestion, options: [validOption, validOption] }] },
      { questions: [{ ...validQuestion, options: [{ label: 'A' }, secondOption] }] },
      { questions: [{ ...validQuestion, options: ['A', 'B'] }] },
    ];

    for (const payload of invalidPayloads) {
      expect(parseHumanInputRequest('ask_user_input', payload, 'tool-1')).toBeNull();
    }
    expect(parseHumanInputRequest('ask_user_question', { questions: [validQuestion] }, 'tool-1')).toBeNull();

    const invalidCall = {
      id: 'ask-invalid-1',
      function: { name: 'ask_user_input', arguments: JSON.stringify(invalidPayloads[0]) },
    };
    streamComplete.mockImplementation(() => eventStream([
      { type: 'assistant_message', message: { role: 'assistant', content: '', tool_calls: [invalidCall] } },
      { type: 'tool_calls', iteration: 1, result: { status: 'tool_calls', toolCalls: [invalidCall], messages: [] } },
    ]));

    const { runChatTurn } = await import('../../core/agent-runtime.js');
    const renderer = createFakeRenderer();
    const result = await runChatTurn({
      chat: { id: 'chat-1', messages: [] },
      userMessage: 'hello',
      builtInSystemPrompt: 'System prompt',
      skillInventory: [],
      agentConfig: { provider: 'openai', model: 'gpt-5' },
      handleToolCall: async ({ toolCall, toolName, arguments: toolArguments }) => {
        const request = parseHumanInputRequest(toolName, toolArguments, toolCall.id);
        if (!request) {
          return { handled: false };
        }
        renderer.send('humanInput:request', request);
        return { handled: true, result: { status: 'answered', answers: { scope: 'a' } } };
      },
    });

    expect(result).toMatchObject({
      status: 'cancelled',
      cancellation: { kind: 'human_input', reason: 'invalid' },
    });
    expect(renderer.sent).toHaveLength(0);
    expect(streamComplete).toHaveBeenCalledTimes(1);
    expect(result.messages.some((message) => message.role === 'tool')).toBe(false);
  });

  it('accepts free-form input only when allowOther is enabled', async () => {
    const toolCall = (allowOther) => ({
      id: allowOther ? 'ask-other-yes' : 'ask-other-no',
      function: {
        name: 'ask_user_input',
        arguments: JSON.stringify({
          questions: [{
            header: 'Input',
            id: 'scope',
            question: 'Choose.',
            ...(allowOther ? { allowOther: true } : {}),
            options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
          }],
        }),
      },
    });

    for (const allowOther of [false, true]) {
      const call = toolCall(allowOther);
      streamComplete.mockReset();
      streamComplete.mockImplementationOnce(() => eventStream([
        { type: 'assistant_message', message: { role: 'assistant', content: '', tool_calls: [call] } },
        { type: 'tool_calls', iteration: 1, result: { status: 'tool_calls', toolCalls: [call], messages: [] } },
      ]));
      if (allowOther) {
        streamComplete.mockImplementationOnce(() => eventStream([
          { type: 'completed', iteration: 2, result: { status: 'completed', output: 'Done', messages: [] } },
        ]));
      }

      const { runChatTurn } = await import('../../core/agent-runtime.js');
      const result = await runChatTurn({
        chat: { id: 'chat-1', messages: [] },
        userMessage: 'hello',
        builtInSystemPrompt: 'System prompt',
        skillInventory: [],
        agentConfig: { provider: 'openai', model: 'gpt-5' },
        handleToolCall: async () => ({
          handled: true,
          result: { status: 'answered', answers: { scope: 'custom' } },
        }),
      });

      expect(result.status).toBe(allowOther ? 'completed' : 'cancelled');
      if (!allowOther) {
        expect(result).toMatchObject({
          cancellation: { kind: 'human_input', reason: 'invalid' },
        });
      }
    }
  });

  it('preserves commas in CLI allowOther answers', async () => {
    const {
      collectHumanInputAnswer,
      parseHumanInputRequest,
    } = await import('../../cli/src/human-input-ui.js');
    const request = parseHumanInputRequest('ask_user_input', {
      questions: [{
        header: 'Location',
        id: 'location',
        question: 'Which location?',
        allowOther: true,
        options: [
          { id: 'toronto', label: 'Toronto' },
          { id: 'montreal', label: 'Montreal' },
        ],
      }],
    }, 'ask-location');
    if (!request) {
      throw new Error('Expected a valid ask_user_input request.');
    }

    const result = await collectHumanInputAnswer(
      request,
      { question: async () => 'Toronto, Canada' },
      { write: () => undefined },
    );

    expect(result).toEqual({
      status: 'answered',
      answers: { location: 'Toronto, Canada' },
    });
  });

  it('prefers exact option ids over display indices and the terminal exit token', async () => {
    const {
      collectHumanInputAnswer,
      parseHumanInputRequest,
    } = await import('../../cli/src/human-input-ui.js');
    const request = parseHumanInputRequest('ask_user_input', {
      questions: [{
        header: 'Numeric IDs',
        id: 'choice',
        question: 'Choose.',
        options: [
          { id: '2', label: 'Exact ID 2' },
          { id: '0', label: 'Exact ID 0' },
          { id: ':exit', label: 'Exact ID :exit' },
        ],
      }],
    }, 'ask-numeric');
    if (!request) {
      throw new Error('Expected a valid ask_user_input request.');
    }

    await expect(collectHumanInputAnswer(
      request,
      { question: async () => '2' },
      { write: () => undefined },
    )).resolves.toEqual({
      status: 'answered',
      answers: { choice: '2' },
    });
    await expect(collectHumanInputAnswer(
      request,
      { question: async () => '0' },
      { write: () => undefined },
    )).resolves.toEqual({
      status: 'answered',
      answers: { choice: '0' },
    });
    await expect(collectHumanInputAnswer(
      request,
      { question: async () => ':exit' },
      { write: () => undefined },
    )).resolves.toEqual({
      status: 'answered',
      answers: { choice: ':exit' },
    });
  });

  it('escapes the terminal exit token for allowOther without making strings unrepresentable', async () => {
    const {
      collectHumanInputAnswer,
      parseHumanInputRequest,
    } = await import('../../cli/src/human-input-ui.js');
    const request = parseHumanInputRequest('ask_user_input', {
      questions: [{
        header: 'Literal',
        id: 'literal',
        question: 'Enter a literal.',
        allowOther: true,
        options: [
          { id: 'known', label: 'Known' },
          { id: 'other', label: 'Other' },
        ],
      }],
    }, 'ask-literal');
    if (!request) {
      throw new Error('Expected a valid ask_user_input request.');
    }

    await expect(collectHumanInputAnswer(
      request,
      { question: async () => '\\:exit' },
      { write: () => undefined },
    )).resolves.toEqual({
      status: 'answered',
      answers: { literal: ':exit' },
    });
    await expect(collectHumanInputAnswer(
      request,
      { question: async () => '\\\\:exit' },
      { write: () => undefined },
    )).resolves.toEqual({
      status: 'answered',
      answers: { literal: '\\:exit' },
    });
  });
});

describe('selectPersistableMessages', () => {
  /** @param {string} name */
  async function load() {
    const { selectPersistableMessages } = await import('../../core/agent-runtime.js');
    return selectPersistableMessages;
  }

  it('returns an already-valid conversation unchanged', async () => {
    const selectPersistableMessages = await load();
    const messages = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'a' }] },
      { role: 'tool', tool_call_id: 'a', content: 'done' },
      { role: 'assistant', content: 'answer' },
    ];

    expect(selectPersistableMessages(messages)).toEqual(messages);
  });

  it('drops an assistant message whose tool call has no result', async () => {
    const selectPersistableMessages = await load();

    expect(selectPersistableMessages([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'missing' }] },
    ])).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('drops a partially resolved assistant call and its orphaned results', async () => {
    const selectPersistableMessages = await load();

    expect(selectPersistableMessages([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'a' }, { id: 'b' }] },
      { role: 'tool', tool_call_id: 'a', content: 'only one result' },
    ])).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('keeps user and plain assistant messages and handles non-arrays', async () => {
    const selectPersistableMessages = await load();

    expect(selectPersistableMessages([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'plain answer' },
    ])).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'plain answer' },
    ]);
    expect(selectPersistableMessages(undefined)).toEqual([]);
  });
});
