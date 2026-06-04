// @ts-check
/**
 * Electron Composer Keybinding Unit Tests
 *
 * Purpose:
 * - Validate message composer keyboard-submit decisions without a browser DOM harness.
 *
 * Key features:
 * - Covers single-line Enter send and multi-line Cmd/Ctrl+Enter send behavior.
 *
 * Recent changes:
 * - 2026-06-04: Added coverage for Electron composer Enter submit rules.
 */
import { describe, expect, it } from 'vitest';
import { shouldSubmitComposerKey } from '../../electron/renderer/src/features/chat/composer-keybinding.js';

describe('composer keybinding helper', () => {
  it('submits non-empty single-line input on plain Enter', () => {
    expect(shouldSubmitComposerKey({ content: 'hello', key: 'Enter' })).toBe(true);
    expect(shouldSubmitComposerKey({ content: '  hello  ', key: 'Enter' })).toBe(true);
  });

  it('does not submit empty, whitespace-only, busy, composing, or non-Enter input', () => {
    expect(shouldSubmitComposerKey({ content: '', key: 'Enter' })).toBe(false);
    expect(shouldSubmitComposerKey({ content: '   ', key: 'Enter' })).toBe(false);
    expect(shouldSubmitComposerKey({ busy: true, content: 'hello', key: 'Enter' })).toBe(false);
    expect(shouldSubmitComposerKey({ content: 'hello', isComposing: true, key: 'Enter' })).toBe(false);
    expect(shouldSubmitComposerKey({ content: 'hello', key: 'a' })).toBe(false);
  });

  it('preserves newline editing for Shift/Alt+Enter and multi-line plain Enter', () => {
    expect(shouldSubmitComposerKey({ content: 'hello', key: 'Enter', shiftKey: true })).toBe(false);
    expect(shouldSubmitComposerKey({ altKey: true, content: 'hello', key: 'Enter' })).toBe(false);
    expect(shouldSubmitComposerKey({ content: 'first\nsecond', key: 'Enter' })).toBe(false);
    expect(shouldSubmitComposerKey({ content: 'first\r\nsecond', key: 'Enter' })).toBe(false);
  });

  it('submits any non-empty input on Cmd+Enter or Ctrl+Enter', () => {
    expect(shouldSubmitComposerKey({ content: 'hello', key: 'Enter', metaKey: true })).toBe(true);
    expect(shouldSubmitComposerKey({ content: 'hello', key: 'Enter', ctrlKey: true })).toBe(true);
    expect(shouldSubmitComposerKey({ content: 'first\nsecond', key: 'Enter', metaKey: true })).toBe(true);
    expect(shouldSubmitComposerKey({ content: 'first\nsecond', key: 'Enter', ctrlKey: true })).toBe(true);
  });
});
