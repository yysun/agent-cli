/**
 * Switch Primitive
 *
 * Purpose:
 * - Provide a generic accessible switch control with renderer-consistent styling.
 *
 * Key features:
 * - Preserves switch semantics via `role="switch"` and `aria-checked`.
 * - Supports compact and default sizes.
 *
 * Recent changes:
 * - 2026-05-31: Added to match the sibling Agent World Electron switch control style.
 */
import type { ButtonHTMLAttributes } from 'react';

type SwitchSize = 'sm' | 'md';

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  checked: boolean;
  size?: SwitchSize;
}

export default function Switch({
  type = 'button',
  checked,
  size = 'md',
  className = '',
  ...props
}: SwitchProps) {
  return (
    <button
      type={type}
      role="switch"
      aria-checked={checked}
      className={['aw-switch', `aw-switch-${size}`, checked && 'is-checked', className].filter(Boolean).join(' ')}
      {...props}
    >
      <span className="aw-switch-track">
        <span className="aw-switch-thumb" />
      </span>
    </button>
  );
}