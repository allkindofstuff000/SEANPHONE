import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { User } from '../../auth/AuthContext';

type LedgerEntry = {
  id: string;
  amount: number;
  reason: string;
  balanceAfter: number;
  relatedMessageId: string | null;
  createdAt: string;
};

const inputCls =
  'rounded-[10px] border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60';
const btnPrimary =
  'rounded-[7px] bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50';
const btnGhost =
  'rounded-[7px] border border-border px-2 py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-primary';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { users } = await api.get<{ users: User[] }>('/users');
      setUsers(users);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-sm font-semibold tracking-widest text-foreground">
          TEAM <span className="text-muted-foreground">// OPERATORS</span>
        </h1>
        <button onClick={() => setShowCreate((v) => !v)} className={btnPrimary}>
          {showCreate ? 'CLOSE' : 'NEW WORKER'}
        </button>
      </div>

      {showCreate && (
        <CreateWorker
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {error && (
        <div className="mt-4 border border-destructive/50 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-[10px] border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-background/40 text-left text-[10px] tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">EMAIL</th>
              <th className="px-4 py-2 font-medium">ROLE</th>
              <th className="px-4 py-2 font-medium">STATUS</th>
              <th className="px-4 py-2 font-medium">CREDITS</th>
              <th className="px-4 py-2 font-medium">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  LOADING…
                </td>
              </tr>
            ) : (
              users.map((u) => <UserRow key={u.id} user={u} onChange={load} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateWorker({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [credits, setCredits] = useState('0');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.post('/users', {
        email,
        password,
        initialCredits: Number(credits) || 0,
      });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create worker');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-4 grid gap-3 rounded-[10px] border border-border bg-card p-4 sm:grid-cols-4"
    >
      <input
        required
        type="email"
        placeholder="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={inputCls}
      />
      <input
        required
        type="password"
        placeholder="temp password (min 8)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={inputCls}
      />
      <input
        type="number"
        min="0"
        placeholder="initial credits"
        value={credits}
        onChange={(e) => setCredits(e.target.value)}
        className={inputCls}
      />
      <button disabled={busy} className={btnPrimary}>
        {busy ? 'CREATING…' : 'CREATE WORKER'}
      </button>
      {err && <div className="text-xs text-destructive sm:col-span-4">{err}</div>}
    </form>
  );
}

function UserRow({ user, onChange }: { user: User; onChange: () => void }) {
  const [open, setOpen] = useState<null | 'credits' | 'ledger'>(null);
  const [busy, setBusy] = useState(false);

  async function toggleActive() {
    setBusy(true);
    try {
      await api.patch(`/users/${user.id}`, { isActive: !user.isActive });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    const pw = window.prompt(`New password for ${user.email} (min 8 chars):`);
    if (!pw) return;
    try {
      await api.patch(`/users/${user.id}`, { password: pw });
      window.alert('Password updated.');
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to update password');
    }
  }

  return (
    <>
      <tr className="border-t border-border">
        <td className="px-4 py-2 text-foreground">{user.email}</td>
        <td className="px-4 py-2 uppercase text-muted-foreground">{user.role}</td>
        <td className="px-4 py-2">
          {user.isActive ? (
            <span className="text-primary">ACTIVE</span>
          ) : (
            <span className="text-muted-foreground">DISABLED</span>
          )}
        </td>
        <td className="px-4 py-2 font-semibold text-foreground">
          {user.creditBalance}
        </td>
        <td className="px-4 py-2">
          <div className="flex flex-wrap gap-2">
            <button onClick={toggleActive} disabled={busy} className={btnGhost}>
              {user.isActive ? 'DISABLE' : 'ENABLE'}
            </button>
            <button
              onClick={() => setOpen(open === 'credits' ? null : 'credits')}
              className={btnGhost}
            >
              CREDITS
            </button>
            <button
              onClick={() => setOpen(open === 'ledger' ? null : 'ledger')}
              className={btnGhost}
            >
              LEDGER
            </button>
            <button onClick={resetPassword} className={btnGhost}>
              RESET PW
            </button>
          </div>
        </td>
      </tr>
      {open === 'credits' && (
        <tr className="bg-background/40">
          <td colSpan={5} className="px-4 py-3">
            <CreditsPanel user={user} onDone={onChange} />
          </td>
        </tr>
      )}
      {open === 'ledger' && (
        <tr className="bg-background/40">
          <td colSpan={5} className="px-4 py-3">
            <LedgerPanel userId={user.id} />
          </td>
        </tr>
      )}
    </>
  );
}

function CreditsPanel({ user, onDone }: { user: User; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('Top-up');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function apply() {
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/users/${user.id}/credits/adjust`, {
        amount: Number(amount),
        reason,
      });
      setAmount('');
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to adjust credits');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">
        Adjust credits (negative to deduct):
      </span>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="e.g. 100 or -20"
        className={`w-36 ${inputCls}`}
      />
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="reason"
        className={`w-48 ${inputCls}`}
      />
      <button disabled={busy || !amount} onClick={apply} className={btnPrimary}>
        APPLY
      </button>
      {err && <span className="text-xs text-destructive">{err}</span>}
    </div>
  );
}

function LedgerPanel({ userId }: { userId: string }) {
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ entries: LedgerEntry[] }>(`/users/${userId}/ledger`)
      .then((r) => setEntries(r.entries))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load'));
  }, [userId]);

  if (err) return <div className="text-xs text-destructive">{err}</div>;
  if (!entries) return <div className="text-xs text-muted-foreground">Loading…</div>;
  if (entries.length === 0)
    return <div className="text-xs text-muted-foreground">No ledger entries yet.</div>;

  return (
    <table className="w-full text-xs">
      <thead className="text-left text-[10px] tracking-widest text-muted-foreground">
        <tr>
          <th className="py-1 pr-2 font-medium">WHEN</th>
          <th className="pr-2 font-medium">AMOUNT</th>
          <th className="pr-2 font-medium">BALANCE AFTER</th>
          <th className="font-medium">REASON</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.id} className="border-t border-border">
            <td className="py-1 pr-2 text-muted-foreground">
              {new Date(e.createdAt).toLocaleString()}
            </td>
            <td
              className={`pr-2 font-medium ${e.amount < 0 ? 'text-destructive' : 'text-primary'}`}
            >
              {e.amount > 0 ? `+${e.amount}` : e.amount}
            </td>
            <td className="pr-2 text-foreground">{e.balanceAfter}</td>
            <td className="text-muted-foreground">{e.reason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
