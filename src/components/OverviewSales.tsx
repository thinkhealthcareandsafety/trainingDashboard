"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type DaySums, PEOPLE, type Remark, type Side, change, fyLines, fyRemarks, inrShort, monthly, remarks, vsLastYear, ymdOf } from "@/lib/overviewMath";
import { useLive } from "@/lib/live";
import { TrainingGoals } from "./Kpis";
import { OverviewChart } from "./OverviewChart";
import { OverviewFyChart } from "./OverviewFyChart";
import type { BoardTraining } from "@/lib/types";
import { Skeleton } from "./ui";
import { useSession } from "@/lib/session";
import { isAdmin, overviewSelf } from "@/lib/roles";

/** Admin: email today's report to Sumit now (owner, 18 Nov — it also goes by itself at 7 pm). */
function SendReport() {
  const [state, setState] = useState<"" | "busy" | "sent" | string>("");
  const send = async () => {
    setState("busy");
    const r = await fetch("/api/cron/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "daily" }) }).then((x) => x.json()).catch(() => ({ error: "Couldn't reach the server" }));
    setState(r.error ? r.error : "sent");
  };
  return (
    <span className="flex items-center gap-2 text-[12.5px]">
      <button type="button" disabled={state === "busy"} onClick={send} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-60" title="Emails today's summary to sshah@thinkhealth.in now. It also goes by itself at 7 pm (Mon–Sat), and the monthly one on the month's last day">
        {state === "busy" && <svg viewBox="0 0 24 24" width="13" height="13" className="animate-spin" aria-hidden><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>}
        {state === "busy" ? "Sending…" : "Email the report now"}
      </button>
      {state === "sent" && <span className="text-low">Sent to sshah@thinkhealth.in</span>}
      {state && state !== "busy" && state !== "sent" && <span className="max-w-[260px] truncate text-high" title={state}>{state}</span>}
    </span>
  );
}

/*
 * The Overview (owner, 16–17 Nov): a tab per person — Company, Sumit, Ashish, Pranjal, Shikha. Under each sales tab, four
 * rows: Daily, Weekly, Monthly, Yearly. Each row: this period (today / this week / this month as they stand, the year so
 * far) beside last year (last FY's average day / week / month; the same days of last FY), quotations, invoiced and the
 * conversion on each side; a bar each for quotations and invoiced with last year as a mark; and outside the box a Remarks
 * card in short lines, green when better, red when it needs to be better. Under the rows, a line chart month by month.
 * On a desktop it all fits the screen (the chart takes what's left). Shikha's tab is her training goals.
 */

type Tab = (typeof PEOPLE)[number]["key"] | "shikha";
type Kind = "day" | "week" | "month" | "year";
const TABS: { key: Tab; label: string }[] = [...PEOPLE.map((p) => ({ key: p.key as Tab, label: p.label })), { key: "shikha", label: "Shikha" }];
const TAB_KEY = "th.overview.tab";
/** Owner, 17 Nov: each salesperson is measured against the company's last year, not their own. */
const VS_COMPANY = true;
const ROWS: { kind: Kind; title: string; last: string }[] = [
  { kind: "day", title: "Daily", last: "Last year · average day" },
  { kind: "week", title: "Weekly", last: "Last year · average week" },
  { kind: "month", title: "Monthly", last: "Last year · average month" },
  { kind: "year", title: "Yearly", last: "Last year · same days" },
];

const fmt = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
function nowTitle(kind: Kind, on: string, isToday: boolean): string {
  if (isToday) return { day: "Today", week: "This week", month: "This month", year: "This year" }[kind];
  return { day: fmt(on), week: "That week", month: "That month", year: `Year to ${fmt(on)}` }[kind];
}
function nowWord(kind: Kind, on: string, isToday: boolean): string {
  if (isToday) return { day: "today", week: "this week", month: "this month", year: "this year so far" }[kind];
  return { day: `on ${fmt(on)}`, week: "that week", month: "that month", year: `this year up to ${fmt(on)}` }[kind];
}

/** One side of a row: quotations sent, invoiced, conversion. */
function SideBox({ title, lead, sub, s, tint, hint }: { title: string; lead?: string; sub?: string; s: Side; tint?: boolean; hint?: string }) {
  const cell = (label: string, value: string) => (
    <div className="min-w-0">
      <p className="text-[13.5px] font-medium text-muted">{label}</p>
      <p className="num mt-0.5 truncate text-[20px] font-semibold leading-tight tracking-tight text-ink min-[400px]:text-[22px] sm:text-[28px] 2xl:text-[30px]">{value}</p>
    </div>
  );
  return (
    <div className={`min-w-0 rounded-2xl px-4 py-4 sm:px-5 ${tint ? "bg-surface-2/70" : "border border-line"}`} title={hint}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate text-[15.5px] text-ink-2">{lead && <span className="text-[19px] font-semibold text-ink">{lead} · </span>}<span className="font-semibold">{title}</span></p>
        {sub && <p className="num shrink-0 text-[13px] text-muted">{sub}</p>}
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 sm:gap-4">
        {cell("Quotations", inrShort(s.quoted))}
        {cell("Invoiced", inrShort(s.invoiced))}
        {cell("Conversion", s.conversion === null ? "—" : `${s.conversion}%`)}
      </div>
    </div>
  );
}

/** This period as a bar, last year as a mark on it, with the difference in ₹ and %. */
function Bar({ label, now, last }: { label: string; now: number; last: number }) {
  const max = Math.max(now, last, 1);
  const up = now >= last;
  const c = change(now, last);
  const pct = (v: number) => (v / max) * 100;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 text-[15px]">
        <p className="font-semibold text-ink">{label}</p>
        <p className={`num truncate font-semibold ${up ? "text-low" : "text-high"}`}>{up ? "▲" : "▼"} {inrShort(Math.abs(now - last))} {up ? "more" : "less"}{c !== null && ` · ${Math.abs(c)}%`}</p>
      </div>
      <div className="relative mt-2.5 h-3.5 rounded-full bg-line" title={`Last year ${inrShort(last)}`}>
        <span className={`block h-full rounded-full ${up ? "bg-low" : "bg-high"}`} style={{ width: `${now > 0 ? Math.max(2, pct(now)) : 0}%` }} />
        {last > 0 && <span className="absolute -top-1.5 h-[26px] w-1 -translate-x-1/2 rounded-full bg-ink ring-2 ring-surface" style={{ left: `${Math.min(pct(last), 99.5)}%` }} aria-hidden />}
      </div>
    </div>
  );
}

const TONE: Record<Remark["tone"], { cls: string; icon: string }> = {
  good: { cls: "text-low", icon: "▲" },
  bad: { cls: "text-high", icon: "▼" },
  neutral: { cls: "text-muted", icon: "•" },
};

/** The green / red / grey lines in a panel to the right (the rows' remarks, the charts' summaries). */
function RemarkPanel({ lines, label }: { lines: Remark[]; label: string }) {
  return (
    <aside className="card min-w-0 px-5 py-4 sm:px-6 sm:py-5" aria-label={label}>
      <ul className="space-y-2.5 text-[15.5px] leading-snug">
        {lines.map((l) => (
          <li key={l.text} className={`flex gap-2.5 ${TONE[l.tone].cls}`}><span className="w-3.5 shrink-0 text-[13px] leading-[1.6]" aria-hidden>{TONE[l.tone].icon}</span><span className={l.tone === "neutral" ? "text-ink-2" : ""}>{l.text}</span></li>
        ))}
      </ul>
    </aside>
  );
}
/** A row's two columns: the figures, and the panel beside them (same widths for the rows and the charts). */
const SIDE_GRID = "grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_460px]";

function Row({ days, person, kind, title, lastTitle, on, isToday }: { days: DaySums; person: string; kind: Kind; title: string; lastTitle: string; on: string; isToday: boolean }) {
  // A salesperson against the company's last year (owner, 17 Nov). To compare with their own again: drop "all" here.
  const v = vsLastYear(days, person, kind, on, VS_COMPANY && person !== "all" ? "all" : person);
  const fy = (() => { const d = new Date(`${on}T00:00:00`); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `FY ${String(y - 1).slice(2)}-${String(y).slice(2)}`; })();
  const hint = kind === "year" ? `${fy}, up to the same date` : `${fy} total ÷ ${kind === "day" ? "its days" : kind === "week" ? "its weeks" : "12"}`;
  return (
    <div className={SIDE_GRID}>
      <section className="card grid min-w-0 gap-4 p-4 sm:p-5 md:grid-cols-2" aria-label={title}>
        <SideBox lead={title} title={nowTitle(kind, on, isToday)} sub={kind === "day" ? undefined : v.label} s={v.now} />
        <SideBox tint title={v.vsCompany ? lastTitle.replace("Last year", "Company last year") : lastTitle} s={v.last} hint={hint} />
        <div className="grid gap-4 px-1 md:col-span-2 md:grid-cols-2 md:gap-8">
          <Bar label="Quotations" now={v.now.quoted} last={v.last.quoted} />
          <Bar label="Invoiced" now={v.now.invoiced} last={v.last.invoiced} />
        </div>
      </section>
      <RemarkPanel lines={remarks(v, nowWord(kind, on, isToday))} label={`${title} remarks`} />
    </div>
  );
}

export function OverviewSales({ board, now }: { board: BoardTraining[] | null; now: Date }) {
  const [days, setDays] = useState<DaySums | null>(null);
  const [error, setError] = useState("");
  const today = ymdOf(now);
  const { member: who } = useSession();
  // Only their own tab for "1 / Self" (Pranjal, owner's sheet 18 Nov).
  const self = who ? (overviewSelf(who) as Tab | null) : null;
  const tabs = self ? TABS.filter((t) => t.key === self) : TABS;
  const [tab, setTab] = useState<Tab>(self ?? "all");
  const { member } = useSession();
  const [on, setOn] = useState(today);
  const load = () => fetch("/api/overview", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j.days) { setDays(j.days); setError(""); } else setError(j.error ?? "Couldn't load the figures"); }).catch(() => setError("Couldn't reach the server"));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useLive(load, ["zoho"]); // a quote or invoice made anywhere shows within seconds
  // The tab each person last looked at stays in their browser (a convenience, so it may simply be gone).
  useEffect(() => { try { const t = localStorage.getItem(TAB_KEY); if (t && tabs.some((x) => x.key === t)) setTab(t as Tab); else if (self) setTab(self); } catch {} }, [self]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (t: Tab) => { setTab(t); try { localStorage.setItem(TAB_KEY, t); } catch {} };
  const day = on > today ? today : on;
  const isToday = day === today;
  const box = "h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink";
  const points = useMemo(() => (days && tab !== "shikha" ? monthly(days, tab, day) : []), [days, tab, day]);
  // Under the Daily row (owner, 18 Nov): this FY against last FY, day by day, as running totals (the "Each day" switch
  // was removed, owner 18 Nov: "looks pointless").
  const running = true;
  const fy = useMemo(() => (days && tab !== "shikha" ? fyLines(days, tab, day, running) : null), [days, tab, day]);

  // Fit the screen on a desktop: the rows take what they need, the chart the rest (the page's bottom padding is 56px).
  const fit = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = fit.current;
      if (!el || window.innerWidth < 1280) return setHeight(null);
      setHeight(Math.max(560, Math.floor(window.innerHeight - (el.getBoundingClientRect().top + window.scrollY) - 56)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [tab, days, error]);

  return (
    <div className="space-y-4">
      {/* Who: a tab per person; everything below is theirs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Whose figures" className="grid w-full grid-cols-5 rounded-xl bg-surface-2 p-1 sm:flex sm:w-auto">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => pick(t.key)} className={`h-9 rounded-lg px-1.5 text-[13px] font-medium transition sm:px-4 ${tab === t.key ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>{t.label}</button>
          ))}
        </div>
        {tab === "shikha" ? <span className="text-[13px] text-muted">Her month’s and year’s training goals</span> : (
          <label className="flex items-center gap-1.5 text-[13px] text-muted">
            <span className="hidden md:inline">{tab === "all" ? "All quotations and invoices, against last year ·" : "Against last year ·"}</span> Looking at <input type="date" className={box} value={day} max={today} onChange={(e) => setOn(e.target.value || today)} aria-label="Which day" />
            {!isToday && <button type="button" onClick={() => setOn(today)} className="h-9 rounded-lg px-2.5 text-[13px] font-medium text-ink-2 hover:bg-surface-2">Today</button>}
            {member && isAdmin(member) && <SendReport />}
          </label>
        )}
      </div>

      {error && tab !== "shikha" && <p className="rounded-xl bg-high-bg px-4 py-3 text-[13px] text-high">{error}</p>}

      {tab === "shikha" ? (
        <section className="card overflow-hidden" aria-label="Shikha’s training goals">
          {board ? <TrainingGoals board={board} now={now} /> : <Skeleton className="m-5 h-[160px]" />}
        </section>
      ) : !days ? <Skeleton className="h-[520px]" /> : (
        <div ref={fit} className="flex flex-col gap-4" style={height ? { minHeight: height } : undefined}>
          {ROWS.map((r) => (
            <div key={r.kind} className="contents">
              <Row days={days} person={tab} kind={r.kind} title={r.title} lastTitle={r.last} on={day} isToday={isToday} />
              {r.kind === "day" && fy && (
                <div className="space-y-2">
                  <p className="text-[13.5px] text-muted">Day by day since 1 April · this FY against last FY</p>
                  {/* Invoices under Quotations (owner, 18 Nov) */}
                  <div className="grid gap-4">
                    {/* Each chart with its summary beside it (owner, 18 Nov), like the rows' remarks */}
                    <div className={SIDE_GRID}>
                    <div className="h-[320px] min-w-0"><OverviewFyChart title="Quotations" now={fy.now.quoted} last={fy.last.quoted} nowCount={fy.now.quotes} lastCount={fy.last.quotes} countLabel="Quotations per day" unit={["quotation", "quotations"]} length={fy.length} start={fy.start} lastStart={fy.lastStart} color="var(--series-1)" running={running} /></div>
                    <RemarkPanel lines={fyRemarks(fy, "quoted", ["quotation", "quotations"])} label="Quotations this FY, in short" />
                    </div>
                    <div className={SIDE_GRID}>
                    <div className="h-[320px] min-w-0"><OverviewFyChart title="Invoices" now={fy.now.invoiced} last={fy.last.invoiced} nowCount={fy.now.invoices} lastCount={fy.last.invoices} countLabel="Invoices per day" unit={["invoice", "invoices"]} length={fy.length} start={fy.start} lastStart={fy.lastStart} color="var(--series-2)" running={running} /></div>
                    <RemarkPanel lines={fyRemarks(fy, "invoiced", ["invoice", "invoices"])} label="Invoices this FY, in short" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          <div className={height ? "min-h-[320px] flex-1" : "h-[360px]"}><OverviewChart points={points} /></div>
        </div>
      )}
    </div>
  );
}
