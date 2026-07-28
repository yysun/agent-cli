/**
 * Electron Pending Request Session
 *
 * Purpose:
 * - Own the shared lifecycle for main-process requests that block on a renderer answer.
 *
 * Key features:
 * - Generates request ids when the incoming request has none or collides with an active request.
 * - Sends structured requests to the renderer and resolves structured answers back to the caller.
 * - Resolves a caller-supplied fallback answer for absent, destroyed, failing, and timed-out renderers.
 *
 * Recent changes:
 * - 2026-07-27: Extracted from `human-input-session.ts` so tool approval reuses one lifecycle.
 */
import { randomUUID } from 'node:crypto';

export type PendingRequestRenderer<TRequest> = {
  isDestroyed: () => boolean;
  send: (channel: string, request: TRequest) => void;
};

type PendingAnswer<TAnswer> = {
  resolve: (answer: TAnswer) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type PendingRequestSessionOptions<
  TRequest extends { requestId: string },
  TAnswer extends { requestId: string },
> = {
  requestChannel: string;
  timeoutMs: number;
  createRequestId?: () => string;
  normalizeAnswer: (value: unknown) => TAnswer | null;
  buildFallbackAnswer: (request: TRequest, message: string) => TAnswer;
  rendererUnavailableMessage: string;
  timeoutMessage: string;
};

export class PendingRequestSessionManager<
  TRequest extends { requestId: string },
  TAnswer extends { requestId: string },
> {
  private readonly pendingAnswers = new Map<string, PendingAnswer<TAnswer>>();

  private readonly options: PendingRequestSessionOptions<TRequest, TAnswer>;

  private readonly createRequestId: () => string;

  constructor(options: PendingRequestSessionOptions<TRequest, TAnswer>) {
    this.options = options;
    this.createRequestId = options.createRequestId ?? randomUUID;
  }

  get pendingCount(): number {
    return this.pendingAnswers.size;
  }

  private prepareRendererRequest(request: TRequest): TRequest {
    const preferredRequestId = String(request.requestId ?? '').trim();
    if (preferredRequestId && !this.pendingAnswers.has(preferredRequestId)) {
      return { ...request, requestId: preferredRequestId };
    }

    let requestId = this.createRequestId();
    while (this.pendingAnswers.has(requestId)) {
      requestId = this.createRequestId();
    }

    return { ...request, requestId };
  }

  request(
    renderer: PendingRequestRenderer<TRequest> | undefined,
    request: TRequest,
  ): Promise<TAnswer> {
    const rendererRequest = this.prepareRendererRequest(request);

    if (!renderer || renderer.isDestroyed()) {
      return Promise.resolve(
        this.options.buildFallbackAnswer(rendererRequest, this.options.rendererUnavailableMessage),
      );
    }

    const { requestId } = rendererRequest;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingAnswers.delete(requestId);
        resolve(this.options.buildFallbackAnswer(rendererRequest, this.options.timeoutMessage));
      }, this.options.timeoutMs);

      this.pendingAnswers.set(requestId, { resolve, timeout });

      try {
        renderer.send(this.options.requestChannel, rendererRequest);
      } catch {
        clearTimeout(timeout);
        this.pendingAnswers.delete(requestId);
        resolve(
          this.options.buildFallbackAnswer(rendererRequest, this.options.rendererUnavailableMessage),
        );
      }
    });
  }

  resolveAnswer(rawAnswer: unknown): { ok: boolean } {
    const answer = this.options.normalizeAnswer(rawAnswer);
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
