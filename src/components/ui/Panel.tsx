import type { ReactNode } from 'react';
import { cn } from '../../utils/cn.ts';

interface PanelProps {
  title?: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Raised panels sit one surface step lighter, for content inside a panel or highlighted cards. */
  tone?: 'base' | 'raised' | 'accent';
  as?: 'section' | 'article' | 'div';
}

/** The standard surface for grouped content. */
export function Panel({ title, eyebrow, actions, children, className, tone = 'base', as: Tag = 'section' }: PanelProps) {
  return (
    <Tag
      className={cn(
        'relative rounded-panel border p-5 sm:p-6',
        tone === 'base' && 'border-iron/80 bg-obsidian',
        tone === 'raised' && 'border-iron bg-charcoal',
        tone === 'accent' && 'border-gold-600 bg-obsidian shadow-[inset_0_1px_0_0_var(--color-gold-600)]',
        className,
      )}
    >
      {(title || eyebrow || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && <p className="text-[0.7rem] font-medium uppercase tracking-[0.25em] text-gold-500">{eyebrow}</p>}
            {title && <h2 className="mt-1 font-display text-lg font-semibold tracking-wide text-gold-200">{title}</h2>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </Tag>
  );
}
