// @ts-check
/**
 * Agent CLI Tool Trace Renderer Unit Tests
 *
 * Purpose:
 * - Validate compact terminal diagnostics for tool calls and results.
 *
 * Recent changes:
 * - 2026-05-26: Covered concise `load_skill` result display without XML previews.
 */
import { describe, expect, it } from 'vitest';

import {
  formatModelResponseDiagnostic,
  formatToolCallDiagnostic,
  formatToolResultDiagnostic,
} from '../../cli/src/tool-trace-renderer.ts';

describe('tool trace renderer', () => {
  const successfulToolExamples = [
    {
      name: 'shell_cmd',
      arguments: JSON.stringify({ command: 'npm', parameters: ['test'] }),
      result: { exitCode: 0, stdout: 'ok\n' },
    },
    {
      name: 'load_skill',
      arguments: JSON.stringify({ skill_id: 'agent-world-skill' }),
      result: '<skill_context id="agent-world-skill">Loaded</skill_context>',
    },
    {
      name: 'path_exists',
      arguments: JSON.stringify({ path: 'README.md' }),
      result: { ok: true, exists: true, path: 'README.md', type: 'file' },
    },
    {
      name: 'search_files',
      arguments: JSON.stringify({ query: 'README' }),
      result: { ok: true, matches: ['README.md'] },
    },
    {
      name: 'list_files',
      arguments: JSON.stringify({ path: '.' }),
      result: { ok: true, entries: ['README.md'] },
    },
    {
      name: 'read_file',
      arguments: JSON.stringify({ filePath: 'README.md' }),
      result: { ok: true, content: '# Agent CLI\n' },
    },
    {
      name: 'write_file',
      arguments: JSON.stringify({ filePath: 'notes.md', content: 'hello' }),
      result: { ok: true, bytesWritten: 5 },
    },
    {
      name: 'create_directory',
      arguments: JSON.stringify({ path: 'tmp/example' }),
      result: { ok: true, status: 'created' },
    },
    {
      name: 'api_request',
      arguments: JSON.stringify({ url: 'https://example.test' }),
      result: { ok: true, status: 'completed' },
    },
    {
      name: 'resolve_object',
      arguments: JSON.stringify({ path: 'README.md' }),
      result: { ok: true, data: [{ displayName: 'README.md', canonicalPath: 'README.md' }] },
    },
    {
      name: 'search_content',
      arguments: JSON.stringify({ query: 'Agent CLI' }),
      result: { ok: true, data: [{ path: 'README.md' }] },
    },
    {
      name: 'list_content',
      arguments: JSON.stringify({ path: '.' }),
      result: { ok: true, data: [{ path: 'README.md' }] },
    },
    {
      name: 'read_content',
      arguments: JSON.stringify({ path: 'README.md' }),
      result: { ok: true, data: { path: 'README.md', contentType: 'text/markdown', content: '# Agent CLI\n' } },
    },
    {
      name: 'write_content',
      arguments: JSON.stringify({ path: 'README.md', content: '# Agent CLI\n' }),
      result: { ok: true, data: { path: 'README.md' } },
    },
    {
      name: 'create_content',
      arguments: JSON.stringify({ path: 'notes.md', content: 'hello' }),
      result: { ok: true, data: { path: 'notes.md', created: true } },
    },
    {
      name: 'delete_content',
      arguments: JSON.stringify({ path: 'old.md' }),
      result: { ok: true, data: { path: 'old.md' } },
    },
    {
      name: 'custom_tool',
      arguments: JSON.stringify({ path: 'custom.txt' }),
      result: { ok: true, status: 'completed' },
    },
  ];

  it.each(successfulToolExamples)('renders one call row and one success row for $name', (tool) => {
    const output = `${formatToolCallDiagnostic({
      name: tool.name,
      arguments: tool.arguments,
    })}${formatToolResultDiagnostic({
      name: tool.name,
      arguments: tool.arguments,
      durationMs: 5,
      result: tool.result,
    })}`;

    expect(output.match(/(^|\n)  ↳ /g) ?? []).toHaveLength(1);
    expect(output.match(/(^|\n)  ✓ /g) ?? []).toHaveLength(1);
    expect(output).not.toContain('\n  ↳ \n');
    expect(output).not.toContain('\n  ✓ \n');
  });

  it('renders load_skill call and result without the skill XML preview', () => {
    const callOutput = formatToolCallDiagnostic({
      name: 'load_skill',
      arguments: JSON.stringify({ skill_id: 'agent-world-skill' }),
    });
    const resultOutput = formatToolResultDiagnostic({
      name: 'load_skill',
      durationMs: 5,
      result: [
        '<skill_context id="agent-world-skill">',
        '  <description>Use when the user intends to create, initialize, run, continue, route, inspect, or debug.</description>',
        '  <skill_root>/Users/esun/.agents/skills/agent-world-skill</skill_root>',
        '  <instructions>',
        '# Agent World Skill',
        '  </instructions>',
        '</skill_context>',
      ].join('\n'),
    });

    const visibleLines = `${callOutput}${resultOutput}`.trim().split('\n');

    expect(visibleLines).toEqual([
      '↳ load_skill {"skill_id":"agent-world-skill"}',
      '  ✓ load_skill 5ms · 7 lines',
    ]);
    expect(resultOutput).not.toContain('<skill_context');
    expect(resultOutput).not.toContain('<description>');
    expect(resultOutput).not.toContain('<skill_root>');
  });

  it('renders model response stop metadata and token usage', () => {
    const output = formatModelResponseDiagnostic({
      stopKind: 'natural_stop',
      providerStopReason: 'stop',
      usage: {
        inputTokens: 8,
        outputTokens: 2,
        totalTokens: 10,
      },
    });

    expect(output.trim()).toBe('✓ model.response stopKind=natural_stop · finish_reason=stop · tokens input=8 output=2 total=10');
  });
});
