"use client";

import { useEffect, useMemo, useState } from "react";
import { type DaySums, PEOPLE, type Period, change, inrShort, periods, sum, yearSoFar, ymdOf } from "@/lib/overviewMath";
import { useLive } from "@/lib/live";
import { TrainingGoals } from "./Kpis";
import type { BoardTraining } from "@/lib/types";
import { Skeleton } from "./ui";

/*
 * The Overview (owner, 16 Nov sketch, replacing the old one entirely): 1 the company's quotations sent and invoiced, in
 * value; 2a today / this week / this month (or picked dates) against yesterday / last week / last month; 2b this
 * financial year so far — its day number, the average per day, today against that average. Then the same for Sumit,
 * Ashish and Pranjal; Shikha only does training, so hers is just the month's and the year's training goals.
 */

const PERIODS: { key: Period; label: string }[] = [{ key: "day", label: "Today" }, { key: "week", label: "This week" }, { key: "month", label: "This month" }, { key: "custom", label: "Pick dates" }];
const BEFORE: Record<Period, string> = { day: "the day before", week: "the same days last week", month: "the same days last month", year: "the same days last year", custom: "the days just before" };

function Delta({ now, before }: { now: number; before: number }) {
  const c = change(now, before);
  if (c === null) return <span className="text-muted">nothing to compare</span>;
  const up = c >= 0;
  return <span className={`inline-flex items-center gap-0.5 font-semibold ${up ? "text-low" : "text-high"}`}>{up ? "▲" : "▼"} {Math.abs(c)}%</span>;
}

function Metric({ label, now, before, beforeLabel, big }: { label: string; now: number; before: number; beforeLabel: string; big?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p className={`num mt-1 font-semibold tracking-tight text-ink ${big ? "text-[30px]" : "text-[22px]"}`}>{inrShort(now)}</p>
      <p className="num mt-1 text-[12.5px] text-ink-2"><Delta now={now} before={before} /> <span className="text-muted">vs {inrShort(before)} {beforeLabel}</span></p>
    </div>
  );
}

function YearBlock({ days, person, today, compact }: { days: DaySums; person: string; today: string; compact?: boolean }) {
  const y = yearSoFar(days, person, today);
  const vs = (t: number, avg: number) => {
    if (!avg) return <span className="text-muted">no average yet</span>;
    const c = change(t, avg)!;
    return <span className={c >= 0 ? "font-semibold text-low" : "font-semibold text-high"}>{c >= 0 ? "▲" : "▼"} {Math.abs(c)}% vs {compact ? "average" : "the daily average"}</span>;
  };
  return (
    <div className={compact ? "" : "rounded-2xl bg-surface-2/50 p-4"}>
      <p className="text-[12px] font-medium text-muted">{y.label} so far · <span className="num font-semibold text-ink-2">day {y.day}</span></p>
      <div className={`mt-2 grid gap-4 ${compact ? "grid-cols-2" : "sm:grid-cols-2"}`}>
        {([["Quotations", y.quoted, y.avgQuoted, y.todayQuoted], ["Invoiced", y.invoiced, y.avgInvoiced, y.todayInvoiced]] as const).map(([l, total, avg, t]) => (
          <div key={l} className="min-w-0">
            <p className="text-[12px] text-muted">{l}: average a day</p>
            <p className={`num font-semibold text-ink ${compact ? "text-[17px]" : "text-[22px]"}`}>{inrShort(avg)}<span className="ml-1.5 text-[12px] font-normal text-muted">({inrShort(total)} in {y.day} days)</span></p>
            <p className="num mt-0.5 text-[12.5px] text-ink-2">Today {inrShort(t)} · {vs(t, avg)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OverviewSales({ board, now }: { board: BoardTraining[] | null; now: Date }) {
  const [days, setDays] = useState<DaySums | null>(null);
  const [error, setError] = useState("");
  const today = ymdOf(now);
  const [kind, setKind] = useState<Period>("day");
  const [on, setOn] = useState(today);
  const [custom, setCustom] = useState({ from: today, to: today });
  const load = () => fetch("/api/overview", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j.days) { setDays(j.days); setError(""); } else setError(j.error ?? "Couldn't load the figures"); }).catch(() => setError("Couldn't reach the server"));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useLive(load, ["zoho"]); // a quote or invoice made anywhere shows within seconds
  const span = useMemo(() => periods(kind, on > today ? today : on, custom), [kind, on, custom, today]);
  const box = "h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink";
  const beforeLabel = BEFORE[kind];
  return (
    <div className="space-y-5">
      {/* The period, shared by every block below */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-surface-2 p-1">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" onClick={() => setKind(p.key)} className={`h-8 rounded-lg px-3 text-[13px] font-medium transition ${kind === p.key ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>{p.label}</button>
          ))}
        </div>
        {kind === "custom" ? (
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            <input type="date" className={box} value={custom.from} max={today} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="From" />
            to
            <input type="date" className={box} value={custom.to} max={today} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="To" />
          </span>
        ) : (
          <label className="flex items-center gap-1.5 text-[13px] text-muted">
            on <input type="date" className={box} value={on} max={today} onChange={(e) => setOn(e.target.value || today)} aria-label="Which day" />
          </label>
        )}
        <span className="num text-[12.5px] text-muted">{span.now.label} vs {span.before.label}</span>
      </div>

      {error && <p className="rounded-xl bg-high-bg px-4 py-3 text-[13px] text-high">{error}</p>}
      {!days ? <Skeleton className="h-[260px]" /> : (
        <>
          {/* 1 · The company */}
          <section className="card p-5 sm:p-6" aria-label="Company">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[17px] font-semibold text-ink">Company</h2>
              <span className="text-[12.5px] text-muted">All quotations and invoices, training included</span>
            </div>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              {(() => { const a = sum(days, "all", span.now.from, span.now.to), b = sum(days, "all", span.before.from, span.before.to); return (<>
                <Metric big label="Quotations sent" now={a.quoted} before={b.quoted} beforeLabel={beforeLabel} />
                <Metric big label="Invoiced" now={a.invoiced} before={b.invoiced} beforeLabel={beforeLabel} />
              </>); })()}
            </div>
            <div className="mt-5"><YearBlock days={days} person="all" today={today} /></div>
          </section>

          {/* The same for each person; Shikha: her training goals only */}
          <div className="grid gap-5 lg:grid-cols-2">
            {PEOPLE.filter((p) => p.key !== "all").map((p) => {
              const a = sum(days, p.key, span.now.from, span.now.to), b = sum(days, p.key, span.before.from, span.before.to);
              return (
                <section key={p.key} className="card p-5" aria-label={p.label}>
                  <h3 className="text-[16px] font-semibold text-ink">{p.label}</h3>
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <Metric label="Quotations sent" now={a.quoted} before={b.quoted} beforeLabel={beforeLabel} />
                    <Metric label="Invoiced" now={a.invoiced} before={b.invoiced} beforeLabel={beforeLabel} />
                  </div>
                  <div className="mt-4 border-t border-line pt-4"><YearBlock compact days={days} person={p.key} today={today} /></div>
                </section>
              );
            })}
            <section className="card overflow-hidden" aria-label="Shikha">
              <h3 className="px-5 pt-5 text-[16px] font-semibold text-ink">Shikha <span className="text-[12.5px] font-normal text-muted">· training goals</span></h3>
              {board ? <TrainingGoals board={board} now={now} /> : <Skeleton className="m-5 h-[160px]" />}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
