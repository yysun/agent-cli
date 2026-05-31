/**
 * Button Primitive
 *
 * Purpose:
 * - Provide a generic semantic button control for renderer features.
 *
 * Key features:
 * - Supports common visual variants and sizes.
 * - Keeps business meaning with the caller.
 *
 * Recent changes:
 * - 2026-05-31: Added button primitive for the React renderer design system.
 */
import type { ButtonHTMLAttributes } from 'react';
import { classNames } from '../../utils/class-names';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export default function Button({
  type = 'button',
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={classNames('aw-button', `aw-button-${variant}`, `aw-button-${size}`, className)}
      {...props}
    />
  );
}