"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useSession } from "@/lib/session";
import { boardsFor } from "@/lib/roles";
import { KpiStrip, type OverviewMode, TrendCard, UPCOMING_DAYS } from "@/components/Kpis";
import { PipelineCard } from "@/components/Pipeline";
import { MiniCalendar } from "@/components/Calendar";
import { PageHeader } from "@/components/AppShell";
import { CardHeader, Skeleton } from "@/components/ui";
import { addDays, fmtDate, startOfDay, ymd } from "@/lib/dates";
import { upcoming } from "@/lib/kpi";
import type { BoardTraining } from "@/lib/types";

function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** The next 15 days of trainings from the board: when, who, what, how many, and the trainers. */
function UpcomingTrainings({ list, now, aed }: { list: BoardTraining[]; now: Date; aed: boolean }) {
  const next = useMemo(() => upcoming(list, now, UPCOMING_DAYS), [list, now]);
  const today = ymd(startOfDay(now));
  const tomorrow = ymd(addDays(startOfDay(now), 1));
  return (
    <section className="card p-5">
      <CardHeader
        title="Upcoming trainings"
        sub={next.length ? `${next.length} in the next ${UPCOMING_DAYS} days` : `Nothing scheduled in the next ${UPCOMING_DAYS} days`}
        right={<Link href="/follow-up" className="text-[13px] font-medium text-muted hover:text-ink">Open the board →</Link>}
      />
      {next.length === 0 ? (
        <p className="mt-6 pb-2 text-[13px] text-muted">When a training gets a date on the {aed ? "AedSmartx" : "Training"} board, it shows here.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {next.slice(0, 7).map(({ t, next: day }) => {
            const when = day === today ? "Today" : day === tomorrow ? "Tomorrow" : fmtDate(day, { weekday: "short", day: "numeric", month: "short" });
            const more = t.dates.length > 1 ? ` · ${t.dates.length} days` : "";
            return (
              <li key={t.id}>
                <Link href={`/follow-up?q=${encodeURIComponent(t.docNumber)}`} className="-mx-2 flex items-center gap-4 rounded-lg px-2 py-3 hover:bg-surface-2/70">
                  <span className={`w-24 shrink-0 text-[12.5px] font-semibold num ${day === today ? "text-brand" : "text-ink-2"}`}>
                    {when}
                    {t.time && <span className="block font-normal text-muted">{t.time}</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">{t.alias || t.customerName}</span>
                    <span className="block truncate text-xs text-muted">{t.training}{more}{t.trainers.length ? ` · ${t.trainers.map((n) => n.split(" ")[0]).join(", ")}` : ""}</span>
                  </span>
                  {t.people > 0 && <span className="shrink-0 text-xs font-medium text-muted num">{t.people} people</span>}
                  {t.status === "postponed" && <span className="shrink-0 rounded-full bg-medium-bg px-2 py-0.5 text-[11px] font-semibold text-medium">Postponed</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function OverviewPage() {
  const { ready, data, now } = useStore();
  const { member } = useSession();
  // Members without the Training board but with AedSmartx (Priyanka) see their own trainings against their own targets (AED_TARGETS), never the team's.
  const boards = member ? boardsFor(member) : ["training"];
  const mode: OverviewMode = !boards.includes("training") && boards.includes("aed") ? "aed" : "team";
  const list = (mode === "aed" ? data?.aedBoard : data?.board) ?? [];
  const has = ready && data && (mode === "aed" ? data.aedBoard : data.board);
  return (
    <>
      <PageHeader
        title={`${greeting(now)}`}
        sub={`${now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })} · Here’s how ${mode === "aed" ? "AED trainings" : "trainings"} are going`}
      />
      {data?.error && (
        <p className="mb-6 flex items-center gap-2.5 rounded-2xl bg-medium-bg px-4 py-3 text-[13.5px] text-ink-2">
          <span className="size-2 shrink-0 rounded-full bg-medium" />
          Zoho is busy right now. You’re seeing the figures from the last update{data.trainings.length ? ` (${new Date(data.syncedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })})` : ""} — they’ll refresh by themselves.
        </p>
      )}
      <div className="space-y-5">
        {has ? <KpiStrip trainings={data.trainings} board={list} now={now} mode={mode} aedWaiting={data.aedWaiting} /> : <Skeleton className="h-[236px]" />}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          {has ? <TrendCard trainings={data.trainings} board={list} now={now} mode={mode} /> : <Skeleton className="h-[520px]" />}
          <div className="xl:sticky xl:top-[60px] xl:self-start">
            <MiniCalendar />
          </div>
        </div>
        <div className={`grid gap-5 [&>*]:min-w-0 ${mode === "team" ? "lg:grid-cols-2" : ""}`}>
          {mode === "team" && (ready && data ? <PipelineCard pipeline={data.pipeline ?? []} trainings={data.trainings} now={now} orgId={data.orgId} /> : <Skeleton className="h-[420px]" />)}
          {has ? <UpcomingTrainings list={list} now={now} aed={mode === "aed"} /> : <Skeleton className="h-[420px]" />}
        </div>
      </div>
    </>
  );
}
