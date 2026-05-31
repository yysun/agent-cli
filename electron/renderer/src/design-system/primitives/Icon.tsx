/**
 * Icon Primitive
 *
 * Purpose:
 * - Provide the small line icons used by desktop shell controls.
 *
 * Recent changes:
 * - 2026-05-31: Moved from shared components into design-system primitives.
 */
export type IconName = 'sidebar-left' | 'sidebar-right' | 'folder' | 'settings' | 'close' | 'system' | 'sun' | 'moon' | 'edit';

export interface IconProps {
  name: IconName;
}

export default function Icon({ name }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {name === 'sidebar-left' && <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><polyline points="15 9 12 12 15 15" /></>}
      {name === 'sidebar-right' && <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><polyline points="13 9 16 12 13 15" /></>}
      {name === 'folder' && <><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4.086a2.5 2.5 0 0 1 1.768.732L12.621 7H18.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" /><path d="M3 9.5h18" /></>}
      {name === 'settings' && <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>}
      {name === 'close' && <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>}
      {name === 'system' && <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></>}
      {name === 'sun' && <><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></>}
      {name === 'moon' && <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />}
      {name === 'edit' && <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>}
    </svg>
  );
}