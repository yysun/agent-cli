/**
 * Renderer UI Types
 *
 * Purpose:
 * - Share compact UI state types between hooks and feature components.
 *
 * Recent changes:
 * - 2026-05-31: Added app info, log, and theme preference types.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

export type RendererLogEntry = {
  id: number;
  level: 'info' | 'error';
  message: string;
};

export type RendererAppInfo = {
  name: string;
  version: string;
  platform: string;
  rendererMode: string;
};