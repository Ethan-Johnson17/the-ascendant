import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../app/AuthProvider.tsx';
import { Button } from '../components/ui/Button.tsx';
import { TextField } from '../components/ui/TextField.tsx';
import { PageFallback } from '../components/ui/PageFallback.tsx';
import { Notice } from '../components/ui/Notice.tsx';
import { AuthFrame, authLink, FormError } from '../features/authentication/AuthFrame.tsx';
import { newPasswordIssue, PASSWORD_MIN_LENGTH } from '../features/authentication/validation.ts';

/** Opened from the password-reset email. Supabase signs the player in from the link first. */
export default function ResetPasswordPage() {
  const { status, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status.state === 'loading') return <PageFallback />;

  if (status.state !== 'signed-in') {
    return (
      <AuthFrame
        title="Link expired"
        footer={
          <p>
            <Link to="/forgot-password" className={authLink}>Send a new reset link</Link>
          </p>
        }
      >
        <Notice tone="warning">This reset link has expired or was already used. Reset links work once and only for a short time.</Notice>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Choose a new password"
      subtitle={status.user.email ? `For ${status.user.email}` : undefined}
      onSubmit={async (e) => {
        e.preventDefault();
        const issue = newPasswordIssue(password, confirm);
        if (issue) return setError(issue);
        setBusy(true);
        const result = await updatePassword(password);
        setBusy(false);
        if (result.ok) navigate('/', { replace: true, state: { notice: 'Your password was changed.' } });
        else setError(result.error);
      }}
    >
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <TextField label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <FormError message={error} />
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? 'Saving…' : 'Save new password'}
      </Button>
    </AuthFrame>
  );
}
