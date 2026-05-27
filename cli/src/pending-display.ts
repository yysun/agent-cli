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
  start(): void;
  clear(): void;
  writeText(text: string): void;
  hasWrittenText(): boolean;
}

export function createPendingDisplay(output: PendingDisplaySink): PendingDisplay {
  const frames = ['.', '..', '...'];
  const clearFrame = `\r\u001b[2K${' '.repeat(Math.max(...frames.map((frame) => frame.length)))}\r\u001b[2K`;
  let frameIndex = frames.length - 1;
  let interval: NodeJS.Timeout | null = null;
  let pendingVisible = false;
  let wroteText = false;

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
    start(): void {
      if (!output.isTTY || interval || pendingVisible) {
        return;
      }

      pendingVisible = true;
      frameIndex = frames.length - 1;
      output.write(frames[frameIndex] ?? '...');
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
      }
    },

    writeText(text: string): void {
      this.clear();

      if (text) {
        wroteText = true;
        output.write(text);
      }
    },

    hasWrittenText(): boolean {
      return wroteText;
    },
  };
}
