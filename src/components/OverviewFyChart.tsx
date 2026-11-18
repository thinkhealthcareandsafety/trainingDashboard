"use client";

import { useEffect, useRef, useState } from "react";
import { inrShort } from "@/lib/overviewMath";

/*
 * This FY against last FY, day by day (owner, 18 Nov): one chart for quotations, one for invoices. x = the days from
 * 1 April (last FY's whole 365, this FY up to the day looked at). Solid lines = rupees (left axis): this FY in the series
 * colour, last FY in grey. Dotted lines = how many are sent per day (right axis; owner: "number of quotations per day"),
 * one for each year — drawn as the average of the last 7 days, since single days (Sundays at 0) make a wall of spikes;
 * hovering a day gives that day's own count. It fills the box it is given.
 */

const PAD = { l: 58, r: 38, t: 22, b: 26 };
const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const DOT = "2 3";

function nice(max: number): number {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  const f = max / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
/** The average of each day and the 6 before it (fewer at the start). */
const week = (vals: number[]) => vals.map((_, k) => { const from = Math.max(0, k - 6); let t = 0; for (let j = from; j <= k; j++) t += vals[j]; return t / (k - from + 1); });
const dayOf = (start: string, k: number) => { const d = new Date(`${start}T00:00:00`); d.setDate(d.getDate() + k); return d; };

type Props = {
  title: string; now: number[]; last: number[]; length: number; start: string; lastStart: string; color: string; running: boolean;
  /** How many each day, this FY and last FY, and what one is called ("Quotations per day"). */
  nowCount: number[]; lastCount: number[]; countLabel: string; unit: [string, string];
};

export function OverviewFyChart({ title, now, last, length, start, lastStart, color, running, nowCount, lastCount, countLabel, unit }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { w, h } = size;
  const plotW = Math.max(0, w - PAD.l - PAD.r), plotH = Math.max(0, h - PAD.t - PAD.b);
  const max = nice(Math.max(0, ...now, ...last));
  const nowWeek = week(nowCount), lastWeek = week(lastCount);
  const cMax = Math.max(4, Math.ceil(nice(Math.max(0, ...nowWeek, ...lastWeek)))); // whole numbers on the right
  const x = (k: number) => PAD.l + (length <= 1 ? 0 : (k / (length - 1)) * plotW);
  const y = (v: number) => PAD.t + plotH - (v / max) * plotH;
  const yc = (v: number) => PAD.t + plotH - (v / cMax) * plotH;
  const line = (vals: number[], f: (v: number) => number) => vals.map((v, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${f(v).toFixed(1)}`).join("");
  // Month starts along the bottom.
  const ticks = MONTHS.map((m, i) => {
    const d = new Date(`${start}T00:00:00`); d.setMonth(d.getMonth() + i);
    return { label: m, k: Math.round((d.getTime() - new Date(`${start}T00:00:00`).getTime()) / 86_400_000) };
  });
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const totalNow = running ? now.at(-1) ?? 0 : now.reduce((a, b) => a + b, 0);
  const totalLastSame = running ? last[now.length - 1] ?? 0 : last.slice(0, now.length).reduce((a, b) => a + b, 0);
  const countNow = nowCount.reduce((a, b) => a + b, 0), countLastSame = lastCount.slice(0, nowCount.length).reduce((a, b) => a + b, 0);
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const k = Math.round(((e.clientX - r.left - PAD.l) / Math.max(1, plotW)) * (length - 1));
    setHover(k >= 0 && k < length ? k : null);
  };
  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const many = (n: number) => `${n} ${n === 1 ? unit[0] : unit[1]}`;
  const key = (stroke: string, dotted: boolean, label: string) => (
    <span className="flex items-center gap-1.5">
      <svg width="20" height="6" aria-hidden><line x1="0" x2="20" y1="3" y2="3" stroke={stroke} strokeWidth={dotted ? 2 : 2.2} strokeDasharray={dotted ? DOT : undefined} strokeLinecap="round" /></svg>
      {label}
    </span>
  );

  return (
    <section className="card flex min-w-0 flex-col p-4 sm:p-5" aria-label={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[15.5px] font-semibold text-ink">{title}</h3>
        <p className="num text-[13px] text-muted">This FY so far <span className="font-semibold text-ink">{inrShort(totalNow)}</span> ({many(countNow)}) · last FY by now <span className="font-semibold text-ink">{inrShort(totalLastSame)}</span> ({many(countLastSame)})</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
        {key(color, false, "This FY ₹")}
        {key("var(--faint)", false, "Last FY ₹")}
        {key(color, true, `${countLabel} · this FY`)}
        {key("var(--faint)", true, `${countLabel} · last FY`)}
        <span className="text-faint">(dotted: 7-day average)</span>
      </div>
      <div ref={box} className="relative mt-2 min-h-[220px] flex-1">
        {w > 0 && h > 0 && (
          <svg width={w} height={h} className="block" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`${title}: this FY against last FY, day by day, in rupees and ${countLabel.toLowerCase()}`}>
            {yTicks.map((f) => (
              <g key={f}>
                <line x1={PAD.l} x2={w - PAD.r} y1={y(f * max)} y2={y(f * max)} stroke="var(--line)" strokeWidth="1" />
                <text x={PAD.l - 8} y={y(f * max) + 4} textAnchor="end" className="num fill-[var(--muted)] text-[11px]">{inrShort(f * max)}</text>
                <text x={w - PAD.r + 8} y={yc(f * cMax) + 4} textAnchor="start" className="num fill-[var(--muted)] text-[11px]">{Math.round(f * cMax)}</text>
              </g>
            ))}
            <text x={w - 2} y={10} textAnchor="end" className="fill-[var(--faint)] text-[10px]">per day</text>
            {ticks.map((t) => <text key={t.label} x={x(t.k)} y={h - 8} textAnchor="start" className="fill-[var(--muted)] text-[11px]">{t.label}</text>)}
            {/* How many each day: dotted, behind the rupee lines. */}
            <path d={line(lastWeek, yc)} fill="none" stroke="var(--faint)" strokeWidth="1.4" strokeDasharray={DOT} strokeLinecap="round" opacity="0.9" />
            <path d={line(nowWeek, yc)} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray={DOT} strokeLinecap="round" opacity="0.85" />
            <path d={line(last, y)} fill="none" stroke="var(--faint)" strokeWidth="1.5" strokeLinejoin="round" opacity="0.8" />
            <path d={line(now, y)} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" />
            {hover !== null && (
              <g pointerEvents="none">
                <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + plotH} stroke="var(--line-strong)" strokeDasharray="3 3" />
                {hover < now.length && <circle cx={x(hover)} cy={y(now[hover])} r="3.5" fill={color} />}
                <circle cx={x(hover)} cy={y(last[hover] ?? 0)} r="3" fill="var(--faint)" />
              </g>
            )}
          </svg>
        )}
        {hover !== null && w > 0 && (
          <div className="pointer-events-none absolute top-1 rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] shadow-pop" style={{ left: Math.min(Math.max(PAD.l, x(hover) + 10), w - 230) }}>
            {hover < now.length
              ? <p className="num font-semibold text-ink">{fmt(dayOf(start, hover))}<span className="font-normal text-ink-2">: {inrShort(now[hover])} · {many(nowCount[hover] ?? 0)}</span></p>
              : <p className="font-semibold text-ink">Not yet this FY</p>}
            <p className="num text-muted">{fmt(dayOf(lastStart, hover))}: {inrShort(last[hover] ?? 0)} · {many(lastCount[hover] ?? 0)}</p>
          </div>
        )}
      </div>
    </section>
  );
}
