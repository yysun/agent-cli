// @ts-check
/**
 * Agent CLI End-to-End Tests
 *
 * Purpose:
 * - Exercise the CLI entrypoint against isolated on-disk fixtures and a mocked `llm-runtime` boundary.
 *
 * Key features:
 * - Covers new chat creation, current chat reuse, and filesystem error paths.
 * - Verifies persisted session files rather than only mocked function calls.
 *
 * Recent changes:
 * - 2026-05-07: Added end-to-end Vitest coverage for the Agent CLI.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  createIoCapture,
  createTestRoot,
  readJson,
  removeTestRoot,
  writeSkill,
  writeSystemPrompt,
} from '../helpers/test-root.js';

/**
 * @typedef {{
 *   role: string,
 *   content?: string,
 *   tool_calls?: Array<unknown>
 * }} MockBuiltMessage
 */

const runtimeMock = vi.hoisted(() => ({
  createLLMEnvironment: vi.fn(),
  disposeLLMEnvironment: vi.fn(),
  resolveToolsAsync: vi.fn(),
  respondWithTools: vi.fn(),
  loadSkillExecute: vi.fn(),
  buildMessagesSnapshots: /** @type {MockBuiltMessage[][]} */ ([]),
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
async function loadCli(rootPath) {
  process.env.AGENT_CLI_ROOT = rootPath;
  vi.resetModules();
  return await import('../../bin/agent-cli.js');
}

beforeEach(() => {
  runtimeMock.buildMessagesSnapshots.length = 0;
  runtimeMock.createLLMEnvironment.mockImplementation((options) => ({
    kind: 'environment',
    options,
  }));
  runtimeMock.disposeLLMEnvironment.mockResolvedValue(undefined);
  runtimeMock.loadSkillExecute.mockImplementation(async (args) => ({ loadedSkill: args.skillId }));
  runtimeMock.resolveToolsAsync.mockResolvedValue({
    load_skill: {
      execute: runtimeMock.loadSkillExecute,
    },
  });
  runtimeMock.respondWithTools.mockImplementation(async (options) => {
    const builtMessages = /** @type {MockBuiltMessage[]} */ (
      await options.buildMessages({
        state: options.initialState,
        emptyTextRetryCount: 0,
      })
    );
    runtimeMock.buildMessagesSnapshots.push(builtMessages);

    const latestUserMessage = options.initialState.conversationMessages.at(-1)?.content ?? '';

    if (latestUserMessage.includes('skill')) {
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
          content: `Assistant reply: ${latestUserMessage}`,
          assistantMessage: {
            role: 'assistant',
            content: `Assistant reply: ${latestUserMessage}`,
          },
        },
        responseText: `Assistant reply: ${latestUserMessage}`,
        messages: builtMessages,
        iteration: 2,
      });

      return {
        state: afterText.state,
        reason: 'text_response',
      };
    }

    const afterText = await options.onTextResponse({
      state: options.initialState,
      response: {
        type: 'text',
        content: `Assistant reply: ${latestUserMessage}`,
        assistantMessage: {
          role: 'assistant',
          content: `Assistant reply: ${latestUserMessage}`,
        },
      },
      responseText: `Assistant reply: ${latestUserMessage}`,
      messages: builtMessages,
      iteration: 1,
    });

    return {
      state: afterText.state,
      reason: 'text_response',
    };
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
    const rootPath = rootsToClean.pop();

    if (!rootPath) {
      break;
    }

    await removeTestRoot(rootPath);
  }
});

describe('agent-cli CLI', () => {
  it('creates a new current chat and persists a completed turn', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Agent CLI system prompt');
    await writeSkill(rootPath, 'agent-cli-core', {
      name: 'agent-cli-core',
      description: 'Core Agent CLI framing.',
    });

    const { main } = await loadCli(rootPath);
    const io = createIoCapture();

    await main(['--new-chat', 'use skill now'], io);

    expect(io.getStdout()).toBe('Assistant reply: use skill now\n');

    const current = await readJson(path.join(rootPath, 'agent', 'sessions', 'current.json'));
    const chat = await readJson(path.join(rootPath, 'agent', 'sessions', 'chats', `${current.chatId}.json`));

    expect(chat.messages).toHaveLength(4);
    expect(chat.messages[0]).toMatchObject({ role: 'user', content: 'use skill now' });
    expect(chat.messages[2]).toMatchObject({ role: 'tool', tool_call_id: 'tool-call-1' });
    expect(chat.messages[3]).toMatchObject({ role: 'assistant', content: 'Assistant reply: use skill now' });
    expect(runtimeMock.buildMessagesSnapshots[0][0]).toMatchObject({
      role: 'system',
      content: 'Agent CLI system prompt',
    });
    expect(runtimeMock.buildMessagesSnapshots[0][1]?.content).toContain('agent-cli-core');
  });

  it('does not persist the system prompt into chat history files', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Private system prompt for test isolation');
    await writeSkill(rootPath, 'agent-cli-core', {
      name: 'agent-cli-core',
      description: 'Core Agent CLI framing.',
    });

    const { main } = await loadCli(rootPath);

    await main(['--new-chat', 'plain message'], createIoCapture());

    const current = await readJson(path.join(rootPath, 'agent', 'sessions', 'current.json'));
    const chatFilePath = path.join(rootPath, 'agent', 'sessions', 'chats', `${current.chatId}.json`);
    const rawChatFile = await readFile(chatFilePath, 'utf8');

    expect(rawChatFile).not.toContain('Private system prompt for test isolation');
    expect(rawChatFile).toContain('plain message');
  });

  it('reuses the current chat on follow-up runs', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    await writeSkill(rootPath, 'agent-cli-core', {
      name: 'agent-cli-core',
      description: 'Core Agent CLI framing.',
    });

    const { main } = await loadCli(rootPath);

    await main(['--new-chat', 'first turn'], createIoCapture());
    const firstCurrent = await readJson(path.join(rootPath, 'agent', 'sessions', 'current.json'));

    await main(['second turn'], createIoCapture());
    const secondCurrent = await readJson(path.join(rootPath, 'agent', 'sessions', 'current.json'));
    const chat = await readJson(path.join(rootPath, 'agent', 'sessions', 'chats', `${secondCurrent.chatId}.json`));

    expect(secondCurrent.chatId).toBe(firstCurrent.chatId);
    expect(chat.messages).toHaveLength(4);
    expect(chat.messages[0]).toMatchObject({ role: 'user', content: 'first turn' });
    expect(chat.messages[2]).toMatchObject({ role: 'user', content: 'second turn' });
    expect(chat.messages[3]).toMatchObject({ role: 'assistant', content: 'Assistant reply: second turn' });
  });

  it('fails clearly when the current chat is missing', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    await writeSkill(rootPath, 'agent-cli-core', {
      name: 'agent-cli-core',
      description: 'Core Agent CLI framing.',
    });

    const { main } = await loadCli(rootPath);

    await expect(main(['follow up'], createIoCapture())).rejects.toThrow(
      'Missing current chat. Start one with --new-chat.',
    );
  });

  it('reports missing messages through the CLI error path', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { runCli } = await loadCli(rootPath);
    const io = createIoCapture();
    const originalExitCode = process.exitCode;

    process.exitCode = undefined;
    await runCli([], io);

    expect(io.getStderr()).toContain('Missing user message.');
    expect(io.getStderr()).toContain('Usage: agent-cli [--new-chat] <message>');
    expect(process.exitCode).toBe(1);

    process.exitCode = originalExitCode;
  });

  it('fails clearly when the system prompt is missing', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSkill(rootPath, 'agent-cli-core', {
      name: 'agent-cli-core',
      description: 'Core Agent CLI framing.',
    });

    const { main } = await loadCli(rootPath);

    await expect(main(['--new-chat', 'hello'], createIoCapture())).rejects.toThrow('Missing system prompt');
  });

  it('accepts an empty skills root and does not inject a skill inventory message', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    await mkdir(path.join(rootPath, 'agent', 'skills'), { recursive: true });

    const { main } = await loadCli(rootPath);

    await main(['--new-chat', 'plain turn'], createIoCapture());

    const latestSnapshot = runtimeMock.buildMessagesSnapshots.at(-1);

    expect(latestSnapshot).toHaveLength(2);

    if (!latestSnapshot) {
      throw new Error('Expected a captured message snapshot.');
    }

    expect(latestSnapshot[0]).toMatchObject({ role: 'system', content: 'Prompt' });
    expect(latestSnapshot[1]).toMatchObject({ role: 'user', content: 'plain turn' });
  });

  it('fails clearly when the skills root is missing', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    await mkdir(path.join(rootPath, 'agent'), { recursive: true });
    await writeFile(path.join(rootPath, 'agent', 'system.md'), 'Prompt\n', 'utf8');

    const { main } = await loadCli(rootPath);

    await expect(main(['--new-chat', 'hello'], createIoCapture())).rejects.toThrow('Missing skills root');
  });

  it('does not write partial session files when the runtime fails', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    await writeSystemPrompt(rootPath, 'Prompt');
    await writeSkill(rootPath, 'agent-cli-core', {
      name: 'agent-cli-core',
      description: 'Core Agent CLI framing.',
    });

    runtimeMock.respondWithTools.mockRejectedValueOnce(new Error('Synthetic runtime failure'));

    const { main } = await loadCli(rootPath);

    await expect(main(['--new-chat', 'hello'], createIoCapture())).rejects.toThrow('Synthetic runtime failure');
    await expect(
      readFile(path.join(rootPath, 'agent', 'sessions', 'current.json'), 'utf8'),
    ).rejects.toThrow();
    await expect(
      readFile(path.join(rootPath, 'agent', 'sessions', 'chats'), 'utf8'),
    ).rejects.toThrow();
  });

  it('prints help without touching runtime dependencies', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);

    const { main } = await loadCli(rootPath);
    const io = createIoCapture();

    await main(['--help'], io);

    expect(io.getStdout()).toContain('Usage: agent-cli [--new-chat] <message>');
    expect(runtimeMock.respondWithTools).not.toHaveBeenCalled();
  });
});