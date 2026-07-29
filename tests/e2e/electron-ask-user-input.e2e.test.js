// @ts-check
/**
 * Electron Ask User Input Live E2E Tests
 *
 * Purpose:
 * - Exercise the real Electron shell against a live runtime turn that emits `ask_user_input`.
 *
 * Key features:
 * - Launches the built Electron app with Playwright's Electron driver.
 * - Uses an isolated workspace with a targeted AGENTS.md prompt and live Gemini runtime config.
 * - Verifies rendered prompt submission, same-turn continuation, tool-card visibility, and reload behavior.
 *
 * Recent changes:
 * - 2026-07-28: Updated the live fixture for strict `llm-runtime` 0.7 input schema.
 * - 2026-07-27: Reported live-model non-compliance explicitly instead of a bare locator timeout.
 * - 2026-07-27: Corrected stale verbose-mode direction and tool-trace selectors after the trace-section refactor.
 * - 2026-06-04: Added live Electron E2E coverage for renderer `ask_user_input` flow.
 */
import 'dotenv/config';

import { _electron as electron } from 'playwright';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  createTestRoot,
  removeTestRoot,
} from '../helpers/test-root.js';
import { validateRuntimeEnvironment } from '../../core/agent-runtime.js';

const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const ELECTRON_APP_ROOT = path.join(PROJECT_ROOT, 'electron');
const GEMINI_LIVE_MODEL = 'gemini-2.5-flash';
const LIVE_ELECTRON_E2E_TIMEOUT_MS = 90000;

/** @type {string[]} */
const rootsToClean = [];
/** @type {Array<import('playwright').ElectronApplication>} */
const electronApps = [];

function resolveLiveRuntimeConfig() {
  try {
    const settings = validateRuntimeEnvironment(process.env, {
      provider: 'google',
      model: GEMINI_LIVE_MODEL,
    });

    return {
      provider: settings.provider,
      model: settings.model,
    };
  } catch {
    throw new Error('test:e2e:electron requires Gemini live provider configuration. Set GOOGLE_API_KEY.');
  }
}

async function createElectronWorkspace() {
  const rootPath = await createTestRoot('agent-cli-electron-e2e-');
  rootsToClean.push(rootPath);

  await mkdir(path.join(rootPath, '.agent-world', 'skills'), { recursive: true });
  await writeFile(
    path.join(rootPath, 'AGENTS.md'),
    [
      'You are an Electron ask-user-input e2e test assistant.',
      'When the user message contains ELECTRON_INPUT_E2E, do not answer first.',
      'Immediately call the ask_user_input tool with this exact JSON argument:',
      '{"type":"single-select","allowSkip":true,"questions":[{"header":"E2E","id":"route","question":"Choose the Electron E2E route.","options":[{"id":"alpha","label":"Alpha route","description":"Use the alpha route."},{"id":"beta","label":"Beta route","description":"Use the beta route."}]}]}',
      'After the tool result is returned, answer exactly: Electron input e2e complete.',
    ].join(' '),
    'utf8',
  );

  return rootPath;
}

async function launchElectronApp(workspaceRoot) {
  const runtimeConfig = resolveLiveRuntimeConfig();
  const app = await electron.launch({
    args: [ELECTRON_APP_ROOT],
    env: {
      ...process.env,
      AGENT_CLI_PROVIDER: runtimeConfig.provider,
      AGENT_CLI_MODEL: runtimeConfig.model,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
    },
    timeout: 30000,
  });
  electronApps.push(app);

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('#message-input', { timeout: 30000 });
  await page.evaluate(async (selectedWorkspaceRoot) => {
    if (!window.agentCliDesktop) {
      throw new Error('Electron preload bridge is unavailable.');
    }

    await window.agentCliDesktop.selectWorkspace({ workspaceRoot: selectedWorkspaceRoot });
  }, workspaceRoot);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('#message-input', { timeout: 30000 });

  return { app, page, runtimeConfig };
}

/**
 * The fixture asks the live model to emit a specific `ask_user_input` call, and
 * the model does not always comply. Distinguish that from a product failure so a
 * red run points at the real cause instead of a bare locator timeout.
 *
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} prompt
 */
async function waitForPromptOrModelNonCompliance(page, prompt) {
  const promptVisible = prompt.waitFor({ state: 'visible', timeout: 60000 }).then(() => 'prompt');
  const turnFinished = page
    .waitForFunction(() => document.querySelector('#working-status')?.hasAttribute('hidden'), undefined, { timeout: 60000 })
    .then(() => 'finished');

  const outcome = await Promise.race([promptVisible, turnFinished]).catch(() => 'timeout');

  if (outcome === 'prompt') {
    return;
  }

  if (await prompt.isVisible()) {
    return;
  }

  if (outcome === 'finished') {
    throw new Error(
      `Live model (${GEMINI_LIVE_MODEL}) did not emit the ask_user_input tool call the fixture requested; `
      + 'the turn completed without rendering a prompt. This is model non-compliance, not a product failure. Re-run to resample.',
    );
  }

  throw new Error(
    `No ask_user_input prompt appeared and the turn never finished within 60s (model ${GEMINI_LIVE_MODEL}).`,
  );
}

/**
 * A turn can finish without persisting any assistant text for two very different
 * reasons: the product rejected the turn, or the live model simply never produced
 * a final answer. The renderer logs `Turn failed: ...` only in the first case, so
 * use that to say which one happened instead of failing on a bare count.
 *
 * @param {import('playwright').Page} page
 * @param {string | undefined} assistantText
 * @param {Array<Record<string, any>>} persistedMessages
 */
async function assertFinalAnswerOrExplain(page, assistantText, persistedMessages) {
  if (String(assistantText || '').trim()) {
    return;
  }

  const failureEntry = (await page.locator('.aw-log-entry').allTextContents())
    .find((entry) => entry.includes('Turn failed:'));

  if (failureEntry) {
    throw new Error(`Product failure: the turn was rejected and persisted no final answer. Renderer reported "${failureEntry.trim()}".`);
  }

  const roles = persistedMessages.map((message) => message.role).join(', ');
  throw new Error(
    `Live model (${GEMINI_LIVE_MODEL}) completed the turn without producing a final answer; `
    + `persisted roles were [${roles}] and the renderer reported no turn failure. `
    + 'This is model non-compliance, not a product failure. Re-run to resample.',
  );
}

async function readMessagesJsonl(workspaceRoot) {
  const current = JSON.parse(await readFile(path.join(workspaceRoot, '.agent-world', 'chats', 'current.json'), 'utf8'));
  const content = await readFile(path.join(workspaceRoot, '.agent-world', 'chats', current.chatId, 'messages.jsonl'), 'utf8');
  return content.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

afterEach(async () => {
  while (electronApps.length > 0) {
    const app = electronApps.pop();
    if (app) {
      await app.close().catch(() => undefined);
    }
  }

  while (rootsToClean.length > 0) {
    const rootPath = rootsToClean.pop();
    if (rootPath) {
      await removeTestRoot(rootPath);
    }
  }
});

describe('Electron ask_user_input live flow', () => {
  it('renders a live input prompt, submits it, continues the turn, and keeps runtime cards transient', async () => {
    const workspaceRoot = await createElectronWorkspace();
    const { page } = await launchElectronApp(workspaceRoot);

    await page.fill('#message-input', 'Run ELECTRON_INPUT_E2E now.');
    await page.click('#send-button');

    const prompt = page.locator('.aw-human-input');
    await waitForPromptOrModelNonCompliance(page, prompt);
    expect(await prompt.textContent()).toContain('Choose the Electron E2E route.');
    expect(await page.locator('input[type="radio"][name*="route"]').count()).toBe(2);

    await page.getByText('Alpha route', { exact: true }).click();
    await page.getByRole('button', { name: 'Submit' }).click();

    await prompt.waitFor({ state: 'hidden', timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('#working-status')?.hasAttribute('hidden'), undefined, { timeout: 60000 });
    let persistedMessages = await readMessagesJsonl(workspaceRoot);
    const assistantText = [...persistedMessages]
      .reverse()
      .find((message) => message.role === 'assistant' && String(message.content || '').trim())?.content;
    await assertFinalAnswerOrExplain(page, assistantText, persistedMessages);
    expect(String(assistantText || '').trim().length).toBeGreaterThan(0);
    expect(await page.locator('#message-list').textContent()).toContain(assistantText);
    // Verbose mode is off by default, so persisted tool traces start hidden.
    const toolTrace = page.locator('.aw-tool-trace-title').filter({ hasText: 'ask_user_input' });
    expect(await toolTrace.count()).toBe(0);

    await page.click('#show-tool-messages-toggle');
    await toolTrace.first().waitFor({ state: 'visible' });
    expect(await page.locator('#message-list').textContent()).toContain(assistantText);

    await page.click('#show-tool-messages-toggle');
    expect(await toolTrace.count()).toBe(0);
    expect(await page.locator('#message-list').textContent()).toContain(assistantText);

    persistedMessages = await readMessagesJsonl(workspaceRoot);
    expect(persistedMessages.some((message) => message.role === 'tool' && String(message.content || '').includes('alpha'))).toBe(true);

    await page.reload();
    await page.waitForSelector('#message-input', { timeout: 30000 });
    await page.waitForFunction((expectedText) => document.querySelector('#message-list')?.textContent?.includes(String(expectedText)), assistantText, { timeout: 30000 });
    expect(await page.locator('.aw-tool-trace-title').filter({ hasText: 'model response' }).count()).toBe(0);
  }, LIVE_ELECTRON_E2E_TIMEOUT_MS);
});
