"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BOOKED_DAYS, DEFAULT_GOAL, type Goal, goalFor, monthEnd, pace } from "@/lib/analytics/goal";
import { grainLabel, inrShort } from "@/lib/analytics/model";
import { confettiPop } from "@/lib/confetti";
import { Field, Modal, btn, inputCls } from "../ui";
import { useThemeColour } from "./Chart";
import { isError, runSpecs } from "./shared";

/*
 * The monthly revenue goal as a vertical meter on the left of Reports (owner, 27 Oct: ₹50 L a month, before tax, every
 * Zoho Books invoice). Fill = invoiced this month; striped = booked (PIs from the last 60 days not invoiced yet);
 * "today" tick = an even pace over the working days; dashed line = month end at this pace. Under it the last six months
 * (reached / missed). Narrow screens get the same as a horizontal strip. Admin changes the goal (✎).
 */

type Data = { goal: Goal; months: { key: string; revenue: number }[]; booked: number };

/** On pace = the theme's own colour (as its charts — owner, 27 Oct); behind = the status colours. */
type Fill = { on: string; slip: string; behind: string };
const fillOf = (on: string): Fill => ({ on, slip: "var(--medium)", behind: "var(--high)" });
const STRIPES = (c: string) => `repeating-linear-gradient(-45deg, color-mix(in srgb, ${c} 45%, transparent) 0 5px, color-mix(in srgb, ${c} 18%, transparent) 5px 10px)`;
const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const monthsBack = (month: string, n: number) => { const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 - n, 1)); return d.toISOString().slice(0, 7); };

export function GoalMeter({ today, admin }: { today: string; admin: boolean }) {
  const month = today.slice(0, 7);
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const fill = fillOf(useThemeColour());

  const load = () => {
    const first = monthsBack(month, 6);
    Promise.all([
      fetch("/api/analytics/goal").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      runSpecs([
        { dataset: "sales", measures: ["revenue"], by: ["date"], grain: "month", from: `${first}-01`, to: monthEnd(month) },
        { dataset: "orders", measures: ["toInvoice"], from: addDays(today, -BOOKED_DAYS), to: today },
      ]),
    ]).then(([goal, j]) => {
      const [byMonth, open] = j.results;
      if (!byMonth || isError(byMonth)) return setFailed(true);
      const got = new Map(byMonth.rows.map((r) => [r.keys[0], r.values[0] ?? 0]));
      const months = Array.from({ length: 7 }, (_, i) => monthsBack(month, 6 - i)).map((key) => ({ key, revenue: got.get(key) ?? 0 }));
      setData({ goal: goal && !goal.error ? goal : { monthly: DEFAULT_GOAL, months: {} }, months, booked: open && !isError(open) ? open.totals[0] ?? 0 : 0 });
    });
  };
  useEffect(load, [month, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const goal = data ? goalFor(data.goal, month) : DEFAULT_GOAL;
  const invoiced = data?.months.at(-1)?.revenue ?? 0;
  const reached = Boolean(data) && invoiced >= goal;

  // Goal reached: one burst per month per browser (owner likes a small celebration).
  useEffect(() => {
    if (!reached) return;
    try {
      if (localStorage.getItem("th.goal.cheered") === month) return;
      localStorage.setItem("th.goal.cheered", month);
    } catch { return; }
    confettiPop(box.current);
  }, [reached, month]);

  if (failed) return null;
  if (!data) return <div className="h-24 animate-pulse rounded-2xl bg-surface-2 xl:h-[600px]" />;

  const p = pace(goal, invoiced, today);
  const tone = invoiced >= p.expected ? "on" : p.expected > 0 && invoiced / p.expected >= 0.7 ? "slip" : "behind";
  const pct = Math.round((invoiced / goal) * 100);
  const monthName = grainLabel(month, "month", true).split(" ")[0];
  const end = new Date(`${monthEnd(month)}T00:00:00Z`).getUTCDate();
  const status = reached ? `Reached · ${inrShort(invoiced - goal)} over` : tone === "on" ? "On pace" : `Behind by ${inrShort(p.expected - invoiced)}`;
  const tickHint = `Where an even pace over the working days (Mon–Sat) puts us by tonight: ${inrShort(p.expected)} of ${inrShort(goal)} by ${end} ${monthName}.`;
  const bookedHint = `PIs from the last ${BOOKED_DAYS} days not invoiced yet (before tax). Older open PIs are left out — most will never be invoiced.`;
  const estimateHint = p.estimate === null ? "" : `If the rest of ${monthName} goes like its working days so far: about ${inrShort(p.estimate)} by month end.`;
  const custom = data.goal.months[month] !== undefined;

  const props = { fill, goal, invoiced, booked: data.booked, expected: p.expected, estimate: p.estimate, tone, tickHint, bookedHint, estimateHint } as const;
  const lines = (
    <dl className="grid gap-1.5 text-[15px]">
      <Line dot={fill[tone]} label="Invoiced" value={inrShort(invoiced)} />
      <Line dot={fill[tone]} striped label="Booked" value={inrShort(data.booked)} title={bookedHint} />
      {reached ? null : <Line label={`Per day · ${p.daysLeft} left`} value={inrShort(p.perDay)} title="₹ still needed ÷ working days left (Mon–Sat, today included)" />}
      {p.estimate !== null && <Line label="Month end" value={`≈ ${inrShort(p.estimate)}`} title={estimateHint} />}
    </dl>
  );

  return (
    <section ref={box} className="card p-4" aria-label={`${monthName} revenue goal`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-medium text-muted">{monthName} goal{custom ? " (this month)" : ""}</h2>
          <div className="text-[22px] font-semibold leading-tight tracking-tight text-ink">{inrShort(goal)}</div>
        </div>
        {admin && (
          <button type="button" className="-mr-1 rounded-md px-1.5 py-1 text-[15px] font-medium text-muted hover:bg-surface-2 hover:text-ink" onClick={() => setEditing(true)} title="Change the goal (Admin)" aria-label="Change the goal">✎</button>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2 xl:block">
        <span className="text-[34px] font-semibold leading-none tracking-tight text-ink">{pct}%</span>
        <span className="mt-1 inline-flex items-center gap-1.5 text-[15px] font-medium text-ink-2 xl:flex">
          <span aria-hidden className="text-[11px]" style={{ color: fill[tone] }}>{reached || tone === "on" ? "●" : "▲"}</span>
          {status}
        </span>
      </div>

      {/* Wide screens: the vertical meter, its numbers under it. */}
      <div className="hidden xl:block">
        <VerticalBar {...props} />
        <div className="mt-4">{lines}</div>
      </div>
      {/* Narrow screens: a horizontal strip and the numbers beside it. */}
      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center xl:hidden">
        <HorizontalBar {...props} />
        {lines}
      </div>

      {p.estimate !== null && p.daysLeft > 0 && <WhatIf goal={goal} invoiced={invoiced} estimate={p.estimate} colour={fill.on} />}
      <History months={data.months} goalOf={(k) => goalFor(data.goal, k)} current={month} colour={fill.on} />
      <p className="mt-3 text-[14px] leading-snug text-faint">Every Zoho Books invoice, before tax.</p>

      {editing && createPortal(<GoalEditor goal={data.goal} month={month} monthName={monthName} onClose={() => setEditing(false)} onSaved={(g) => { setData((d) => (d ? { ...d, goal: g } : d)); setEditing(false); }} />, document.body)}
    </section>
  );
}

/** What-if (owner, 27 Oct: "parameters"): the rest of the month a bit faster or slower than so far → month end. */
function WhatIf({ goal, invoiced, estimate, colour }: { goal: number; invoiced: number; estimate: number; colour: string }) {
  const [pct, setPct] = useState(0);
  const end = invoiced + (estimate - invoiced) * (1 + pct / 100);
  const gap = end - goal;
  return (
    <details className="group mt-3 rounded-xl bg-surface-2/70 px-3 py-2 text-[15px]">
      <summary className="cursor-pointer list-none font-medium text-ink-2 marker:hidden">What if…<span className="float-right text-muted group-open:hidden">▾</span></summary>
      <label className="mt-2 block text-muted">
        The rest of the month goes <b className="font-semibold text-ink">{pct === 0 ? "as so far" : `${Math.abs(pct)}% ${pct > 0 ? "faster" : "slower"}`}</b>
        <input type="range" min={-50} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="mt-1.5 w-full" style={{ accentColor: colour }} aria-label="How much faster or slower, in %" />
      </label>
      <p className="mt-1 text-ink-2">Month end ≈ <b className="font-semibold text-ink">{inrShort(end)}</b> · {gap >= 0 ? <span className="text-low">goal reached (+{inrShort(gap)})</span> : <span className="text-high">{inrShort(-gap)} short</span>}</p>
    </details>
  );
}

function Line({ label, value, dot, striped, title }: { label: string; value: string; dot?: string; striped?: boolean; title?: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3" title={title}>
      <dt className="flex min-w-0 items-center gap-1.5 text-muted">
        {dot && <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: striped ? STRIPES(dot) : dot }} />}
        <span className="truncate">{label}</span>
      </dt>
      <dd className="shrink-0 font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

type BarProps = { goal: number; invoiced: number; booked: number; expected: number; estimate: number | null; tone: keyof Fill; fill: Fill; tickHint: string; bookedHint: string; estimateHint: string };

/** The scale: the goal, or more once invoiced + booked / the estimate pass it (then the goal is a line inside). */
const scaleOf = (b: BarProps) => Math.max(b.goal, (b.invoiced + b.booked) * 1.06, (b.estimate ?? 0) * 1.06);

function VerticalBar(b: BarProps) {
  const max = scaleOf(b);
  const at = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const over = max > b.goal;
  return (
    <div className="relative mx-auto mt-5 flex h-[300px] w-full justify-center">
      <div className="relative h-full w-14 overflow-hidden rounded-2xl bg-surface-2" role="meter" aria-valuemin={0} aria-valuemax={b.goal} aria-valuenow={Math.round(b.invoiced)} aria-label="Invoiced this month against the goal">
        <div className="absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out" style={{ height: at(b.invoiced), background: b.fill[b.tone] }} />
        {b.booked > 0 && <div className="absolute inset-x-0" style={{ bottom: at(b.invoiced), height: `calc(${at(b.invoiced + b.booked)} - ${at(b.invoiced)})`, background: STRIPES(b.fill[b.tone]) }} title={b.bookedHint} />}
      </div>
      {/* Marks beside the bar: goal (when the scale goes past it), today's pace, the month-end estimate. */}
      {over && <Mark at={at(b.goal)} label="Goal" strong />}
      <Mark at={at(b.expected)} label="today" hint={b.tickHint} side="left" />
      {b.estimate !== null && <Mark at={at(b.estimate)} label={`≈ ${inrShort(b.estimate)}`} hint={b.estimateHint} dashed />}
    </div>
  );
}

function Mark({ at, label, hint, side = "right", strong, dashed }: { at: string; label: string; hint?: string; side?: "left" | "right"; strong?: boolean; dashed?: boolean }) {
  const line = dashed ? "border-t-2 border-dashed border-ink/50" : strong ? "h-0.5 bg-ink" : "h-0.5 bg-ink/70";
  return (
    <span tabIndex={hint ? 0 : undefined} aria-label={hint ?? label} className="group absolute left-1/2 w-[5.5rem] -translate-x-1/2 translate-y-1/2 outline-none" style={{ bottom: at }}>
      <span className={`absolute left-1/2 top-0 w-[4.5rem] -translate-x-1/2 rounded-full ${line}`} />
      <span className={`absolute top-0 -translate-y-1/2 whitespace-nowrap text-[13px] leading-none ${strong ? "font-semibold text-ink" : "text-muted"} ${hint ? "cursor-help group-hover:text-ink group-focus:text-ink" : ""} ${side === "left" ? "right-full mr-1 text-right" : "left-full ml-1"}`}>{label}</span>
      {hint && (
        <span role="tooltip" className={`pointer-events-none invisible absolute bottom-full z-20 mb-2 w-56 rounded-lg border border-line bg-surface p-2.5 text-[14px] leading-snug text-ink-2 opacity-0 shadow-pop transition-opacity group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 ${side === "left" ? "left-0" : "right-0"}`}>{hint}</span>
      )}
    </span>
  );
}

function HorizontalBar(b: BarProps) {
  const max = scaleOf(b);
  const at = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="relative pt-4">
      <div className="relative h-3 overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuemin={0} aria-valuemax={b.goal} aria-valuenow={Math.round(b.invoiced)} aria-label="Invoiced this month against the goal">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: at(b.invoiced), background: b.fill[b.tone] }} />
        {b.booked > 0 && <div className="absolute inset-y-0" style={{ left: at(b.invoiced), width: `calc(${at(b.invoiced + b.booked)} - ${at(b.invoiced)})`, background: STRIPES(b.fill[b.tone]) }} />}
      </div>
      <span className="absolute top-0 -translate-x-1/2 text-[12px] leading-none text-faint" style={{ left: at(b.expected) }} title={b.tickHint}>today</span>
      <span className="absolute top-3 h-5 w-0.5 -translate-x-1/2 rounded-full bg-ink/70" style={{ left: at(b.expected) }} />
      {max > b.goal && <span className="absolute top-3 h-5 w-0.5 -translate-x-1/2 bg-ink" style={{ left: at(b.goal) }} title={`Goal ${inrShort(b.goal)}`} />}
    </div>
  );
}

/** The last six months, small: reached = filled, missed = grey, height = share of that month's goal. */
function History({ months, goalOf, current, colour }: { months: { key: string; revenue: number }[]; goalOf: (month: string) => number; current: string; colour: string }) {
  const past = months.filter((m) => m.key !== current);
  const hit = past.filter((m) => m.revenue >= goalOf(m.key)).length;
  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="flex items-baseline justify-between text-[14.5px]">
        <span className="text-muted">Last 6 months</span>
        <span className="font-medium text-ink-2">{hit} of {past.length} reached</span>
      </div>
      <div className="mt-2 flex h-12 items-end justify-between gap-1.5">
        {past.map((m) => {
          const g = goalOf(m.key);
          const ok = m.revenue >= g;
          return (
            <div key={m.key} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${grainLabel(m.key, "month", true)}: ${inrShort(m.revenue)} of ${inrShort(g)}`}>
              <div className="flex h-8 w-full items-end rounded-[4px] bg-surface-2">
                <div className="w-full rounded-[4px]" style={{ height: `${Math.max(6, Math.min(100, (m.revenue / g) * 100))}%`, background: ok ? colour : "var(--line-strong)" }} />
              </div>
              <span className="text-[12px] leading-none text-faint">{grainLabel(m.key, "month").slice(0, 1)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GoalEditor({ goal, month, monthName, onClose, onSaved }: { goal: Goal; month: string; monthName: string; onClose: () => void; onSaved: (g: Goal) => void }) {
  const lakh = (n?: number) => (n === undefined ? "" : String(Math.round((n / 1e5) * 100) / 100));
  const [usual, setUsual] = useState(lakh(goal.monthly));
  const [only, setOnly] = useState(lakh(goal.months[month]));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const u = Number(usual);
    const o = only.trim() === "" ? null : Number(only);
    if (!Number.isFinite(u) || u <= 0 || (o !== null && (!Number.isFinite(o) || o <= 0))) return setError("Enter the goal in lakh, e.g. 50");
    setBusy(true);
    const r = await fetch("/api/analytics/goal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monthly: u * 1e5, month, amount: o === null ? null : o * 1e5 }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : { error: "Couldn't reach the server" };
    setBusy(false);
    if (!r?.ok || j.error) return setError(j.error ?? "Couldn't save");
    onSaved(j as Goal);
  };
  return (
    <Modal open onClose={onClose} title="Monthly revenue goal">
      <div className="grid gap-4">
        <Field label="Every month (₹ lakh)" hint="Every Zoho Books invoice, before tax.">
          <input className={inputCls} inputMode="decimal" value={usual} onChange={(e) => setUsual(e.target.value)} autoFocus />
        </Field>
        <Field label={`Only for ${monthName} (₹ lakh)`} hint="Leave empty to use the usual goal.">
          <input className={inputCls} inputMode="decimal" value={only} onChange={(e) => setOnly(e.target.value)} placeholder={usual} />
        </Field>
        {error && <p className="text-[15px] text-high">{error}</p>}
        {goal.updatedBy && <p className="text-[14px] text-faint">Last changed by {goal.updatedBy}{goal.updatedAt ? `, ${new Date(goal.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btn.ghost} onClick={onClose}>Cancel</button>
          <button type="button" className={btn.primary} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}
