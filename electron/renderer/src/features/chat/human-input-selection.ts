/**
 * Human Input Selection Helpers
 *
 * Purpose:
 * - Build canonical Electron human-input outcomes from renderer prompt state.
 *
 * Key features:
 * - Keeps answer construction deterministic and testable outside React.
 * - Enforces declared single/multiple selections and opt-in `allowOther` input.
 *
 * Recent changes:
 * - 2026-07-28: Migrated renderer answers to the `llm-runtime` 0.7 contract.
 * - 2026-06-03: Extracted Electron prompt answer construction from `HumanInputPrompt`.
 */
import type {
  AgentCliDesktopHumanInputAnswer,
  AgentCliDesktopHumanInputQuestion,
  AgentCliDesktopHumanInputRequest,
} from '../../types/desktop-api';

export type HumanInputPromptState = {
  selectedOptionIdsByQuestion: Record<string, string[]>;
  freeformTextByQuestion: Record<string, string>;
};

export type HumanInputAnswerResult =
  | { ok: true; answer: AgentCliDesktopHumanInputAnswer }
  | { ok: false; error: string };

export function allowsOtherInput(question: AgentCliDesktopHumanInputQuestion): boolean {
  return question.allowOther === true;
}

export function buildHumanInputAnswer(
  request: AgentCliDesktopHumanInputRequest,
  state: HumanInputPromptState,
  skipAll = false,
): HumanInputAnswerResult {
  if (skipAll) {
    if (!request.allowSkip) {
      return { ok: false, error: 'This input request cannot be skipped.' };
    }
    return {
      ok: true,
      answer: {
        requestId: request.requestId,
        status: 'cancelled',
        reason: 'skipped',
        message: 'User skipped input.',
      },
    };
  }

  const answers: Record<string, string | string[]> = {};

  for (const question of request.questions) {
    const selectedOptionIds = state.selectedOptionIdsByQuestion[question.id] || [];
    const declaredOptionIds = new Set(question.options.map((option) => option.id));
    const validSelectedIds = selectedOptionIds.filter((optionId) => declaredOptionIds.has(optionId));
    const enteredText = String(state.freeformTextByQuestion[question.id] || '').trim();

    if (request.type === 'multiple-select') {
      const uniqueSelectedIds = [...new Set(validSelectedIds)];
      if (uniqueSelectedIds.length === 0) {
        return { ok: false, error: `Answer required: ${question.question}` };
      }
      answers[question.id] = uniqueSelectedIds;
      continue;
    }

    if (validSelectedIds[0]) {
      answers[question.id] = validSelectedIds[0];
      continue;
    }

    if (enteredText && allowsOtherInput(question)) {
      answers[question.id] = enteredText;
      continue;
    }

    return { ok: false, error: `Answer required: ${question.question}` };
  }

  return {
    ok: true,
    answer: {
      requestId: request.requestId,
      status: 'answered',
      answers,
    },
  };
}

export function buildCancelledHumanInputAnswer(
  request: AgentCliDesktopHumanInputRequest,
): AgentCliDesktopHumanInputAnswer {
  return {
    requestId: request.requestId,
    status: 'cancelled',
    reason: 'dismissed',
    message: 'User cancelled input.',
  };
}
