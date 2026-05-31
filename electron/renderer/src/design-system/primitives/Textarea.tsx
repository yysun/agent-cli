/**
 * Textarea Primitive
 *
 * Purpose:
 * - Provide a generic multiline input styled by renderer tokens.
 *
 * Recent changes:
 * - 2026-05-31: Added textarea primitive for design-system layering.
 */
import type { TextareaHTMLAttributes } from 'react';
import { classNames } from '../../utils/class-names';

export default function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={classNames('aw-textarea', className)} {...props} />;
}