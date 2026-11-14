import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../app/AuthProvider.tsx';
import { Button } from '../components/ui/Button.tsx';
import { TextField } from '../components/ui/TextField.tsx';
import { AuthFrame, authLink, FormError } from '../features/authentication/AuthFrame.tsx';
import { emailIssue } from '../features/authentication/validation.ts';

export default function SignInPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <AuthFrame
      title="Welcome back"
      subtitle="Sign in to continue your adventure."
      onSubmit={async (e) => {
        e.preventDefault();
        const issue = emailIssue(email) ?? (password === '' ? 'Enter your password.' : null);
        if (issue) return setError(issue);
        setBusy(true);
        const result = await signIn(email, password);
        setBusy(false);
        if (result.ok) navigate('/', { replace: true });
        else setError(result.error);
      }}
      footer={
        <>
          <p>
            <Link to="/forgot-password" className={authLink}>Forgot your password?</Link>
          </p>
          <p>
            New here? <Link to="/sign-up" className={authLink}>Create an account</Link>
          </p>
        </>
      }
    >
      <TextField label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <FormError message={error} />
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </AuthFrame>
  );
}
