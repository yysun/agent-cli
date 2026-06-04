// @ts-check
/**
 * Electron Human Input Session Unit Tests
 *
 * Purpose:
 * - Validate the Electron main-process pending human-input lifecycle helper.
 *
 * Key features:
 * - Covers accepted answers, request-id normalization, missing renderers, renderer send failures, timeouts, and duplicate answers.
 *
 * Recent changes:
 * - 2026-06-03: Added coverage for Electron `ask_user_input` session management.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HumanInputSessionManager } from '../../electron/human-input-session.js';

function createRequest(overrides = {}) {
  return {
    toolName: 'ask_user_input',
    requestId: 'request-1',
    type: 'single-select',
    allowSkip: false,
    questions: [
      {
        header: 'Input',
        id: 'question-1',
        question: 'Continue?',
        options: [{ id: 'yes', label: 'Yes' }],
      },
    ],
    ...overrides,
  };
}

function createRenderer() {
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

afterEach(() => {
  vi.useRealTimers();
});

describe('HumanInputSessionManager', () => {
  it('sends requests with generated ids and resolves accepted answers', async () => {
    const renderer = createRenderer();
    const manager = new HumanInputSessionManager({
      requestChannel: 'humanInput:request',
      timeoutMs: 1000,
      createRequestId: () => 'generated-request',
    });

    const pending = manager.requestInput(renderer, createRequest({ requestId: '' }));

    expect(renderer.sent).toEqual([
      {
        channel: 'humanInput:request',
        request: expect.objectContaining({ requestId: 'generated-request' }),
      },
    ]);
    expect(manager.pendingCount).toBe(1);
    expect(manager.resolveAnswer({
      ok: true,
      status: 'answered',
      requestId: 'generated-request',
      selections: [],
    })).toEqual({ ok: true });

    await expect(pending).resolves.toEqual({
      ok: true,
      status: 'answered',
      requestId: 'generated-request',
      selections: [],
    });
    expect(manager.pendingCount).toBe(0);
  });

  it('accepts skipped and cancelled responses for pending requests', async () => {
    for (const status of ['skipped', 'cancelled']) {
      const renderer = createRenderer();
      const manager = new HumanInputSessionManager({
        requestChannel: 'humanInput:request',
        timeoutMs: 1000,
      });
      const pending = manager.requestInput(renderer, createRequest({ requestId: `request-${status}` }));

      expect(manager.resolveAnswer({
        ok: status === 'skipped',
        status,
        requestId: `request-${status}`,
        selections: [],
      })).toEqual({ ok: true });

      await expect(pending).resolves.toEqual(expect.objectContaining({
        ok: status === 'skipped',
        status,
        requestId: `request-${status}`,
      }));
    }
  });

  it('returns unavailable answers when the renderer is missing, destroyed, or throws while sending', async () => {
    const manager = new HumanInputSessionManager({
      requestChannel: 'humanInput:request',
      timeoutMs: 1000,
      createRequestId: () => 'generated-missing',
    });

    await expect(manager.requestInput(undefined, createRequest({ requestId: '' }))).resolves.toEqual(expect.objectContaining({
      ok: false,
      status: 'unavailable',
      requestId: 'generated-missing',
      message: 'Electron renderer is unavailable for ask_user_input.',
    }));

    const destroyedRenderer = createRenderer();
    destroyedRenderer.destroyed = true;
    await expect(manager.requestInput(destroyedRenderer, createRequest({ requestId: 'destroyed' }))).resolves.toEqual(expect.objectContaining({
      ok: false,
      status: 'unavailable',
      requestId: 'destroyed',
    }));

    const throwingRenderer = {
      isDestroyed: () => false,
      send: () => {
        throw new Error('send failed');
      },
    };
    await expect(manager.requestInput(throwingRenderer, createRequest({ requestId: 'throws' }))).resolves.toEqual(expect.objectContaining({
      ok: false,
      status: 'unavailable',
      requestId: 'throws',
    }));
    expect(manager.pendingCount).toBe(0);
  });

  it('generates a replacement id when a new request collides with an active request id', async () => {
    const renderer = createRenderer();
    const generatedIds = ['generated-collision'];
    const manager = new HumanInputSessionManager({
      requestChannel: 'humanInput:request',
      timeoutMs: 1000,
      createRequestId: () => generatedIds.shift() || 'generated-fallback',
    });

    const first = manager.requestInput(renderer, createRequest({ requestId: 'same-id' }));
    const second = manager.requestInput(renderer, createRequest({ requestId: 'same-id' }));

    expect(renderer.sent.map((entry) => entry.request.requestId)).toEqual([
      'same-id',
      'generated-collision',
    ]);
    expect(manager.resolveAnswer({
      ok: true,
      status: 'answered',
      requestId: 'same-id',
      selections: [],
    })).toEqual({ ok: true });
    expect(manager.resolveAnswer({
      ok: true,
      status: 'answered',
      requestId: 'generated-collision',
      selections: [],
    })).toEqual({ ok: true });

    await expect(first).resolves.toEqual(expect.objectContaining({ requestId: 'same-id' }));
    await expect(second).resolves.toEqual(expect.objectContaining({ requestId: 'generated-collision' }));
  });

  it('times out pending requests and rejects duplicate or unknown answers', async () => {
    vi.useFakeTimers();
    const renderer = createRenderer();
    const manager = new HumanInputSessionManager({
      requestChannel: 'humanInput:request',
      timeoutMs: 250,
    });

    const pending = manager.requestInput(renderer, createRequest({ requestId: 'timeout-request' }));
    await vi.advanceTimersByTimeAsync(250);

    await expect(pending).resolves.toEqual(expect.objectContaining({
      ok: false,
      status: 'unavailable',
      requestId: 'timeout-request',
      message: 'Timed out waiting for ask_user_input response.',
    }));
    expect(manager.resolveAnswer({
      ok: true,
      status: 'answered',
      requestId: 'timeout-request',
      selections: [],
    })).toEqual({ ok: false });
    expect(manager.resolveAnswer({
      ok: true,
      status: 'answered',
      requestId: 'unknown-request',
      selections: [],
    })).toEqual({ ok: false });
    expect(manager.pendingCount).toBe(0);
  });
});
