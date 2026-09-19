import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { User } from '../../auth/AuthContext';
import { formatPhone } from '../../lib/format';

type PhoneNumber = {
  id: string;
  e164Number: string;
  twilioSid: string | null;
  status: string;
  assignedUserId: string | null;
  assignedUser?: { id: string; email: string } | null;
  createdAt: string;
};

type Available = {
  e164Number: string;
  friendlyName?: string;
  locality?: string;
  region?: string;
};

const inputCls =
  'rounded-[10px] border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60';
const btnPrimary =
  'rounded-[7px] bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50';
const btnGhost =
  'rounded-[7px] border border-border px-2 py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-primary';

export default function AdminNumbersPage() {
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [areaCode, setAreaCode] = useState('');
  const [available, setAvailable] = useState<Available[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [providerName, setProviderName] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [n, u] = await Promise.all([
        api.get<{ numbers: PhoneNumber[] }>('/numbers'),
        api.get<{ users: User[] }>('/users'),
      ]);
      setNumbers(n.numbers);
      setUsers(u.users);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function search() {
    setSearching(true);
    setError(null);
    try {
      const q = areaCode ? `?areaCode=${encodeURIComponent(areaCode)}` : '';
      const r = await api.get<{ provider: string; numbers: Available[] }>(
        `/numbers/available${q}`,
      );
      setAvailable(r.numbers);
      setProviderName(r.provider);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  async function buy(e164: string) {
    try {
      await api.post('/numbers', { e164Number: e164 });
      setAvailable((a) => a?.filter((x) => x.e164Number !== e164) ?? null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Purchase failed');
    }
  }

  async function assign(id: string, userId: string) {
    try {
      await api.post(`/numbers/${id}/assign`, { userId: userId || null });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assign failed');
    }
  }

  async function release(id: string) {
    if (!window.confirm('Release this number? It will be unassigned.')) return;
    try {
      await api.post(`/numbers/${id}/release`, {});
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Release failed');
    }
  }

  return (
    <div>
      <h1 className="mb-3 text-sm font-semibold tracking-widest text-foreground">
        NUMBERS <span className="text-muted-foreground">// PROVISIONING</span>
      </h1>

      {error && (
        <div className="mb-4 border border-destructive/50 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Search / buy */}
      <div className="rounded-[10px] border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs tracking-widest text-muted-foreground">
            FIND A NUMBER
          </span>
          <input
            value={areaCode}
            onChange={(e) => setAreaCode(e.target.value)}
            placeholder="area code (e.g. 415)"
            className={`w-44 ${inputCls}`}
          />
          <button onClick={search} disabled={searching} className={btnPrimary}>
            {searching ? 'SEARCHING…' : 'SEARCH'}
          </button>
          {providerName && (
            <span className="border border-border px-2 py-0.5 text-[10px] tracking-widest text-muted-foreground">
              PROVIDER: {providerName.toUpperCase()}
            </span>
          )}
        </div>

        {available && (
          <div className="mt-4">
            {available.length === 0 ? (
              <div className="text-xs text-muted-foreground">No numbers found.</div>
            ) : (
              <ul className="divide-y divide-border">
                {available.map((a) => (
                  <li
                    key={a.e164Number}
                    className="flex items-center justify-between py-2"
                  >
                    <span className="text-sm text-foreground">
                      {formatPhone(a.e164Number)}
                      {(a.locality || a.region) && (
                        <span className="ml-2 text-muted-foreground">
                          {[a.locality, a.region].filter(Boolean).join(', ')}
                        </span>
                      )}
                    </span>
                    <button onClick={() => buy(a.e164Number)} className={btnGhost}>
                      BUY
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Provisioned numbers */}
      <div className="mt-4 overflow-x-auto rounded-[10px] border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-background/40 text-left text-[10px] tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">NUMBER</th>
              <th className="px-4 py-2 font-medium">STATUS</th>
              <th className="px-4 py-2 font-medium">ASSIGNED TO</th>
              <th className="px-4 py-2 font-medium">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  LOADING…
                </td>
              </tr>
            ) : numbers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  No numbers yet — search and buy one above.
                </td>
              </tr>
            ) : (
              numbers.map((n) => (
                <tr key={n.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium text-foreground">
                    {formatPhone(n.e164Number)}
                  </td>
                  <td className="px-4 py-2">
                    {n.status === 'active' ? (
                      <span className="text-primary">ACTIVE</span>
                    ) : (
                      <span className="uppercase text-muted-foreground">
                        {n.status}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={n.assignedUserId ?? ''}
                      onChange={(e) => assign(n.id, e.target.value)}
                      disabled={n.status !== 'active'}
                      className={`${inputCls} py-1 disabled:opacity-50`}
                    >
                      <option value="">— unassigned —</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.email}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    {n.status === 'active' && (
                      <button onClick={() => release(n.id)} className={btnGhost}>
                        RELEASE
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
