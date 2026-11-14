import { cn } from '../../utils/cn.ts';

/** A restrained gold rule with a small lozenge — the app's one recurring ornament. */
export function Ornament({ className, align = 'center' }: { className?: string; align?: 'center' | 'start' }) {
  return (
    <div aria-hidden className={cn('flex items-center gap-3', align === 'center' ? 'justify-center' : 'justify-start', className)}>
      <span className={cn('h-px bg-gradient-to-r from-transparent to-gold-500/80', align === 'center' ? 'w-16 sm:w-24' : 'w-0')} />
      <span className="size-1.5 rotate-45 border border-gold-400" />
      <span className="h-px w-16 bg-gradient-to-r from-gold-500/80 to-transparent sm:w-24" />
    </div>
  );
}
