/**
 * Agent CLI Pending Display
 *
 * Purpose:
 * - Render a minimal terminal pending animation while streamed turns wait for assistant text.
 *
 * Key features:
 * - Emits three-dot frames only when stdout is TTY-like.
 * - Clears the active frame before assistant text, diagnostics, or prompts write output.
 *
 * Recent changes:
 * - 2026-05-23: Added CRM-style three-dot pending display for streamed CLI turns.
 */

export interface PendingDisplaySink {
  isTTY?: boolean;
  write(chunk: string): void;
}

export interface PendingDisplay {
  start(options?: { separateFromText?: boolean }): void;
  clear(): void;
  writeText(text: string): void;
  noteExternalOutput(text?: string): void;
  hasWrittenText(): boolean;
}

export function createPendingDisplay(output: PendingDisplaySink): PendingDisplay {
  const frames = ['.', '..', '...'];
  const clearFrame = `\r\u001b[2K${' '.repeat(Math.max(...frames.map((frame) => frame.length)))}\r\u001b[2K`;
  let frameIndex = frames.length - 1;
  let interval: NodeJS.Timeout | null = null;
  let pendingVisible = false;
  let wroteText = false;
  let cursorAtLineStart = true;

  const writeFrame = (frame: string): void => {
    output.write(`\r\u001b[2K${frame}`);
  };

  const stop = (): void => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  };

  return {
    start(options = {}): void {
      if (!output.isTTY || interval || pendingVisible) {
        return;
      }

      if (options.separateFromText === true && wroteText && !cursorAtLineStart) {
        output.write('\n');
        cursorAtLineStart = true;
      }

      pendingVisible = true;
      frameIndex = frames.length - 1;
      output.write(frames[frameIndex] ?? '...');
      cursorAtLineStart = false;
      interval = setInterval(() => {
        frameIndex = (frameIndex + 1) % frames.length;
        writeFrame(frames[frameIndex] ?? '...');
      }, 250);
      interval.unref?.();
    },

    clear(): void {
      stop();

      if (pendingVisible) {
        output.write(clearFrame);
        pendingVisible = false;
        cursorAtLineStart = true;
      }
    },

    writeText(text: string): void {
      this.clear();

      if (text) {
        wroteText = true;
        output.write(text);
        cursorAtLineStart = /(?:\r?\n|\r)$/u.test(text);
      }
    },

    noteExternalOutput(text?: string): void {
      wroteText = true;
      cursorAtLineStart = typeof text === 'string' && text.length > 0
        ? /(?:\r?\n|\r)$/u.test(text)
        : false;
    },

    hasWrittenText(): boolean {
      return wroteText;
    },
  };
}
