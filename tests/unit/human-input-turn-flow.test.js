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
 * - 2026-07-27: Added deterministic coverage replacing reliance on live model behavior.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createRuntime = vi.fn();
const complete = vi.fn();
const streamComplete = vi.fn();

vi.mock('llm-runtime', () => ({ complete, createRuntime, streamComplete }));

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
      requestId: 'ask-1',
      allowSkip: true,
      questions: [{
        header: 'E2E',
        id: 'route',
        question: 'Choose the route.',
        options: [{ id: 'alpha', label: 'Alpha route' }],
        allowFreeformInput: false,
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

        return { handled: true, result: await sessions.requestInput(renderer, request) };
      },
    });

    // The renderer receives the prompt, exactly as Electron's IPC would deliver it.
    await vi.waitFor(() => {
      expect(renderer.sent).toHaveLength(1);
    });
    expect(renderer.sent[0].channel).toBe('humanInput:request');
    expect(renderer.sent[0].request.questions[0].question).toBe('Choose the route.');

    expect(sessions.resolveAnswer({
      ok: true,
      status: 'answered',
      requestId: renderer.sent[0].request.requestId,
      selections: [{ questionId: 'route', skipped: false, selectedOptions: [{ id: 'alpha', label: 'Alpha route' }] }],
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
