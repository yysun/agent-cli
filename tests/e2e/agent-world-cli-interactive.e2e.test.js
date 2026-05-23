// @ts-check
/**
 * Agent World CLI Interactive Process End-to-End Tests
 *
 * Purpose:
 * - Exercise interactive mode as a live process by writing stdin one command at a time and waiting on stdout.
 *
 * Key features:
 * - Mirrors the Electron E2E harness style with a real built entrypoint, isolated workspace, bounded teardown, and stepwise helpers.
 * - Monitors stdout after every interactive command instead of only inspecting final buffered output.
 * - Verifies durable queue state after the interactive session exits.
 *
 * Recent changes:
 * - 2026-05-23: Added monitored stdin/stdout E2E coverage for `agent-world-cli` interactive mode.
 * - 2026-05-23: Updated prompt expectation for plain interactive prompt.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createTestRoot, readJson, removeTestRoot } from '../helpers/test-root.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const agentWorldCliBin = path.join(repoRoot, 'bin', 'agent-world-cli.js');
const START_TIMEOUT_MS = 5000;
const OUTPUT_TIMEOUT_MS = 5000;
const CLOSE_TIMEOUT_MS = 1500;

/**
 * @typedef {{
 *   childProcess: any,
 *   stdout: string,
 *   stderr: string,
 * }} InteractiveCliSession
 */

/** @type {InteractiveCliSession[]} */
const activeSessions = [];
/** @type {string[]} */
const rootsToClean = [];

afterEach(async () => {
  while (activeSessions.length > 0) {
    const session = activeSessions.pop();
    await stopInteractiveCli(session);
  }

  while (rootsToClean.length > 0) {
    const rootPath = rootsToClean.pop();
    if (rootPath) {
      await removeTestRoot(rootPath);
    }
  }
});

function providerFreeEnv() {
  return {
    ...process.env,
    OPENAI_API_KEY: '',
    ANTHROPIC_API_KEY: '',
    GOOGLE_API_KEY: '',
    XAI_API_KEY: '',
    AZURE_OPENAI_API_KEY: '',
    OPENAI_COMPATIBLE_API_KEY: '',
    OLLAMA_BASE_URL: '',
  };
}

/**
 * @param {string} rootPath
 * @returns {Promise<InteractiveCliSession>}
 */
async function startInteractiveCli(rootPath) {
  const childProcess = /** @type {any} */ (spawn(process.execPath, [agentWorldCliBin], {
    cwd: rootPath,
    env: providerFreeEnv(),
    stdio: ['pipe', 'pipe', 'pipe'],
  }));

  const session = {
    childProcess,
    stdout: '',
    stderr: '',
  };

  childProcess.stdout.setEncoding('utf8');
  childProcess.stderr.setEncoding('utf8');
  childProcess.stdout.on('data', (chunk) => {
    session.stdout += String(chunk);
  });
  childProcess.stderr.on('data', (chunk) => {
    session.stderr += String(chunk);
  });
  activeSessions.push(session);

  await waitForStdout(session, /agent-world-cli interactive/);
  await waitForStdout(session, /> /);
  return session;
}

/**
 * @param {InteractiveCliSession | undefined} session
 */
async function stopInteractiveCli(session) {
  if (!session) {
    return;
  }

  const index = activeSessions.indexOf(session);
  if (index >= 0) {
    activeSessions.splice(index, 1);
  }

  if (session.childProcess.exitCode !== null || session.childProcess.signalCode !== null) {
    return;
  }

  session.childProcess.stdin.end('/exit\n');
  const stopped = await Promise.race([
    once(session.childProcess, 'exit').then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), CLOSE_TIMEOUT_MS)),
  ]);

  if (stopped || session.childProcess.exitCode !== null || session.childProcess.signalCode !== null) {
    return;
  }

  session.childProcess.kill('SIGKILL');
  await once(session.childProcess, 'exit');
}

/**
 * @param {InteractiveCliSession} session
 * @param {RegExp} pattern
 * @param {number} [fromIndex]
 */
async function waitForStdout(session, pattern, fromIndex = 0) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < OUTPUT_TIMEOUT_MS) {
    const output = session.stdout.slice(fromIndex);
    if (pattern.test(output)) {
      return session.stdout.length;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Timed out waiting for stdout pattern ${pattern}.\nstdout:\n${session.stdout}\nstderr:\n${session.stderr}`);
}

/**
 * @param {InteractiveCliSession} session
 * @param {string} line
 * @param {RegExp} pattern
 */
async function sendLineAndWait(session, line, pattern) {
  const cursor = session.stdout.length;
  session.childProcess.stdin.write(`${line}\n`);
  return await waitForStdout(session, pattern, cursor);
}

/** @param {InteractiveCliSession} session */
async function exitInteractiveCli(session) {
  const cursor = session.stdout.length;
  session.childProcess.stdin.write('/exit\n');
  const [code, signal] = /** @type {[number | null, NodeJS.Signals | null]} */ (await once(session.childProcess, 'exit'));
  await waitForStdout(session, /agent-world:/, cursor).catch(() => cursor);
  return { code, signal };
}

describe('agent-world-cli monitored interactive process', () => {
  it('accepts commands over stdin and publishes each state transition to stdout', async () => {
    const rootPath = await createTestRoot();
    rootsToClean.push(rootPath);
    const session = await startInteractiveCli(rootPath);

    await sendLineAndWait(session, '/help', /agent-world-cli interactive commands:/);
    await sendLineAndWait(session, '/agents create reviewer --name Reviewer', /"id": "reviewer"/);
    await sendLineAndWait(session, '/new', /"chatId": "[^"]+"/);
    await sendLineAndWait(session, '/send --queue @reviewer monitored interactive token', /"queued": true/);
    await waitForStdout(session, /"content": "@reviewer monitored interactive token"/);
    await sendLineAndWait(session, '/queue', /"status": "queued"/);
    await sendLineAndWait(session, '/stop', /"stopped": true/);
    await sendLineAndWait(session, '/queue', /"status": "cancelled"/);
    await sendLineAndWait(session, '/clear', /"cleared": true/);
    await sendLineAndWait(session, '/queue', /\[\]/);

    const exit = await exitInteractiveCli(session);
    expect(exit).toEqual({ code: 0, signal: null });
    expect(session.stderr).toBe('');

    const world = await readJson(path.join(rootPath, '.agent-world', 'worlds', 'default', 'world.json'));
    expect(world.currentChatId).toBeTruthy();
    const queue = await readJson(path.join(rootPath, '.agent-world', 'worlds', 'default', 'queues', `${world.currentChatId}.json`));
    expect(queue.rows).toEqual([]);
  }, 15000);
});
