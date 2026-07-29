// @ts-check
/**
 * Agent CLI Turn Executor Unit Tests
 *
 * Purpose:
 * - Validate the CLI turn executor's history depth and tool-approval wiring.
 *
 * Key features:
 * - Captures the options handed to `llm-runtime` through a mocked `streamComplete`.
 * - Exercises the approval gate the executor supplies when tool permission is `ask`.
 *
 * Recent changes:
 * - 2026-07-28: Covered explicit 0.7 approval decisions plus approval and
 *   human-input cancellation composition.
 * - 2026-07-27: Added coverage for rejected-turn persistence.
 * - 2026-07-27: Added coverage for full-history default and terminal tool approval.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const persistCompletedChat = vi.fn();
const persistStreamTraceEvents = vi.fn();

vi.mock('../../core/chat-store.js', () => ({
  persistCompletedChat,
  persistStreamTraceEvents,
}));

/** @param {Array<Record<string, any>>} events */
function eventStream(events) {
  return (async function* () {
    for (const event of events) {
      yield event;
    }
  })();
}

function createIo() {
  const stdoutChunks = [];
  const stderrChunks = [];

  return {
    stdoutChunks,
    stderrChunks,
    io: {
      stdout: { isTTY: false, write: (chunk) => stdoutChunks.push(chunk) },
      stderr: { isTTY: false, write: (chunk) => stderrChunks.push(chunk) },
    },
  };
}

/** @param {string[]} answers */
function createScriptedPrompt(answers) {
  const asked = [];
  const remaining = [...answers];

  return {
    asked,
    prompt: {
      question: async (query) => {
        asked.push(query);
        return remaining.shift() ?? '';
      },
    },
  };
}

/**
 * Runs one turn and returns the options `streamComplete` received plus the
 * captured `onToolApproval` callback.
 *
 * @param {Record<string, any>} params
 */
async function runTurn({ agentConfig = {}, chatMessages = [], inputPrompt, io }) {
  /** @type {Record<string, any> | undefined} */
  let receivedOptions;
  streamComplete.mockImplementation((options) => {
    receivedOptions = options;
    return eventStream([
      { type: 'completed', iteration: 1, result: { status: 'completed', output: 'Done', messages: [] } },
    ]);
  });

  const { createTurnExecutor } = await import('../../cli/src/turn-executor.js');
  const executeTurn = createTurnExecutor({
    io: io.io,
    verbose: false,
    streamOff: false,
    agentConfig: { provider: 'openai', model: 'gpt-5', ...agentConfig },
    skillInventory: [],
  });

  await executeTurn({
    chat: { id: 'chat-1', messages: chatMessages },
    message: 'hello',
    inputPrompt,
  });

  if (!receivedOptions) {
    throw new Error('streamComplete did not receive options');
  }

  return receivedOptions;
}

const originalOpenAiKey = process.env.OPENAI_API_KEY;

beforeEach(() => {
  complete.mockReset();
  createRuntime.mockReset();
  streamComplete.mockReset();
  runtimeDispose.mockReset();
  persistCompletedChat.mockReset();
  persistStreamTraceEvents.mockReset();
  createRuntime.mockReturnValue({ dispose: runtimeDispose });
  persistCompletedChat.mockResolvedValue({ id: 'chat-1', messages: [] });
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

describe('turn executor history depth', () => {
  const priorMessages = [
    { role: 'user', content: 'first' },
    { role: 'assistant', content: 'second' },
    { role: 'user', content: 'third' },
  ];

  /** @param {Record<string, any>[]} messages */
  function conversationMessages(messages) {
    return messages.filter((message) => message.role !== 'system');
  }

  it('sends the full conversation when no history limit is configured', async () => {
    const io = createIo();
    const options = await runTurn({ chatMessages: priorMessages, io });

    // Three prior messages plus the pending user message.
    expect(conversationMessages(options.messages)).toHaveLength(4);
    expect(conversationMessages(options.messages).map((message) => message.content))
      .toEqual(['first', 'second', 'third', 'hello']);
  });

  it('sends no prior messages when the history limit is explicitly zero', async () => {
    const io = createIo();
    const options = await runTurn({
      agentConfig: { pastMessages: 0 },
      chatMessages: priorMessages,
      io,
    });

    expect(conversationMessages(options.messages).map((message) => message.content)).toEqual(['hello']);
  });

  it('sends only the last N prior messages when a positive history limit is configured', async () => {
    const io = createIo();
    const options = await runTurn({
      agentConfig: { pastMessages: 2 },
      chatMessages: priorMessages,
      io,
    });

    expect(conversationMessages(options.messages).map((message) => message.content))
      .toEqual(['second', 'third', 'hello']);
  });
});

describe('turn executor rejected turns', () => {
  const unhandledCall = { id: 'host-1', function: { name: 'some_host_tool', arguments: '{}' } };

  async function runRejectedTurn(io) {
    streamComplete.mockImplementation(() => eventStream([
      { type: 'assistant_message', message: { role: 'assistant', content: '', tool_calls: [unhandledCall] } },
      { type: 'tool_calls', iteration: 1, result: { status: 'tool_calls', toolCalls: [unhandledCall], messages: [] } },
    ]));

    const { createTurnExecutor } = await import('../../cli/src/turn-executor.js');
    const executeTurn = createTurnExecutor({
      io: io.io,
      verbose: false,
      streamOff: false,
      agentConfig: { provider: 'openai', model: 'gpt-5' },
      skillInventory: [],
    });

    return executeTurn({
      chat: { id: 'chat-1', messages: [{ role: 'user', content: 'earlier turn' }] },
      message: 'hello',
    });
  }

  it('still reports the rejection and names the unresolved tool', async () => {
    const io = createIo();
    await expect(runRejectedTurn(io)).rejects.toThrow(/some_host_tool/);
  });

  it('persists the surviving transcript instead of discarding the user message', async () => {
    const io = createIo();
    await expect(runRejectedTurn(io)).rejects.toThrow();

    expect(persistCompletedChat).toHaveBeenCalledTimes(1);
    const persisted = persistCompletedChat.mock.calls[0][0].messages;
    expect(persisted).toContainEqual(expect.objectContaining({ role: 'user', content: 'earlier turn' }));
    expect(persisted).toContainEqual(expect.objectContaining({ role: 'user', content: 'hello' }));
  });

  it('does not persist an orphaned assistant tool call that would break the next turn', async () => {
    const io = createIo();
    await expect(runRejectedTurn(io)).rejects.toThrow();

    const persisted = persistCompletedChat.mock.calls[0][0].messages;
    const resolvedIds = new Set(persisted.filter((m) => m.role === 'tool').map((m) => m.tool_call_id));
    for (const message of persisted) {
      for (const toolCall of message.tool_calls ?? []) {
        expect(resolvedIds.has(toolCall.id)).toBe(true);
      }
    }
  });
});

describe('turn executor cancelled turns', () => {
  it('persists sanitized history and emits no fabricated assistant answer', async () => {
    const io = createIo();
    const toolCall = {
      id: 'tool-cancel-1',
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
          cancellation: {
            kind: 'tool_approval',
            reason: 'approval_rejected',
            toolCall,
          },
        },
      },
    ]));

    const { createTurnExecutor } = await import('../../cli/src/turn-executor.js');
    const executeTurn = createTurnExecutor({
      io: io.io,
      verbose: false,
      streamOff: false,
      agentConfig: { provider: 'openai', model: 'gpt-5', toolPermission: 'ask' },
      skillInventory: [],
    });
    const result = await executeTurn({
      chat: { id: 'chat-1', messages: [] },
      message: 'hello',
    });

    expect(result).toMatchObject({
      status: 'cancelled',
      assistantText: '',
      cancellation: { reason: 'approval_rejected' },
    });
    expect(io.stdoutChunks.join('')).not.toContain('undefined');
    const persisted = persistCompletedChat.mock.calls[0][0].messages;
    expect(persisted).toContainEqual(expect.objectContaining({ role: 'user', content: 'hello' }));
    expect(persisted.some((message) => Array.isArray(message.tool_calls))).toBe(false);
  });

  it('cancels skipped CLI human input without a tool result or model retry', async () => {
    const io = createIo();
    const { asked, prompt } = createScriptedPrompt(['']);
    const toolCall = {
      id: 'ask-cli-cancel-1',
      type: 'function',
      function: {
        name: 'ask_user_input',
        arguments: JSON.stringify({
          type: 'single-select',
          allowSkip: true,
          questions: [{
            header: 'Route',
            id: 'route',
            question: 'Choose a route.',
            options: [
              { id: 'alpha', label: 'Alpha' },
              { id: 'beta', label: 'Beta' },
            ],
          }],
        }),
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

    const { createTurnExecutor } = await import('../../cli/src/turn-executor.js');
    const executeTurn = createTurnExecutor({
      io: io.io,
      verbose: false,
      streamOff: false,
      agentConfig: { provider: 'openai', model: 'gpt-5' },
      skillInventory: [],
    });
    const result = await executeTurn({
      chat: { id: 'chat-1', messages: [] },
      message: 'ask me',
      inputPrompt: prompt,
    });

    expect(result).toMatchObject({
      status: 'cancelled',
      assistantText: '',
      cancellation: {
        kind: 'human_input',
        reason: 'skipped',
        toolCallId: 'ask-cli-cancel-1',
      },
    });
    expect(asked).toHaveLength(1);
    expect(streamComplete).toHaveBeenCalledTimes(1);
    expect(result.messages.some((message) => message.role === 'tool')).toBe(false);
    expect(io.stdoutChunks.join('')).not.toContain('undefined');

    const persisted = persistCompletedChat.mock.calls[0][0].messages;
    expect(persisted).toContainEqual(expect.objectContaining({ role: 'user', content: 'ask me' }));
    expect(persisted.some((message) => message.role === 'tool')).toBe(false);
    expect(persisted.some((message) => Array.isArray(message.tool_calls))).toBe(false);
  });
});

describe('turn executor tool approval', () => {
  /** @param {Record<string, any>} options */
  async function approve(options, request) {
    expect(typeof options.onToolApproval).toBe('function');
    return await options.onToolApproval(request);
  }

  const loadSkillRequest = {
    toolCall: { id: 'tool-1', function: { name: 'load_skill', arguments: '{"skillId":"core"}' } },
    toolName: 'load_skill',
    parsedArguments: { skillId: 'core' },
  };

  it('prompts before a tool runs and approves on y', async () => {
    const io = createIo();
    const { asked, prompt } = createScriptedPrompt(['y']);
    const options = await runTurn({
      agentConfig: { toolPermission: 'ask' },
      inputPrompt: prompt,
      io,
    });

    await expect(approve(options, loadSkillRequest)).resolves.toEqual({ decision: 'approve' });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain('load_skill');
    expect(io.stdoutChunks.join('')).toContain('Approve tool call: load_skill');
  });

  it('denies with a reason on n and does not execute the tool', async () => {
    const io = createIo();
    const { prompt } = createScriptedPrompt(['n']);
    const options = await runTurn({
      agentConfig: { toolPermission: 'ask' },
      inputPrompt: prompt,
      io,
    });

    await expect(approve(options, loadSkillRequest)).resolves.toEqual({
      decision: 'cancel',
      reason: 'rejected',
      message: 'Tool execution denied by user: load_skill.',
    });
  });

  it('denies an empty answer rather than defaulting to approval', async () => {
    const io = createIo();
    const { prompt } = createScriptedPrompt(['']);
    const options = await runTurn({
      agentConfig: { toolPermission: 'ask' },
      inputPrompt: prompt,
      io,
    });

    await expect(approve(options, loadSkillRequest)).resolves.toMatchObject({
      decision: 'cancel',
      reason: 'rejected',
    });
  });

  it('re-asks on an unrecognized answer', async () => {
    const io = createIo();
    const { asked, prompt } = createScriptedPrompt(['maybe', 'y']);
    const options = await runTurn({
      agentConfig: { toolPermission: 'ask' },
      inputPrompt: prompt,
      io,
    });

    await expect(approve(options, loadSkillRequest)).resolves.toEqual({ decision: 'approve' });
    expect(asked).toHaveLength(2);
  });

  it('denies without hanging when no interactive prompt is available', async () => {
    const io = createIo();
    const options = await runTurn({
      agentConfig: { toolPermission: 'ask' },
      inputPrompt: undefined,
      io,
    });

    await expect(approve(options, loadSkillRequest)).resolves.toEqual({
      decision: 'cancel',
      reason: 'dismissed',
      message: 'Tool execution denied: interactive approval is unavailable for load_skill.',
    });
  });

  it('approves without prompting when tool permission is not ask', async () => {
    const io = createIo();
    const { asked, prompt } = createScriptedPrompt(['n']);
    const options = await runTurn({
      agentConfig: { toolPermission: 'auto' },
      inputPrompt: prompt,
      io,
    });

    await expect(approve(options, loadSkillRequest)).resolves.toEqual({ decision: 'approve' });
    expect(asked).toHaveLength(0);
  });

  it('does not gate host-owned human input tools', async () => {
    const io = createIo();
    const { asked, prompt } = createScriptedPrompt(['n']);
    const options = await runTurn({
      agentConfig: { toolPermission: 'ask' },
      inputPrompt: prompt,
      io,
    });

    await expect(approve(options, {
      toolCall: { id: 'tool-2', function: { name: 'ask_user_input', arguments: '{}' } },
      toolName: 'ask_user_input',
      parsedArguments: {},
    })).resolves.toEqual({ decision: 'approve' });
    expect(asked).toHaveLength(0);
  });
});
