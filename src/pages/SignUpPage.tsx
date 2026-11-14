import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { useAuth } from '../app/AuthProvider.tsx';
import { Button } from '../components/ui/Button.tsx';
import { TextField } from '../components/ui/TextField.tsx';
import { AuthFrame, authLink, FormError } from '../features/authentication/AuthFrame.tsx';
import { emailIssue, newPasswordIssue, PASSWORD_MIN_LENGTH } from '../features/authentication/validation.ts';

export default function SignUpPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (sentTo) {
    return (
      <AuthFrame
        title="Check your inbox"
        footer={
          <p>
            Already confirmed? <Link to="/sign-in" className={authLink}>Sign in</Link>
          </p>
        }
      >
        <div className="flex gap-4 rounded-panel border border-iron bg-obsidian/80 p-5">
          <MailCheck className="mt-0.5 size-6 shrink-0 text-gold-400" aria-hidden />
          <div className="text-sm text-ash" role="status">
            <p className="text-ink">
              We sent a confirmation link to <strong className="font-semibold">{sentTo}</strong>.
            </p>
            <p className="mt-2">Open it on this device to finish creating your account. It can take a minute or two; check your spam folder if it doesn’t arrive.</p>
          </div>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Create your account"
      subtitle="Your character and progress are saved to your account, so you can continue on any device."
      onSubmit={async (e) => {
        e.preventDefault();
        const issue = emailIssue(email) ?? newPasswordIssue(password, confirm);
        if (issue) return setError(issue);
        setBusy(true);
        const result = await signUp(email, password);
        setBusy(false);
        if (!result.ok) return setError(result.error);
        if (result.needsConfirmation) setSentTo(email.trim());
        else navigate('/', { replace: true });
      }}
      footer={
        <p>
          Already have an account? <Link to="/sign-in" className={authLink}>Sign in</Link>
        </p>
      }
    >
      <TextField label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <TextField
        label="Password"
        type="password"
        autoComplete="new-password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short phrase is easy to remember and hard to guess.`}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <TextField label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <FormError message={error} />
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? 'Creating account…' : 'Create account'}
      </Button>
    </AuthFrame>
  );
}
