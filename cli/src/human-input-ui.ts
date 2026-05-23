/**
 * Agent CLI Human Input UI
 *
 * Purpose:
 * - Convert `ask_user_input`-style tool calls into terminal prompts and tool-result payloads.
 *
 * Key features:
 * - Parses single-question and multi-question payloads.
 * - Supports option ids, numbered selections, freeform answers, and allowed skips.
 * - Returns structured answer artifacts that can be persisted as normal tool messages.
 *
 * Recent changes:
 * - 2026-05-23: Added terminal UI handling for `ask_user_input` tool requests.
 */

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
  allowFreeformInput?: boolean;
}

export interface PendingHumanInputRequest {
  toolName: string;
  requestId: string;
  type: HumanInputSelectionType;
  allowSkip: boolean;
  questions: HumanInputQuestion[];
}

export interface HumanInputSelection {
  questionId: string;
  questionText?: string;
  skipped: boolean;
  selectedOptions: HumanInputOption[];
  enteredText?: string;
}

export interface HumanInputAnswerArtifact {
  ok: boolean;
  status: 'answered' | 'skipped' | 'cancelled' | 'unavailable';
  requestId: string;
  selections: HumanInputSelection[];
  message?: string;
}

type JsonRecord = Record<string, unknown>;

const EXIT_HUMAN_INPUT_TOKEN = '0';
const HUMAN_INPUT_TOOL_NAMES = new Set([
  'ask_user_input',
  'human_intervention_request',
  'ask_user_question',
]);

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

function readTrimmedString(record: JsonRecord | null, fieldName: string): string | null {
  const value = record?.[fieldName];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sanitizeDisplayText(value: string): string {
  return value.replace(/\s{2,}/g, ' ').trim();
}

function parseHumanInputOption(value: unknown, index: number): HumanInputOption | null {
  if (typeof value === 'string' && value.trim()) {
    return {
      id: String(index + 1),
      label: sanitizeDisplayText(value),
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const label = readTrimmedString(value, 'label') ?? readTrimmedString(value, 'text');
  if (!label) {
    return null;
  }

  return {
    id: readTrimmedString(value, 'id') ?? String(index + 1),
    label: sanitizeDisplayText(label),
    ...(readTrimmedString(value, 'description') ? { description: sanitizeDisplayText(readTrimmedString(value, 'description') ?? '') } : {}),
  };
}

function parseHumanInputQuestion(value: unknown, index: number): HumanInputQuestion | null {
  if (!isRecord(value)) {
    return null;
  }

  const question = readTrimmedString(value, 'question') ?? readTrimmedString(value, 'prompt');
  if (!question) {
    return null;
  }

  const rawOptions = Array.isArray(value.options) ? value.options : [];
  const options = rawOptions.map(parseHumanInputOption).filter((option): option is HumanInputOption => option !== null);

  return {
    header: readTrimmedString(value, 'header') ?? 'Input',
    id: readTrimmedString(value, 'id') ?? `question-${index + 1}`,
    question: sanitizeDisplayText(question),
    options,
    ...(value.allowFreeformInput === false ? { allowFreeformInput: false } : {}),
  };
}

function normalizeQuestions(record: JsonRecord): HumanInputQuestion[] {
  if (Array.isArray(record.questions)) {
    return record.questions
      .map(parseHumanInputQuestion)
      .filter((question): question is HumanInputQuestion => question !== null);
  }

  const singleQuestion = parseHumanInputQuestion(record, 0);
  return singleQuestion ? [singleQuestion] : [];
}

function allowsFreeformInput(question: HumanInputQuestion): boolean {
  return question.allowFreeformInput !== false;
}

export function parseHumanInputRequest(
  toolName: string,
  payload: unknown,
  fallbackRequestId = '',
): PendingHumanInputRequest | null {
  if (!HUMAN_INPUT_TOOL_NAMES.has(toolName)) {
    return null;
  }

  const record = parseJsonRecord(payload);
  if (!record) {
    return null;
  }

  const rawType = record.type;
  const type: HumanInputSelectionType = rawType === 'multiple-select' ? 'multiple-select' : 'single-select';
  if (rawType !== undefined && rawType !== 'single-select' && rawType !== 'multiple-select') {
    return null;
  }

  const questions = normalizeQuestions(record);
  if (questions.length === 0) {
    return null;
  }

  return {
    toolName,
    requestId: readTrimmedString(record, 'requestId') ?? fallbackRequestId,
    type,
    allowSkip: record.allowSkip === true,
    questions,
  };
}

function resolveHumanInputOption(question: HumanInputQuestion, token: string): HumanInputOption | null {
  const index = Number(token);
  if (Number.isInteger(index) && index >= 1 && index <= question.options.length) {
    return question.options[index - 1] ?? null;
  }

  return question.options.find((option) => option.id === token) ?? null;
}

function parseSelection(
  question: HumanInputQuestion,
  selectionType: HumanInputSelectionType,
  allowSkip: boolean,
  rawInput: string,
): HumanInputSelection | string {
  const trimmedInput = rawInput.trim();
  if (!trimmedInput) {
    if (allowSkip) {
      return {
        questionId: question.id,
        questionText: question.question,
        skipped: true,
        selectedOptions: [],
      };
    }

    return 'Select an option before continuing.';
  }

  const tokens = trimmedInput.split(',').map((token) => token.trim()).filter(Boolean);
  if (selectionType === 'single-select' && tokens.length !== 1) {
    if (allowsFreeformInput(question)) {
      return {
        questionId: question.id,
        questionText: question.question,
        skipped: false,
        selectedOptions: [],
        enteredText: trimmedInput,
      };
    }

    return 'Select exactly one option.';
  }

  const selectedOptions: HumanInputOption[] = [];
  for (const token of tokens) {
    const option = resolveHumanInputOption(question, token);
    if (!option) {
      if (allowsFreeformInput(question)) {
        return {
          questionId: question.id,
          questionText: question.question,
          skipped: false,
          selectedOptions: [],
          enteredText: trimmedInput,
        };
      }

      return `Unknown option: ${token}`;
    }

    if (!selectedOptions.some((selectedOption) => selectedOption.id === option.id)) {
      selectedOptions.push(option);
    }
  }

  return {
    questionId: question.id,
    questionText: question.question,
    skipped: false,
    selectedOptions,
  };
}

export function formatHumanInputCheckpoint(
  request: PendingHumanInputRequest,
  question: HumanInputQuestion,
): string {
  const lines = ['assistant needs input:', `  ${question.question}`, ''];

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
  const selectionHint = question.options.length === 0
    ? 'Type your answer'
    : request.type === 'multiple-select'
      ? 'Select numbers or option ids separated by commas'
      : 'Select a number or option id';
  const freeformHint = allowsFreeformInput(question) ? ', or type a custom answer' : '';
  const skipHint = request.allowSkip ? ', or press Enter to skip' : '';
  return `${selectionHint}${freeformHint}${skipHint}. Enter ${EXIT_HUMAN_INPUT_TOKEN} to exit UI: `;
}

export async function collectHumanInputAnswer(
  request: PendingHumanInputRequest,
  prompt: HumanInputPrompt | undefined,
  output: HumanInputOutput,
): Promise<HumanInputAnswerArtifact> {
  if (!prompt) {
    return {
      ok: false,
      status: 'unavailable',
      requestId: request.requestId,
      selections: [],
      message: 'Interactive input is unavailable for ask_user_input.',
    };
  }

  const selections: HumanInputSelection[] = [];

  for (const question of request.questions) {
    output.write(`\n${formatHumanInputCheckpoint(request, question)}`);

    while (true) {
      const rawSelection = await prompt.question(createHumanInputPrompt(request, question));
      if (rawSelection.trim() === EXIT_HUMAN_INPUT_TOKEN) {
        return {
          ok: false,
          status: 'cancelled',
          requestId: request.requestId,
          selections,
          message: 'User cancelled input.',
        };
      }

      const selection = parseSelection(question, request.type, request.allowSkip, rawSelection);
      if (typeof selection !== 'string') {
        selections.push(selection);
        break;
      }

      output.write(`${selection}\n`);
    }
  }

  return {
    ok: true,
    status: selections.every((selection) => selection.skipped) ? 'skipped' : 'answered',
    requestId: request.requestId,
    selections,
  };
}
