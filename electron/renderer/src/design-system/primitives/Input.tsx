/**
 * Input Primitive
 *
 * Purpose:
 * - Provide a generic text input styled by renderer tokens.
 *
 * Recent changes:
 * - 2026-05-31: Added input primitive for design-system layering.
 */
import type { InputHTMLAttributes } from 'react';
import { classNames } from '../../utils/class-names';

export default function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={classNames('aw-input', className)} {...props} />;
}