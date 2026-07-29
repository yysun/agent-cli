/**
 * Electron Turn Outcome Serialization
 *
 * Purpose:
 * - Serialize shared runtime turn outcomes across the Electron IPC boundary.
 *
 * Key features:
 * - Preserves completed, pending, and cancelled status without inventing assistant text.
 * - Carries exact tool-approval or human-input cancellation metadata to the renderer.
 *
 * Recent changes:
 * - 2026-07-28: Added the 0.7 cancellation-aware Electron response boundary.
 */
import type {
  ChatTurnCancellation,
  ChatTurnResult,
} from '../core/agent-runtime.js';

export type ElectronTurnOutcome = {
  status: ChatTurnResult['status'];
  assistantText: string;
  cancellation?: ChatTurnCancellation;
};

export function serializeElectronTurnOutcome(result: ChatTurnResult): ElectronTurnOutcome {
  if (result.status === 'cancelled') {
    return {
      status: 'cancelled',
      assistantText: '',
      cancellation: result.cancellation,
    };
  }

  return {
    status: result.status,
    assistantText: result.assistantText,
  };
}
