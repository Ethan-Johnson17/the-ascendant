import { Suspense, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../app/AuthProvider.tsx';
import { Backpack, FlaskConical, LayoutDashboard, Map, Settings, UserRound, type LucideIcon } from 'lucide-react';
import { useGame } from '../app/GameProvider.tsx';
import { Crest } from '../components/game/Crest.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Notice } from '../components/ui/Notice.tsx';
import { PageFallback } from '../components/ui/PageFallback.tsx';
import { findClass, findRace } from '../content/character/options.ts';
import { levelFromXp } from '../engine/progression/levels.ts';
import { defaultProgressionConfig } from '../engine/progression/config.ts';
import { cn } from '../utils/cn.ts';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

// Only screens that exist are listed. Later phases add Codex, Weakness Bank, etc.
const nav: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/character', label: 'Character', icon: UserRound },
  { to: '/campaigns', label: 'Campaigns', icon: Map },
  { to: '/inventory', label: 'Inventory', icon: Backpack },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell() {
  const { player, isSample, exitSample, storageWarning } = useGame();
  const { status } = useAuth();
  const character = player.character;
  const { pathname, state } = useLocation();
  const notice = (state as { notice?: string } | null)?.notice ?? null;
  // Each new screen starts at the top, as a player expects when changing page.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  const level = character ? levelFromXp(character.totalXp, defaultProgressionConfig.characterLevels).level : null;

  return (
    <div className="min-h-dvh lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-gold-300 focus:px-4 focus:py-2 focus:text-abyss">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-iron/70 bg-obsidian/80 backdrop-blur lg:flex">
        <div className="px-6 pb-6 pt-8">
          <p className="font-display text-xl font-semibold tracking-[0.12em] text-gold-200">The Ascendant</p>
          <div className="mt-3 h-px bg-gradient-to-r from-gold-500/70 to-transparent" />
        </div>
        {character && (
          <div className="mx-4 mb-6 flex items-center gap-3 rounded-panel border border-iron bg-charcoal/60 p-3">
            <Crest tinctureId={character.appearance.tinctureId} classId={character.classId} size="sm" />
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold text-gold-100">{character.name}</p>
              <p className="truncate text-xs text-ash">
                Level {level} · {findRace(character.raceId)?.name} {findClass(character.classId)?.name}
              </p>
            </div>
          </div>
        )}
        <nav aria-label="Main" className="flex flex-col gap-1 px-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end ?? false}
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors',
                  isActive ? 'bg-gold-600/20 text-gold-100 shadow-[inset_2px_0_0_var(--color-gold-300)]' : 'text-ash hover:bg-slate/50 hover:text-ink',
                )
              }
            >
              <item.icon className="size-5" aria-hidden />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <p className="mt-auto truncate px-6 pb-6 text-xs text-smoke">
          {status.state === 'signed-in' ? `Signed in as ${status.user.email ?? 'player'}` : 'Not signed in'}
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-iron/60 bg-abyss/85 px-4 py-3 backdrop-blur pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden">
          <p className="font-display text-base font-semibold tracking-[0.12em] text-gold-200">The Ascendant</p>
          {character && <Crest tinctureId={character.appearance.tinctureId} classId={character.classId} size="sm" className="w-8" />}
        </header>

        {isSample && (
          <div className="border-b border-arcane/40 bg-arcane/10 px-4 py-2.5 sm:px-8">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm text-ink">
                <FlaskConical className="size-4 text-arcane" aria-hidden />
                <span>
                  <strong className="font-semibold">Sample data.</strong> <span className="text-ash">A pretend adventurer for previewing the design. Nothing here is saved to your account.</span>
                </span>
              </p>
              <Button variant="ghost" onClick={exitSample} className="min-h-9 text-arcane hover:text-ink">
                Exit sample
              </Button>
            </div>
          </div>
        )}

        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-6 sm:px-8 sm:pt-10 lg:pb-12">
          {storageWarning && (
            <Notice tone="warning" title="Saving problem" className="mb-6">
              {storageWarning}
            </Notice>
          )}
          {notice && <Notice className="mb-6">{notice}</Notice>}
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-iron/70 bg-obsidian/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end ?? false}
            className={({ isActive }) =>
              cn('flex min-h-16 flex-col items-center justify-center gap-1 text-[0.7rem] font-medium tracking-wide', isActive ? 'text-gold-200' : 'text-smoke hover:text-ash')
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className={cn('size-5', isActive && 'drop-shadow-[0_0_6px_var(--color-gold-500)]')} aria-hidden />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
