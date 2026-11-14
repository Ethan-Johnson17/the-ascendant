import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../utils/cn.ts';

/**
 * A large selectable card backed by a real radio input, so keyboard and screen-reader
 * behaviour (arrow keys, "1 of 4, selected") come from the browser.
 */
interface OptionCardProps {
  name: string;
  value: string;
  checked: boolean;
  onSelect: (value: string) => void;
  title: string;
  media?: ReactNode;
  children?: ReactNode;
}

export function OptionCard({ name, value, checked, onSelect, title, media, children }: OptionCardProps) {
  return (
    <label
      className={cn(
        'group relative flex cursor-pointer gap-4 rounded-panel border p-4 transition-colors',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold-300',
        checked ? 'border-gold-400 bg-gold-600/15' : 'border-iron bg-obsidian hover:border-gold-600 hover:bg-charcoal',
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={() => onSelect(value)} aria-label={title} className="sr-only" />
      {media && <div className="shrink-0">{media}</div>}
      <div className="min-w-0 flex-1">
        <p className={cn('font-display text-base font-semibold tracking-wide', checked ? 'text-gold-100' : 'text-gold-200')}>{title}</p>
        {children && <div className="mt-1 text-sm text-ash">{children}</div>}
      </div>
      <span
        aria-hidden
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors',
          checked ? 'border-gold-300 bg-gold-300 text-abyss' : 'border-iron text-transparent',
        )}
      >
        <Check className="size-4" strokeWidth={3} />
      </span>
    </label>
  );
}

export function OptionGroup({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('grid gap-3', className)}>
      {children}
    </div>
  );
}
