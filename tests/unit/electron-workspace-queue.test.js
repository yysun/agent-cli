// @ts-check
/**
 * Electron Workspace Operation Queue Unit Tests
 *
 * Purpose:
 * - Validate that workspace-touching Electron IPC operations run serially.
 *
 * Key features:
 * - Confirms a second operation cannot start while the first is in flight.
 * - Confirms a rejected operation does not wedge the queue.
 * - Confirms answer channels resolve while a queued operation holds the queue.
 *
 * Recent changes:
 * - 2026-07-28: Updated queued approval evidence to the 0.7 decision contract.
 * - 2026-07-27: Added coverage for the serial workspace operation queue.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getName: () => 'Agent World',
    getVersion: () => '0.1.0',
    getPath: () => '/tmp/agent-world-test',
    setName: () => undefined,
    setAppUserModelId: () => undefined,
    on: () => undefined,
    quit: () => undefined,
    whenReady: () => new Promise(() => {}),
  },
  BrowserWindow: class {
    static getAllWindows() {
      return [];
    }
  },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  ipcMain: { handle: () => undefined },
  shell: { openExternal: async () => undefined },
}));

function createDeferred() {
  let resolve = () => {};
  let reject = () => {};
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

describe('enqueueWorkspaceOperation', () => {
  it('runs operations serially instead of interleaving them', async () => {
    const { enqueueWorkspaceOperation } = await import('../../electron/main.js');
    const events = [];
    const first = createDeferred();
    const second = createDeferred();

    const firstOperation = enqueueWorkspaceOperation(async () => {
      events.push('first:start');
      await first.promise;
      events.push('first:end');
      return 'first';
    });

    const secondOperation = enqueueWorkspaceOperation(async () => {
      events.push('second:start');
      await second.promise;
      events.push('second:end');
      return 'second';
    });

    // The second operation must not have started while the first is pending.
    await Promise.resolve();
    expect(events).toEqual(['first:start']);

    first.resolve(undefined);
    await expect(firstOperation).resolves.toBe('first');
    expect(events).toEqual(['first:start', 'first:end', 'second:start']);

    second.resolve(undefined);
    await expect(secondOperation).resolves.toBe('second');
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('keeps draining after an operation rejects', async () => {
    const { enqueueWorkspaceOperation } = await import('../../electron/main.js');

    const failing = enqueueWorkspaceOperation(async () => {
      throw new Error('boom');
    });

    await expect(failing).rejects.toThrow('boom');
    await expect(enqueueWorkspaceOperation(async () => 'after-failure')).resolves.toBe('after-failure');
  });

  it('lets an answer channel resolve while a queued operation holds the queue', async () => {
    const { enqueueWorkspaceOperation } = await import('../../electron/main.js');
    const { ToolApprovalSessionManager } = await import('../../electron/tool-approval-session.js');

    const renderer = {
      sent: [],
      isDestroyed: () => false,
      send(channel, request) {
        this.sent.push({ channel, request });
      },
    };
    const manager = new ToolApprovalSessionManager({
      requestChannel: 'toolApproval:request',
      timeoutMs: 1000,
    });

    // Mirrors a turn: the queued operation blocks until the renderer answers.
    // Answer handlers are registered outside the queue, so this must not deadlock.
    const queuedTurn = enqueueWorkspaceOperation(async () => (
      manager.createApprovalGate(renderer).requestApproval({
        toolCallId: 'tool-1',
        toolName: 'load_skill',
        arguments: {},
      })
    ));

    await vi.waitFor(() => {
      expect(renderer.sent).toHaveLength(1);
    });

    expect(manager.resolveAnswer({ requestId: 'tool-1', decision: 'approve' })).toEqual({ ok: true });
    await expect(queuedTurn).resolves.toEqual({ decision: 'approve' });
  });
});
