/**
 * Settings Labeled Field
 *
 * Purpose:
 * - Render the label-plus-control wrapper used by the settings panel.
 *
 * Recent changes:
 * - 2026-05-31: Moved from design-system patterns into the settings feature.
 */
import type { ReactNode } from 'react';
import { classNames } from '../../utils/class-names';

export interface LabeledFieldProps {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function LabeledField({ label, children, className }: LabeledFieldProps) {
  return (
    <label className={classNames('aw-field-row', className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}