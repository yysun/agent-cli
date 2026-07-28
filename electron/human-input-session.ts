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
 * - 2026-07-27: Re-expressed on the shared pending-request lifecycle without behavior change.
 * - 2026-06-03: Extracted pending human-input lifecycle from the Electron main process.
 */
import type {
  HumanInputAnswerArtifact,
  PendingHumanInputRequest,
} from '../cli/src/human-input-ui.js';
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

const HUMAN_INPUT_STATUSES = new Set([
  'answered',
  'skipped',
  'cancelled',
  'unavailable',
]);

const RENDERER_UNAVAILABLE_MESSAGE = 'Electron renderer is unavailable for ask_user_input.';
const TIMEOUT_MESSAGE = 'Timed out waiting for ask_user_input response.';

function isHumanInputStatus(value: unknown): value is HumanInputAnswerArtifact['status'] {
  return typeof value === 'string' && HUMAN_INPUT_STATUSES.has(value);
}

export function normalizeHumanInputAnswer(value: unknown): HumanInputAnswerArtifact | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const answer = value as Partial<HumanInputAnswerArtifact>;
  const requestId = String(answer.requestId ?? '').trim();
  if (!requestId) {
    return null;
  }

  return {
    ok: answer.ok === true,
    status: isHumanInputStatus(answer.status) ? answer.status : 'answered',
    requestId,
    selections: Array.isArray(answer.selections) ? answer.selections : [],
    ...(typeof answer.message === 'string' ? { message: answer.message } : {}),
  };
}

export function unavailableHumanInputAnswer(
  request: PendingHumanInputRequest,
  message: string,
): HumanInputAnswerArtifact {
  return {
    ok: false,
    status: 'unavailable',
    requestId: request.requestId,
    selections: [],
    message,
  };
}

export class HumanInputSessionManager {
  private readonly sessions: PendingRequestSessionManager<PendingHumanInputRequest, HumanInputAnswerArtifact>;

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
  ): Promise<HumanInputAnswerArtifact> {
    return this.sessions.request(renderer, request);
  }

  resolveAnswer(rawAnswer: unknown): { ok: boolean } {
    return this.sessions.resolveAnswer(rawAnswer);
  }
}
