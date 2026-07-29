/**
 * Renderer Turn Outcome Helpers
 *
 * Purpose:
 * - Convert Electron turn results into explicit renderer follow-up behavior.
 *
 * Key features:
 * - Requests persisted-transcript reload after cancellation.
 * - Labels cancellation separately from successful sends and ordinary failures.
 *
 * Recent changes:
 * - 2026-07-28: Added cancellation-aware renderer outcome handling.
 */
import type { AgentCliDesktopRunTurnResponse } from '../../types/desktop-api';

export type RendererTurnOutcome = {
  reloadTranscript: boolean;
  message: string;
};

function cancellationLabel(response: AgentCliDesktopRunTurnResponse): string {
  const cancellation = response.cancellation;
  if (!cancellation) {
    return 'Turn cancelled.';
  }

  if (cancellation.kind === 'human_input') {
    return `Turn cancelled: human input ${cancellation.reason.replaceAll('_', ' ')}.`;
  }

  return `Turn cancelled: tool approval ${cancellation.reason.replace(/^approval_/, '').replaceAll('_', ' ')}.`;
}

export function resolveRendererTurnOutcome(
  response: AgentCliDesktopRunTurnResponse,
  wasEditing: boolean,
): RendererTurnOutcome {
  if (response.status === 'cancelled') {
    return {
      reloadTranscript: true,
      message: cancellationLabel(response),
    };
  }

  return {
    reloadTranscript: false,
    message: wasEditing ? 'Edited message resent.' : 'Message sent.',
  };
}
