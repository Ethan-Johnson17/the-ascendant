import { attributeInfo } from '../../content/character/options.ts';
import { isUntested, type AttributeId } from '../../engine/character/attributes.ts';
import { cn } from '../../utils/cn.ts';

interface AttributeTileProps {
  id: AttributeId;
  score: number;
  /** Show the real-world description under the name. */
  detailed?: boolean;
  /** Class signature attribute (story flavour only). */
  signature?: boolean;
}

export function AttributeTile({ id, score, detailed = false, signature = false }: AttributeTileProps) {
  const info = attributeInfo(id);
  const untested = isUntested(score);
  return (
    <div
      className={cn(
        'flex rounded-panel border bg-charcoal/60 p-3.5',
        detailed ? 'items-start gap-4' : 'flex-col items-center text-center',
        signature ? 'border-gold-600' : 'border-iron',
      )}
    >
      <div className={cn('flex flex-col items-center', detailed && 'w-14 shrink-0')}>
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-gold-500">{info.abbreviation}</span>
        <span className={cn('font-display text-3xl font-semibold tabular-nums leading-tight', untested ? 'text-smoke' : 'text-gold-200')}>{score}</span>
      </div>
      <div className={cn('min-w-0', detailed ? 'flex-1' : 'mt-1')}>
        <p className={cn('font-medium text-ink', detailed ? 'text-sm' : 'text-xs')}>{info.name}</p>
        {detailed && <p className="mt-0.5 text-sm text-ash">{info.summary}</p>}
        <p className={cn('text-[0.7rem] uppercase tracking-wider', untested ? 'text-smoke' : 'text-vital', detailed ? 'mt-1.5' : 'mt-0.5')}>
          {untested ? 'Untested' : 'Proven'}
          {signature && detailed && <span className="text-gold-500"> · Class signature</span>}
        </p>
      </div>
    </div>
  );
}
