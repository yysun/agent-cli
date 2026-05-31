/**
 * Class Name Utilities
 *
 * Purpose:
 * - Join optional CSS class names without feature components repeating filtering logic.
 *
 * Recent changes:
 * - 2026-05-31: Added small class-name helper for React renderer components.
 */
export function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}