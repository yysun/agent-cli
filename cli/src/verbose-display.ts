/**
 * Verbose terminal display state.
 *
 * Purpose:
 * - Keep gray diagnostic output and assistant-text spacing rules out of turn orchestration.
 */
import type { WritableSink } from './terminal-io.js';

const ANSI_GRAY = '\u001b[90m';
const ANSI_RESET = '\u001b[0m';

type VisibleOutputType = 'assistant_text' | 'verbose_diagnostic';

export type VerboseDiagnosticType =
  | 'warning'
  | 'error'
  | 'reasoning'
  | 'tool_call'
  | 'tool_result'
  | 'model_response';

export interface VerboseDisplay {
  closeReasoning(): boolean;
  noteAssistantText(text: string): void;
  beforeAssistantText(currentDiagnosticType: string | null): void;
  writeReasoning(text: string, previousType: string | null): void;
  writeDiagnostic(
    text: string,
    diagnosticType: VerboseDiagnosticType,
    options?: { separateFromVisibleOutput?: boolean },
  ): void;
}

export interface CreateVerboseDisplayOptions {
  stdout: WritableSink;
  stderr: WritableSink;
  clearPending?: () => void;
  enabled: boolean;
}

function writeTypeTransitionSeparator(
  output: WritableSink,
  previousType: string | null,
  nextType: string,
): void {
  if (previousType && previousType !== nextType) {
    output.write('\n');
  }
}

function grayForTerminal(stderr: WritableSink, text: string): string {
  return stderr.isTTY ? `${ANSI_GRAY}${text}${ANSI_RESET}` : text;
}

function stripLeadingLineBreaks(text: string): string {
  return text.replace(/^\n+/, '');
}

function countLeadingLineBreaks(text: string): number {
  return text.match(/^\n*/)?.[0].length ?? 0;
}

function countTrailingLineBreaks(text: string): number {
  return text.match(/\n*$/)?.[0].length ?? 0;
}

function ensureLeadingLineBreaks(text: string, minimumCount: number): string {
  return `${'\n'.repeat(Math.max(0, minimumCount - countLeadingLineBreaks(text)))}${text}`;
}

function ensureTotalBoundaryLineBreaks(text: string, previousTrailingLineBreaks: number, minimumCount: number): string {
  const leadingLineBreaks = countLeadingLineBreaks(text);
  const missingLineBreaks = Math.max(0, minimumCount - previousTrailingLineBreaks - leadingLineBreaks);
  return `${'\n'.repeat(missingLineBreaks)}${text}`;
}

function isVerboseDiagnosticType(type: string | null): boolean {
  return type === 'warning'
    || type === 'error'
    || type === 'tool_call'
    || type === 'tool_result'
    || type === 'model_response';
}

export function createVerboseDisplay({
  stdout,
  stderr,
  clearPending,
  enabled,
}: CreateVerboseDisplayOptions): VerboseDisplay {
  let lastVisibleOutputType: VisibleOutputType | null = null;
  let lastVerboseDiagnosticTrailingLineBreaks = 0;
  let reasoningOpen = false;

  function beginReasoning(previousType: string | null): void {
    if (reasoningOpen) {
      return;
    }

    clearPending?.();
    if (lastVisibleOutputType === 'assistant_text') {
      stderr.write('\n\n');
    } else {
      writeTypeTransitionSeparator(stderr, previousType, 'reasoning');
    }

    stderr.write(stderr.isTTY ? ANSI_GRAY : '');
    reasoningOpen = true;
    lastVisibleOutputType = 'verbose_diagnostic';
    lastVerboseDiagnosticTrailingLineBreaks = 0;
  }

  function writeDiagnosticBlock(
    text: string,
    options: { separateFromVisibleOutput?: boolean } = {},
  ): void {
    let separatedText = text;
    if (lastVisibleOutputType === 'assistant_text') {
      separatedText = ensureLeadingLineBreaks(text, 2);
    } else if (options.separateFromVisibleOutput === true && lastVisibleOutputType !== null) {
      separatedText = ensureTotalBoundaryLineBreaks(text, lastVerboseDiagnosticTrailingLineBreaks, 2);
    }

    lastVerboseDiagnosticTrailingLineBreaks = countTrailingLineBreaks(separatedText);
    lastVisibleOutputType = 'verbose_diagnostic';
    stderr.write(grayForTerminal(stderr, separatedText));
  }

  return {
    closeReasoning(): boolean {
      if (!reasoningOpen) {
        return false;
      }

      stderr.write(stderr.isTTY ? `${ANSI_RESET}\n\n` : '\n\n');
      reasoningOpen = false;
      lastVisibleOutputType = 'verbose_diagnostic';
      lastVerboseDiagnosticTrailingLineBreaks = 2;
      return true;
    },

    noteAssistantText(text: string): void {
      if (text) {
        lastVisibleOutputType = 'assistant_text';
      }
    },

    beforeAssistantText(currentDiagnosticType: string | null): void {
      if (!enabled || lastVisibleOutputType !== 'verbose_diagnostic' || !isVerboseDiagnosticType(currentDiagnosticType)) {
        return;
      }

      const missingLineBreaks = Math.max(0, 2 - lastVerboseDiagnosticTrailingLineBreaks);
      if (missingLineBreaks > 0) {
        stdout.write('\n'.repeat(missingLineBreaks));
      }

      lastVerboseDiagnosticTrailingLineBreaks = 0;
    },

    writeReasoning(text: string, previousType: string | null): void {
      beginReasoning(previousType);
      stderr.write(text);
    },

    writeDiagnostic(text, diagnosticType, options = {}): void {
      const closedReasoning = this.closeReasoning();
      const outputText = closedReasoning ? stripLeadingLineBreaks(text) : text;
      writeDiagnosticBlock(outputText, {
        separateFromVisibleOutput: options.separateFromVisibleOutput === true || diagnosticType === 'tool_call',
      });
    },
  };
}
