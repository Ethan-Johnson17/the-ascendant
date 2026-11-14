import { lazy, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { GameProvider, useGame } from './GameProvider.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { AppShell } from '../layouts/AppShell.tsx';
import { FocusLayout } from '../layouts/FocusLayout.tsx';

// Each page is its own bundle, loaded on first visit (keeps the initial download small).
const WelcomePage = lazy(() => import('../pages/WelcomePage.tsx'));
const CreateCharacterPage = lazy(() => import('../pages/CreateCharacterPage.tsx'));
const DashboardPage = lazy(() => import('../pages/DashboardPage.tsx'));
const CharacterSheetPage = lazy(() => import('../pages/CharacterSheetPage.tsx'));
const CampaignsPage = lazy(() => import('../pages/CampaignsPage.tsx'));
const SettingsPage = lazy(() => import('../pages/SettingsPage.tsx'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage.tsx'));

/** Screens that need a character send newcomers to the welcome screen. */
function RequireCharacter({ children }: { children: ReactNode }) {
  const { save } = useGame();
  return save.character ? children : <Navigate to="/welcome" replace />;
}

/** Onboarding screens send players who already have a character to the dashboard. */
function RequireNoCharacter({ children }: { children: ReactNode }) {
  const { save } = useGame();
  return save.character ? <Navigate to="/" replace /> : children;
}

export function App() {
  return (
    <ErrorBoundary>
      <GameProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<FocusLayout />}>
              <Route path="/welcome" element={<RequireNoCharacter><WelcomePage /></RequireNoCharacter>} />
              <Route path="/create" element={<RequireNoCharacter><CreateCharacterPage /></RequireNoCharacter>} />
            </Route>
            <Route element={<AppShell />}>
              <Route index element={<RequireCharacter><DashboardPage /></RequireCharacter>} />
              <Route path="/character" element={<RequireCharacter><CharacterSheetPage /></RequireCharacter>} />
              <Route path="/campaigns" element={<RequireCharacter><CampaignsPage /></RequireCharacter>} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </GameProvider>
    </ErrorBoundary>
  );
}
