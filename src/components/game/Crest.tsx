import { useId } from 'react';
import { Sun, Swords, Trees, VenetianMask, WandSparkles, Shield, type LucideIcon } from 'lucide-react';
import { findTincture } from '../../content/character/options.ts';
import { cn } from '../../utils/cn.ts';

/**
 * The character's heraldic crest: a shield in their chosen tincture bearing their class emblem.
 *
 * PLACEHOLDER ART. GAME_DESIGN.md §14 calls for high-quality character artwork; that requires
 * an art source decision (see ROADMAP). The crest is deliberately restrained so it can sit
 * beside, or be replaced by, real portraits later without layout changes.
 */
const classEmblem: Record<string, LucideIcon> = {
  fighter: Swords,
  ranger: Trees,
  rogue: VenetianMask,
  wizard: WandSparkles,
  cleric: Sun,
};

const sizes = { sm: 'w-10', md: 'w-16', lg: 'w-24', xl: 'w-32' } as const;

export function Crest({ tinctureId, classId, size = 'md', className }: { tinctureId: string; classId: string; size?: keyof typeof sizes; className?: string }) {
  const gid = useId();
  const tincture = findTincture(tinctureId)?.hex ?? 'var(--color-slate)';
  const Emblem = classEmblem[classId] ?? Shield;
  return (
    <div className={cn('relative aspect-[5/6]', sizes[size], className)} aria-hidden>
      <svg viewBox="0 0 100 120" className="absolute inset-0 size-full drop-shadow-[0_6px_14px_rgba(0,0,0,0.6)]">
        <defs>
          <linearGradient id={`${gid}-shade`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="0.55" stopColor="#000000" stopOpacity="0.15" />
            <stop offset="1" stopColor="#000000" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <path d="M50 4 L94 16 V58 C94 86 74 104 50 116 C26 104 6 86 6 58 V16 Z" fill={tincture} />
        <path d="M50 4 L94 16 V58 C94 86 74 104 50 116 C26 104 6 86 6 58 V16 Z" fill={`url(#${gid}-shade)`} />
        <path
          d="M50 4 L94 16 V58 C94 86 74 104 50 116 C26 104 6 86 6 58 V16 Z"
          fill="none"
          stroke="var(--color-gold-300)"
          strokeWidth="3"
        />
        <path
          d="M50 12 L86 22 V58 C86 81 70 96 50 106 C30 96 14 81 14 58 V22 Z"
          fill="none"
          stroke="var(--color-gold-500)"
          strokeWidth="1"
          opacity="0.8"
        />
      </svg>
      <Emblem className="absolute left-1/2 top-[44%] w-[42%] -translate-x-1/2 -translate-y-1/2 text-gold-100" strokeWidth={1.5} style={{ height: 'auto' }} />
    </div>
  );
}
