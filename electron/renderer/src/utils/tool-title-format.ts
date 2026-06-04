/**
 * Tool Title Format Utilities
 *
 * Purpose:
 * - Mirror the CLI's first-line tool diagnostic shape for renderer card titles.
 *
 * Recent changes:
 * - 2026-06-04: Removed CLI status glyphs from Electron tool-card titles.
 * - 2026-06-04: Added browser-safe CLI-style tool call/result title formatting.
 */
type JsonRecord = Record<string, unknown>;

const MAX_COMMAND_WIDTH = 100;
const MAX_PREVIEW_LINE_WIDTH = 120;

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

function stringifyCompact(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function truncateOneLine(value: string, maxWidth: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxWidth) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxWidth - 1)).trimEnd()}...`;
}

function compactJsonPreview(value: unknown, maxWidth = MAX_COMMAND_WIDTH): string {
  const serialized = stringifyCompact(value);
  return truncateOneLine(serialized ?? String(value), maxWidth);
}

function readFirstString(record: JsonRecord | null, ...keys: string[]): string | null {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return null;
}

function readFirstNumber(record: JsonRecord | null, ...keys: string[]): number | null {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function readFirstBoolean(record: JsonRecord | null, ...keys: string[]): boolean | null {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') {
      return value;
    }
  }

  return null;
}

function countLines(value: string): number {
  if (!value) {
    return 0;
  }

  const lines = value.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') {
    lines.pop();
  }
  return lines.length;
}

function formatLineCount(lineCount: number): string {
  return `${lineCount} line${lineCount === 1 ? '' : 's'}`;
}

function inferOk(record: JsonRecord | null, fallback = true): boolean {
  if (!record) {
    return fallback;
  }

  const ok = readFirstBoolean(record, 'ok', 'success');
  if (ok !== null) {
    return ok;
  }

  const exitCode = readFirstNumber(record, 'exit_code', 'exitCode', 'code');
  if (exitCode !== null) {
    return exitCode === 0;
  }

  return record.error === undefined ? fallback : false;
}

function summarizeToolCall(toolName: string, args: unknown): string {
  const record = parseJsonRecord(args);
  if (!record) {
    return typeof args === 'undefined' ? '' : compactJsonPreview(args);
  }

  if (toolName === 'load_skill') {
    const skillId = readFirstString(record, 'skillId', 'id', 'name');
    return skillId ? truncateOneLine(skillId, MAX_COMMAND_WIDTH) : compactJsonPreview(record);
  }

  const value = readFirstString(record, 'url', 'path', 'filePath', 'query', 'pattern', 'glob');
  return value ? truncateOneLine(value, MAX_COMMAND_WIDTH) : compactJsonPreview(record);
}

function summarizeToolResult(toolName: string, result: unknown): { ok: boolean; summary: string } {
  const record = parseJsonRecord(result);
  const ok = inferOk(record, true);

  if (toolName === 'load_skill' && typeof result === 'string') {
    const errorMatch = result.match(/<error>\s*([\s\S]*?)\s*<\/error>/);
    if (errorMatch) {
      return { ok: false, summary: truncateOneLine(errorMatch[1].replace(/\s+/g, ' ').trim(), MAX_PREVIEW_LINE_WIDTH) };
    }

    const lineCount = countLines(result);
    return { ok: true, summary: lineCount > 1 ? formatLineCount(lineCount) : truncateOneLine(result, MAX_PREVIEW_LINE_WIDTH) };
  }

  const textPreview = typeof result === 'string'
    ? result
    : readFirstString(record, 'stdout', 'stderr', 'text', 'content', 'message', 'result', 'detail');
  if (textPreview) {
    const lineCount = countLines(textPreview);
    return { ok, summary: lineCount > 1 ? formatLineCount(lineCount) : truncateOneLine(textPreview, MAX_PREVIEW_LINE_WIDTH) };
  }

  const status = readFirstString(record, 'status', 'message');
  return { ok, summary: status ? truncateOneLine(status, MAX_PREVIEW_LINE_WIDTH) : (ok ? 'completed' : 'failed') };
}

export function formatToolCallTitle(toolName: string, args?: unknown): string {
  const summary = summarizeToolCall(toolName, args);
  return `${toolName}${summary ? ` ${summary}` : ''}`;
}

export function formatToolResultTitle(toolName: string, result: unknown, durationMs?: number): string {
  const summary = summarizeToolResult(toolName, result);
  const parts = [
    typeof durationMs === 'number' && Number.isFinite(durationMs) ? `${Math.round(durationMs)}ms` : '',
    summary.summary || (summary.ok ? 'completed' : 'failed'),
  ].filter(Boolean);
  return `${toolName} ${parts.join(' · ')}`;
}
