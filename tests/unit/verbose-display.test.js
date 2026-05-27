// @ts-check
/**
 * Verbose Display Unit Tests
 *
 * Purpose:
 * - Validate terminal-only spacing and color rules outside the turn executor.
 */
import { describe, expect, it } from 'vitest';

import { createVerboseDisplay } from '../../cli/src/verbose-display.ts';

function createCapture() {
  const stdoutChunks = [];
  const stderrChunks = [];

  return {
    stdout: {
      write(chunk) {
        stdoutChunks.push(String(chunk));
      },
    },
    stderr: {
      isTTY: true,
      write(chunk) {
        stderrChunks.push(String(chunk));
      },
    },
    output() {
      return `${stdoutChunks.join('')}${stderrChunks.join('')}`;
    },
    stdoutText() {
      return stdoutChunks.join('');
    },
    stderrText() {
      return stderrChunks.join('');
    },
  };
}

describe('verbose display', () => {
  it('separates tool-call diagnostics from preceding assistant text', () => {
    const io = createCapture();
    const display = createVerboseDisplay({
      stdout: io.stdout,
      stderr: io.stderr,
      enabled: true,
    });

    display.noteAssistantText('I will create the directory.');
    display.writeDiagnostic('\n  ↳ create_directory /tmp/example', 'tool_call');

    expect(io.stderrText()).toBe('\u001b[90m\n\n  ↳ create_directory /tmp/example\u001b[0m');
  });

  it('adds only missing line breaks before assistant text after diagnostics', () => {
    const io = createCapture();
    const display = createVerboseDisplay({
      stdout: io.stdout,
      stderr: io.stderr,
      enabled: true,
    });

    display.writeDiagnostic('\n  ✓ create_directory 1ms · created\n', 'tool_result');
    display.beforeAssistantText('tool_result');

    expect(io.stdoutText()).toBe('\n');
  });

  it('does not add duplicate blank lines between verbose diagnostics', () => {
    const io = createCapture();
    const display = createVerboseDisplay({
      stdout: io.stdout,
      stderr: io.stderr,
      enabled: true,
    });

    display.writeDiagnostic('\n  ✓ model.response stopKind=tool_call · finish_reason=tool_calls\n', 'model_response');
    display.writeDiagnostic('\n  ↳ load_skill {"skill_id":"agent-world-skill"}', 'tool_call');

    expect(io.stderrText()).toBe([
      '\u001b[90m\n  ✓ model.response stopKind=tool_call · finish_reason=tool_calls\n\u001b[0m',
      '\u001b[90m\n  ↳ load_skill {"skill_id":"agent-world-skill"}\u001b[0m',
    ].join(''));
    expect(io.stderrText()).not.toContain('tool_calls\n\u001b[0m\u001b[90m\n\n  ↳');
  });
});
