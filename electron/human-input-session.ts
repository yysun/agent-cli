/**
 * Electron Human Input Session
 *
 * Purpose:
 * - Own pending `ask_user_input` request lifecycles for the Electron main process.
 *
 * Key features:
 * - Generates request ids when the runtime request has none or collides with an active request.
 * - Sends structured requests to the renderer and resolves structured answers back to the runtime.
 * - Cleans up accepted, duplicate, unknown, unavailable, and timed-out requests deterministically.
 *
 * Recent changes:
 * - 2026-07-28: Returned canonical 0.7 answered/cancelled outcomes with explicit reasons.
 * - 2026-07-27: Re-expressed on the shared pending-request lifecycle without behavior change.
 * - 2026-06-03: Extracted pending human-input lifecycle from the Electron main process.
 */
import type { AskUserInputRawResponse } from 'llm-runtime';
import type { PendingHumanInputRequest } from '../cli/src/human-input-ui.js';
import {
  PendingRequestSessionManager,
  type PendingRequestRenderer,
} from './pending-request-session.js';

export type HumanInputRenderer = PendingRequestRenderer<PendingHumanInputRequest>;

export type HumanInputSessionOptions = {
  requestChannel: string;
  timeoutMs: number;
  createRequestId?: () => string;
};

const RENDERER_UNAVAILABLE_MESSAGE = 'Electron renderer is unavailable for ask_user_input.';
const TIMEOUT_MESSAGE = 'Timed out waiting for ask_user_input response.';

export type HumanInputAnswer = { requestId: string } & AskUserInputRawResponse;

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  const allowed = new Set(allowedKeys);
  return Reflect.ownKeys(value).every((key) => typeof key === 'string' && allowed.has(key));
}

export function normalizeHumanInputAnswer(value: unknown): HumanInputAnswer | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const answer = value as Record<string, unknown>;
  const requestId = String(answer.requestId ?? '').trim();
  if (!requestId) {
    return null;
  }

  if (answer.status === 'answered') {
    if (
      !hasOnlyKeys(answer, ['requestId', 'status', 'answers'])
      || !answer.answers
      || typeof answer.answers !== 'object'
      || Array.isArray(answer.answers)
    ) {
      return null;
    }
    return {
      requestId,
      status: 'answered',
      answers: answer.answers as Record<string, string | string[]>,
    };
  }
  if (
    answer.status !== 'cancelled'
    || !hasOnlyKeys(answer, ['requestId', 'status', 'reason', 'message'])
    || (
      answer.reason !== 'rejected'
      && answer.reason !== 'skipped'
      && answer.reason !== 'dismissed'
      && answer.reason !== 'timeout'
    )
  ) {
    return null;
  }

  return {
    requestId,
    status: 'cancelled',
    reason: answer.reason,
    ...(typeof answer.message === 'string' && answer.message
      ? { message: answer.message }
      : {}),
  };
}

export function unavailableHumanInputAnswer(
  request: PendingHumanInputRequest,
  message: string,
  fallbackReason: 'unavailable' | 'timeout',
): HumanInputAnswer {
  return {
    requestId: request.requestId,
    status: 'cancelled',
    reason: fallbackReason === 'timeout' ? 'timeout' : 'dismissed',
    message,
  };
}

export class HumanInputSessionManager {
  private readonly sessions: PendingRequestSessionManager<PendingHumanInputRequest, HumanInputAnswer>;

  constructor(options: HumanInputSessionOptions) {
    this.sessions = new PendingRequestSessionManager({
      requestChannel: options.requestChannel,
      timeoutMs: options.timeoutMs,
      ...(options.createRequestId ? { createRequestId: options.createRequestId } : {}),
      normalizeAnswer: normalizeHumanInputAnswer,
      buildFallbackAnswer: unavailableHumanInputAnswer,
      rendererUnavailableMessage: RENDERER_UNAVAILABLE_MESSAGE,
      timeoutMessage: TIMEOUT_MESSAGE,
    });
  }

  get pendingCount(): number {
    return this.sessions.pendingCount;
  }

  requestInput(
    renderer: HumanInputRenderer | undefined,
    request: PendingHumanInputRequest,
  ): Promise<HumanInputAnswer> {
    return this.sessions.request(renderer, request);
  }

  resolveAnswer(rawAnswer: unknown): { ok: boolean } {
    return this.sessions.resolveAnswer(rawAnswer);
  }
}
