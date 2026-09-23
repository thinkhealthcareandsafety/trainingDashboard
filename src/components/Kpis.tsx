"use client";

import { useMemo, useState } from "react";
import type { PipelineDoc, Training } from "@/lib/types";
import { fmtDate, fmtINR, fiscalYearLabel, parseYmd, startOfDay } from "@/lib/dates";
import { breakdown, deliveredIn, fiscalMonthSeries, fyStats, monthStats, type BreakdownKey, type MonthPoint, type PeriodStats } from "@/lib/kpi";
import { CardHeader, Segmented, useCountUp } from "./ui";

/* ---------------- Pace status (reserved status colours, always with icon + label) ---------------- */

type Pace = { tone: "on" | "slip" | "behind"; label: string };

function pace(s: PeriodStats): Pace {
  const ratio = s.expected > 0 ? s.completed / s.expected : 1;
  const gap = Math.abs(s.ahead);
  if (ratio >= 1) return { tone: "on", label: s.ahead >= 0.5 ? `Ahead by ${gap.toFixed(1)}` : "On track" };
  if (ratio >= 0.7) return { tone: "slip", label: `Behind by ${gap.toFixed(1)}` };
  return { tone: "behind", label: `Behind by ${gap.toFixed(1)}` };
}

const PACE_FILL = { on: "var(--brand)", slip: "var(--medium)", behind: "var(--high)" };
const PACE_ICON = { on: "●", slip: "▲", behind: "▲" };

function Meter({ value, target, expected, tone }: { value: number; target: number; expected: number; tone: Pace["tone"] }) {
  const pct = Math.min(1, value / target);
  const exp = Math.min(1, expected / target);
  return (
    <div className="relative mt-4 h-1.5 w-full rounded-full bg-surface-2" role="meter" aria-valuemin={0} aria-valuemax={target} aria-valuenow={value}>
      <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${pct * 100}%`, background: PACE_FILL[tone] }} />
      {/* expected-by-today tick */}
      <div className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-ink/70" style={{ left: `calc(${exp * 100}% - 1px)` }} title={`Expected by today: ${expected.toFixed(1)}`} />
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

function TargetTile({ label, s, hero = false }: { label: string; s: PeriodStats; hero?: boolean }) {
  const n = useCountUp(s.completed);
  const p = pace(s);
  return (
    <div className="p-5">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`${hero ? "text-5xl" : "text-[32px]"} font-semibold leading-none tracking-tight`}>{Math.round(n)}</span>
        <span className={`${hero ? "text-xl" : "text-lg"} text-faint`}>/ {s.target}</span>
        <span className="ml-auto text-[13px] font-medium text-muted">{Math.round(s.pct * 100)}%</span>
      </div>
      <Meter value={s.completed} target={s.target} expected={s.expected} tone={p.tone} />
      <PaceLine p={p} extra={s.scheduled ? `${s.scheduled} scheduled` : "none scheduled"} />
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

function RevenueTile({ m, last, series }: { m: PeriodStats; last: PeriodStats; series: number[] }) {
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
        {change === null ? (
          "No revenue last month"
        ) : (
          <>
            <span className="font-medium text-ink-2">{change >= 0 ? "↑" : "↓"} {Math.abs(change * 100).toFixed(0)}%</span> vs last month
          </>
        )}
      </div>
    </div>
  );
}

function BookedTile({ trainings, pipeline, now }: { trainings: Training[]; pipeline: PipelineDoc[]; now: Date }) {
  const t0 = startOfDay(now);
  // Booked = sales orders confirmed but not invoiced, plus invoiced trainings dated in the future.
  const orders = pipeline.filter((p) => p.kind === "salesorder");
  const future = trainings.filter((t) => t.status !== "void" && parseYmd(t.trainingDate) > t0);
  const count = orders.length + future.length;
  const value = orders.reduce((s, p) => s + p.amount, 0) + future.reduce((s, t) => s + t.amount, 0);
  const dated = [
    ...orders.filter((p) => p.trainingDate).map((p) => ({ date: p.trainingDate!, who: p.customerName })),
    ...future.map((t) => ({ date: t.trainingDate, who: t.customerName })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const undated = orders.filter((p) => !p.trainingDate).length;
  const n = useCountUp(count);
  return (
    <div className="p-5">
      <div className="text-[13px] text-muted">Booked · not yet delivered</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[32px] font-semibold leading-none tracking-tight">{Math.round(n)}</span>
        {value > 0 && <span className="text-[13px] font-medium text-muted">{fmtINR(value, true)}</span>}
      </div>
      <div className="mt-[26px] truncate text-[13px] text-muted">
        {dated[0] ? (
          <>
            Next: <span className="font-medium text-ink-2">{fmtDate(dated[0].date)}</span> · {dated[0].who}
          </>
        ) : count ? (
          <span className="text-ink-2">{undated} without a training date</span>
        ) : (
          "Nothing booked yet"
        )}
      </div>
    </div>
  );
}

export function KpiStrip({ trainings, pipeline, now }: { trainings: Training[]; pipeline: PipelineDoc[]; now: Date }) {
  const m = useMemo(() => monthStats(trainings, now), [trainings, now]);
  const last = useMemo(() => monthStats(trainings, now, -1), [trainings, now]);
  const y = useMemo(() => fyStats(trainings, now), [trainings, now]);
  const revSeries = useMemo(
    () => fiscalMonthSeries(trainings, now).filter((p) => !p.isFuture || p.isCurrent).slice(-6).map((p) => p.revenue),
    [trainings, now],
  );
  return (
    <section className="card grid overflow-hidden sm:grid-cols-2 xl:grid-cols-4" aria-label="Training KPIs">
      {[
        <TargetTile key="m" hero label={`Trainings · ${now.toLocaleDateString("en-IN", { month: "long" })}`} s={m} />,
        <TargetTile key="y" label={`Trainings · ${fiscalYearLabel(now)}`} s={y} />,
        <RevenueTile key="r" m={m} last={last} series={revSeries} />,
        <BookedTile key="b" trainings={trainings} pipeline={pipeline} now={now} />,
      ].map((tile, i) => (
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

const TARGET = 10;

function TrendChart({ series, selected, onSelect }: { series: MonthPoint[]; selected: string | null; onSelect: (k: string | null) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const H = 176;
  const top = Math.max(15, ...series.map((p) => p.actual + p.scheduled));
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
          <div className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-ink/40" style={{ bottom: y(TARGET) }}>
            <span className="absolute -top-[9px] right-0 bg-surface pl-1.5 text-[11px] font-medium text-muted">Target {TARGET}</span>
          </div>
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
                  aria-label={`${p.label} ${p.year}: ${p.actual} delivered${p.scheduled ? `, ${p.scheduled} scheduled` : ""}`}
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
              className="pointer-events-none absolute z-20 w-40 -translate-x-1/2 rounded-lg border border-line bg-surface p-3 text-[12px] shadow-pop"
              style={{
                left: `clamp(80px, ${((hover + 0.5) / series.length) * 100}%, calc(100% - 80px))`,
                bottom: Math.min(H - 76, y(series[hover].actual + series[hover].scheduled) + 12),
              }}
            >
              <div className="mb-1.5 font-semibold text-ink">{series[hover].label} {series[hover].year}</div>
              <Row k="Delivered" v={series[hover].actual} dot="var(--brand)" />
              {series[hover].scheduled > 0 && <Row k="Scheduled" v={series[hover].scheduled} dot="var(--brand-2)" />}
              <Row k="Revenue" v={fmtINR(series[hover].revenue, true)} />
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

function TrendTable({ series }: { series: MonthPoint[] }) {
  return (
    <table className="mt-5 w-full text-[13px] num">
      <thead className="text-left text-muted">
        <tr className="border-b border-line">
          <th className="py-2 font-medium">Month</th>
          <th className="py-2 text-right font-medium">Delivered</th>
          <th className="py-2 text-right font-medium">Scheduled</th>
          <th className="py-2 text-right font-medium">vs target</th>
          <th className="py-2 text-right font-medium">Revenue</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {series.filter((p) => !p.isFuture || p.scheduled).map((p) => (
          <tr key={p.key}>
            <td className="py-2">{p.label} {p.year}</td>
            <td className="py-2 text-right">{p.actual}</td>
            <td className="py-2 text-right text-muted">{p.scheduled || "–"}</td>
            <td className="py-2 text-right text-muted">{p.actual - TARGET > 0 ? "+" : ""}{p.actual - TARGET}</td>
            <td className="py-2 text-right">{fmtINR(p.revenue, true)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------------- Breakdown ---------------- */

const TABS: { value: BreakdownKey; label: string }[] = [
  { value: "trainingType", label: "Type" },
  { value: "customerName", label: "Client" },
  { value: "trainer", label: "Trainer" },
  { value: "leadSource", label: "Source" },
];

function Breakdown({ trainings, title }: { trainings: Training[]; title: string }) {
  const [tab, setTab] = useState<BreakdownKey>("trainingType");
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const rows = useMemo(() => breakdown(trainings, tab), [trainings, tab]);
  const max = Math.max(1, ...rows.map((r) => r.count));
  const shown = all ? rows : rows.slice(0, 5);
  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-medium text-ink-2">
          Delivered by {TABS.find((t) => t.value === tab)!.label.toLowerCase()} <span className="font-normal text-muted">· {title}</span>
        </h3>
        <Segmented value={tab} onChange={(v) => { setTab(v); setOpen(null); }} options={TABS} />
      </div>
      {rows.length === 0 && <p className="py-2 text-[13px] text-muted">No trainings delivered in this period.</p>}
      <ul>
        {shown.map((r) => (
          <li key={r.name}>
            <button
              onClick={() => setOpen(open === r.name ? null : r.name)}
              className="grid w-full grid-cols-[minmax(0,11rem)_1fr_5.5rem] items-center gap-4 rounded-md px-1 py-2 text-left hover:bg-surface-2/70"
              aria-expanded={open === r.name}
            >
              <span className="truncate text-[13px] text-ink-2" title={r.name}>{r.name}</span>
              <span className="h-1.5 rounded-full bg-surface-2">
                <span className="block h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${(r.count / max) * 100}%` }} />
              </span>
              <span className="text-right text-[13px] num">
                <span className="font-medium text-ink">{r.count}</span> <span className="text-faint">· {fmtINR(r.revenue, true)}</span>
              </span>
            </button>
            {open === r.name && (
              <ul className="rise mb-2 ml-2 space-y-1.5 border-l border-line py-1 pl-4">
                {trainings
                  .filter((t) => ((t[tab] as string) || "Unspecified") === r.name)
                  .sort((a, b) => b.trainingDate.localeCompare(a.trainingDate))
                  .map((t) => (
                    <li key={t.id} className="flex flex-wrap justify-between gap-x-4 text-[12px]">
                      <span className="text-ink-2">{t.customerName} <span className="text-muted">· {t.trainingType}</span></span>
                      <span className="text-muted num">{fmtDate(t.trainingDate)} · {t.participants} pax · {t.docNumber}</span>
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

export function TrendCard({ trainings, now }: { trainings: Training[]; now: Date }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");
  const series = useMemo(() => fiscalMonthSeries(trainings, now), [trainings, now]);
  const delivered = useMemo(() => deliveredIn(trainings, now, selected), [trainings, now, selected]);
  const sel = selected ? series.find((s) => s.key === selected) : null;

  return (
    <section className="card p-5 sm:p-6" aria-label="Monthly trend">
      <CardHeader
        title="Trainings per month"
        sub={`${fiscalYearLabel(now)} · click a month to see the details`}
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
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand" /> Delivered</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand-2" /> Scheduled</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 border-t border-dashed border-ink/50" /> Target</span>
          </div>
          <TrendChart series={series} selected={selected} onSelect={setSelected} />
        </>
      ) : (
        <TrendTable series={series} />
      )}
      <Breakdown trainings={delivered} title={sel ? `${sel.label} ${sel.year}` : fiscalYearLabel(now)} />
    </section>
  );
}
