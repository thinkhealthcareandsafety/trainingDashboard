"use client";

import { useEffect, useState } from "react";
import { type DaySums, PEOPLE, type Side, change, inrShort, remarks, vsLastYear, ymdOf } from "@/lib/overviewMath";
import { useLive } from "@/lib/live";
import { TrainingGoals } from "./Kpis";
import type { BoardTraining } from "@/lib/types";
import { Skeleton } from "./ui";

/*
 * The Overview (owner, 16–17 Nov): a tab per person — Company, Sumit, Ashish, Pranjal, Shikha. Under each sales tab, four
 * rows: Daily, Weekly, Monthly, Yearly. Each row: this period on the left (today / this week / this month as they stand,
 * the FY so far), last year on the right (last FY's average day / week / month; the same days of last FY), quotations sent,
 * invoiced and the conversion on each side; a bar each for quotations and invoiced with the difference; and beside it a
 * Remarks card telling the story in plain lines. Shikha only does training, so her tab is her training goals.
 */

type Tab = (typeof PEOPLE)[number]["key"] | "shikha";
type Kind = "day" | "week" | "month" | "year";
const TABS: { key: Tab; label: string }[] = [...PEOPLE.map((p) => ({ key: p.key as Tab, label: p.label })), { key: "shikha", label: "Shikha" }];
const TAB_KEY = "th.overview.tab";
const ROWS: { kind: Kind; title: string; last: string }[] = [
  { kind: "day", title: "Daily", last: "Last year’s average day" },
  { kind: "week", title: "Weekly", last: "Last year’s average week" },
  { kind: "month", title: "Monthly", last: "Last year’s average month" },
  { kind: "year", title: "Yearly", last: "Last year, same days" },
];

const fmt = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
function nowTitle(kind: Kind, on: string, isToday: boolean): string {
  if (isToday) return { day: "Today", week: "This week", month: "This month", year: "This year so far" }[kind];
  return { day: fmt(on), week: `Week to ${fmt(on)}`, month: `Month to ${fmt(on)}`, year: `Year to ${fmt(on)}` }[kind];
}
function nowWord(kind: Kind, on: string, isToday: boolean): string {
  if (isToday) return { day: "today", week: "this week", month: "this month", year: "this year so far" }[kind];
  return { day: `on ${fmt(on)}`, week: "that week", month: "that month", year: `this year up to ${fmt(on)}` }[kind];
}

/** One side of a row: quotations sent, invoiced, conversion. */
function SideBox({ title, sub, s, tint }: { title: string; sub: string; s: Side; tint?: boolean }) {
  const cell = (label: string, value: string) => (
    <div className="min-w-0">
      <p className="text-[11.5px] font-medium text-muted">{label}</p>
      <p className="num mt-0.5 truncate text-[19px] font-semibold leading-tight tracking-tight text-ink sm:text-[22px]">{value}</p>
    </div>
  );
  return (
    <div className={`min-w-0 rounded-xl p-4 ${tint ? "bg-surface-2/70" : "border border-line"}`}>
      <p className="text-[13.5px] font-semibold text-ink">{title}</p>
      <p className="num truncate text-[12px] text-muted">{sub}</p>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {cell("Quotations", inrShort(s.quoted))}
        {cell("Invoiced", inrShort(s.invoiced))}
        {cell("Conversion", s.conversion === null ? "—" : `${s.conversion}%`)}
      </div>
    </div>
  );
}

/** This period against last year, as two bars, with the difference in ₹ and %. */
function Bar({ label, now, last, nowLabel }: { label: string; now: number; last: number; nowLabel: string }) {
  const max = Math.max(now, last, 1);
  const up = now >= last;
  const c = change(now, last);
  const w = (v: number) => `${v > 0 ? Math.max(2, Math.round((v / max) * 100)) : 0}%`;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-[12.5px] font-semibold text-ink">{label}</p>
        <p className={`num text-[12.5px] font-semibold ${up ? "text-low" : "text-high"}`}>
          {up ? "▲" : "▼"} {inrShort(Math.abs(now - last))} {up ? "more" : "less"}{c !== null && ` · ${Math.abs(c)}%`}
        </p>
      </div>
      {/* One bar: this period only (owner: no last-year bar), scaled to the larger of the two */}
      <div className="mt-2 flex items-center gap-2 text-[11.5px] text-muted" aria-hidden>
        <span className="w-20 shrink-0 truncate">{nowLabel}</span>
        <span className="h-2.5 flex-1 rounded-full bg-line"><span className={`block h-full rounded-full ${up ? "bg-low" : "bg-high"}`} style={{ width: w(now) }} /></span>
      </div>
    </div>
  );
}

function Row({ days, person, kind, title, lastTitle, on, isToday }: { days: DaySums; person: string; kind: Kind; title: string; lastTitle: string; on: string; isToday: boolean }) {
  const v = vsLastYear(days, person, kind, on);
  const nt = nowTitle(kind, on, isToday);
  const fy = (() => { const d = new Date(`${on}T00:00:00`); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `FY ${String(y - 1).slice(2)}-${String(y).slice(2)}`; })();
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="card min-w-0 p-5" aria-label={title}>
        <h3 className="text-[16px] font-semibold text-ink">{title}</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <SideBox title={nt} sub={v.label} s={v.now} />
          <SideBox tint title={lastTitle} sub={kind === "year" ? `${fy}, up to the same date` : `${fy} ÷ ${kind === "day" ? "its days" : kind === "week" ? "its weeks" : "12"}`} s={v.last} />
        </div>
        <div className="mt-4 grid gap-5 border-t border-line pt-4 md:grid-cols-2">
          <Bar label="Quotations sent" now={v.now.quoted} last={v.last.quoted} nowLabel={nt.replace(" so far", "")} />
          <Bar label="Invoiced" now={v.now.invoiced} last={v.last.invoiced} nowLabel={nt.replace(" so far", "")} />
        </div>
      </section>
      <aside className="card min-w-0 p-5" aria-label={`${title} remarks`}>
        <h4 className="text-[13.5px] font-semibold text-ink">Remarks</h4>
        <ul className="mt-2.5 space-y-2 text-[13px] leading-snug text-ink-2">
          {remarks(v, nowWord(kind, on, isToday)).map((l) => <li key={l} className="flex gap-2"><span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-muted/60" />{l}</li>)}
        </ul>
      </aside>
    </div>
  );
}

export function OverviewSales({ board, now }: { board: BoardTraining[] | null; now: Date }) {
  const [days, setDays] = useState<DaySums | null>(null);
  const [error, setError] = useState("");
  const today = ymdOf(now);
  const [tab, setTab] = useState<Tab>("all");
  const [on, setOn] = useState(today);
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
  const sub = tab === "all" ? "All quotations and invoices, training included, against last year" : tab === "shikha" ? "Her month’s and year’s training goals" : `Quotations and invoices with ${current.label} as the salesperson, against last year`;

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
      ) : !days ? <Skeleton className="h-[520px]" /> : (
        <div className="space-y-4">
          {ROWS.map((r) => <Row key={r.kind} days={days} person={tab} kind={r.kind} title={r.title} lastTitle={r.last} on={day} isToday={isToday} />)}
        </div>
      )}
    </div>
  );
}
