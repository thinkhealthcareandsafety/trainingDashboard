"use client";

import { useMemo, useState } from "react";
import type { BoardTraining, Training } from "@/lib/types";
import { fmtDate, fmtINR, fiscalYearLabel, startOfDay } from "@/lib/dates";
import {
  AED_TARGETS, TEAM_TARGETS, boardBreakdown, boardMonth, boardMonthSeries, boardYear, completedIn, countsOn, fiscalMonthSeries, monthStats, revenueBetween, upcoming,
  type BoardBreakdownKey, type BoardPeriod,
} from "@/lib/kpi";
import { CardHeader, Segmented, useCountUp } from "./ui";

/*
 * Overview tiles and trend. Trainings and people come from the boards (one training per deal, counted on its last
 * training day once marked completed); revenue still comes from the Zoho invoices — money only lives there.
 * "team" = the Training board with its targets; "aed" = Priyanka's AedSmartx trainings with hers (trainings only, no people).
 */
export type OverviewMode = "team" | "aed";

/* ---------------- Pace status (reserved status colours, always with icon + label) ---------------- */

type Pace = { tone: "on" | "slip" | "behind"; label: string };

/** Ahead / behind in whole trainings (or people): nobody runs 0.6 of a training. Colour from how far behind. */
function pace(done: number, expected: number): Pace {
  const gap = done - Math.round(expected);
  const n = Math.abs(gap).toLocaleString("en-IN");
  if (gap >= 0) return { tone: "on", label: gap > 0 ? `Ahead by ${n}` : "On track" };
  return { tone: expected > 0 && done / expected >= 0.7 ? "slip" : "behind", label: `Behind by ${n}` };
}

const PACE_FILL = { on: "var(--brand)", slip: "var(--medium)", behind: "var(--high)" };
const PACE_ICON = { on: "●", slip: "▲", behind: "▲" };

function Meter({ value, target, expected, tone, thin = false }: { value: number; target: number; expected: number; tone: Pace["tone"]; thin?: boolean }) {
  const pct = Math.min(1, value / target);
  const exp = Math.min(1, expected / target);
  return (
    <div className={`relative w-full rounded-full bg-surface-2 ${thin ? "mt-2 h-1" : "mt-4 h-1.5"}`} role="meter" aria-valuemin={0} aria-valuemax={target} aria-valuenow={value}>
      <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${pct * 100}%`, background: PACE_FILL[tone] }} />
      {/* expected-by-today tick */}
      <div className={`absolute w-0.5 rounded-full bg-ink/70 ${thin ? "-top-[3px] h-2.5" : "-top-1 h-3.5"}`} style={{ left: `calc(${exp * 100}% - 1px)` }} title={`Expected by today: ${Math.round(expected).toLocaleString("en-IN")}`} />
    </div>
  );
}

function PaceLine({ p, extra }: { p: Pace; extra: string }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
      <span className="inline-flex items-center gap-1.5 font-medium text-ink-2">
        <span aria-hidden className="text-[9px]" style={{ color: PACE_FILL[p.tone] }}>{PACE_ICON[p.tone]}</span>
        {p.label}
      </span>
      <span className="text-muted">· {extra}</span>
    </div>
  );
}

/** Trainings against the target (big), and under it people trained against theirs. */
function TargetTile({ label, s, hero = false }: { label: string; s: BoardPeriod; hero?: boolean }) {
  const n = useCountUp(s.completed);
  const people = useCountUp(s.people);
  const p = s.target ? pace(s.completed, s.expected) : null;
  const pp = s.peopleTarget ? pace(s.people, s.peopleExpected) : null;
  // Trainings whose day has passed without "Training completed" aren't upcoming — they need marking.
  const scheduled = (s.scheduled ? `${s.scheduled} scheduled` : "none scheduled") + (s.unmarked ? ` · ${s.unmarked} to mark completed` : "");
  return (
    <div className="p-5">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`${hero ? "text-5xl" : "text-[32px]"} font-semibold leading-none tracking-tight`}>{Math.round(n)}</span>
        {s.target ? <span className={`${hero ? "text-xl" : "text-lg"} text-faint`}>/ {s.target}</span> : <span className="text-[15px] text-muted">{s.completed === 1 ? "training" : "trainings"}</span>}
        {s.target ? <span className="ml-auto text-[13px] font-medium text-muted">{Math.round((s.completed / s.target) * 100)}%</span> : null}
      </div>
      {s.target && p ? (
        <>
          <Meter value={s.completed} target={s.target} expected={s.expected} tone={p.tone} />
          <PaceLine p={p} extra={scheduled} />
        </>
      ) : (
        <div className="mt-3 text-[13px] text-muted">{scheduled}</div>
      )}
      {s.peopleTarget && pp && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="flex items-baseline gap-1.5 text-[13px]">
            <span className="text-muted">People trained</span>
            <span className="num ml-auto text-[15px] font-semibold text-ink">{Math.round(people).toLocaleString("en-IN")}</span>
            <span className="num text-faint">/ {s.peopleTarget.toLocaleString("en-IN")}</span>
          </div>
          <Meter thin value={s.people} target={s.peopleTarget} expected={s.peopleExpected} tone={pp.tone} />
          <div className="mt-2 text-[12.5px] text-muted">
            <span className="font-medium text-ink-2">{pp.label}</span>
            {s.peopleScheduled ? <> · {s.peopleScheduled.toLocaleString("en-IN")} more in scheduled trainings</> : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const w = 96;
  const h = 28;
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * w, h - 3 - (v / max) * (h - 6)]);
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--faint)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {last && <circle cx={last[0]} cy={last[1]} r="3" fill="var(--brand)" stroke="var(--surface)" strokeWidth="2" />}
    </svg>
  );
}

/**
 * Revenue: training invoices in Zoho Books (by their training date), as before. Compared like for like: this month so
 * far against the same days of last month (1–17 Oct vs 1–17 Sep), not against the whole of last month.
 */
function RevenueTile({ trainings, now }: { trainings: Training[]; now: Date }) {
  const m = useMemo(() => monthStats(trainings, now), [trainings, now]);
  const lastFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastTo = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), new Date(now.getFullYear(), now.getMonth(), 0).getDate()));
  const last = useMemo(() => ({ revenue: revenueBetween(trainings, lastFrom, startOfDay(lastTo)) }), [trainings, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastLabel = `${lastFrom.getDate()}–${lastTo.getDate()} ${lastTo.toLocaleDateString("en-IN", { month: "short" })}`;
  const series = useMemo(() => fiscalMonthSeries(trainings, now).filter((p) => !p.isFuture || p.isCurrent).slice(-6).map((p) => p.revenue), [trainings, now]);
  const v = useCountUp(m.revenue);
  const change = last.revenue ? (m.revenue - last.revenue) / last.revenue : null;
  return (
    <div className="p-5">
      <div className="text-[13px] text-muted">Training revenue · this month</div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <span className="text-[32px] font-semibold leading-none tracking-tight">{fmtINR(Math.round(v), true)}</span>
        <Sparkline values={series} />
      </div>
      <div className="mt-[26px] text-[13px] text-muted">
        {change === null ? `No revenue in ${lastLabel}` : (
          <><span className="font-medium text-ink-2">{change >= 0 ? "↑" : "↓"} {Math.abs(change * 100).toFixed(0)}%</span> vs {lastLabel}</>
        )}
      </div>
      <div className="mt-1 text-[12px] text-faint">From the invoices in Zoho Books</div>
    </div>
  );
}

export const UPCOMING_DAYS = 15;

/** Dated trainings in the next 15 days, and the first of them. */
function ComingUpTile({ list, now }: { list: BoardTraining[]; now: Date }) {
  const next = useMemo(() => upcoming(list, now, UPCOMING_DAYS), [list, now]);
  const people = next.reduce((n, x) => n + x.t.people, 0);
  const n = useCountUp(next.length);
  const first = next[0];
  return (
    <div className="p-5">
      <div className="text-[13px] text-muted">Coming up · next {UPCOMING_DAYS} days</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[32px] font-semibold leading-none tracking-tight">{Math.round(n)}</span>
        <span className="text-[13px] font-medium text-muted">{next.length === 1 ? "training" : "trainings"}{people ? ` · ${people.toLocaleString("en-IN")} people` : ""}</span>
      </div>
      <div className="mt-[26px] truncate text-[13px] text-muted">
        {first ? <>Next: <span className="font-medium text-ink-2">{fmtDate(first.next, { weekday: "short", day: "numeric", month: "short" })}</span> · {first.t.alias || first.t.customerName}</> : "Nothing scheduled yet"}
      </div>
    </div>
  );
}

/** AedSmartx: invoices still without a training date. */
function WaitingTile({ waiting }: { waiting: number }) {
  const n = useCountUp(waiting);
  return (
    <div className="p-5">
      <div className="text-[13px] text-muted">AED invoices · no training date yet</div>
      <div className="mt-2 text-[32px] font-semibold leading-none tracking-tight">{Math.round(n)}</div>
      <div className="mt-[26px] text-[13px] text-muted">Invoices sent and Contacted, on the AedSmartx board</div>
    </div>
  );
}

export function KpiStrip({ trainings, board, now, mode, aedWaiting = 0 }: { trainings: Training[]; board: BoardTraining[]; now: Date; mode: OverviewMode; aedWaiting?: number }) {
  const team = mode === "team";
  const targets = team ? TEAM_TARGETS : AED_TARGETS;
  const m = useMemo(() => boardMonth(board, now, targets), [board, now, targets]);
  const y = useMemo(() => boardYear(board, now, targets), [board, now, targets]);
  const what = team ? "Trainings" : "AED trainings";
  const tiles = [
    <TargetTile key="m" hero label={`${what} · ${now.toLocaleDateString("en-IN", { month: "long" })}`} s={m} />,
    <TargetTile key="y" label={`${what} · ${fiscalYearLabel(now)}${y.since ? ` · from ${y.since.toLocaleDateString("en-IN", { month: "short" })}` : ""}`} s={y} />,
    team ? <RevenueTile key="r" trainings={trainings} now={now} /> : <WaitingTile key="w" waiting={aedWaiting} />,
    <ComingUpTile key="c" list={board} now={now} />,
  ];
  return (
    <section className="card grid overflow-hidden sm:grid-cols-2 xl:grid-cols-4" aria-label="Training KPIs">
      {tiles.map((tile, i) => (
        // Hairline dividers between tiles at every breakpoint.
        <div
          key={i}
          className={`border-line ${i > 0 ? "border-t sm:border-t-0" : ""} ${i % 2 === 1 ? "sm:border-l" : ""} ${i >= 2 ? "sm:border-t xl:border-t-0" : ""} ${i === 2 ? "xl:border-l" : ""}`}
        >
          {tile}
        </div>
      ))}
    </section>
  );
}

/* ---------------- Trend chart ---------------- */

type ChartPoint = { key: string; label: string; year: number; actual: number; scheduled: number; people: number; revenue?: number; isCurrent: boolean; isFuture: boolean };

function TrendChart({ series, target, selected, onSelect }: { series: ChartPoint[]; target?: number; selected: string | null; onSelect: (k: string | null) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const H = 176;
  const top = Math.max(target ? target + 5 : 5, ...series.map((p) => p.actual + p.scheduled));
  const max = Math.ceil(top / 5) * 5;
  const ticks = Array.from({ length: max / 5 + 1 }, (_, i) => i * 5);
  const y = (v: number) => (v / max) * H;

  return (
    <div className="mt-5 flex gap-3">
      {/* y-axis */}
      <div className="relative w-5 shrink-0 text-right text-[11px] text-faint num" style={{ height: H }}>
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: y(t) }}>{t}</span>
        ))}
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="relative" style={{ height: H }} onMouseLeave={() => setHover(null)}>
          {/* gridlines: solid hairlines */}
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 h-px bg-line" style={{ bottom: y(t) }} />
          ))}
          {/* target reference */}
          {target && (
            <div className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-ink/40" style={{ bottom: y(target) }}>
              <span className="absolute -top-[9px] right-0 bg-surface pl-1.5 text-[11px] font-medium text-muted">Target {target}</span>
            </div>
          )}
          <div className="absolute inset-0 flex">
            {series.map((p, i) => {
              const sel = selected === p.key;
              const dim = selected ? !sel : hover !== null && hover !== i;
              return (
                <button
                  key={p.key}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  onClick={() => onSelect(sel ? null : p.key)}
                  className="relative flex h-full flex-1 flex-col items-center justify-end"
                  aria-label={`${p.label} ${p.year}: ${p.actual} completed${p.scheduled ? `, ${p.scheduled} scheduled` : ""}${p.people ? `, ${p.people} people` : ""}`}
                  aria-pressed={sel}
                >
                  <div className={`flex w-[62%] max-w-6 flex-col items-stretch gap-[2px] transition-opacity duration-200 ${dim ? "opacity-35" : ""}`}>
                    {p.scheduled > 0 && <div className="rounded-t-[4px]" style={{ height: Math.max(2, y(p.scheduled) - 2), background: "var(--brand-2)" }} />}
                    {p.actual > 0 && (
                      <div className={`${p.scheduled ? "" : "rounded-t-[4px]"} transition-[height] duration-700 ease-out`} style={{ height: y(p.actual), background: "var(--brand)" }} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {hover !== null && (
            <div
              className="pointer-events-none absolute z-20 w-44 -translate-x-1/2 rounded-lg border border-line bg-surface p-3 text-[12px] shadow-pop"
              style={{
                left: `clamp(88px, ${((hover + 0.5) / series.length) * 100}%, calc(100% - 88px))`,
                bottom: Math.min(H - 96, y(series[hover].actual + series[hover].scheduled) + 12),
              }}
            >
              <div className="mb-1.5 font-semibold text-ink">{series[hover].label} {series[hover].year}</div>
              <Row k="Completed" v={series[hover].actual} dot="var(--brand)" />
              {series[hover].scheduled > 0 && <Row k="Scheduled" v={series[hover].scheduled} dot="var(--brand-2)" />}
              {series[hover].people > 0 && <Row k="People trained" v={series[hover].people.toLocaleString("en-IN")} />}
              {series[hover].revenue !== undefined && <Row k="Revenue" v={fmtINR(series[hover].revenue!, true)} />}
            </div>
          )}
        </div>
        <div className="mt-2 flex">
          {series.map((p) => (
            <div key={p.key} className={`flex-1 text-center text-[11px] ${p.isCurrent ? "font-semibold text-ink" : "text-faint"}`}>{p.label}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, dot }: { k: string; v: string | number; dot?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="inline-flex items-center gap-1.5 text-muted">
        {dot && <span className="size-2 rounded-sm" style={{ background: dot }} />}
        {k}
      </span>
      <span className="font-medium text-ink num">{v}</span>
    </div>
  );
}

function TrendTable({ series, target, team }: { series: ChartPoint[]; target?: number; team: boolean }) {
  return (
    <table className="mt-5 w-full text-[13px] num">
      <thead className="text-left text-muted">
        <tr className="border-b border-line">
          <th className="py-2 font-medium">Month</th>
          <th className="py-2 text-right font-medium">Completed</th>
          <th className="py-2 text-right font-medium">Scheduled</th>
          {team && <th className="py-2 text-right font-medium">People</th>}
          {target && <th className="py-2 text-right font-medium">vs target</th>}
          {team && <th className="py-2 text-right font-medium">Revenue</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {series.filter((p) => !p.isFuture || p.scheduled).map((p) => (
          <tr key={p.key}>
            <td className="py-2">{p.label} {p.year}</td>
            <td className="py-2 text-right">{p.actual}</td>
            <td className="py-2 text-right text-muted">{p.scheduled || "–"}</td>
            {team && <td className="py-2 text-right">{p.people.toLocaleString("en-IN")}</td>}
            {target && <td className="py-2 text-right text-muted">{p.isFuture ? "–" : <>{p.actual - target > 0 ? "+" : ""}{p.actual - target}{p.isCurrent ? " so far" : ""}</>}</td>}
            {team && <td className="py-2 text-right">{fmtINR(p.revenue ?? 0, true)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------------- Breakdown ---------------- */

const TABS: { value: BoardBreakdownKey; label: string }[] = [
  { value: "training", label: "Type" },
  { value: "client", label: "Client" },
  { value: "trainer", label: "Trainer" },
];

function Breakdown({ list, title, team }: { list: BoardTraining[]; title: string; team: boolean }) {
  const [tab, setTab] = useState<BoardBreakdownKey>("training");
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const rows = useMemo(() => boardBreakdown(list, tab), [list, tab]);
  const max = Math.max(1, ...rows.map((r) => r.count));
  const shown = all ? rows : rows.slice(0, 5);
  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-medium text-ink-2">
          Completed by {TABS.find((t) => t.value === tab)!.label.toLowerCase()} <span className="font-normal text-muted">· {title}</span>
        </h3>
        <Segmented value={tab} onChange={(v) => { setTab(v); setOpen(null); }} options={TABS} />
      </div>
      {rows.length === 0 && <p className="py-2 text-[13px] text-muted">No trainings completed in this period.</p>}
      <ul>
        {shown.map((r) => (
          <li key={r.name}>
            <button
              onClick={() => setOpen(open === r.name ? null : r.name)}
              className="grid w-full grid-cols-[minmax(0,11rem)_1fr_6.5rem] items-center gap-4 rounded-md px-1 py-2 text-left hover:bg-surface-2/70"
              aria-expanded={open === r.name}
            >
              <span className="truncate text-[13px] text-ink-2" title={r.name}>{r.name}</span>
              <span className="h-1.5 rounded-full bg-surface-2">
                <span className="block h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${(r.count / max) * 100}%` }} />
              </span>
              <span className="text-right text-[13px] num">
                <span className="font-medium text-ink">{r.count}</span>
                {team && <span className="text-faint"> · {r.people.toLocaleString("en-IN")} people</span>}
              </span>
            </button>
            {open === r.name && (
              <ul className="rise mb-2 ml-2 space-y-1.5 border-l border-line py-1 pl-4">
                {[...r.items].sort((a, b) => countsOn(b).localeCompare(countsOn(a))).map((t) => (
                  <li key={t.id} className="flex flex-wrap justify-between gap-x-4 text-[12px]">
                    <span className="text-ink-2">{t.alias || t.customerName} <span className="text-muted">· {t.training}</span></span>
                    <span className="text-muted num">{fmtDate(countsOn(t))}{team ? ` · ${t.people} people` : ""} · {t.docNumber}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {rows.length > 5 && (
        <button className="mt-1 px-1 text-[13px] font-medium text-muted hover:text-ink" onClick={() => setAll((a) => !a)}>
          {all ? "Show less" : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}

export function TrendCard({ trainings, board, now, mode }: { trainings: Training[]; board: BoardTraining[]; now: Date; mode: OverviewMode }) {
  const team = mode === "team";
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");
  const series = useMemo<ChartPoint[]>(() => {
    const revenue = team ? new Map(fiscalMonthSeries(trainings, now).map((p) => [p.key, p.revenue])) : null;
    return boardMonthSeries(board, now, team ? undefined : AED_TARGETS.since).map((p) => ({ ...p, revenue: revenue?.get(p.key) }));
  }, [board, trainings, now, team]);
  const done = useMemo(() => completedIn(board, now, selected), [board, now, selected]);
  const sel = selected ? series.find((s) => s.key === selected) : null;
  const target = (team ? TEAM_TARGETS : AED_TARGETS).month;

  return (
    <section className="card p-5 sm:p-6" aria-label="Monthly trend">
      <CardHeader
        title={team ? "Trainings per month" : "AED trainings per month"}
        sub={`${fiscalYearLabel(now)} · from the ${team ? "Training" : "AedSmartx"} board · click a month to see the details`}
        right={
          <>
            {sel && (
              <button onClick={() => setSelected(null)} className="inline-flex h-7 items-center gap-1.5 rounded-md bg-surface-2 px-2.5 text-xs font-medium text-ink-2 hover:text-ink">
                {sel.label} {sel.year} <span aria-hidden>×</span>
              </button>
            )}
            <Segmented value={view} onChange={setView} options={[{ value: "chart", label: "Chart" }, { value: "table", label: "Table" }]} />
          </>
        }
      />
      {view === "chart" ? (
        <>
          <div className="mt-4 flex items-center gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand" /> Completed</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand-2" /> Scheduled</span>
            {target && <span className="inline-flex items-center gap-1.5"><span className="w-3 border-t border-dashed border-ink/50" /> Target</span>}
          </div>
          <TrendChart series={series} target={target} selected={selected} onSelect={setSelected} />
        </>
      ) : (
        <TrendTable series={series} target={target} team={team} />
      )}
      <Breakdown list={done} title={sel ? `${sel.label} ${sel.year}` : fiscalYearLabel(now)} team={team} />
    </section>
  );
}
