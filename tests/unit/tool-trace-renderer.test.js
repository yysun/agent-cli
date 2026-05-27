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
  formatToolCallDiagnostic,
  formatToolResultDiagnostic,
} from '../../cli/src/tool-trace-renderer.ts';

describe('tool trace renderer', () => {
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
});
