/**
 * Renderer Formatting Utilities
 *
 * Purpose:
 * - Keep display formatting separate from feature components.
 *
 * Recent changes:
 * - 2026-05-31: Added chat ID and timestamp formatting helpers.
 */
export function formatTime(value: unknown): string {
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export function shortId(chatId: unknown): string {
  return String(chatId || '').slice(0, 18) || 'new chat';
}