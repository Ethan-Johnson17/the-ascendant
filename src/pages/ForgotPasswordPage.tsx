import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { useAuth } from '../app/AuthProvider.tsx';
import { Button } from '../components/ui/Button.tsx';
import { TextField } from '../components/ui/TextField.tsx';
import { AuthFrame, authLink, FormError } from '../features/authentication/AuthFrame.tsx';
import { emailIssue } from '../features/authentication/validation.ts';

export default function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const footer = (
    <p>
      Remembered it? <Link to="/sign-in" className={authLink}>Sign in</Link>
    </p>
  );

  if (sent) {
    return (
      <AuthFrame title="Check your inbox" footer={footer}>
        <div className="flex gap-4 rounded-panel border border-iron bg-obsidian/80 p-5" role="status">
          <MailCheck className="mt-0.5 size-6 shrink-0 text-gold-400" aria-hidden />
          <p className="text-sm text-ash">
            If an account exists for <strong className="font-semibold text-ink">{email.trim()}</strong>, we’ve sent it a link to choose a new password. Open it on this device.
          </p>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Reset your password"
      subtitle="Enter your account’s email and we’ll send you a link to choose a new password."
      onSubmit={async (e) => {
        e.preventDefault();
        const issue = emailIssue(email);
        if (issue) return setError(issue);
        setBusy(true);
        const result = await sendPasswordReset(email);
        setBusy(false);
        if (result.ok) setSent(true);
        else setError(result.error);
      }}
      footer={footer}
    >
      <TextField label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <FormError message={error} />
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? 'Sending…' : 'Send reset link'}
      </Button>
    </AuthFrame>
  );
}
