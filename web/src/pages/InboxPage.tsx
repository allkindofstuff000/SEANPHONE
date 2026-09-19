import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  usePhoneNumbers,
  useConversations,
  useConversation,
  useSendMessage,
  useMarkRead,
  useSimulateInbound,
  type ConversationSummary,
} from '../api/queries';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { formatPhone, timeUtc6, opHandle } from '../lib/format';
import { IconSearch, IconChat } from '../components/icons';

const mintBtn =
  'rounded-[7px] bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50';

export default function InboxPage() {
  const { user } = useAuth();
  const { push } = useToast();
  const [params, setParams] = useSearchParams();

  const numberFilter = params.get('number');
  const selectedId = params.get('conversation');
  const focused = params.get('focus') === '1';

  const [query, setQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [composing, setComposing] = useState(false);

  const convosQ = useConversations();
  const numbersQ = usePhoneNumbers();
  const markRead = useMarkRead();

  const myNumbers = (numbersQ.data ?? []).filter(
    (n) => n.operationalStatus !== 'released' && n.assignedUserId === user?.id,
  );

  const conversations = useMemo(() => {
    let all = convosQ.data ?? [];
    if (numberFilter) all = all.filter((c) => c.workerNumber.id === numberFilter);
    if (unreadOnly) all = all.filter((c) => c.unread);
    const q = query.trim().toLowerCase();
    if (q) {
      all = all.filter(
        (c) =>
          c.contactNumber.toLowerCase().includes(q) ||
          c.workerNumber.e164Number.toLowerCase().includes(q) ||
          (c.lastMessage?.body ?? '').toLowerCase().includes(q),
      );
    }
    return all;
  }, [convosQ.data, numberFilter, unreadOnly, query]);

  const selected = (convosQ.data ?? []).find((c) => c.id === selectedId) ?? null;

  // Mark read when a conversation is selected while unread.
  useEffect(() => {
    if (selectedId && selected?.unread) markRead.mutate(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selected?.unread]);

  function patchParams(mut: (p: URLSearchParams) => void) {
    const next = new URLSearchParams(params);
    mut(next);
    setParams(next, { replace: true });
  }

  function selectRow(id: string) {
    setComposing(false);
    patchParams((p) => {
      p.set('conversation', id);
      p.delete('focus');
    });
  }

  function openFocused() {
    if (!selectedId) return;
    patchParams((p) => p.set('focus', '1'));
  }

  function backToList() {
    patchParams((p) => p.delete('focus'));
  }

  if (focused && selectedId) {
    return <FocusedThread conversationId={selectedId} onBack={backToList} />;
  }

  return (
    <div>
      {/* Header block */}
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        Message Operations
      </div>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-[38px]">
        Messages
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Triage inbound traffic across every assigned line without losing the
        thread.
      </p>

      {/* Controls */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            className="w-full rounded-[10px] border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
          />
        </div>
        <button
          onClick={() => setUnreadOnly((v) => !v)}
          className={`rounded-[7px] border px-3 py-2 text-xs transition ${
            unreadOnly
              ? 'border-primary text-primary'
              : 'border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          Unread only
        </button>
      </div>

      {numberFilter && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-[7px] border border-primary/40 bg-card px-3 py-1.5 text-[12px] text-primary">
          Filtered to {formatPhone(conversations[0]?.workerNumber.e164Number ?? '')}
          <button
            onClick={() => patchParams((p) => p.delete('number'))}
            className="text-muted-foreground hover:text-foreground"
          >
            clear
          </button>
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Recent conversations */}
        <div className="overflow-hidden rounded-[10px] border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <div className="text-[15px] font-semibold">Recent conversations</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {convosQ.isLoading
                  ? 'loading…'
                  : `${conversations.length} active thread${conversations.length === 1 ? '' : 's'}`}
              </div>
            </div>
            <button
              onClick={() => {
                setComposing(true);
                patchParams((p) => {
                  p.delete('conversation');
                  p.delete('focus');
                });
              }}
              title="New message"
              className="text-muted-foreground transition hover:text-primary"
            >
              <IconChat className="h-5 w-5" />
            </button>
          </div>

          {convosQ.isLoading ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : convosQ.isError ? (
            <div className="px-5 py-10 text-center text-sm text-destructive">
              Failed to load conversations.
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              {unreadOnly ? 'No unread conversations.' : 'No conversations yet.'}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {conversations.map((c) => (
                <ConversationRow
                  key={c.id}
                  c={c}
                  active={c.id === selectedId}
                  onSelect={() => selectRow(c.id)}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Right panel */}
        <div>
          {composing ? (
            <NewMessage
              numbers={myNumbers.map((n) => ({
                id: n.id,
                e164Number: n.e164Number,
              }))}
              onCancel={() => setComposing(false)}
              onSent={() => {
                setComposing(false);
                push({
                  variant: 'success',
                  title: 'Message sent',
                  message: 'Transmission delivered to the gateway.',
                });
              }}
            />
          ) : selected ? (
            <SummaryPanel c={selected} onOpen={openFocused} />
          ) : (
            <div className="rounded-[10px] border border-border bg-card p-6 text-sm text-muted-foreground">
              Select a conversation to see its details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConversationRow({
  c,
  active,
  onSelect,
}: {
  c: ConversationSummary;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        onClick={onSelect}
        className={`block w-full px-5 py-3.5 text-left transition hover:bg-white/[0.02] ${
          active ? 'bg-white/[0.03]' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            {c.unread && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            )}
            <span className="truncate text-[14px] text-foreground">
              {formatPhone(c.contactNumber)}
            </span>
          </span>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {timeUtc6(c.lastMessageAt)}
          </span>
        </div>
        <div className="mt-1 truncate text-[12px] text-muted-foreground">
          {c.lastMessage
            ? `${c.lastMessage.direction === 'outbound' ? 'You: ' : ''}${c.lastMessage.body}`
            : '—'}
        </div>
        <div className="mt-1 font-mono text-[11px] text-muted-foreground/60">
          via {formatPhone(c.workerNumber.e164Number)}
        </div>
      </button>
    </li>
  );
}

function SummaryPanel({
  c,
  onOpen,
}: {
  c: ConversationSummary;
  onOpen: () => void;
}) {
  return (
    <div className="rounded-[10px] border border-border bg-card p-5">
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        Selected thread
      </div>
      <div className="mt-3 text-[15px] font-semibold text-foreground">
        {formatPhone(c.contactNumber)}
      </div>
      <div className="mt-0.5 font-mono text-[12px] text-muted-foreground">
        via {formatPhone(c.workerNumber.e164Number)} · OP:
        {opHandle(c.assignedWorker?.email)}
      </div>

      <div className="my-4 border-t border-border" />

      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        Queue status
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <span
          className={`h-1.5 w-1.5 rounded-full ${c.unread ? 'bg-primary' : 'bg-muted-foreground'}`}
        />
        <span className="text-foreground">
          {c.unread ? 'Unread — needs a reply' : 'Ready for review'}
        </span>
      </div>

      <button onClick={onOpen} className={`mt-5 w-full ${mintBtn}`}>
        Open focused conversation
      </button>
    </div>
  );
}

function FocusedThread({
  conversationId,
  onBack,
}: {
  conversationId: string;
  onBack: () => void;
}) {
  const { push } = useToast();
  const convoQ = useConversation(conversationId);
  const send = useSendMessage();
  const simulate = useSimulateInbound();
  const [body, setBody] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const convo = convoQ.data;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [convo?.messages.length]);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (!convo || !body.trim()) return;
    try {
      await send.mutateAsync({
        fromNumberId: convo.workerNumber.id,
        toNumber: convo.contactNumber,
        body,
      });
      setBody('');
    } catch (err) {
      push({
        variant: 'error',
        title: 'Send failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  async function onSimulate() {
    if (!convo) return;
    try {
      await simulate.mutateAsync({
        toNumber: convo.workerNumber.e164Number,
        fromNumber: convo.contactNumber,
        body: 'Acknowledged. Standing by. (simulated inbound)',
      });
    } catch {
      /* non-critical */
    }
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 text-[13px] text-muted-foreground transition hover:text-foreground"
      >
        ← Back to Messages
      </button>

      <div className="flex min-h-[520px] flex-col overflow-hidden rounded-[10px] border border-border bg-card">
        {convoQ.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading thread…</div>
        ) : convoQ.isError || !convo ? (
          <div className="p-6 text-sm text-destructive">
            Failed to load thread.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <div className="text-[15px] font-semibold text-foreground">
                  {formatPhone(convo.contactNumber)}
                </div>
                <div className="mt-0.5 font-mono text-[12px] text-muted-foreground">
                  via {formatPhone(convo.workerNumber.e164Number)} · OP:
                  {opHandle(convo.assignedWorker?.email)}
                </div>
              </div>
              <button
                onClick={onSimulate}
                disabled={simulate.isPending}
                title="Dev helper: simulate an incoming SMS from this contact"
                className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {simulate.isPending ? 'Simulating…' : 'Simulate reply'}
              </button>
            </div>

            <div className="flex-1 space-y-2.5 overflow-y-auto p-5">
              {convo.messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[72%] rounded-[10px] px-3.5 py-2 text-sm ${
                      m.direction === 'outbound'
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border bg-background text-foreground'
                    }`}
                  >
                    <div>{m.body}</div>
                    <div
                      className={`mt-1 font-mono text-[10px] ${
                        m.direction === 'outbound'
                          ? 'text-primary-foreground/70'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {timeUtc6(m.createdAt)}
                      {m.direction === 'outbound' && (
                        <>
                          {' · '}
                          <span
                            className={
                              m.status === 'delivered'
                                ? 'text-primary-foreground'
                                : m.status === 'failed' ||
                                    m.status === 'undelivered'
                                  ? 'font-semibold text-red-900'
                                  : 'text-primary-foreground/60'
                            }
                          >
                            {m.status === 'delivered' ? 'delivered ✓' : m.status}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={onSend} className="border-t border-border p-4">
              <div className="flex gap-2">
                <input
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Type a message…"
                  className="flex-1 rounded-[10px] border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
                />
                <button
                  type="submit"
                  disabled={send.isPending || !body.trim()}
                  className={mintBtn}
                >
                  {send.isPending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function NewMessage({
  numbers,
  onCancel,
  onSent,
}: {
  numbers: { id: string; e164Number: string }[];
  onCancel: () => void;
  onSent: () => void;
}) {
  const send = useSendMessage();
  const [fromNumberId, setFromNumberId] = useState(numbers[0]?.id ?? '');
  const [to, setTo] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await send.mutateAsync({ fromNumberId, toNumber: to, body });
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    }
  }

  return (
    <form onSubmit={submit} className="rounded-[10px] border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          New transmission
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          cancel
        </button>
      </div>

      {numbers.length === 0 ? (
        <div className="mt-4 text-sm text-muted-foreground">
          You have no active numbers assigned.
        </div>
      ) : (
        <>
          <label className="mt-4 block text-[12px] text-muted-foreground">
            From
            <select
              value={fromNumberId}
              onChange={(e) => setFromNumberId(e.target.value)}
              className="mt-1 w-full rounded-[10px] border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {numbers.map((n) => (
                <option key={n.id} value={n.id}>
                  {formatPhone(n.e164Number)}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 block text-[12px] text-muted-foreground">
            To
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="+1 555 123 4567"
              className="mt-1 w-full rounded-[10px] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
            />
          </label>

          <label className="mt-3 block text-[12px] text-muted-foreground">
            Message
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-[10px] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
            />
          </label>

          {error && <div className="mt-2 text-sm text-destructive">{error}</div>}

          <button
            type="submit"
            disabled={send.isPending || !fromNumberId || !to.trim() || !body.trim()}
            className={`mt-4 w-full ${mintBtn}`}
          >
            {send.isPending ? 'Sending…' : 'Send message'}
          </button>
        </>
      )}
    </form>
  );
}
