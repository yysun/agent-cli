// @ts-check
/**
 * Electron Human Input Selection Unit Tests
 *
 * Purpose:
 * - Validate renderer-side construction of structured human-input answers.
 *
 * Key features:
 * - Covers single-select, multiple-select, freeform, required-answer, skip, and cancel payloads.
 *
 * Recent changes:
 * - 2026-07-28: Covered canonical 0.7 answers, `allowOther`, skip, and dismissal.
 * - 2026-06-03: Added coverage for Electron prompt answer construction.
 */
import { describe, expect, it } from 'vitest';
import {
  buildCancelledHumanInputAnswer,
  buildHumanInputAnswer,
} from '../../electron/renderer/src/features/chat/human-input-selection.js';

function createRequest(overrides = {}) {
  return {
    toolName: 'ask_user_input',
    requestId: 'request-1',
    type: 'single-select',
    allowSkip: false,
    questions: [
      {
        header: 'Input',
        id: 'question-1',
        question: 'Choose one.',
        options: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
      },
    ],
    ...overrides,
  };
}

function emptyState(overrides = {}) {
  return {
    selectedOptionIdsByQuestion: {},
    freeformTextByQuestion: {},
    ...overrides,
  };
}

describe('human-input-selection helpers', () => {
  it('builds a single-select answer with only one selected option', () => {
    const result = buildHumanInputAnswer(createRequest(), emptyState({
      selectedOptionIdsByQuestion: {
        'question-1': ['a', 'b'],
      },
    }));

    expect(result).toEqual({
      ok: true,
      answer: {
        requestId: 'request-1',
        status: 'answered',
        answers: { 'question-1': 'a' },
      },
    });
  });

  it('builds a multiple-select answer with every selected option', () => {
    const result = buildHumanInputAnswer(createRequest({ type: 'multiple-select' }), emptyState({
      selectedOptionIdsByQuestion: {
        'question-1': ['a', 'b'],
      },
    }));

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      answer: expect.objectContaining({
        status: 'answered',
        answers: { 'question-1': ['a', 'b'] },
      }),
    }));
  });

  it('builds freeform answers and rejects required unanswered prompts', () => {
    expect(buildHumanInputAnswer(createRequest({
      questions: [
        {
          header: 'Input',
          id: 'question-1',
          question: 'Choose one.',
          options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
          allowOther: true,
        },
      ],
    }), emptyState({
      freeformTextByQuestion: {
        'question-1': 'Use the custom path',
      },
    }))).toEqual(expect.objectContaining({
      ok: true,
      answer: expect.objectContaining({
        answers: { 'question-1': 'Use the custom path' },
      }),
    }));

    expect(buildHumanInputAnswer(createRequest({
      questions: [
        {
          header: 'Input',
          id: 'question-1',
          question: 'Choose one.',
          options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
        },
      ],
    }), emptyState())).toEqual({
      ok: false,
      error: 'Answer required: Choose one.',
    });
  });

  it('builds skipped and cancelled payloads', () => {
    const request = createRequest({ allowSkip: true });

    expect(buildHumanInputAnswer(request, emptyState(), true)).toEqual({
      ok: true,
      answer: {
        requestId: 'request-1',
        status: 'cancelled',
        reason: 'skipped',
        message: 'User skipped input.',
      },
    });

    expect(buildCancelledHumanInputAnswer(request)).toEqual({
      requestId: 'request-1',
      status: 'cancelled',
      reason: 'dismissed',
      message: 'User cancelled input.',
    });
  });
});
