/**
 * Runtime Option Constants
 *
 * Purpose:
 * - Centralize renderer option lists for runtime turn controls.
 *
 * Recent changes:
 * - 2026-05-31: Added tool permission and reasoning effort options.
 */
export const TOOL_PERMISSION_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'ask', label: 'Ask' },
  { value: 'read', label: 'Read' },
];

export const REASONING_EFFORT_OPTIONS = [
  { value: '', label: 'Default reasoning' },
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];