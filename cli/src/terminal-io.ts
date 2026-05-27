/**
 * Shared terminal I/O sink types for CLI modules.
 */

export interface WritableSink {
  isTTY?: boolean;
  write(chunk: string): void;
}

export interface CliIo {
  stdout: WritableSink;
  stderr?: WritableSink;
}
