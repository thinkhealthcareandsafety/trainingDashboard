"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { KpiStrip, TrendCard } from "@/components/Kpis";
import { PipelineCard } from "@/components/Pipeline";
import { MiniCalendar } from "@/components/Calendar";
import { PageHeader } from "@/components/AppShell";
import { CardHeader, PriorityBadge, Skeleton } from "@/components/ui";
import { addDays, relativeDue, startOfDay } from "@/lib/dates";
import { effectiveStatus, isOpen } from "@/lib/followups";
import { PRIORITY_RANK } from "@/lib/priority";

function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function NeedsAttention() {
  const { followUps, now } = useStore();
  const endToday = addDays(startOfDay(now), 1);
  const list = followUps
    .map((f) => ({ f, s: effectiveStatus(f, now) }))
    .filter(({ f, s }) => isOpen(s) && s !== "snoozed" && new Date(f.dueAt) < endToday)
    .sort((a, b) => PRIORITY_RANK[a.f.priority] - PRIORITY_RANK[b.f.priority] || a.f.dueAt.localeCompare(b.f.dueAt));
  return (
    <section className="card p-5">
      <CardHeader
        title="Needs attention"
        sub={list.length ? `${list.length} follow-up${list.length > 1 ? "s" : ""} due today or overdue` : "Follow-ups due today"}
        right={<Link href="/follow-up" className="text-[13px] font-medium text-muted hover:text-ink">View all →</Link>}
      />
      {list.length === 0 ? (
        <p className="mt-6 pb-2 text-[13px] text-muted">You&apos;re all caught up.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {list.slice(0, 6).map(({ f, s }) => (
            <li key={f.id}>
              <Link href={`/follow-up?open=${f.id}`} className="-mx-2 flex items-center gap-4 rounded-lg px-2 py-3 hover:bg-surface-2/70">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium">{f.subject}</div>
                  <div className="truncate text-xs text-muted">{f.customerName} · {f.owner}</div>
                </div>
                <span className={`text-xs font-medium num ${s === "overdue" ? "text-high" : "text-muted"}`}>{relativeDue(f.dueAt, now)}</span>
                <span className="w-14 text-right"><PriorityBadge p={f.priority} compact /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function OverviewPage() {
  const { ready, data, now } = useStore();
  return (
    <>
      <PageHeader
        title={`${greeting(now)}`}
        sub={`${now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })} · Here’s how trainings are going`}
      />
      {data?.error && (
        <p className="mb-6 flex items-center gap-2.5 rounded-2xl bg-medium-bg px-4 py-3 text-[13.5px] text-ink-2">
          <span className="size-2 shrink-0 rounded-full bg-medium" />
          Zoho is busy right now. You’re seeing the figures from the last update{data.trainings.length ? ` (${new Date(data.syncedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })})` : ""} — they’ll refresh by themselves.
        </p>
      )}
      <div className="space-y-5">
        {ready && data ? <KpiStrip trainings={data.trainings} pipeline={data.pipeline ?? []} now={now} /> : <Skeleton className="h-[164px]" />}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          {ready && data ? <TrendCard trainings={data.trainings} now={now} /> : <Skeleton className="h-[520px]" />}
          <div className="xl:sticky xl:top-[60px] xl:self-start">
            <MiniCalendar />
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {ready && data ? <PipelineCard pipeline={data.pipeline ?? []} trainings={data.trainings} now={now} orgId={data.orgId} /> : <Skeleton className="h-[420px]" />}
          <NeedsAttention />
        </div>
      </div>
    </>
  );
}
