"use client";

import { useEffect, useMemo, useState } from "react";
import { type DaySums, PEOPLE, type Period, change, inrShort, periods, sum, yearSoFar, ymdOf } from "@/lib/overviewMath";
import { useLive } from "@/lib/live";
import { TrainingGoals } from "./Kpis";
import type { BoardTraining } from "@/lib/types";
import { Skeleton } from "./ui";

/*
 * The Overview (owner, 16 Nov sketch; 17 Nov: "salesperson name as tabs and the rest reports go under them"): a tab per
 * person — Company, Sumit, Ashish, Pranjal, Shikha. Under each sales tab, all at once: today, this week, this month and
 * this financial year, quotations sent and invoiced in value, each against the period before; then the year so far (its
 * day number, the average a day, the day against that average) and a pick-your-dates card. Shikha only does training,
 * so her tab is the month's and the year's training goals.
 */

type Tab = (typeof PEOPLE)[number]["key"] | "shikha";
const TABS: { key: Tab; label: string }[] = [...PEOPLE.map((p) => ({ key: p.key as Tab, label: p.label })), { key: "shikha", label: "Shikha" }];
const TAB_KEY = "th.overview.tab";
const CARDS: Period[] = ["day", "week", "month", "year"];

const fmt = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
function title(kind: Period, on: string, isToday: boolean): string {
  if (isToday) return { day: "Today", week: "This week", month: "This month", year: "This year", custom: "Pick dates" }[kind];
  return { day: fmt(on), week: `Week to ${fmt(on)}`, month: `Month to ${fmt(on)}`, year: `Year to ${fmt(on)}`, custom: "Pick dates" }[kind];
}
function beforeWord(kind: Period, isToday: boolean): string {
  return { day: isToday ? "yesterday" : "the day before", week: "same days last week", month: "same days last month", year: "same days last year", custom: "the days just before" }[kind];
}

function Delta({ now, before }: { now: number; before: number }) {
  const c = change(now, before);
  if (c === null) return <span className="text-muted">nothing to compare</span>;
  const up = c >= 0;
  return <span className={`inline-flex items-center gap-0.5 font-semibold ${up ? "text-low" : "text-high"}`}>{up ? "▲" : "▼"} {Math.abs(c)}%</span>;
}

function Metric({ label, now, before, beforeLabel }: { label: string; now: number; before: number; beforeLabel: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p className="num mt-0.5 text-[24px] font-semibold leading-tight tracking-tight text-ink">{inrShort(now)}</p>
      <p className="num mt-0.5 text-[12.5px] text-ink-2"><Delta now={now} before={before} /> <span className="text-muted">vs {inrShort(before)} {beforeLabel}</span></p>
    </div>
  );
}

/** One period: quotations sent and invoiced, against the period before. */
function PeriodCard({ days, person, kind, on, isToday, custom, children }: { days: DaySums; person: string; kind: Period; on: string; isToday: boolean; custom?: { from: string; to: string }; children?: React.ReactNode }) {
  const span = periods(kind, on, custom);
  const a = sum(days, person, span.now.from, span.now.to), b = sum(days, person, span.before.from, span.before.to);
  const word = beforeWord(kind, isToday);
  return (
    <section className="card flex min-w-0 flex-col p-5" aria-label={title(kind, on, isToday)}>
      <h3 className="text-[15px] font-semibold text-ink">{title(kind, on, isToday)}</h3>
      <p className="num mt-0.5 truncate text-[12px] text-muted">{kind === "year" ? `${span.now.label}, this FY vs the last` : `${span.now.label} vs ${span.before.label}`}</p>
      {children}
      <div className="mt-4 grid gap-4">
        <Metric label="Quotations sent" now={a.quoted} before={b.quoted} beforeLabel={word} />
        <div className="border-t border-line pt-4"><Metric label="Invoiced" now={a.invoiced} before={b.invoiced} beforeLabel={word} /></div>
      </div>
    </section>
  );
}

/** The financial year so far: its day number, the average a day, the day against that average. */
function YearBlock({ days, person, on, isToday }: { days: DaySums; person: string; on: string; isToday: boolean }) {
  const y = yearSoFar(days, person, on);
  const dayWord = isToday ? "Today" : fmt(on);
  const vs = (t: number, avg: number) => {
    if (!avg) return <span className="text-muted">no average yet</span>;
    const c = change(t, avg)!;
    return <span className={c >= 0 ? "font-semibold text-low" : "font-semibold text-high"}>{c >= 0 ? "▲" : "▼"} {Math.abs(c)}% vs the daily average</span>;
  };
  return (
    <section className="card flex min-w-0 flex-col p-5" aria-label="Year so far">
      <h3 className="text-[15px] font-semibold text-ink">{y.label} so far <span className="num text-[12.5px] font-normal text-muted">· day {y.day}</span></h3>
      <div className="mt-4 grid flex-1 gap-5 sm:grid-cols-2">
        {([["Quotations", y.quoted, y.avgQuoted, y.todayQuoted], ["Invoiced", y.invoiced, y.avgInvoiced, y.todayInvoiced]] as const).map(([l, total, avg, t]) => (
          <div key={l} className="flex min-w-0 flex-col rounded-xl bg-surface-2/60 p-4">
            <p className="text-[12px] font-medium text-muted">{l}: average a day</p>
            <p className="num mt-0.5 text-[24px] font-semibold leading-tight tracking-tight text-ink">{inrShort(avg)}</p>
            <p className="num text-[12px] text-muted">{inrShort(total)} in {y.day} days</p>
            {/* The day against the average, as two bars */}
            <div className="mt-auto space-y-1.5 pt-4" aria-hidden>
              {([["Average", avg, "bg-muted/45"], [dayWord, t, t >= avg ? "bg-low" : "bg-high"]] as const).map(([k, v, c]) => (
                <div key={k} className="flex items-center gap-2 text-[11.5px] text-muted">
                  <span className="w-14 shrink-0 truncate">{k}</span>
                  <span className="h-2 flex-1 rounded-full bg-line"><span className={`block h-full rounded-full ${c}`} style={{ width: `${Math.max(2, Math.round((v / Math.max(avg, t, 1)) * 100))}%` }} /></span>
                </div>
              ))}
            </div>
            <p className="num mt-2.5 text-[12.5px] text-ink-2">{dayWord} {inrShort(t)} · {vs(t, avg)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function OverviewSales({ board, now }: { board: BoardTraining[] | null; now: Date }) {
  const [days, setDays] = useState<DaySums | null>(null);
  const [error, setError] = useState("");
  const today = ymdOf(now);
  const [tab, setTab] = useState<Tab>("all");
  const [on, setOn] = useState(today);
  const [custom, setCustom] = useState(() => { const d = new Date(now); d.setDate(d.getDate() - 6); return { from: ymdOf(d), to: today }; });
  const load = () => fetch("/api/overview", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j.days) { setDays(j.days); setError(""); } else setError(j.error ?? "Couldn't load the figures"); }).catch(() => setError("Couldn't reach the server"));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useLive(load, ["zoho"]); // a quote or invoice made anywhere shows within seconds
  // The tab each person last looked at stays in their browser (a convenience, so it may simply be gone).
  useEffect(() => { try { const t = localStorage.getItem(TAB_KEY); if (t && TABS.some((x) => x.key === t)) setTab(t as Tab); } catch {} }, []);
  const pick = (t: Tab) => { setTab(t); try { localStorage.setItem(TAB_KEY, t); } catch {} };
  const day = on > today ? today : on;
  const isToday = day === today;
  const box = "h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink";
  const current = TABS.find((t) => t.key === tab)!;
  const sub = useMemo(() => tab === "all" ? "All quotations and invoices, training included" : tab === "shikha" ? "Her month’s and year’s training goals" : `Quotations and invoices with ${current.label} as the salesperson`, [tab, current.label]);

  return (
    <div className="space-y-5">
      {/* Who: a tab per person; everything below is theirs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Whose figures" className="grid w-full grid-cols-5 rounded-xl bg-surface-2 p-1 sm:flex sm:w-auto">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => pick(t.key)} className={`h-9 rounded-lg px-1.5 text-[13px] font-medium transition sm:px-4 ${tab === t.key ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>{t.label}</button>
          ))}
        </div>
        {tab !== "shikha" && (
          <label className="flex items-center gap-1.5 text-[13px] text-muted">
            Looking at <input type="date" className={box} value={day} max={today} onChange={(e) => setOn(e.target.value || today)} aria-label="Which day" />
            {!isToday && <button type="button" onClick={() => setOn(today)} className="h-9 rounded-lg px-2.5 text-[13px] font-medium text-ink-2 hover:bg-surface-2">Today</button>}
          </label>
        )}
      </div>

      <p className="-mt-1 text-[13px] text-muted"><span className="font-semibold text-ink">{current.label}</span> · {sub}</p>

      {error && tab !== "shikha" && <p className="rounded-xl bg-high-bg px-4 py-3 text-[13px] text-high">{error}</p>}

      {tab === "shikha" ? (
        <section className="card overflow-hidden" aria-label="Shikha’s training goals">
          {board ? <TrainingGoals board={board} now={now} /> : <Skeleton className="m-5 h-[160px]" />}
        </section>
      ) : !days ? <Skeleton className="h-[420px]" /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {CARDS.map((k) => <PeriodCard key={k} days={days} person={tab} kind={k} on={day} isToday={isToday} />)}
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <YearBlock days={days} person={tab} on={day} isToday={isToday} />
            <PeriodCard days={days} person={tab} kind="custom" on={day} isToday={isToday} custom={custom}>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
                <input type="date" className={box} value={custom.from} max={today} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="From" />
                to
                <input type="date" className={box} value={custom.to} max={today} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="To" />
              </div>
            </PeriodCard>
          </div>
        </>
      )}
    </div>
  );
}
