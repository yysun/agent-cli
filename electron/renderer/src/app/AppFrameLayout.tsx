/**
 * App Frame Layout
 *
 * Purpose:
 * - Render the Agent World desktop shell frame with sidebar and main content slots.
 *
 * Recent changes:
 * - 2026-05-31: Moved from design-system patterns into the app layer because it is app-shell specific.
 */
import type { ReactNode } from 'react';
import { classNames } from '../utils/class-names';

export interface AppFrameLayoutProps {
  sidebar: ReactNode;
  mainContent: ReactNode;
  sidebarCollapsed?: boolean;
  panelOpen?: boolean;
}

export default function AppFrameLayout({
  sidebar,
  mainContent,
  sidebarCollapsed = false,
  panelOpen = true,
}: AppFrameLayoutProps) {
  return (
    <main
      id="app-shell"
      className={classNames(
        'aw-app-shell',
        sidebarCollapsed && 'is-sidebar-collapsed',
        !panelOpen && 'is-right-panel-collapsed',
      )}
    >
      {sidebar}
      {mainContent}
    </main>
  );
}