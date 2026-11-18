"use client";

import { useEffect, useRef, useState } from "react";
import { inrShort } from "@/lib/overviewMath";

/*
 * This FY against last FY, day by day (owner, 18 Nov): one chart for quotations, one for invoices. x = the days from
 * 1 April (last FY's whole 365, this FY up to the day looked at), y = rupees; this FY in the series colour, last FY in
 * grey. Hover a day for both values. It fills the box it is given.
 */

const PAD = { l: 58, r: 16, t: 14, b: 26 };
const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

function nice(max: number): number {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  const f = max / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
const dayOf = (start: string, k: number) => { const d = new Date(`${start}T00:00:00`); d.setDate(d.getDate() + k); return d; };

export function OverviewFyChart({ title, now, last, length, start, lastStart, color, running }: { title: string; now: number[]; last: number[]; length: number; start: string; lastStart: string; color: string; running: boolean }) {
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
  const x = (k: number) => PAD.l + (length <= 1 ? 0 : (k / (length - 1)) * plotW);
  const y = (v: number) => PAD.t + plotH - (v / max) * plotH;
  const line = (vals: number[]) => vals.map((v, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join("");
  // Month starts along the bottom.
  const ticks = MONTHS.map((m, i) => {
    const d = new Date(`${start}T00:00:00`); d.setMonth(d.getMonth() + i);
    return { label: m, k: Math.round((d.getTime() - new Date(`${start}T00:00:00`).getTime()) / 86_400_000) };
  });
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const totalNow = running ? now.at(-1) ?? 0 : now.reduce((a, b) => a + b, 0);
  const totalLastSame = running ? last[now.length - 1] ?? 0 : last.slice(0, now.length).reduce((a, b) => a + b, 0);
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const k = Math.round(((e.clientX - r.left - PAD.l) / Math.max(1, plotW)) * (length - 1));
    setHover(k >= 0 && k < length ? k : null);
  };
  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <section className="card flex min-w-0 flex-col p-4 sm:p-5" aria-label={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[15.5px] font-semibold text-ink">{title}</h3>
        <p className="num text-[13px] text-muted">This FY so far <span className="font-semibold text-ink">{inrShort(totalNow)}</span> · last FY by now <span className="font-semibold text-ink">{inrShort(totalLastSame)}</span></p>
      </div>
      <div className="mt-2 flex items-center gap-4 text-[12.5px] text-ink-2">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded" style={{ background: color }} />This FY</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded" style={{ background: "var(--faint)" }} />Last FY</span>
      </div>
      <div ref={box} className="relative mt-2 min-h-[220px] flex-1">
        {w > 0 && h > 0 && (
          <svg width={w} height={h} className="block" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`${title}: this FY against last FY, day by day`}>
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={PAD.l} x2={w - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
                <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="num fill-[var(--muted)] text-[11px]">{inrShort(v)}</text>
              </g>
            ))}
            {ticks.map((t) => <text key={t.label} x={x(t.k)} y={h - 8} textAnchor="start" className="fill-[var(--muted)] text-[11px]">{t.label}</text>)}
            <path d={line(last)} fill="none" stroke="var(--faint, #9a9aa0)" strokeWidth="1.5" strokeLinejoin="round" opacity="0.8" />
            <path d={line(now)} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" />
            {hover !== null && (
              <g pointerEvents="none">
                <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + plotH} stroke="var(--line-strong)" strokeDasharray="3 3" />
                {hover < now.length && <circle cx={x(hover)} cy={y(now[hover])} r="3.5" fill={color} />}
                <circle cx={x(hover)} cy={y(last[hover] ?? 0)} r="3" fill="var(--faint, #9a9aa0)" />
              </g>
            )}
          </svg>
        )}
        {hover !== null && w > 0 && (
          <div className="pointer-events-none absolute top-1 rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] shadow-pop" style={{ left: Math.min(Math.max(PAD.l, x(hover) + 10), w - 190) }}>
            <p className="num font-semibold text-ink">{hover < now.length ? fmt(dayOf(start, hover)) : "Not yet this FY"}{hover < now.length ? <span className="font-normal text-ink-2">: {inrShort(now[hover])}</span> : null}</p>
            <p className="num text-muted">{fmt(dayOf(lastStart, hover))}: {inrShort(last[hover] ?? 0)}</p>
          </div>
        )}
      </div>
    </section>
  );
}
