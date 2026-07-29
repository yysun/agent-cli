/**
 * Human Input Prompt Feature
 *
 * Purpose:
 * - Render runtime `ask_user_input` requests inside the Electron chat flow.
 *
 * Key features:
 * - Supports single-select, multiple-select, freeform answers, skips, and cancellation.
 * - Returns the same structured answer artifact shape used by the CLI human-input UI.
 *
 * Recent changes:
 * - 2026-07-28: Adopted `allowOther` and canonical answered/cancelled outcomes.
 * - 2026-06-03: Reused deterministic answer helpers and radio semantics for single-select prompts.
 * - 2026-06-03: Added in-chat prompt handling for Electron runtime turns.
 */
import { useMemo, useState } from 'react';
import { Button, Checkbox, Input } from '../../design-system';
import type {
  AgentCliDesktopHumanInputAnswer,
  AgentCliDesktopHumanInputRequest,
} from '../../types/desktop-api';
import {
  allowsOtherInput,
  buildCancelledHumanInputAnswer,
  buildHumanInputAnswer,
} from './human-input-selection';

export interface HumanInputPromptProps {
  request: AgentCliDesktopHumanInputRequest;
  onSubmitAnswer: (answer: AgentCliDesktopHumanInputAnswer) => Promise<void>;
}

export default function HumanInputPrompt({ request, onSubmitAnswer }: HumanInputPromptProps) {
  const [selectedOptionIdsByQuestion, setSelectedOptionIdsByQuestion] = useState<Record<string, string[]>>({});
  const [freeformTextByQuestion, setFreeformTextByQuestion] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const multipleSelect = request.type === 'multiple-select';

  const questionCountLabel = useMemo(() => (
    request.questions.length === 1 ? '1 question' : `${request.questions.length} questions`
  ), [request.questions.length]);

  function setQuestionOption(questionId: string, optionId: string, checked: boolean): void {
    setSelectedOptionIdsByQuestion((current) => {
      const currentIds = current[questionId] || [];
      const nextIds = multipleSelect
        ? checked
          ? [...new Set([...currentIds, optionId])]
          : currentIds.filter((currentId) => currentId !== optionId)
        : checked
          ? [optionId]
          : [];

      return {
        ...current,
        [questionId]: nextIds,
      };
    });
  }

  async function submitAnswer(skipAll = false): Promise<void> {
    if (submitting) {
      return;
    }

    const result = buildHumanInputAnswer(request, {
      selectedOptionIdsByQuestion,
      freeformTextByQuestion,
    }, skipAll);
    if (result.ok === false) {
      setError(result.error);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await onSubmitAnswer(result.answer);
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelAnswer(): Promise<void> {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await onSubmitAnswer(buildCancelledHumanInputAnswer(request));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="aw-human-input" aria-label="Agent input request">
      <div className="aw-human-input-header">
        <div>
          <span>{request.toolName}</span>
          <h3>Input requested</h3>
        </div>
        <span>{questionCountLabel}</span>
      </div>

      <div className="aw-human-input-questions">
        {request.questions.map((question) => {
          const selectedOptionIds = selectedOptionIdsByQuestion[question.id] || [];

          return (
            <fieldset className="aw-human-input-question" key={question.id}>
              <legend>{question.header}</legend>
              <p>{question.question}</p>
              {question.options.length ? (
                <div className="aw-human-input-options">
                  {question.options.map((option) => {
                    const checked = selectedOptionIds.includes(option.id);
                    return (
                      <label className="aw-human-input-option" key={option.id}>
                        {multipleSelect ? (
                          <Checkbox
                            name={`${request.requestId}-${question.id}`}
                            checked={checked}
                            onChange={(event) => setQuestionOption(question.id, option.id, event.currentTarget.checked)}
                          />
                        ) : (
                          <input
                            type="radio"
                            className="accent-primary"
                            name={`${request.requestId}-${question.id}`}
                            checked={checked}
                            onChange={() => setQuestionOption(question.id, option.id, true)}
                          />
                        )}
                        <span>
                          <strong>{option.label}</strong>
                          {option.description ? <small>{option.description}</small> : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
              {allowsOtherInput(question) ? (
                <Input
                  aria-label={`Freeform answer for ${question.question}`}
                  placeholder={question.options.length ? 'Custom answer' : 'Type your answer'}
                  value={freeformTextByQuestion[question.id] || ''}
                  onChange={(event) => setFreeformTextByQuestion((current) => ({
                    ...current,
                    [question.id]: event.currentTarget.value,
                  }))}
                />
              ) : null}
            </fieldset>
          );
        })}
      </div>

      {error ? <p className="aw-human-input-error" role="alert">{error}</p> : null}

      <div className="aw-human-input-actions">
        <Button variant="ghost" size="sm" disabled={submitting} onClick={() => void cancelAnswer()}>Cancel</Button>
        {request.allowSkip ? <Button variant="ghost" size="sm" disabled={submitting} onClick={() => void submitAnswer(true)}>Skip</Button> : null}
        <Button size="sm" disabled={submitting} onClick={() => void submitAnswer()}>{submitting ? 'Submitting' : 'Submit'}</Button>
      </div>
    </section>
  );
}
