/**
 * Agent CLI Tool Trace Renderer
 *
 * Purpose:
 * - Summarize verbose tool activity into compact terminal-friendly diagnostic lines.
 *
 * Key features:
 * - Produces bounded summaries for common tool calls and results without dumping full payloads.
 * - Keeps shell, path, file, search, and generic tool activity readable on stderr.
 *
 * Recent changes:
 * - 2026-05-16: Ported bounded tool trace rendering from ai-workspace into Agent CLI.
 */

type JsonRecord = Record<string, unknown>;

interface ToolCallView {
  name: string;
  summary: string;
}

interface ToolResultView {
  name: string;
  ok: boolean;
  summary: string;
  preview?: string[];
}

const MAX_COMMAND_WIDTH = 100;
const MAX_PREVIEW_LINES = 3;
const MAX_PREVIEW_LINE_WIDTH = 120;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringifyCompact(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
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

function truncateOneLine(value: string, maxWidth: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxWidth) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxWidth - 3)).trimEnd()}...`;
}

function countLines(value: string): number {
  if (!value) {
    return 0;
  }

  const normalized = value.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines.at(-1) === '') {
    lines.pop();
  }

  return lines.length;
}

function previewLines(value: string, maxLines = MAX_PREVIEW_LINES, maxWidth = MAX_PREVIEW_LINE_WIDTH): string[] {
  const normalized = value.replace(/\r\n/g, '\n');

  return normalized
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(0, maxLines)
    .map((line) => truncateOneLine(line, maxWidth));
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

function formatToken(token: string): string {
  return /^[A-Za-z0-9_./:=@%-]+$/.test(token) ? token : JSON.stringify(token);
}

function compactJsonPreview(value: unknown, maxWidth = MAX_COMMAND_WIDTH): string {
  const serialized = stringifyCompact(value);
  return truncateOneLine(serialized ?? String(value), maxWidth);
}

function formatLineCount(lineCount: number): string {
  return `${lineCount} line${lineCount === 1 ? '' : 's'}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(bytes >= 10 * 1024 ? 0 : 1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extractMeaningfulLine(value: unknown): string | null {
  if (typeof value !== 'string') {
    if (isRecord(value)) {
      return extractMeaningfulLine(
        readFirstString(value, 'message', 'error', 'stderr', 'stdout', 'detail', 'reason'),
      );
    }

    return null;
  }

  const line = value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.length > 0);

  return line ? truncateOneLine(line, MAX_PREVIEW_LINE_WIDTH) : null;
}

function summarizeShellInvocation(command: string, parameters: string[]): string {
  if ((/python(?:\d+(?:\.\d+)*)?$/).test(command) && parameters[0] === '-c') {
    const remainder = parameters.slice(2).map(formatToken);
    return truncateOneLine([command, '-c', JSON.stringify('...'), ...remainder].join(' '), MAX_COMMAND_WIDTH);
  }

  if ((/node$/).test(command) && parameters[0] === '-e') {
    const remainder = parameters.slice(2).map(formatToken);
    return truncateOneLine([command, '-e', JSON.stringify('...'), ...remainder].join(' '), MAX_COMMAND_WIDTH);
  }

  return truncateOneLine([command, ...parameters.map(formatToken)].join(' '), MAX_COMMAND_WIDTH);
}

function summarizeShellToolCall(args: JsonRecord): string {
  const command = typeof args.command === 'string' ? args.command : 'shell';
  const parameters = Array.isArray(args.parameters)
    ? args.parameters.filter((value): value is string => typeof value === 'string')
    : [];
  return summarizeShellInvocation(command, parameters);
}

function summarizePathLikeCall(args: JsonRecord, ...keys: string[]): string {
  const value = readFirstString(args, ...keys);
  return value ? truncateOneLine(value, MAX_COMMAND_WIDTH) : compactJsonPreview(args);
}

function summarizeLoadSkillCall(args: JsonRecord): string {
  const skillId = readFirstString(args, 'skillId', 'id', 'name');
  return skillId ? truncateOneLine(skillId, MAX_COMMAND_WIDTH) : compactJsonPreview(args);
}

function summarizeGenericCall(args: unknown): string {
  const record = parseJsonRecord(args);
  if (!record) {
    return typeof args === 'undefined' ? '' : compactJsonPreview(args);
  }

  const value = readFirstString(record, 'url', 'path', 'filePath', 'query', 'pattern', 'glob');
  return value ? truncateOneLine(value, MAX_COMMAND_WIDTH) : compactJsonPreview(record);
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

  if (record.error !== undefined) {
    return false;
  }

  return fallback;
}

function countMatches(result: unknown): number | null {
  if (Array.isArray(result)) {
    return result.length;
  }

  const record = parseJsonRecord(result);
  if (!record) {
    return null;
  }

  for (const key of ['matches', 'results', 'files', 'items']) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.length;
    }
  }

  return readFirstNumber(record, 'count', 'matchCount', 'total');
}

function summarizeShellToolResult(result: unknown): ToolResultView {
  const record = parseJsonRecord(result);
  const exitCode = readFirstNumber(record, 'exit_code', 'exitCode');
  const aborted = readFirstBoolean(record, 'aborted') === true;
  const timedOut = readFirstBoolean(record, 'timed_out', 'timedOut') === true;
  const stdout = readFirstString(record, 'stdout');
  const stderr = readFirstString(record, 'stderr');
  const ok = !aborted && !timedOut && (exitCode === null ? inferOk(record, true) : exitCode === 0);

  if (timedOut) {
    return {
      name: 'shell_cmd',
      ok: false,
      summary: 'timed out',
      preview: stderr ? previewLines(stderr) : undefined,
    };
  }

  if (aborted) {
    return {
      name: 'shell_cmd',
      ok: false,
      summary: 'aborted',
      preview: stderr ? previewLines(stderr) : undefined,
    };
  }

  if (!ok) {
    return {
      name: 'shell_cmd',
      ok: false,
      summary: extractMeaningfulLine(stderr)
        ?? extractMeaningfulLine(record?.error)
        ?? extractMeaningfulLine(stdout)
        ?? (exitCode === null ? 'command failed' : `exit ${exitCode}`),
      preview: stderr ? previewLines(stderr) : undefined,
    };
  }

  if (stdout) {
    const lineCount = countLines(stdout);
    return {
      name: 'shell_cmd',
      ok: true,
      summary: `stdout ${formatLineCount(lineCount)}`,
      preview: previewLines(stdout, Math.min(MAX_PREVIEW_LINES, lineCount || 1)),
    };
  }

  return {
    name: 'shell_cmd',
    ok: true,
    summary: exitCode === null ? 'completed' : `exit ${exitCode}`,
  };
}

function summarizeSearchFilesResult(result: unknown): ToolResultView {
  const record = parseJsonRecord(result);
  const count = countMatches(result);
  return {
    name: 'search_files',
    ok: inferOk(record, true),
    summary: count === null ? 'completed' : `${count} match${count === 1 ? '' : 'es'}`,
  };
}

function summarizeReadFileResult(result: unknown): ToolResultView {
  const record = parseJsonRecord(result);
  const content = typeof result === 'string'
    ? result
    : readFirstString(record, 'content', 'text', 'result');
  const lineCount = content ? countLines(content) : null;
  return {
    name: 'read_file',
    ok: inferOk(record, true),
    summary: lineCount === null ? 'completed' : formatLineCount(lineCount),
    preview: content ? previewLines(content) : undefined,
  };
}

function summarizePathExistsResult(result: unknown): ToolResultView {
  const record = parseJsonRecord(result);
  const ok = inferOk(record, true);
  const exists = readFirstBoolean(record, 'exists');
  const path = readFirstString(record, 'path', 'filePath');
  const type = readFirstString(record, 'type', 'kind');
  const preview = [
    path ? truncateOneLine(`path: ${path}`, MAX_PREVIEW_LINE_WIDTH) : null,
    type ? `type: ${type}` : null,
  ].filter((line): line is string => line !== null);

  return {
    name: 'path_exists',
    ok,
    summary: exists === null ? (ok ? 'completed' : 'failed') : String(exists),
    ...(preview.length > 0 ? { preview } : {}),
  };
}

function summarizeWriteFileResult(result: unknown): ToolResultView {
  const record = parseJsonRecord(result);
  const bytes = readFirstNumber(record, 'bytesWritten', 'bytes', 'size')
    ?? (typeof result === 'string' ? Buffer.byteLength(result, 'utf8') : null);
  return {
    name: 'write_file',
    ok: inferOk(record, true),
    summary: bytes === null ? 'written' : `${formatFileSize(bytes)} written`,
  };
}

function summarizeGenericToolResult(result: unknown, toolName: string): ToolResultView {
  const record = parseJsonRecord(result);
  const ok = inferOk(record, true);
  const textPreview = typeof result === 'string'
    ? result
    : readFirstString(record, 'stdout', 'stderr', 'text', 'content', 'message', 'result', 'detail');

  if (!ok) {
    return {
      name: toolName,
      ok: false,
      summary: extractMeaningfulLine(record?.error)
        ?? extractMeaningfulLine(textPreview)
        ?? 'failed',
      preview: textPreview ? previewLines(textPreview) : undefined,
    };
  }

  const status = readFirstString(record, 'status', 'message');
  if (status) {
    return {
      name: toolName,
      ok: true,
      summary: truncateOneLine(status, MAX_PREVIEW_LINE_WIDTH),
    };
  }

  if (textPreview) {
    const lineCount = countLines(textPreview);
    return {
      name: toolName,
      ok: true,
      summary: lineCount > 1 ? formatLineCount(lineCount) : truncateOneLine(textPreview, MAX_PREVIEW_LINE_WIDTH),
      preview: lineCount > 1 ? previewLines(textPreview) : undefined,
    };
  }

  return {
    name: toolName,
    ok,
    summary: ok ? 'completed' : 'failed',
  };
}

function summarizeToolCall(toolName: string, args: unknown): ToolCallView {
  const record = parseJsonRecord(args);

  if (toolName === 'shell_cmd' && record) {
    return { name: toolName, summary: summarizeShellToolCall(record) };
  }

  if (toolName === 'load_skill' && record) {
    return { name: toolName, summary: summarizeLoadSkillCall(record) };
  }

  if (toolName === 'path_exists' && record) {
    return { name: toolName, summary: summarizePathLikeCall(record, 'path', 'filePath') };
  }

  if (toolName === 'search_files' && record) {
    return { name: toolName, summary: summarizePathLikeCall(record, 'query', 'pattern', 'glob', 'includePattern') };
  }

  if (toolName === 'read_file' && record) {
    return { name: toolName, summary: summarizePathLikeCall(record, 'filePath', 'path') };
  }

  if (toolName === 'write_file' && record) {
    return { name: toolName, summary: summarizePathLikeCall(record, 'filePath', 'path') };
  }

  return { name: toolName, summary: summarizeGenericCall(args) };
}

function summarizeToolResult(toolName: string, result: unknown): ToolResultView {
  if (toolName === 'shell_cmd') {
    return summarizeShellToolResult(result);
  }

  if (toolName === 'search_files') {
    return summarizeSearchFilesResult(result);
  }

  if (toolName === 'read_file') {
    return summarizeReadFileResult(result);
  }

  if (toolName === 'path_exists') {
    return summarizePathExistsResult(result);
  }

  if (toolName === 'write_file') {
    return summarizeWriteFileResult(result);
  }

  return summarizeGenericToolResult(result, toolName);
}

export function formatToolCallDiagnostic(toolCall: { name: string; arguments?: string }): string {
  const view = summarizeToolCall(toolCall.name, toolCall.arguments);
  return `tool.call: ${view.name}${view.summary ? ` ${view.summary}` : ''}\n`;
}

export function formatToolResultDiagnostic(toolResult: { name: string; result: unknown }): string {
  const view = summarizeToolResult(toolResult.name, toolResult.result);
  const lines = [
    `tool.result: ${view.name} ${view.ok ? 'ok' : 'error'} ${view.summary || (view.ok ? 'completed' : 'failed')}`,
  ];

  for (const previewLine of view.preview ?? []) {
    lines.push(`  ${previewLine}`);
  }

  return `${lines.join('\n')}\n`;
}