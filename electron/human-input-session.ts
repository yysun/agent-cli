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
 * - 2026-06-03: Extracted pending human-input lifecycle from the Electron main process.
 */
import { randomUUID } from 'node:crypto';
import type {
  HumanInputAnswerArtifact,
  PendingHumanInputRequest,
} from '../cli/src/human-input-ui.js';

export type HumanInputRenderer = {
  isDestroyed: () => boolean;
  send: (channel: string, request: PendingHumanInputRequest) => void;
};

type PendingHumanInputAnswer = {
  resolve: (answer: HumanInputAnswerArtifact) => void;
  timeout: ReturnType<typeof setTimeout>;
};

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
  private readonly pendingAnswers = new Map<string, PendingHumanInputAnswer>();

  private readonly requestChannel: string;

  private readonly timeoutMs: number;

  private readonly createRequestId: () => string;

  constructor(options: HumanInputSessionOptions) {
    this.requestChannel = options.requestChannel;
    this.timeoutMs = options.timeoutMs;
    this.createRequestId = options.createRequestId ?? randomUUID;
  }

  get pendingCount(): number {
    return this.pendingAnswers.size;
  }

  private prepareRendererRequest(request: PendingHumanInputRequest): PendingHumanInputRequest {
    const preferredRequestId = request.requestId.trim();
    if (preferredRequestId && !this.pendingAnswers.has(preferredRequestId)) {
      return { ...request, requestId: preferredRequestId };
    }

    let requestId = this.createRequestId();
    while (this.pendingAnswers.has(requestId)) {
      requestId = this.createRequestId();
    }

    return { ...request, requestId };
  }

  requestInput(
    renderer: HumanInputRenderer | undefined,
    request: PendingHumanInputRequest,
  ): Promise<HumanInputAnswerArtifact> {
    const rendererRequest = this.prepareRendererRequest(request);

    if (!renderer || renderer.isDestroyed()) {
      return Promise.resolve(unavailableHumanInputAnswer(rendererRequest, 'Electron renderer is unavailable for ask_user_input.'));
    }

    const { requestId } = rendererRequest;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingAnswers.delete(requestId);
        resolve(unavailableHumanInputAnswer(rendererRequest, 'Timed out waiting for ask_user_input response.'));
      }, this.timeoutMs);

      this.pendingAnswers.set(requestId, { resolve, timeout });

      try {
        renderer.send(this.requestChannel, rendererRequest);
      } catch {
        clearTimeout(timeout);
        this.pendingAnswers.delete(requestId);
        resolve(unavailableHumanInputAnswer(rendererRequest, 'Electron renderer is unavailable for ask_user_input.'));
      }
    });
  }

  resolveAnswer(rawAnswer: unknown): { ok: boolean } {
    const answer = normalizeHumanInputAnswer(rawAnswer);
    if (!answer) {
      return { ok: false };
    }

    const pendingAnswer = this.pendingAnswers.get(answer.requestId);
    if (!pendingAnswer) {
      return { ok: false };
    }

    clearTimeout(pendingAnswer.timeout);
    this.pendingAnswers.delete(answer.requestId);
    pendingAnswer.resolve(answer);
    return { ok: true };
  }
}
