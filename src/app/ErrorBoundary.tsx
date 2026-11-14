import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Last line of defence: if a screen crashes, show a calm recovery message instead of a blank page.
 * The player's save is untouched — it lives in storage, not in the crashed component.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Phase 7 routes this to error logging; for now the browser console keeps it.
    console.error('Screen crashed', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-gold-500">Something went wrong</p>
        <h1 className="font-display text-3xl font-semibold text-gold-200">The path collapsed</h1>
        <p className="text-ash">This screen hit an unexpected error. Your character and progress are safe.</p>
        <button
          type="button"
          onClick={() => window.location.assign('/')}
          className="mt-2 min-h-11 rounded-control bg-gold-300 px-5 font-medium text-abyss hover:bg-gold-200"
        >
          Return to the dashboard
        </button>
        <p className="mt-4 break-words text-xs text-smoke">{this.state.error.message}</p>
      </main>
    );
  }
}
