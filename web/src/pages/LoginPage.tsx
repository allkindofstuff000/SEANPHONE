import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { IconPhone } from '../components/icons';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-[12px] border border-border bg-card p-8"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <IconPhone className="h-4 w-4" />
          </span>
          <span className="text-sm font-bold tracking-tight text-foreground">
            SEANPHONE
          </span>
        </div>
        <div className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Secure access
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Sign in</h1>

        <label className="mt-6 block text-[12px] text-muted-foreground">
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-[10px] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
          />
        </label>

        <label className="mt-4 block text-[12px] text-muted-foreground">
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-[10px] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
          />
        </label>

        {error && (
          <div className="mt-4 rounded-[8px] border border-destructive/40 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-[8px] bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
