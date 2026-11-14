import type { ReactNode } from 'react';
import { CircleAlert, Info, FlaskConical } from 'lucide-react';
import { cn } from '../../utils/cn.ts';

type NoticeTone = 'info' | 'warning' | 'fixture';

const styles: Record<NoticeTone, string> = {
  info: 'border-arcane/40 bg-arcane/5 text-ink',
  warning: 'border-warning/50 bg-warning/5 text-ink',
  fixture: 'border-arcane/60 bg-arcane/10 text-ink',
};

/** Inline message. `fixture` tone marks development data, per CLAUDE.md Part 16. */
export function Notice({ tone = 'info', title, children, className }: { tone?: NoticeTone; title?: string; children: ReactNode; className?: string }) {
  const Icon = tone === 'warning' ? CircleAlert : tone === 'fixture' ? FlaskConical : Info;
  return (
    <div role={tone === 'warning' ? 'alert' : 'note'} className={cn('flex gap-3 rounded-control border p-3.5 text-sm', styles[tone], className)}>
      <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', tone === 'warning' ? 'text-warning' : 'text-arcane')} />
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        <div className="text-ash">{children}</div>
      </div>
    </div>
  );
}
