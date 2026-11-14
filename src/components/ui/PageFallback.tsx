import { LoaderCircle } from 'lucide-react';

/** Shown for the moment a page's code is loading. */
export function PageFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status">
      <LoaderCircle className="size-6 animate-spin text-gold-500" aria-hidden />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
