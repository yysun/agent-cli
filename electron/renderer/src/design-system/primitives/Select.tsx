/**
 * Select Primitive
 *
 * Purpose:
 * - Provide a generic select control styled by renderer tokens.
 *
 * Recent changes:
 * - 2026-05-31: Added select primitive for design-system layering.
 */
import type { SelectHTMLAttributes } from 'react';
import { classNames } from '../../utils/class-names';

export default function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={classNames('aw-select', className)} {...props} />;
}