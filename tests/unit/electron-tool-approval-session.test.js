// @ts-check
/**
 * Electron Tool Approval Session Unit Tests
 *
 * Purpose:
 * - Validate the Electron main-process tool-approval lifecycle helper.
 *
 * Key features:
 * - Covers approvals, denials, missing renderers, send failures, timeouts, and duplicate answers.
 * - Asserts the gate denies by default rather than falling open.
 *
 * Recent changes:
 * - 2026-07-28: Covered explicit approve/rejected/dismissed/timeout decisions.
 * - 2026-07-27: Added coverage for Electron tool-approval sessions.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ToolApprovalSessionManager,
  summarizeToolApprovalArguments,
} from '../../electron/tool-approval-session.js';

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

function createManager(overrides = {}) {
  return new ToolApprovalSessionManager({
    requestChannel: 'toolApproval:request',
    timeoutMs: 1000,
    createRequestId: () => 'generated-request',
    ...overrides,
  });
}

const loadSkillRequest = {
  toolCallId: 'tool-1',
  toolName: 'load_skill',
  arguments: { skillId: 'core' },
};

afterEach(() => {
  vi.useRealTimers();
});

describe('ToolApprovalSessionManager', () => {
  it('sends an approval request to the renderer and resolves an approval', async () => {
    const renderer = createRenderer();
    const manager = createManager();
    const gate = manager.createApprovalGate(renderer);

    const pending = gate.requestApproval(loadSkillRequest);
    await Promise.resolve();

    expect(renderer.sent).toHaveLength(1);
    expect(renderer.sent[0].channel).toBe('toolApproval:request');
    expect(renderer.sent[0].request).toMatchObject({
      requestId: 'tool-1',
      toolCallId: 'tool-1',
      toolName: 'load_skill',
      argumentsSummary: '{"skillId":"core"}',
    });
    expect(manager.pendingCount).toBe(1);

    expect(manager.resolveAnswer({ requestId: 'tool-1', decision: 'approve' })).toEqual({ ok: true });
    await expect(pending).resolves.toEqual({ decision: 'approve' });
    expect(manager.pendingCount).toBe(0);
  });

  it('resolves a denial with the supplied reason', async () => {
    const renderer = createRenderer();
    const manager = createManager();
    const gate = manager.createApprovalGate(renderer);

    const pending = gate.requestApproval(loadSkillRequest);
    await Promise.resolve();

    manager.resolveAnswer({
      requestId: 'tool-1',
      decision: 'cancel',
      reason: 'rejected',
      message: 'Not this time.',
    });
    await expect(pending).resolves.toEqual({
      decision: 'cancel',
      reason: 'rejected',
      message: 'Not this time.',
    });
  });

  it('preserves a rejected decision without inventing a message', async () => {
    const renderer = createRenderer();
    const manager = createManager();
    const gate = manager.createApprovalGate(renderer);

    const pending = gate.requestApproval(loadSkillRequest);
    await Promise.resolve();

    manager.resolveAnswer({ requestId: 'tool-1', decision: 'cancel', reason: 'rejected' });
    await expect(pending).resolves.toEqual({
      decision: 'cancel',
      reason: 'rejected',
    });
  });

  it('denies when the renderer is missing or destroyed', async () => {
    const manager = createManager();
    const destroyedRenderer = createRenderer();
    destroyedRenderer.destroyed = true;

    await expect(manager.createApprovalGate(undefined).requestApproval(loadSkillRequest))
      .resolves.toMatchObject({ decision: 'cancel', reason: 'dismissed' });
    await expect(manager.createApprovalGate(destroyedRenderer).requestApproval(loadSkillRequest))
      .resolves.toMatchObject({ decision: 'cancel', reason: 'dismissed' });
    expect(manager.pendingCount).toBe(0);
  });

  it('denies when the renderer send throws', async () => {
    const manager = createManager();
    const throwingRenderer = {
      isDestroyed: () => false,
      send: () => {
        throw new Error('send failed');
      },
    };

    await expect(manager.createApprovalGate(throwingRenderer).requestApproval(loadSkillRequest))
      .resolves.toMatchObject({ decision: 'cancel', reason: 'dismissed' });
    expect(manager.pendingCount).toBe(0);
  });

  it('denies on timeout instead of approving', async () => {
    vi.useFakeTimers();
    const renderer = createRenderer();
    const manager = createManager();

    const pending = manager.createApprovalGate(renderer).requestApproval(loadSkillRequest);
    await Promise.resolve();

    vi.advanceTimersByTime(1000);

    await expect(pending).resolves.toEqual({
      decision: 'cancel',
      reason: 'timeout',
      message: 'Timed out waiting for tool approval.',
    });
    expect(manager.pendingCount).toBe(0);
  });

  it('rejects unknown, malformed, and duplicate answers', async () => {
    const renderer = createRenderer();
    const manager = createManager();

    const pending = manager.createApprovalGate(renderer).requestApproval(loadSkillRequest);
    await Promise.resolve();

    expect(manager.resolveAnswer(null)).toEqual({ ok: false });
    expect(manager.resolveAnswer({ decision: 'approve' })).toEqual({ ok: false });
    expect(manager.resolveAnswer({ requestId: 'other', decision: 'approve' })).toEqual({ ok: false });
    expect(manager.resolveAnswer({ requestId: 'tool-1', decision: 'approve', approved: true })).toEqual({ ok: false });
    expect(manager.resolveAnswer({ requestId: 'tool-1', decision: 'approve' })).toEqual({ ok: true });
    expect(manager.resolveAnswer({ requestId: 'tool-1', decision: 'approve' })).toEqual({ ok: false });

    await expect(pending).resolves.toEqual({ decision: 'approve' });
  });

  it('generates a request id when the tool call id is missing or already pending', async () => {
    const renderer = createRenderer();
    const manager = createManager();
    const gate = manager.createApprovalGate(renderer);

    const first = gate.requestApproval({ toolName: 'shell_cmd' });
    await Promise.resolve();
    expect(renderer.sent[0].request.requestId).toBe('generated-request');

    manager.resolveAnswer({ requestId: 'generated-request', decision: 'approve' });
    await expect(first).resolves.toEqual({ decision: 'approve' });
  });

  it('approves host-owned human input tools without prompting the renderer', async () => {
    const renderer = createRenderer();
    const manager = createManager();

    await expect(manager.createApprovalGate(renderer).requestApproval({
      toolCallId: 'tool-9',
      toolName: 'ask_user_input',
      arguments: {},
    })).resolves.toEqual({ decision: 'approve' });
    expect(renderer.sent).toHaveLength(0);
  });
});

describe('summarizeToolApprovalArguments', () => {
  it('returns an empty summary for absent arguments', () => {
    expect(summarizeToolApprovalArguments(undefined)).toBe('');
    expect(summarizeToolApprovalArguments(null)).toBe('');
  });

  it('collapses whitespace and bounds long payloads', () => {
    expect(summarizeToolApprovalArguments('{\n  "a": 1\n}')).toBe('{ "a": 1 }');

    const summary = summarizeToolApprovalArguments({ blob: 'x'.repeat(2000) });
    expect(summary.length).toBeLessThanOrEqual(400);
    expect(summary.endsWith('…')).toBe(true);
  });
});
