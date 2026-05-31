/**
 * Checkbox Primitive
 *
 * Purpose:
 * - Provide a generic checkbox input control wrapper.
 *
 * Key features:
 * - Preserves native checkbox semantics.
 * - Applies the shared renderer accent treatment by default.
 *
 * Recent changes:
 * - 2026-05-31: Added to match the sibling Agent World Electron checkbox primitive style.
 */
import type { InputHTMLAttributes } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> { }

export default function Checkbox({ className = '', ...props }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      className={['accent-primary', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}