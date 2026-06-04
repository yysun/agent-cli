/**
 * Human Input Selection Helpers
 *
 * Purpose:
 * - Build structured Electron human-input answers from renderer prompt state.
 *
 * Key features:
 * - Keeps answer construction deterministic and testable outside React.
 * - Enforces single-select, multiple-select, freeform, required-answer, skip, and cancel rules.
 *
 * Recent changes:
 * - 2026-06-03: Extracted Electron prompt answer construction from `HumanInputPrompt`.
 */
import type {
  AgentCliDesktopHumanInputAnswer,
  AgentCliDesktopHumanInputOption,
  AgentCliDesktopHumanInputQuestion,
  AgentCliDesktopHumanInputRequest,
  AgentCliDesktopHumanInputSelection,
} from '../../types/desktop-api';

export type HumanInputPromptState = {
  selectedOptionIdsByQuestion: Record<string, string[]>;
  freeformTextByQuestion: Record<string, string>;
};

export type HumanInputSelectionsResult =
  | { ok: true; selections: AgentCliDesktopHumanInputSelection[] }
  | { ok: false; error: string };

export type HumanInputAnswerResult =
  | { ok: true; answer: AgentCliDesktopHumanInputAnswer }
  | { ok: false; error: string };

export function allowsFreeformInput(question: AgentCliDesktopHumanInputQuestion): boolean {
  return question.allowFreeformInput !== false;
}

export function selectedOptionsForQuestion(
  question: AgentCliDesktopHumanInputQuestion,
  selectedOptionIds: string[],
): AgentCliDesktopHumanInputOption[] {
  return selectedOptionIds
    .map((optionId) => question.options.find((option) => option.id === optionId))
    .filter((option): option is AgentCliDesktopHumanInputOption => Boolean(option));
}

export function buildHumanInputSelections(
  request: AgentCliDesktopHumanInputRequest,
  state: HumanInputPromptState,
  skipAll = false,
): HumanInputSelectionsResult {
  const selections: AgentCliDesktopHumanInputSelection[] = [];

  for (const question of request.questions) {
    const selectedOptionIds = state.selectedOptionIdsByQuestion[question.id] || [];
    const selectedOptions = selectedOptionsForQuestion(question, selectedOptionIds);
    const normalizedSelectedOptions = request.type === 'single-select'
      ? selectedOptions.slice(0, 1)
      : selectedOptions;
    const enteredText = String(state.freeformTextByQuestion[question.id] || '').trim();

    if (skipAll || (request.allowSkip && normalizedSelectedOptions.length === 0 && !enteredText)) {
      selections.push({
        questionId: question.id,
        questionText: question.question,
        skipped: true,
        selectedOptions: [],
      });
      continue;
    }

    if (normalizedSelectedOptions.length > 0) {
      selections.push({
        questionId: question.id,
        questionText: question.question,
        skipped: false,
        selectedOptions: normalizedSelectedOptions,
      });
      continue;
    }

    if (enteredText && allowsFreeformInput(question)) {
      selections.push({
        questionId: question.id,
        questionText: question.question,
        skipped: false,
        selectedOptions: [],
        enteredText,
      });
      continue;
    }

    return {
      ok: false,
      error: `Answer required: ${question.question}`,
    };
  }

  return { ok: true, selections };
}

export function buildHumanInputAnswer(
  request: AgentCliDesktopHumanInputRequest,
  state: HumanInputPromptState,
  skipAll = false,
): HumanInputAnswerResult {
  const result = buildHumanInputSelections(request, state, skipAll);
  if (result.ok === false) {
    return {
      ok: false,
      error: result.error,
    };
  }

  return {
    ok: true,
    answer: {
      ok: true,
      status: result.selections.every((selection) => selection.skipped) ? 'skipped' : 'answered',
      requestId: request.requestId,
      selections: result.selections,
    },
  };
}

export function buildCancelledHumanInputAnswer(
  request: AgentCliDesktopHumanInputRequest,
): AgentCliDesktopHumanInputAnswer {
  return {
    ok: false,
    status: 'cancelled',
    requestId: request.requestId,
    selections: [],
    message: 'User cancelled input.',
  };
}
