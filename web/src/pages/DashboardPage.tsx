import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  usePhoneNumbers,
  useConversations,
  useReleaseNumber,
  useMarkRead,
  type PhoneNumber,
  type ConversationSummary,
} from '../api/queries';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import {
  formatPhone,
  areaTag,
  opHandle,
  timeAgo,
  timeUtc6,
  pad3,
} from '../lib/format';
import { IconPhone, IconChat, IconPower, IconArrowRight } from '../components/icons';

const eyebrow =
  'font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground';

export default function DashboardPage() {
  const { user } = useAuth();
  const numbersQ = usePhoneNumbers();
  const convosQ = useConversations();
  const navigate = useNavigate();
  const { push } = useToast();
  const release = useReleaseNumber();
  const markRead = useMarkRead();
  const isAdmin = user?.role === 'admin';

  const numbers = numbersQ.data ?? [];
  const gridNumbers = numbers.filter((n) => n.operationalStatus !== 'released');

  function openInbox(n: PhoneNumber) {
    push({
      variant: 'success',
      title: 'Connection established',
      message: `Opening secure inbox for ${formatPhone(n.e164Number)}`,
    });
    navigate(`/inbox?number=${n.id}`);
  }

  async function onRelease(n: PhoneNumber) {
    if (
      !window.confirm(
        `Release ${formatPhone(n.e164Number)}? It will be unassigned and marked released.`,
      )
    )
      return;
    try {
      await release.mutateAsync(n.id);
      push({
        variant: 'success',
        title: 'Number released',
        message: `${formatPhone(n.e164Number)} has been released.`,
      });
    } catch (e) {
      push({
        variant: 'error',
        title: 'Release failed',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  }

  function inspect(c: ConversationSummary) {
    if (c.unread) markRead.mutate(c.id);
    navigate(`/inbox?conversation=${c.id}&focus=1`);
  }

  return (
    <div className="space-y-8">
      <div>
        <div className={eyebrow}>Operations Overview</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-[38px]">
          Dashboard
        </h1>
      </div>

      <section>
        <SectionHeader
          title="Active numbers"
          right={
            numbers.length
              ? `Showing ${gridNumbers.length} of ${numbers.length}`
              : undefined
          }
        />
        {numbersQ.isLoading ? (
          <GridSkeleton />
        ) : numbersQ.isError ? (
          <ErrorBox
            label="Failed to load numbers"
            onRetry={() => numbersQ.refetch()}
          />
        ) : gridNumbers.length === 0 ? (
          <EmptyBox
            label="No active numbers"
            hint={
              isAdmin
                ? 'Provision numbers on the Numbers page.'
                : 'No numbers assigned to you yet.'
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {gridNumbers.map((n) => (
              <NumberCard
                key={n.id}
                n={n}
                isAdmin={isAdmin}
                onOpen={() => openInbox(n)}
                onRelease={() => onRelease(n)}
                releasing={release.isPending}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader
          title="Conversation stream"
          rightNode={
            <button
              onClick={() => navigate('/inbox')}
              className="flex items-center gap-1 text-[13px] text-primary transition hover:opacity-80"
            >
              View all <IconArrowRight className="h-3.5 w-3.5" />
            </button>
          }
        />
        {convosQ.isLoading ? (
          <div className="rounded-[10px] border border-border bg-card p-6 text-sm text-muted-foreground">
            Loading stream…
          </div>
        ) : convosQ.isError ? (
          <ErrorBox
            label="Failed to load conversations"
            onRetry={() => convosQ.refetch()}
          />
        ) : (convosQ.data?.length ?? 0) === 0 ? (
          <EmptyBox label="No conversations yet" />
        ) : (
          <StreamTable rows={convosQ.data!} onInspect={inspect} />
        )}
      </section>
    </div>
  );
}

function NumberCard({
  n,
  isAdmin,
  onOpen,
  onRelease,
  releasing,
}: {
  n: PhoneNumber;
  isAdmin: boolean;
  onOpen: () => void;
  onRelease: () => void;
  releasing: boolean;
}) {
  const active = n.operationalStatus === 'active';
  return (
    <div
      className={`rounded-[10px] border bg-card p-4 ${active ? 'border-primary/30' : 'border-border'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconPhone className="h-4 w-4 text-primary" />
          <span className="font-mono text-[17px] font-medium text-foreground">
            {formatPhone(n.e164Number)}
          </span>
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
            active
              ? 'border-primary/40 text-primary'
              : 'border-warning/40 text-warning'
          }`}
        >
          {active ? 'Active' : 'Idle'}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-3 text-[11px]">
        <span className="font-mono text-muted-foreground">
          [{areaTag(n.e164Number)}]
        </span>
        <span className={n.assignedUser ? 'text-primary' : 'text-warning'}>
          OP:{opHandle(n.assignedUser?.email)}
        </span>
      </div>

      <div className="my-3.5 border-t border-border" />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className={eyebrow}>Msgs today</div>
          <div className="mt-0.5 font-mono text-xl font-medium text-foreground">
            {pad3(n.messagesToday)}
          </div>
        </div>
        <div>
          <div className={eyebrow}>Last active</div>
          <div className="mt-0.5 font-mono text-sm font-medium text-foreground">
            {timeAgo(n.lastActivityAt)}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={onOpen}
          className="flex flex-1 items-center justify-center gap-2 rounded-[7px] border border-border px-3 py-2 text-[13px] text-foreground transition hover:border-primary hover:text-primary"
        >
          <IconChat className="h-3.5 w-3.5" />
          Open inbox
        </button>
        {isAdmin && (
          <button
            onClick={onRelease}
            disabled={releasing}
            title="Release number"
            className="rounded-[7px] border border-border p-2 text-muted-foreground transition hover:border-destructive hover:text-destructive disabled:opacity-50"
          >
            <IconPower className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function StreamTable({
  rows,
  onInspect,
}: {
  rows: ConversationSummary[];
  onInspect: (c: ConversationSummary) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-border bg-card">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Time (UTC+6)</th>
            <th className="px-4 py-3 font-medium">Source</th>
            <th className="px-4 py-3 font-medium">Target</th>
            <th className="px-4 py-3 font-medium">Payload snippet</th>
            <th className="px-4 py-3 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-border/60 last:border-0">
              <td className="px-4 py-3">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    c.unread ? 'bg-primary' : 'bg-muted-foreground/40'
                  }`}
                />
              </td>
              <td className="px-4 py-3 font-mono text-muted-foreground">
                {timeUtc6(c.lastMessageAt)}
              </td>
              <td className="px-4 py-3 font-mono text-foreground">
                {formatPhone(c.contactNumber)}
              </td>
              <td className="px-4 py-3 font-mono text-muted-foreground">
                <span className="text-muted-foreground/60">→ </span>
                {formatPhone(c.workerNumber.e164Number)}
              </td>
              <td className="max-w-[36ch] truncate px-4 py-3 text-muted-foreground">
                {c.lastMessage?.body ?? '—'}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => onInspect(c)}
                  className="text-[12px] text-muted-foreground transition hover:text-primary"
                >
                  Inspect
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionHeader({
  title,
  right,
  rightNode,
}: {
  title: string;
  right?: string;
  rightNode?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
      {rightNode ??
        (right && (
          <span className="text-[12px] text-muted-foreground">{right}</span>
        ))}
    </div>
  );
}

function ErrorBox({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="rounded-[10px] border border-destructive/40 bg-card p-6 text-center">
      <div className="text-sm text-destructive">{label}</div>
      <button
        onClick={onRetry}
        className="mt-2 rounded-[7px] border border-border px-3 py-1 text-[12px] text-muted-foreground transition hover:text-foreground"
      >
        Retry
      </button>
    </div>
  );
}

function EmptyBox({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="rounded-[10px] border border-dashed border-border bg-card p-8 text-center">
      <div className="text-sm text-muted-foreground">{label}</div>
      {hint && <div className="mt-1 text-[12px] text-muted-foreground/70">{hint}</div>}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-44 animate-pulse rounded-[10px] border border-border bg-card"
        />
      ))}
    </div>
  );
}
