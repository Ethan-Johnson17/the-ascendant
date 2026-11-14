import type { ReactNode } from 'react';
import { cn } from '../../utils/cn.ts';

export type BadgeTone = 'neutral' | 'gold' | 'vital' | 'warning' | 'arcane' | 'ember';

const tones: Record<BadgeTone, string> = {
  neutral: 'border-iron text-ash bg-slate/50',
  gold: 'border-gold-600 text-gold-200 bg-gold-600/20',
  vital: 'border-vital/50 text-vital bg-vital/10',
  warning: 'border-warning/50 text-warning bg-warning/10',
  arcane: 'border-arcane/50 text-arcane bg-arcane/10',
  ember: 'border-ember/50 text-ember bg-ember/10',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.7rem] font-medium uppercase tracking-wider',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
