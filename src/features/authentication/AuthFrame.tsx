import type { FormEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../../app/AuthProvider.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
import { Ornament } from '../../components/ui/Ornament.tsx';

/** Shared frame for the sign-in screens: title, optional form, and links underneath. */
export function AuthFrame({
  title,
  subtitle,
  children,
  footer,
  onSubmit,
}: {
  title: string;
  subtitle?: string | undefined;
  children: ReactNode;
  footer?: ReactNode;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const { status } = useAuth();
  const body = onSubmit ? (
    <form noValidate onSubmit={onSubmit} className="space-y-5">
      {children}
    </form>
  ) : (
    <div className="space-y-5">{children}</div>
  );

  return (
    <div className="flex flex-1 flex-col justify-center py-6">
      <Link to="/welcome" className="-ml-1 mb-6 inline-flex min-h-11 w-fit items-center gap-1 text-sm text-ash hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden /> The Ascendant
      </Link>
      <div className="mx-auto w-full max-w-md">
        <h1 className="font-display text-3xl font-semibold tracking-wide text-gold-200">{title}</h1>
        {subtitle && <p className="mt-2 text-ash">{subtitle}</p>}
        <Ornament className="my-6" />
        {status.state === 'unconfigured' ? (
          <Notice tone="warning" title="Not connected">
            This copy of the game isn’t connected to its database yet, so accounts are unavailable. ({status.issues.join(' · ')})
          </Notice>
        ) : (
          body
        )}
        {footer && <div className="mt-8 space-y-2 text-center text-sm text-ash">{footer}</div>}
      </div>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  return (
    <div aria-live="assertive">
      {message && (
        <Notice tone="warning" className="mt-1">
          {message}
        </Notice>
      )}
    </div>
  );
}

export const authLink = 'font-medium text-gold-300 underline-offset-4 hover:text-gold-200 hover:underline';
