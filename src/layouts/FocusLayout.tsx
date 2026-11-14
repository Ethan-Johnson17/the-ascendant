import { Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { PageFallback } from '../components/ui/PageFallback.tsx';
import { Notice } from '../components/ui/Notice.tsx';
import { useGame } from '../app/GameProvider.tsx';

/** Full-screen layout without navigation, for onboarding and character creation. */
export function FocusLayout() {
  const { pathname } = useLocation();
  const { storageWarning } = useGame();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pb-10 pt-[max(2rem,env(safe-area-inset-top))] sm:px-8">
      {storageWarning && (
        <Notice tone="warning" title="Saving problem" className="mb-6">
          {storageWarning}
        </Notice>
      )}
      <Suspense fallback={<PageFallback />}>
        <Outlet />
      </Suspense>
    </main>
  );
}
