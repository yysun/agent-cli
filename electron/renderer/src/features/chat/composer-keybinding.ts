/**
 * Composer Keybinding Helpers
 *
 * Purpose:
 * - Keep message composer keyboard-submit decisions testable outside React.
 *
 * Key features:
 * - Sends single-line drafts with plain Enter.
 * - Treats Cmd/Ctrl+Enter as an explicit send gesture for any draft.
 * - Avoids submission while IME text composition is active.
 * - Preserves Shift/Alt+Enter newline editing when no explicit send modifier is present.
 *
 * Recent changes:
 * - 2026-06-04: Added composer Enter submit decision helper.
 */
export interface ComposerSubmitKeyInput {
  altKey?: boolean;
  busy?: boolean;
  content: string;
  ctrlKey?: boolean;
  isComposing?: boolean;
  key: string;
  metaKey?: boolean;
  shiftKey?: boolean;
}

export function shouldSubmitComposerKey({
  altKey = false,
  busy = false,
  content,
  ctrlKey = false,
  isComposing = false,
  key,
  metaKey = false,
  shiftKey = false,
}: ComposerSubmitKeyInput) {
  if (busy || isComposing || key !== 'Enter' || !content.trim()) {
    return false;
  }

  const isExplicitSend = metaKey || ctrlKey;
  const isMultiLine = /\r|\n/.test(content);
  if (isMultiLine) {
    return isExplicitSend;
  }

  return isExplicitSend || (!altKey && !shiftKey);
}
