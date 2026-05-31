/**
 * Settings Status Log
 *
 * Purpose:
 * - Render bounded local renderer status entries in the settings panel.
 *
 * Recent changes:
 * - 2026-05-31: Moved from shared components into the settings feature.
 */
import type { RendererLogEntry } from '../../types/ui';

export interface StatusLogProps {
  logs: RendererLogEntry[];
}

export default function StatusLog({ logs }: StatusLogProps) {
  return (
    <div id="log-list">
      {logs.map((entry) => (
        <div className="aw-log-entry" key={entry.id}>
          <span>{entry.level}</span>
          <p>{entry.message}</p>
        </div>
      ))}
    </div>
  );
}