import { lazy, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthProvider.tsx';
import { GameProvider, useGame } from './GameProvider.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { AppShell } from '../layouts/AppShell.tsx';
import { FocusLayout } from '../layouts/FocusLayout.tsx';
import { PageFallback } from '../components/ui/PageFallback.tsx';
import { Notice } from '../components/ui/Notice.tsx';
import { Button } from '../components/ui/Button.tsx';

// Each page is its own bundle, loaded on first visit (keeps the initial download small).
const WelcomePage = lazy(() => import('../pages/WelcomePage.tsx'));
const SignInPage = lazy(() => import('../pages/SignInPage.tsx'));
const SignUpPage = lazy(() => import('../pages/SignUpPage.tsx'));
const ForgotPasswordPage = lazy(() => import('../pages/ForgotPasswordPage.tsx'));
const ResetPasswordPage = lazy(() => import('../pages/ResetPasswordPage.tsx'));
const CreateCharacterPage = lazy(() => import('../pages/CreateCharacterPage.tsx'));
const DashboardPage = lazy(() => import('../pages/DashboardPage.tsx'));
const CharacterSheetPage = lazy(() => import('../pages/CharacterSheetPage.tsx'));
const CampaignsPage = lazy(() => import('../pages/CampaignsPage.tsx'));
const CampaignPage = lazy(() => import('../pages/CampaignPage.tsx'));
const LessonPage = lazy(() => import('../pages/LessonPage.tsx'));
const CheckPage = lazy(() => import('../pages/CheckPage.tsx'));
const CodexPage = lazy(() => import('../pages/CodexPage.tsx'));
const WeaknessBankPage = lazy(() => import('../pages/WeaknessBankPage.tsx'));
const InventoryPage = lazy(() => import('../pages/InventoryPage.tsx'));
const SettingsPage = lazy(() => import('../pages/SettingsPage.tsx'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage.tsx'));

/** Welcome and sign-in screens: signed-in players go straight to the game. */
function SignedOutOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status.state === 'loading') return <PageFallback />;
  return status.state === 'signed-in' ? <Navigate to="/" replace /> : children;
}

/** Screens that need an account (or the sample preview). */
function RequireAccount({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const { isSample } = useGame();
  if (isSample) return children;
  if (status.state === 'loading') return <PageFallback />;
  return status.state === 'signed-in' ? children : <Navigate to="/welcome" replace />;
}

/** Waits for the player's records; shows a retry if they could not be loaded. */
function PlayerLoaded({ children }: { children: ReactNode }) {
  const { load, reload } = useGame();
  if (load.state === 'loading' || load.state === 'idle') return <PageFallback />;
  if (load.state === 'error') {
    return (
      <div className="mx-auto max-w-md py-12">
        <Notice tone="warning" title="Couldn’t load your adventure">
          {load.message}
        </Notice>
        <Button className="mt-4" onClick={() => void reload()}>
          Try again
        </Button>
      </div>
    );
  }
  return children;
}

/** Game screens need a character; new players are sent to character creation. */
function RequireCharacter({ children }: { children: ReactNode }) {
  const { player } = useGame();
  return (
    <RequireAccount>
      <PlayerLoaded>{player.character ? children : <Navigate to="/create" replace />}</PlayerLoaded>
    </RequireAccount>
  );
}

/** Character creation is for signed-in players without a character. */
function RequireNoCharacter({ children }: { children: ReactNode }) {
  const { player, isSample } = useGame();
  if (isSample) return <Navigate to="/" replace />;
  return (
    <RequireAccount>
      <PlayerLoaded>{player.character ? <Navigate to="/" replace /> : children}</PlayerLoaded>
    </RequireAccount>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <GameProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<FocusLayout />}>
                <Route path="/welcome" element={<SignedOutOnly><WelcomePage /></SignedOutOnly>} />
                <Route path="/sign-in" element={<SignedOutOnly><SignInPage /></SignedOutOnly>} />
                <Route path="/sign-up" element={<SignedOutOnly><SignUpPage /></SignedOutOnly>} />
                <Route path="/forgot-password" element={<SignedOutOnly><ForgotPasswordPage /></SignedOutOnly>} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/create" element={<RequireNoCharacter><CreateCharacterPage /></RequireNoCharacter>} />
              </Route>
              <Route element={<AppShell />}>
                <Route index element={<RequireCharacter><DashboardPage /></RequireCharacter>} />
                <Route path="/character" element={<RequireCharacter><CharacterSheetPage /></RequireCharacter>} />
                <Route path="/campaigns" element={<RequireCharacter><CampaignsPage /></RequireCharacter>} />
                <Route path="/campaigns/:campaignId" element={<RequireCharacter><CampaignPage /></RequireCharacter>} />
                <Route path="/campaigns/:campaignId/lesson/:lessonKey" element={<RequireCharacter><LessonPage /></RequireCharacter>} />
                <Route path="/campaigns/:campaignId/check/:checkKey" element={<RequireCharacter><CheckPage /></RequireCharacter>} />
                <Route path="/codex" element={<RequireCharacter><CodexPage /></RequireCharacter>} />
                <Route path="/weaknesses" element={<RequireCharacter><WeaknessBankPage /></RequireCharacter>} />
                <Route path="/inventory" element={<RequireCharacter><InventoryPage /></RequireCharacter>} />
                <Route path="/settings" element={<RequireAccount><PlayerLoaded><SettingsPage /></PlayerLoaded></RequireAccount>} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </GameProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
