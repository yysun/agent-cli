/**
 * Agent CLI Tool Trace Renderer
 *
 * Purpose:
 * - Summarize verbose tool activity into compact terminal-friendly status rows.
 *
 * Key features:
 * - Produces bounded summaries for common tool calls and results without dumping full payloads.
 * - Supports default, verbose, and debug render modes for CLI trace output.
 * - Keeps shell, path, file, search, and generic tool activity readable on stderr.
 *
 * Recent changes:
 * - 2026-05-20: Aligned result display with ai-workspace CLI trace rows.
 */

export type TraceMode = 'default' | 'verbose' | 'debug';

type JsonRecord = Record<string, unknown>;

export interface ToolCallView {
  id?: string;
  name: string;
  summary: string;
  args?: unknown;
}

export interface ToolResultView {
  id?: string;
  name: string;
  ok: boolean;
  durationMs?: number;
  summary: string;
  preview?: string[];
  raw?: unknown;
}

const MAX_COMMAND_WIDTH = 100;
const MAX_PREVIEW_LINES = 5;
const MAX_PREVIEW_LINE_WIDTH = 120;
const MAX_VERBOSE_JSON_WIDTH = 320;

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

  return `${normalized.slice(0, Math.max(0, maxWidth - 1)).trimEnd()}...`;
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
  const lines = normalized
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .map((line) => truncateOneLine(line, maxWidth));

  const compactLines = lines.filter((line) => !/^[\[{]$|^[}\])][,]?$/.test(line.trim()));

  if (compactLines.length > 0) {
    return compactLines.slice(0, maxLines);
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  const closingLine = lines.at(-1);
  if (closingLine && /^[}\])][,]?$/.test(closingLine.trim())) {
    return [
      ...lines.slice(0, maxLines),
      closingLine,
    ];
  }

  return lines.slice(0, maxLines);
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

function formatRequestedLineSummary(args: unknown): string | null {
  const record = parseJsonRecord(args);
  if (!record) {
    return null;
  }

  const startLine = readFirstNumber(record, 'startLine');
  const endLine = readFirstNumber(record, 'endLine');

  if (startLine !== null && endLine !== null && startLine > 0 && endLine >= startLine) {
    return startLine === endLine ? `line ${startLine}` : `lines ${startLine}-${endLine}`;
  }

  if (startLine !== null && startLine > 0) {
    return `from line ${startLine}`;
  }

  if (endLine !== null && endLine > 0) {
    return `through line ${endLine}`;
  }

  return null;
}

function isReadFileLikeToolName(toolName: string): boolean {
  return toolName === 'read_file';
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

function summarizePathExistsCall(args: JsonRecord): string {
  return summarizePathLikeCall(args, 'path', 'filePath');
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

  for (const key of ['matches', 'results', 'files', 'items', 'entries']) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.length;
    }
  }

  return readFirstNumber(record, 'count', 'matchCount', 'total');
}

function summarizeShellToolResult(result: unknown, forcedDurationMs?: number): ToolResultView {
  const record = parseJsonRecord(result);
  const durationMs = forcedDurationMs ?? readFirstNumber(record, 'duration_ms', 'durationMs') ?? undefined;
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
      durationMs,
      summary: 'timed out',
      preview: stderr ? previewLines(stderr, 3) : undefined,
      raw: result,
    };
  }

  if (aborted) {
    return {
      name: 'shell_cmd',
      ok: false,
      durationMs,
      summary: 'aborted',
      preview: stderr ? previewLines(stderr, 3) : undefined,
      raw: result,
    };
  }

  if (!ok) {
    return {
      name: 'shell_cmd',
      ok: false,
      durationMs,
      summary: extractMeaningfulLine(stderr)
        ?? extractMeaningfulLine(record?.error)
        ?? extractMeaningfulLine(stdout)
        ?? (exitCode === null ? 'command failed' : `exit ${exitCode}`),
      preview: stderr ? previewLines(stderr, 3) : undefined,
      raw: result,
    };
  }

  if (stdout) {
    const lineCount = countLines(stdout);
    return {
      name: 'shell_cmd',
      ok: true,
      durationMs,
      summary: `stdout ${formatLineCount(lineCount)}`,
      preview: previewLines(stdout, Math.min(MAX_PREVIEW_LINES, lineCount || 1)),
      raw: result,
    };
  }

  return {
    name: 'shell_cmd',
    ok: true,
    durationMs,
    summary: exitCode === null ? 'completed' : `exit ${exitCode}`,
    raw: result,
  };
}

function summarizeSearchFilesResult(result: unknown, forcedDurationMs?: number): ToolResultView {
  const record = parseJsonRecord(result);
  const count = countMatches(result);
  return {
    name: 'search_files',
    ok: inferOk(record, true),
    durationMs: forcedDurationMs ?? readFirstNumber(record, 'duration_ms', 'durationMs') ?? undefined,
    summary: count === null ? 'completed' : `${count} match${count === 1 ? '' : 'es'}`,
    raw: result,
  };
}

function summarizeReadFileResult(
  result: unknown,
  forcedDurationMs?: number,
  callArgs?: unknown,
  toolName = 'read_file',
): ToolResultView {
  const record = parseJsonRecord(result);
  const content = typeof result === 'string'
    ? result
    : readFirstString(record, 'content', 'text', 'result');
  const lineCount = content ? countLines(content) : null;
  return {
    name: toolName,
    ok: inferOk(record, true),
    durationMs: forcedDurationMs ?? readFirstNumber(record, 'duration_ms', 'durationMs') ?? undefined,
    summary: formatRequestedLineSummary(callArgs) ?? (lineCount === null ? 'completed' : formatLineCount(lineCount)),
    raw: result,
  };
}

function summarizePathExistsResult(result: unknown, forcedDurationMs?: number): ToolResultView {
  const record = parseJsonRecord(result);
  const durationMs = forcedDurationMs ?? readFirstNumber(record, 'duration_ms', 'durationMs') ?? undefined;
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
    durationMs,
    summary: exists === null ? (ok ? 'completed' : 'failed') : String(exists),
    ...(preview.length > 0 ? { preview } : {}),
    raw: result,
  };
}

function summarizeWriteFileResult(result: unknown, forcedDurationMs?: number): ToolResultView {
  const record = parseJsonRecord(result);
  const bytes = readFirstNumber(record, 'bytesWritten', 'bytes', 'size')
    ?? (typeof result === 'string' ? Buffer.byteLength(result, 'utf8') : null);
  return {
    name: 'write_file',
    ok: inferOk(record, true),
    durationMs: forcedDurationMs ?? readFirstNumber(record, 'duration_ms', 'durationMs') ?? undefined,
    summary: bytes === null ? 'written' : `${formatFileSize(bytes)} written`,
    raw: result,
  };
}

function summarizeListFilesResult(result: unknown, forcedDurationMs?: number): ToolResultView {
  const record = parseJsonRecord(result);
  const entryCount = countMatches(result)
    ?? readFirstNumber(record, 'entryCount', 'lineCount')
    ?? (typeof result === 'string' ? countLines(result) : null);

  return {
    name: 'list_files',
    ok: inferOk(record, true),
    durationMs: forcedDurationMs ?? readFirstNumber(record, 'duration_ms', 'durationMs') ?? undefined,
    summary: entryCount === null ? 'completed' : formatLineCount(entryCount),
    raw: result,
  };
}

function summarizeCreateDirectoryResult(result: unknown, forcedDurationMs?: number): ToolResultView {
  const record = parseJsonRecord(result);
  const status = readFirstString(record, 'status', 'message');

  return {
    name: 'create_directory',
    ok: inferOk(record, true),
    durationMs: forcedDurationMs ?? readFirstNumber(record, 'duration_ms', 'durationMs') ?? undefined,
    summary: status ? truncateOneLine(status, MAX_PREVIEW_LINE_WIDTH) : 'completed',
    raw: result,
  };
}

function summarizeApiRequestResult(result: unknown, forcedDurationMs?: number): ToolResultView {
  const record = parseJsonRecord(result);
  const durationMs = forcedDurationMs ?? readFirstNumber(record, 'duration_ms', 'durationMs') ?? undefined;
  const ok = inferOk(record, true);
  const bodySaved = readFirstBoolean(record, 'bodySaved') === true;
  const bodyFilePath = readFirstString(record, 'bodyFilePath');

  if (ok && bodySaved && bodyFilePath) {
    return {
      name: 'api_request',
      ok,
      durationMs,
      summary: `completed · saved to ${truncateOneLine(bodyFilePath, MAX_PREVIEW_LINE_WIDTH)}`,
      raw: result,
    };
  }

  return summarizeGenericToolResult(result, 'api_request', forcedDurationMs);
}

function summarizeApiRequestOutputPathFailure(
  result: unknown,
  forcedDurationMs?: number,
  callArgs?: unknown,
): ToolResultView | null {
  const record = parseJsonRecord(result);
  const errorText = readFirstString(record, 'error', 'message', 'detail');
  const args = parseJsonRecord(callArgs);
  const outputFilePath = readFirstString(args, 'outputFilePath');

  if (!errorText || !outputFilePath) {
    return null;
  }

  if (!/api_request outputFilePath must /i.test(errorText)) {
    return null;
  }

  return {
    name: 'api_request',
    ok: false,
    durationMs: forcedDurationMs ?? readFirstNumber(record, 'duration_ms', 'durationMs') ?? undefined,
    summary: `cannot save to: ${truncateOneLine(outputFilePath, MAX_PREVIEW_LINE_WIDTH)}`,
    raw: result,
  };
}

function readDataField(result: unknown): unknown {
  const record = parseJsonRecord(result);
  return record?.data;
}

function summarizeResolveObjectResult(result: unknown, forcedDurationMs?: number): ToolResultView {
  const record = parseJsonRecord(result);
  const durationMs = forcedDurationMs ?? readFirstNumber(record, 'duration_ms', 'durationMs') ?? undefined;
  const ok = inferOk(record, true);

  if (!ok) {
    return summarizeGenericToolResult(result, 'resolve_object', forcedDurationMs);
  }

  const data = readDataField(result);
  const matches = Array.isArray(data) ? data.filter(isRecord) : [];
  const first = matches[0];
  const displayName = readFirstString(first ?? null, 'displayName');
  const canonicalPath = readFirstString(first ?? null, 'canonicalPath');
  const preview = displayName || canonicalPath
    ? [truncateOneLine([displayName, canonicalPath].filter((value): value is string => !!value).join(' · '), MAX_PREVIEW_LINE_WIDTH)]
    : undefined;

  return {
    name: 'resolve_object',
    ok: true,
    durationMs,
    summary: `${matches.length} match${matches.length === 1 ? '' : 'es'}`,
    preview,
    raw: result,
  };
}

function summarizeSearchContentResult(result: unknown, forcedDurationMs?: number): ToolResultView {
  const record = parseJsonRecord(result);
  const durationMs = forcedDurationMs ?? readFirstNumber(record, 'duration_ms', 'durationMs') ?? undefined;
  const ok = inferOk(record, true);

  if (!ok) {
    return summarizeGenericToolResult(result, 'search_content', forcedDurationMs);
  }

  const data = readDataField(result);
  const matches = Array.isArray(data) ? data.filter(isRecord) : [];
  const firstPath = readFirstString(matches[0] ?? null, 'path');

  return {
    name: 'search_content',
    ok: true,
    durationMs,
    summary: `${matches.length} match${matches.length === 1 ? '' : 'es'}`,
    preview: firstPath ? [truncateOneLine(firstPath, MAX_PREVIEW_LINE_WIDTH)] : undefined,
    raw: result,
  };
}

function summarizeListContentResult(result: unknown, forcedDurationMs?: number): ToolResultView {
  const record = parseJsonRecord(result);
  const durationMs = forcedDurationMs ?? readFirstNumber(record, 'duration_ms', 'durationMs') ?? undefined;
  const ok = inferOk(record, true);

  if (!ok) {
    return summarizeGenericToolResult(result, 'list_content', forcedDurationMs);
  }

  const data = readDataField(result);
  const entries = Array.isArray(data) ? data.filter(isRecord) : [];
  const firstPath = readFirstString(entries[0] ?? null, 'path');

  return {
    name: 'list_content',
    ok: true,
    durationMs,
    summary: `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`,
    preview: firstPath ? [truncateOneLine(firstPath, MAX_PREVIEW_LINE_WIDTH)] : undefined,
    raw: result,
  };
}

function summarizeReadContentResult(result: unknown, forcedDurationMs?: number): ToolResultView {
  const record = parseJsonRecord(result);
  const durationMs = forcedDurationMs ?? readFirstNumber(record, 'duration_ms', 'durationMs') ?? undefined;
  const ok = inferOk(record, true);

  if (!ok) {
    return summarizeGenericToolResult(result, 'read_content', forcedDurationMs);
  }

  const data = parseJsonRecord(readDataField(result));
  const contentType = readFirstString(data, 'contentType') ?? 'content';
  const contentEncoding = readFirstString(data, 'contentEncoding') ?? 'utf8';
  const path = readFirstString(data, 'path');
  const content = readFirstString(data, 'content');
  const sizeSummary = contentEncoding === 'base64'
    ? 'base64'
    : content === null
      ? null
      : formatLineCount(countLines(content));
  const summary = sizeSummary ? `${contentType} · ${sizeSummary}` : contentType;

  return {
    name: 'read_content',
    ok: true,
    durationMs,
    summary,
    preview: path ? [`path: ${truncateOneLine(path, MAX_PREVIEW_LINE_WIDTH - 6)}`] : undefined,
    raw: result,
  };
}

function summarizeAiwContentMutationResult(
  toolName: 'write_content' | 'create_content' | 'delete_content',
  result: unknown,
  forcedDurationMs?: number,
): ToolResultView {
  const record = parseJsonRecord(result);
  const durationMs = forcedDurationMs ?? readFirstNumber(record, 'duration_ms', 'durationMs') ?? undefined;
  const ok = inferOk(record, true);

  if (!ok) {
    return summarizeGenericToolResult(result, toolName, forcedDurationMs);
  }

  const data = isRecord(record?.data) ? record.data : null;
  const path = readFirstString(data, 'path') ?? readFirstString(record, 'path');
  const summary = toolName === 'delete_content'
    ? 'deleted'
    : toolName === 'create_content' || readFirstBoolean(data, 'created') === true
      ? 'created'
      : 'updated';

  return {
    name: toolName,
    ok: true,
    durationMs,
    summary: path ? `${summary} · ${truncateOneLine(path, MAX_PREVIEW_LINE_WIDTH)}` : summary,
    raw: result,
  };
}

function summarizeGenericToolResult(result: unknown, toolName: string, forcedDurationMs?: number): ToolResultView {
  const record = parseJsonRecord(result);
  const durationMs = forcedDurationMs ?? readFirstNumber(record, 'duration_ms', 'durationMs') ?? undefined;
  const ok = inferOk(record, true);
  const textPreview = typeof result === 'string'
    ? result
    : readFirstString(record, 'stdout', 'stderr', 'text', 'content', 'message', 'result', 'detail');

  if (!ok) {
    return {
      name: toolName,
      ok: false,
      durationMs,
      summary: extractMeaningfulLine(record?.error)
        ?? extractMeaningfulLine(textPreview)
        ?? 'failed',
      preview: textPreview ? previewLines(textPreview, 3) : undefined,
      raw: result,
    };
  }

  if (textPreview) {
    const lineCount = countLines(textPreview);
    return {
      name: toolName,
      ok: true,
      durationMs,
      summary: lineCount > 1 ? formatLineCount(lineCount) : truncateOneLine(textPreview, MAX_PREVIEW_LINE_WIDTH),
      preview: lineCount > 1 ? previewLines(textPreview, 3) : undefined,
      raw: result,
    };
  }

  const status = readFirstString(record, 'status', 'message');
  return {
    name: toolName,
    ok,
    durationMs,
    summary: status ? truncateOneLine(status, MAX_PREVIEW_LINE_WIDTH) : (ok ? 'completed' : 'failed'),
    raw: result,
  };
}

function rawFieldLines(record: JsonRecord): string[] {
  return Object.entries(record)
    .map(([key, value]) => {
      const serialized = stringifyCompact(value);
      return serialized ? `  ${key}: ${serialized}` : null;
    })
    .filter((line): line is string => line !== null);
}

function formatRawCallPayload(toolName: string, args: unknown): string {
  if (toolName === 'shell_cmd' && isRecord(args)) {
    const lines: string[] = [];
    if (typeof args.command === 'string') {
      lines.push(`  command: ${JSON.stringify(args.command)}`);
    }
    if (Array.isArray(args.parameters)) {
      lines.push(`  args: ${JSON.stringify(args.parameters)}`);
    }

    for (const key of ['directory', 'timeout', 'output_format', 'output_detail']) {
      if (args[key] !== undefined) {
        const serialized = stringifyCompact(args[key]);
        if (serialized) {
          lines.push(`  ${key}: ${serialized}`);
        }
      }
    }

    return lines.length > 0 ? `\n${lines.join('\n')}` : '';
  }

  if (isRecord(args)) {
    const lines = rawFieldLines(args);
    return lines.length > 0 ? `\n${lines.join('\n')}` : '';
  }

  if (typeof args === 'string') {
    return `\n  result: ${JSON.stringify(args)}`;
  }

  return '';
}

function formatRawResultPayload(result: unknown): string {
  const record = parseJsonRecord(result);
  if (record) {
    const lines = rawFieldLines(record);
    return lines.length > 0 ? `\n${lines.join('\n')}` : '';
  }

  if (typeof result === 'string') {
    return `\n  result: ${JSON.stringify(result)}`;
  }

  return '';
}

export function summarizeToolCall(toolName: string, args: unknown): ToolCallView {
  const record = parseJsonRecord(args);

  if (toolName === 'shell_cmd' && record) {
    return { name: toolName, summary: summarizeShellToolCall(record), args: record };
  }

  if (toolName === 'load_skill' && record) {
    return { name: toolName, summary: summarizeLoadSkillCall(record), args: record };
  }

  if (toolName === 'path_exists' && record) {
    return { name: toolName, summary: summarizePathExistsCall(record), args: record };
  }

  if (toolName === 'search_files' && record) {
    return { name: toolName, summary: summarizePathLikeCall(record, 'query', 'pattern', 'glob', 'includePattern'), args: record };
  }

  if (toolName === 'list_files' && record) {
    return { name: toolName, summary: summarizePathLikeCall(record, 'requestedPath', 'path', 'filePath'), args: record };
  }

  if (isReadFileLikeToolName(toolName) && record) {
    return { name: toolName, summary: summarizePathLikeCall(record, 'filePath', 'path'), args: record };
  }

  if ((toolName === 'write_file' || toolName === 'create_directory') && record) {
    return { name: toolName, summary: summarizePathLikeCall(record, 'filePath', 'path'), args: record };
  }

  return { name: toolName, summary: summarizeGenericCall(args), args };
}

export function summarizeToolResult(
  toolName: string,
  result: unknown,
  durationMs?: number,
  callArgs?: unknown,
): ToolResultView {
  if (toolName === 'shell_cmd') {
    return summarizeShellToolResult(result, durationMs);
  }

  if (toolName === 'search_files') {
    return summarizeSearchFilesResult(result, durationMs);
  }

  if (isReadFileLikeToolName(toolName)) {
    return summarizeReadFileResult(result, durationMs, callArgs, toolName);
  }

  if (toolName === 'path_exists') {
    return summarizePathExistsResult(result, durationMs);
  }

  if (toolName === 'write_file') {
    return summarizeWriteFileResult(result, durationMs);
  }

  if (toolName === 'list_files') {
    return summarizeListFilesResult(result, durationMs);
  }

  if (toolName === 'create_directory') {
    return summarizeCreateDirectoryResult(result, durationMs);
  }

  if (toolName === 'api_request') {
    return summarizeApiRequestOutputPathFailure(result, durationMs, callArgs)
      ?? summarizeApiRequestResult(result, durationMs);
  }

  if (toolName === 'resolve_object') {
    return summarizeResolveObjectResult(result, durationMs);
  }

  if (toolName === 'search_content') {
    return summarizeSearchContentResult(result, durationMs);
  }

  if (toolName === 'list_content') {
    return summarizeListContentResult(result, durationMs);
  }

  if (toolName === 'read_content') {
    return summarizeReadContentResult(result, durationMs);
  }

  if (toolName === 'write_content' || toolName === 'create_content' || toolName === 'delete_content') {
    return summarizeAiwContentMutationResult(toolName, result, durationMs);
  }

  return summarizeGenericToolResult(result, toolName, durationMs);
}

export function renderToolCall(view: ToolCallView, mode: TraceMode): string {
  if (mode === 'debug') {
    return `\n[tool.call] ${view.name}${formatRawCallPayload(view.name, view.args)}`;
  }

  const lines = [`  ↳ ${view.name}${view.summary ? ` ${view.summary}` : ''}`];
  if (mode === 'verbose' && typeof view.args !== 'undefined') {
    lines.push(`    args: ${compactJsonPreview(view.args, MAX_VERBOSE_JSON_WIDTH)}`);
  }

  return `\n${lines.join('\n')}`;
}

export function renderToolResult(view: ToolResultView, mode: TraceMode): string {
  if (mode === 'debug') {
    return `\n[tool.result] ${view.name}${formatRawResultPayload(view.raw)}\n`;
  }

  const statusIcon = view.ok ? '✓' : '✗';
  const parts: string[] = [];
  if (typeof view.durationMs === 'number' && Number.isFinite(view.durationMs)) {
    parts.push(`${Math.round(view.durationMs)}ms`);
  }
  parts.push(view.summary || (view.ok ? 'completed' : 'failed'));

  const lines = [`  ${statusIcon} ${view.name} ${parts.join(' · ')}`];
  for (const previewLine of view.preview ?? []) {
    lines.push(`    ${previewLine}`);
  }
  if (mode === 'verbose' && typeof view.raw !== 'undefined') {
    lines.push(`    raw: ${compactJsonPreview(view.raw, MAX_VERBOSE_JSON_WIDTH)}`);
  }

  return `\n${lines.join('\n')}\n`;
}

export function formatToolCallDiagnostic(
  toolCall: { name: string; arguments?: string },
  mode: TraceMode = 'default',
): string {
  const view = summarizeToolCall(toolCall.name, toolCall.arguments);
  return renderToolCall(view, mode);
}

export function formatToolResultDiagnostic(
  toolResult: { name: string; result: unknown; arguments?: string; durationMs?: number },
  mode: TraceMode = 'default',
): string {
  const view = summarizeToolResult(toolResult.name, toolResult.result, toolResult.durationMs, toolResult.arguments);
  return renderToolResult(view, mode);
}
