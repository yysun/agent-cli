/**
 * Settings Panel Section
 *
 * Purpose:
 * - Render a titled section container inside the settings panel.
 *
 * Recent changes:
 * - 2026-05-31: Moved from design-system patterns into the settings feature.
 */
import type { ReactNode } from 'react';
import { classNames } from '../../utils/class-names';

export interface PanelSectionProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export default function PanelSection({ title, children, className }: PanelSectionProps) {
  return (
    <section className={classNames('aw-panel-section', className)}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}