import { levelFromXp } from '../../engine/progression/levels.ts';
import type { LevelCurve } from '../../engine/progression/config.ts';
import { ProgressBar } from '../../components/ui/ProgressBar.tsx';

/** Level number plus XP bar, computed by the engine from a total XP figure. */
export function LevelProgress({ totalXp, curve, label, compact = false }: { totalXp: number; curve: LevelCurve; label: string; compact?: boolean }) {
  const state = levelFromXp(totalXp, curve);
  const caption = state.isMaxLevel
    ? `${totalXp.toLocaleString()} XP · maximum level`
    : `${state.xpIntoLevel.toLocaleString()} / ${(state.xpForNextLevel ?? 0).toLocaleString()} XP to level ${state.level + 1}`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className={compact ? 'text-sm text-ash' : 'text-xs uppercase tracking-[0.2em] text-gold-500'}>{label}</p>
        <p className="font-display text-gold-100">
          <span className="text-xs uppercase tracking-wider text-ash">Level </span>
          <span className={compact ? 'text-lg' : 'text-2xl'}>{state.level}</span>
        </p>
      </div>
      <ProgressBar
        className="mt-2"
        value={state.isMaxLevel ? 1 : state.xpIntoLevel}
        max={state.isMaxLevel ? 1 : (state.xpForNextLevel ?? 1)}
        label={`${label} progress`}
        caption={caption}
      />
    </div>
  );
}
