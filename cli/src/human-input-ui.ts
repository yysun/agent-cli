/**
 * Agent CLI Human Input UI
 *
 * Purpose:
 * - Convert `ask_user_input` tool calls into terminal prompts and canonical runtime outcomes.
 *
 * Key features:
 * - Strictly parses the `llm-runtime` 0.7 request schema without repairing malformed input.
 * - Supports declared single/multiple selections and opt-in single-select free-form answers.
 * - Returns answered or cancelled outcomes that the shared runtime validates before resume.
 *
 * Recent changes:
 * - 2026-07-28: Migrated to strict `allowOther` requests, canonical 0.7 outcomes,
 *   and collision-free terminal cancellation escaping.
 * - 2026-05-23: Added terminal UI handling for `ask_user_input` tool requests.
 */
import type { AskUserInputRawResponse } from 'llm-runtime';

export interface HumanInputPrompt {
  question(query: string): Promise<string>;
}

export interface HumanInputOutput {
  write(chunk: string): void;
}

export type HumanInputSelectionType = 'single-select' | 'multiple-select';

export interface HumanInputOption {
  id: string;
  label: string;
  description?: string;
}

export interface HumanInputQuestion {
  header: string;
  id: string;
  question: string;
  options: HumanInputOption[];
  allowOther?: boolean;
}

export interface PendingHumanInputRequest {
  toolName: 'ask_user_input';
  requestId: string;
  type: HumanInputSelectionType;
  allowSkip: boolean;
  questions: HumanInputQuestion[];
}

type JsonRecord = Record<string, unknown>;

const EXIT_HUMAN_INPUT_TOKEN = ':exit';
const ESCAPE_HUMAN_INPUT_PREFIX = '\\';
const HUMAN_INPUT_TOOL_NAME = 'ask_user_input';

export function isHumanInputToolName(toolName: string): boolean {
  return toolName === HUMAN_INPUT_TOOL_NAME;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonRecord(value: unknown): JsonRecord | null {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function hasOnlyKeys(record: JsonRecord, allowedKeys: readonly string[]): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(record).every((key) => allowed.has(key));
}

function readRequiredString(record: JsonRecord, fieldName: string): string | null {
  const value = record[fieldName];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sanitizeDisplayText(value: string): string {
  return value.replace(/\s{2,}/g, ' ').trim();
}

function parseHumanInputOption(value: unknown): HumanInputOption | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ['id', 'label', 'description'])) {
    return null;
  }

  const id = readRequiredString(value, 'id');
  const label = readRequiredString(value, 'label');
  const description = value.description;
  if (!id || !label || (description !== undefined && typeof description !== 'string')) {
    return null;
  }

  return {
    id,
    label: sanitizeDisplayText(label),
    ...(typeof description === 'string' && description.trim()
      ? { description: sanitizeDisplayText(description) }
      : {}),
  };
}

function parseHumanInputQuestion(
  value: unknown,
  selectionType: HumanInputSelectionType,
): HumanInputQuestion | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ['header', 'id', 'question', 'allowOther', 'options'])) {
    return null;
  }

  const header = readRequiredString(value, 'header');
  const id = readRequiredString(value, 'id');
  const question = readRequiredString(value, 'question');
  if (!header || !id || !question || !Array.isArray(value.options) || value.options.length < 2) {
    return null;
  }
  if (value.allowOther !== undefined && typeof value.allowOther !== 'boolean') {
    return null;
  }
  if (selectionType === 'multiple-select' && value.allowOther === true) {
    return null;
  }

  const options = value.options.map(parseHumanInputOption);
  if (options.some((option) => option === null)) {
    return null;
  }

  const normalizedOptions = options as HumanInputOption[];
  if (new Set(normalizedOptions.map((option) => option.id)).size !== normalizedOptions.length) {
    return null;
  }

  return {
    header: sanitizeDisplayText(header),
    id,
    question: sanitizeDisplayText(question),
    options: normalizedOptions,
    ...(value.allowOther === true ? { allowOther: true } : {}),
  };
}

export function parseHumanInputRequest(
  toolName: string,
  payload: unknown,
  fallbackRequestId = '',
): PendingHumanInputRequest | null {
  if (!isHumanInputToolName(toolName)) {
    return null;
  }

  const record = parseJsonRecord(payload);
  if (!record || !hasOnlyKeys(record, ['type', 'allowSkip', 'questions'])) {
    return null;
  }

  const rawType = record.type;
  if (rawType !== undefined && rawType !== 'single-select' && rawType !== 'multiple-select') {
    return null;
  }
  if (record.allowSkip !== undefined && typeof record.allowSkip !== 'boolean') {
    return null;
  }
  if (!Array.isArray(record.questions) || record.questions.length === 0) {
    return null;
  }

  const type: HumanInputSelectionType = rawType === 'multiple-select'
    ? 'multiple-select'
    : 'single-select';
  const questions = record.questions.map((value) => parseHumanInputQuestion(value, type));
  if (questions.some((question) => question === null)) {
    return null;
  }

  const normalizedQuestions = questions as HumanInputQuestion[];
  if (new Set(normalizedQuestions.map((question) => question.id)).size !== normalizedQuestions.length) {
    return null;
  }

  return {
    toolName: HUMAN_INPUT_TOOL_NAME,
    requestId: fallbackRequestId,
    type,
    allowSkip: record.allowSkip === true,
    questions: normalizedQuestions,
  };
}

function resolveHumanInputOption(question: HumanInputQuestion, token: string): HumanInputOption | null {
  const exactOption = question.options.find((option) => option.id === token);
  if (exactOption) {
    return exactOption;
  }

  const index = Number(token);
  if (Number.isInteger(index) && index >= 1 && index <= question.options.length) {
    return question.options[index - 1] ?? null;
  }

  return null;
}

function prepareHumanInputSelection(
  question: HumanInputQuestion,
  rawInput: string,
): { cancelled: true } | { cancelled: false; value: string } {
  const trimmedInput = rawInput.trim();

  if (question.options.some((option) => option.id === trimmedInput)) {
    return { cancelled: false, value: trimmedInput };
  }
  if (trimmedInput === EXIT_HUMAN_INPUT_TOKEN) {
    return { cancelled: true };
  }
  if (trimmedInput.startsWith(ESCAPE_HUMAN_INPUT_PREFIX)) {
    return { cancelled: false, value: trimmedInput.slice(ESCAPE_HUMAN_INPUT_PREFIX.length) };
  }

  return { cancelled: false, value: trimmedInput };
}

function parseAnswer(
  question: HumanInputQuestion,
  selectionType: HumanInputSelectionType,
  rawInput: string,
): string | string[] | { error: string } {
  const trimmedInput = rawInput.trim();

  if (selectionType === 'single-select') {
    const option = resolveHumanInputOption(question, trimmedInput);
    if (option) {
      return option.id;
    }
    if (question.allowOther === true) {
      return trimmedInput;
    }
    if (trimmedInput.includes(',')) {
      return { error: 'Select exactly one option.' };
    }
    return { error: `Unknown option: ${trimmedInput}` };
  }

  const tokens = trimmedInput.split(',').map((token) => token.trim()).filter(Boolean);
  const selectedOptionIds: string[] = [];
  for (const token of tokens) {
    const option = resolveHumanInputOption(question, token);
    if (!option) {
      return { error: `Unknown option: ${token}` };
    }
    if (selectedOptionIds.includes(option.id)) {
      return { error: `Duplicate option: ${token}` };
    }
    selectedOptionIds.push(option.id);
  }

  return selectedOptionIds;
}

export function formatHumanInputCheckpoint(
  request: PendingHumanInputRequest,
  question: HumanInputQuestion,
): string {
  const lines = [question.question, ''];

  question.options.forEach((option, index) => {
    const description = option.description ? ` - ${option.description}` : '';
    lines.push(`  ${index + 1}. ${option.label}${description}`);
  });

  lines.push(`  ${EXIT_HUMAN_INPUT_TOKEN}. Exit UI`);

  if (request.allowSkip) {
    lines.push('', '  Press Enter to skip.');
  }

  return `${lines.join('\n')}\n`;
}

function createHumanInputPrompt(request: PendingHumanInputRequest, question: HumanInputQuestion): string {
  const selectionHint = request.type === 'multiple-select'
    ? 'Select numbers or option ids separated by commas'
    : 'Select a number or option id';
  const freeformHint = question.allowOther === true ? ', or type a custom answer' : '';
  const skipHint = request.allowSkip ? ', or press Enter to skip' : '';
  return `${selectionHint}${freeformHint}${skipHint}. Enter ${EXIT_HUMAN_INPUT_TOKEN} to exit UI; prefix it with \\ to answer literally: `;
}

export async function collectHumanInputAnswer(
  request: PendingHumanInputRequest,
  prompt: HumanInputPrompt | undefined,
  output: HumanInputOutput,
): Promise<AskUserInputRawResponse> {
  if (!prompt) {
    return {
      status: 'cancelled',
      reason: 'dismissed',
      message: 'Interactive input is unavailable for ask_user_input.',
    };
  }

  const answers: Record<string, string | string[]> = {};

  for (const question of request.questions) {
    output.write(`\n${formatHumanInputCheckpoint(request, question)}`);

    while (true) {
      const rawSelection = await prompt.question(createHumanInputPrompt(request, question));
      const preparedSelection = prepareHumanInputSelection(question, rawSelection);
      if (!('value' in preparedSelection)) {
        return {
          status: 'cancelled',
          reason: 'dismissed',
          message: 'User cancelled input.',
        };
      }
      if (!preparedSelection.value) {
        if (request.allowSkip) {
          return {
            status: 'cancelled',
            reason: 'skipped',
            message: 'User skipped input.',
          };
        }
        output.write('Select an option before continuing.\n');
        continue;
      }

      const answer = parseAnswer(question, request.type, preparedSelection.value);
      if (!isRecord(answer) || !('error' in answer)) {
        answers[question.id] = answer as string | string[];
        break;
      }

      output.write(`${answer.error}\n`);
    }
  }

  return {
    status: 'answered',
    answers,
  };
}
