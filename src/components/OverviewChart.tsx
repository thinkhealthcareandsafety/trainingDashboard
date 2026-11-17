"use client";

import { useEffect, useRef, useState } from "react";
import { type MonthPoint, inrShort } from "@/lib/overviewMath";

/*
 * The Overview's line chart (owner, 17 Nov): quotations sent, invoiced and conversion, month by month for the 12 months up
 * to the day looked at. Rupees and % don't share a scale, so it's one chart in two bands on one time axis: quotations and
 * invoiced (₹) above, conversion (%) below. New clients: later (owner: skip for now). It fills the height it is given.
 */

const PAD = { l: 52, r: 86, t: 6, b: 22, gap: 20 };

function nice(max: number): number {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  const f = max / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

export function OverviewChart({ points }: { points: MonthPoint[] }) {
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
  const n = points.length;
  const plotW = Math.max(0, w - PAD.l - PAD.r);
  const bandsH = Math.max(0, h - PAD.t - PAD.b - PAD.gap);
  const topH = Math.round(bandsH * 0.62), botH = bandsH - topH;
  const top0 = PAD.t, bot0 = PAD.t + topH + PAD.gap;
  const x = (i: number) => PAD.l + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const moneyMax = nice(Math.max(...points.map((p) => Math.max(p.quoted, p.invoiced)), 0));
  const convMax = nice(Math.max(100, ...points.map((p) => p.conversion ?? 0)));
  const yM = (v: number) => top0 + topH - (v / moneyMax) * topH;
  const yC = (v: number) => bot0 + botH - (v / convMax) * botH;

  // A path per series; the month still running is drawn dashed.
  const path = (vals: (number | null)[], y: (v: number) => number, from: number, to: number) => {
    let d = "", pen = false;
    for (let i = from; i <= to; i++) {
      const v = vals[i];
      if (v === null) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const partial = points[n - 1]?.partial;
  const solidTo = partial ? n - 2 : n - 1;
  const series = [
    { key: "q", label: "Quotations sent", color: "var(--series-1)", vals: points.map((p) => p.quoted), y: yM },
    { key: "i", label: "Invoiced", color: "var(--series-2)", vals: points.map((p) => p.invoiced), y: yM },
    { key: "c", label: "Conversion", color: "var(--info)", vals: points.map((p) => p.conversion), y: yC },
  ];

  // Direct labels at the line ends, nudged apart so they never overlap.
  const ends = series.slice(0, 2).map((s) => ({ s, y: s.y(s.vals[n - 1] ?? 0) }));
  if (ends.length === 2 && Math.abs(ends[0].y - ends[1].y) < 14) {
    const mid = (ends[0].y + ends[1].y) / 2, up = ends[0].y <= ends[1].y ? 0 : 1;
    ends[up].y = mid - 7; ends[1 - up].y = mid + 7;
  }
  const lastConv = [...points].reverse().find((p) => p.conversion !== null);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - PAD.l) / Math.max(plotW, 1)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const hp = hover !== null ? points[hover] : null;
  const step = Math.max(1, Math.ceil(34 / Math.max(plotW / Math.max(n - 1, 1), 1))); // month labels need ~34px each; on a phone, every other one

  return (
    <section className="card flex h-full min-h-[200px] min-w-0 flex-col px-5 py-4" aria-label="Month by month">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <h3 className="text-[15px] font-semibold text-ink">Month by month <span className="text-[12px] font-normal text-muted">· the last 12 months</span></h3>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
          {series.map((s) => <li key={s.key} className="flex items-center gap-1.5"><span className="h-[3px] w-4 rounded-full" style={{ background: s.color }} />{s.label}{s.key === "c" && <span className="text-muted">(invoiced ÷ quoted)</span>}</li>)}
          {partial && <li className="flex items-center gap-1.5 text-muted"><span className="w-4 border-t-2 border-dashed border-muted" />this month so far</li>}
        </ul>
      </div>
      <div ref={box} className="relative mt-3 min-h-0 flex-1">
        {w > 0 && h > 0 && (
          <svg width={w} height={h} className="block overflow-visible" role="img" aria-label="Quotations sent, invoiced and conversion for the last 12 months">
            {/* recessive grid and y labels */}
            {[0, 0.5, 1].map((f) => (
              <g key={`m${f}`}>
                <line x1={PAD.l} x2={PAD.l + plotW} y1={yM(moneyMax * f)} y2={yM(moneyMax * f)} stroke="var(--line)" />
                <text x={PAD.l - 8} y={yM(moneyMax * f)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--muted)" className="num">{inrShort(moneyMax * f)}</text>
              </g>
            ))}
            {[0, 0.5, 1].map((f) => (
              <g key={`c${f}`}>
                <line x1={PAD.l} x2={PAD.l + plotW} y1={yC(convMax * f)} y2={yC(convMax * f)} stroke="var(--line)" />
                <text x={PAD.l - 8} y={yC(convMax * f)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--muted)" className="num">{Math.round(convMax * f)}%</text>
              </g>
            ))}
            {points.map((p, i) => (i % step === (n - 1) % step || hover === i) && (
              <text key={p.key} x={x(i)} y={h - 6} textAnchor="middle" fontSize="11" fill={hover === i ? "var(--ink)" : "var(--muted)"}>{p.label}</text>
            ))}
            {/* crosshair */}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={top0} y2={bot0 + botH} stroke="var(--line-strong)" />}
            {/* lines */}
            {series.map((s) => (
              <g key={s.key} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
                <path d={path(s.vals, s.y, 0, solidTo)} />
                {partial && n > 1 && <path d={path(s.vals, s.y, n - 2, n - 1)} strokeDasharray="4 4" />}
              </g>
            ))}
            {/* direct labels at the ends */}
            {ends.map(({ s, y }) => <text key={s.key} x={PAD.l + plotW + 8} y={y} dy="0.32em" fontSize="11.5" fill="var(--ink-2)">{s.label === "Quotations sent" ? "Quotations" : s.label}</text>)}
            {lastConv && <text x={PAD.l + plotW + 8} y={yC(lastConv.conversion!)} dy="0.32em" fontSize="11.5" fill="var(--ink-2)">Conversion</text>}
            {/* hover dots */}
            {hover !== null && series.map((s) => s.vals[hover] !== null && (
              <circle key={s.key} cx={x(hover)} cy={s.y(s.vals[hover]!)} r="4" fill={s.color} stroke="var(--surface)" strokeWidth="2" />
            ))}
            <rect x={PAD.l - 10} y={0} width={plotW + 20} height={h} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
          </svg>
        )}
        {hp && hover !== null && (
          <div className="pointer-events-none absolute z-10 w-[190px] rounded-xl border border-line bg-surface px-3 py-2.5 text-[12px] shadow-lg" style={{ left: Math.min(Math.max(x(hover) - 95, 0), w - 190), top: 0 }}>
            <p className="font-semibold text-ink">{hp.label} {hp.year}{hp.partial ? " (so far)" : ""}</p>
            {series.map((s) => (
              <p key={s.key} className="num mt-1 flex items-center justify-between gap-3 text-ink-2">
                <span className="flex items-center gap-1.5"><span className="h-[3px] w-3 rounded-full" style={{ background: s.color }} />{s.label}</span>
                <span className="font-semibold text-ink">{s.key === "c" ? (hp.conversion === null ? "—" : `${hp.conversion}%`) : inrShort(s.vals[hover] as number)}</span>
              </p>
            ))}
          </div>
        )}
        {/* the same figures as a table, for screen readers */}
        <table className="sr-only">
          <caption>Month by month</caption>
          <thead><tr><th>Month</th><th>Quotations sent</th><th>Invoiced</th><th>Conversion</th></tr></thead>
          <tbody>{points.map((p) => <tr key={p.key}><td>{p.label} {p.year}</td><td>{inrShort(p.quoted)}</td><td>{inrShort(p.invoiced)}</td><td>{p.conversion === null ? "—" : `${p.conversion}%`}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
