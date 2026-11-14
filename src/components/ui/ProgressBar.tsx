import { motion } from 'framer-motion';
import { duration, easeAscend } from '../../styles/motion.ts';
import { cn } from '../../utils/cn.ts';

interface ProgressBarProps {
  value: number;
  max: number;
  label: string;
  /** Visible caption under the bar, e.g. "187 / 445 XP". */
  caption?: string;
  tone?: 'gold' | 'vital' | 'arcane';
  className?: string;
}

export function ProgressBar({ value, max, label, caption, tone = 'gold', className }: ProgressBarProps) {
  const pct = max <= 0 ? 100 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={className}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className="h-2 overflow-hidden rounded-full bg-slate ring-1 ring-iron"
      >
        <motion.div
          className={cn(
            'h-full rounded-full',
            tone === 'gold' && 'bg-gradient-to-r from-gold-500 to-gold-300',
            tone === 'vital' && 'bg-vital',
            tone === 'arcane' && 'bg-arcane',
          )}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: duration.slow, ease: easeAscend }}
        />
      </div>
      {caption && <p className="mt-1.5 text-xs tabular-nums text-ash">{caption}</p>}
    </div>
  );
}
