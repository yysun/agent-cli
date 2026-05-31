/**
 * Icon Button Primitive
 *
 * Purpose:
 * - Provide an accessible icon-only button primitive.
 *
 * Key features:
 * - Requires a text label for assistive technology and tooltips.
 * - Wraps the base button visual system.
 *
 * Recent changes:
 * - 2026-05-31: Added icon button primitive for renderer controls.
 */
import type { ReactNode } from 'react';
import Button, { type ButtonProps } from './Button';

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'size'> {
  label: string;
  children: ReactNode;
}

export default function IconButton({ label, title, children, ...props }: IconButtonProps) {
  return (
    <Button aria-label={label} title={title ?? label} size="icon" {...props}>
      {children}
    </Button>
  );
}