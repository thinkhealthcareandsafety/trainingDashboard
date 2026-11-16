"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { QuizResults } from "@/lib/portalTrainings";
import { type Item, accuracyColor, buildReport, fmtSeconds } from "@/lib/quizReport";

/*
 * The quiz report (owner, 16 Nov: "click here to generate report for the quiz"): a full-screen dashboard in four tiers,
 * top-down — 1 KPI cards; 2 score distribution, topic mastery, time vs score; 3 the 30-question item analysis (an
 * accuracy heatmap and the questions sorted hardest first); 4 a searchable, filterable drill-down table. Print / Save as
 * PDF. The portal's world: navy marks on white cards, hairline guides, values in text inks; the heatmap alone goes
 * red → grey → green (owner's ask) and every tile carries its number, so colour is never the only cue.
 */

const card = "rounded-xl bg-surface p-4 ring-1 ring-line sm:p-5";
const h = "text-[16px] font-extrabold tracking-[-0.01em] text-ink";
const sub = "mt-0.5 text-[13px] leading-snug text-muted";
const label = "text-[12px] font-bold uppercase tracking-[0.12em] text-muted";

function Kpi({ title, value, note }: { title: string; value: React.ReactNode; note: React.ReactNode }) {
  return (
    <div className={card}>
      <p className={label}>{title}</p>
      <p className="num mt-2 text-[30px] font-extrabold leading-none tracking-[-0.02em] text-ink">{value}</p>
      <p className="mt-2 text-[13.5px] text-ink-2">{note}</p>
    </div>
  );
}

function Histogram({ data, pass }: { data: { label: string; count: number; passing: boolean }[]; pass: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const first = data.findIndex((d) => d.passing);
  return (
    <section className={card}>
      <h5 className={h}>Score distribution</h5>
      <p className={sub}>Questions right on each person&apos;s best try</p>
      <div className="mt-5 flex h-[160px] items-end gap-3 border-b border-line">
        {data.map((d, i) => (
          <div key={d.label} className={`relative flex h-full flex-1 flex-col items-center justify-end ${i === first ? "border-l border-ink-2/40" : ""}`}>
            {i === first && <span className="absolute -top-1 left-1.5 whitespace-nowrap text-[11.5px] font-semibold text-ink-2">{pass}</span>}
            <span className="num mb-1 text-[13px] font-bold text-ink">{d.count}</span>
            <span className="w-full max-w-[24px] rounded-t-[4px]" style={{ height: `${d.count ? Math.max(4, (d.count / max) * 118) : 0}px`, background: d.passing ? "var(--navy)" : "var(--line-strong)" }} title={`${d.label} right: ${d.count}`} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-3">{data.map((d) => <span key={d.label} className="num flex-1 text-center text-[12px] text-muted">{d.label}</span>)}</div>
    </section>
  );
}

function Topics({ data }: { data: { name: string; pct: number; questions: number }[] }) {
  return (
    <section className={card}>
      <h5 className={h}>By topic</h5>
      <p className={sub}>% right, first tries</p>
      <ul className="mt-4 space-y-3.5">
        {data.map((t) => (
          <li key={t.name}>
            <p className="text-[14px] font-semibold text-ink">{t.name} <span className="font-normal text-muted">· {t.questions} questions</span></p>
            <div className="mt-1.5 flex items-center gap-2.5">
              <span className="h-3 flex-1 rounded-full bg-ground"><span className="block h-full rounded-l-full rounded-r-[4px] bg-navy" style={{ width: `${t.pct}%` }} title={`${t.name}: ${t.pct}% right`} /></span>
              <span className="num w-11 text-right text-[13.5px] font-bold text-ink">{t.pct}%</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Scatter({ dots, passPct }: { dots: { name: string; minutes: number; pct: number; passed: boolean }[]; passPct: number }) {
  const maxMin = Math.max(5, Math.ceil(Math.max(0, ...dots.map((d) => d.minutes)) / 5) * 5);
  return (
    <section className={card}>
      <h5 className={h}>Time vs score</h5>
      <p className={sub}>Minutes on their best try · filled = passed, hollow = not yet</p>
      <div className="mt-4 flex gap-2">
        <div className="relative w-8 shrink-0">{[0, 50, 100].map((v) => <span key={v} className="num absolute right-0 text-[11.5px] leading-none text-muted" style={{ bottom: `${v}%`, transform: "translateY(50%)" }}>{v}%</span>)}</div>
        <div className="relative h-[160px] min-w-0 flex-1 border-b border-l border-line">
          {[50, 100].map((v) => <span key={v} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${v}%` }} aria-hidden />)}
          <span className="absolute inset-x-0 border-t border-ink-2/50" style={{ bottom: `${passPct}%` }} aria-hidden />
          <span className="absolute left-1.5 z-10 rounded bg-surface px-1 text-[11.5px] font-semibold text-ink-2" style={{ bottom: `calc(${passPct}% + 3px)` }}>{passPct}% to pass</span>
          {dots.map((d, i) => (
            <span key={i} title={`${d.name}: ${d.pct}% in ${d.minutes} min`} className={`absolute size-3 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-surface ${d.passed ? "bg-navy" : "bg-surface shadow-[inset_0_0_0_2px_var(--muted)]"}`} style={{ left: `${(d.minutes / maxMin) * 100}%`, bottom: `${d.pct}%` }} />
          ))}
        </div>
      </div>
      <div className="ml-10 mt-1.5 flex justify-between">{[0, maxMin / 2, maxMin].map((t) => <span key={t} className="num text-[11.5px] text-muted">{t} min</span>)}</div>
    </section>
  );
}

function Heatmap({ items, onPick }: { items: Item[]; onPick: (n: number) => void }) {
  return (
    <section className={card}>
      <h5 className={h}>Accuracy, question by question</h5>
      <p className={sub}>Each tile is a question: % right on first tries · red low, green high</p>
      <div className="mt-4 grid grid-cols-5 gap-1.5 sm:grid-cols-10">
        {items.map((q) => {
          const c = accuracyColor(q.rightPct);
          return (
            <button key={q.n} type="button" onClick={() => onPick(q.n)} title={`Q${q.n}: ${q.text} — ${q.rightPct}% right`}
              className="flex aspect-[4/3] flex-col items-center justify-center rounded-md text-center transition hover:ring-2 hover:ring-navy" style={{ background: c.bg, color: c.ink === "light" ? "#fff" : "var(--ink)" }}>
              <span className="num text-[11px] font-semibold opacity-85">Q{q.n}</span>
              <span className="num text-[14px] font-extrabold leading-tight">{q.rightPct}%</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[12px] text-muted">
        <span>0%</span><span className="h-2 w-40 rounded-full" style={{ background: `linear-gradient(90deg, ${accuracyColor(0).bg}, ${accuracyColor(50).bg}, ${accuracyColor(100).bg})` }} /><span>100%</span>
      </div>
    </section>
  );
}

function Hardest({ items, onPick }: { items: Item[]; onPick: (n: number) => void }) {
  const sorted = [...items].sort((a, b) => a.rightPct - b.rightPct || a.n - b.n);
  return (
    <section className={card}>
      <h5 className={h}>Hardest first</h5>
      <p className={sub}>Every question by % right, lowest on top</p>
      <ol className="no-scrollbar mt-3 max-h-[340px] space-y-1.5 overflow-y-auto pr-1">
        {sorted.map((q) => (
          <li key={q.n}>
            <button type="button" onClick={() => onPick(q.n)} className="grid w-full grid-cols-[40px_minmax(0,1fr)_44px] items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-ground">
              <span className="num text-[12.5px] font-semibold text-muted">Q{q.n}</span>
              <span className="h-2.5 rounded-full bg-ground" title={q.text}><span className="block h-full rounded-l-full rounded-r-[3px] bg-navy" style={{ width: `${q.rightPct}%`, minWidth: q.rightPct ? 4 : 0 }} /></span>
              <span className="num text-right text-[12.5px] font-bold text-ink">{q.rightPct}%</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

type Sort = "n" | "right" | "disc";
function Table({ items, open, setOpen }: { items: Item[]; open: number | null; setOpen: (n: number | null) => void }) {
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState("");
  const [sort, setSort] = useState<Sort>("n");
  const topics = [...new Set(items.map((i) => i.topic).filter(Boolean))];
  const rows = items
    .filter((i) => (!topic || i.topic === topic) && (!q.trim() || `${i.n} ${i.text} ${i.topic}`.toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => (sort === "right" ? a.rightPct - b.rightPct : sort === "disc" ? (a.discrimination ?? 9) - (b.discrimination ?? 9) : a.n - b.n) || a.n - b.n);
  const th = (key: Sort, text: string, cls = "") => (
    <th className={`px-3 py-2 text-left text-[12px] font-bold uppercase tracking-[0.08em] text-muted ${cls}`}>
      <button type="button" className={`whitespace-nowrap uppercase tracking-[0.08em] hover:text-ink ${sort === key ? "text-ink" : ""}`} onClick={() => setSort(key)}>{text}{sort === key ? " ↓" : ""}</button>
    </th>
  );
  return (
    <section className={card} aria-label="Every question">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h5 className={h}>Every question</h5><p className={sub}>Search, filter by topic, sort; open a row for every option&apos;s count</p></div>
        <div className="flex flex-wrap gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions" className="h-10 w-56 rounded-xl border border-line bg-surface px-3 text-[14px] text-ink focus:border-action focus:outline-none focus:ring-4 focus:ring-action/15" />
          <select value={topic} onChange={(e) => setTopic(e.target.value)} className="h-10 rounded-xl border border-line bg-surface px-3 text-[14px] text-ink">
            <option value="">All topics</option>{topics.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-line">
        <table className="w-full min-w-[760px] text-[14px]">
          <thead className="bg-ground"><tr>{th("n", "#", "w-12")}<th className="px-3 py-2 text-left text-[12px] font-bold uppercase tracking-[0.08em] text-muted">Question</th>{th("right", "Correct", "w-28")}<th className="px-3 py-2 text-left text-[12px] font-bold uppercase tracking-[0.08em] text-muted">Most common wrong answer</th>{th("disc", "Discrimination", "w-36")}</tr></thead>
          <tbody>
            {rows.map((i) => (
              <Fragment key={i.n}>
                <tr className={`cursor-pointer border-t border-line align-top hover:bg-ground/60 ${open === i.n ? "bg-ground/60" : ""}`} onClick={() => setOpen(open === i.n ? null : i.n)}>
                  <td className="num px-3 py-2.5 font-semibold text-muted">{i.n}</td>
                  <td className="px-3 py-2.5"><p className="font-semibold text-ink">{i.text}</p>{i.topic && <p className="text-[12.5px] text-muted">{i.topic}</p>}</td>
                  <td className="num px-3 py-2.5 font-bold text-ink">{i.rightPct}%</td>
                  <td className="px-3 py-2.5 text-ink-2">{i.wrong ? <>{i.wrong.text} <span className="num text-muted">({i.wrong.pct}%)</span></> : <span className="text-muted">—</span>}</td>
                  <td className="num px-3 py-2.5 text-ink-2">{i.discrimination === null ? <span className="text-muted">—</span> : <>{i.discrimination.toFixed(2)} <span className="text-[12.5px] text-muted">{i.discrimination >= 0.3 ? "good" : i.discrimination >= 0.1 ? "fair" : "weak"}</span></>}</td>
                </tr>
                {open === i.n && (
                  <tr className="bg-ground/60"><td /><td colSpan={4} className="px-3 pb-3">
                    <ul className="space-y-1.5">
                      {i.options.map((o, k) => (
                        <li key={k} className="grid grid-cols-[minmax(0,1fr)_minmax(80px,30%)_70px] items-center gap-3 text-[13.5px]">
                          <span className={o.right ? "font-bold text-ink" : "text-ink-2"}>{o.text}{o.right ? " (right)" : ""}</span>
                          <span className="h-2 rounded-full bg-surface"><span className={`block h-full rounded-full ${o.right ? "bg-navy" : "bg-line-strong"}`} style={{ width: `${o.pct}%` }} /></span>
                          <span className="num text-right text-ink-2">{o.count} · {o.pct}%</span>
                        </li>
                      ))}
                    </ul>
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12.5px] text-muted">Discrimination: the share right among the top 27% of scorers minus among the bottom 27% (first tries). 0.3 or more separates well; below 0.1 the question may be unclear or a giveaway.</p>
    </section>
  );
}

function Report({ title, r, onClose }: { title: string; r: QuizResults; onClose: () => void }) {
  const data = useMemo(() => buildReport(r), [r]);
  const [open, setOpen] = useState<number | null>(null);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => { document.body.style.overflow = was; window.removeEventListener("keydown", key); };
  }, [onClose]);
  const pick = (n: number) => { setOpen(n); setTimeout(() => body.current?.querySelector("[aria-label='Every question']")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30); };
  // Print / Save as PDF: the report alone, in a window of its own with the page's styles.
  const print = () => {
    const w = window.open("", "_blank");
    if (!w || !body.current) return window.print();
    const styles = [...document.querySelectorAll("link[rel=stylesheet], style")].map((n) => n.outerHTML).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title} report</title>${styles}<style>body{background:#fff;padding:24px}.no-print{display:none!important}</style></head><body>${body.current.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 500);
  };
  const k = data.kpi;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ground" role="dialog" aria-modal="true" aria-label={`${title} report`}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
        <div className="min-w-0"><h4 className="truncate text-[18px] font-extrabold tracking-[-0.01em] text-ink sm:text-[20px]">{title} report</h4><p className="hidden text-[13px] text-muted sm:block">Everyone who took it, combined</p></div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={print} className="h-10 rounded-xl px-4 text-[14px] font-bold text-action ring-1 ring-inset ring-action/35 hover:bg-action/5"><span className="sm:hidden">Print</span><span className="hidden sm:inline">Print / Save as PDF</span></button>
          <button type="button" onClick={onClose} className="h-10 rounded-xl bg-navy px-4 text-[14px] font-bold text-white hover:bg-navy-deep">Close</button>
        </div>
      </header>
      <div ref={body} className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi title="Participants" value={<>{k.finished}<span className="text-[18px] font-bold text-muted"> of {k.started}</span></>} note={<>finished · {k.completionPct}% completion</>} />
            <Kpi title="Average score" value={<>{k.avgCorrect}<span className="text-[18px] font-bold text-muted"> / {k.of}</span></>} note={<>{k.avgPct}% on best tries</>} />
            <Kpi title="Pass rate" value={`${k.passPct}%`} note={<>{k.passed} passed ({r.passPct}% or more)</>} />
            <Kpi title="Average time" value={fmtSeconds(k.avgSeconds)} note="to finish, best try" />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Histogram data={data.histogram} pass={`${Math.ceil((r.passPct / 100) * k.of)}+ passes`} />
            <Topics data={data.topics} />
            <Scatter dots={data.scatter} passPct={r.passPct} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Heatmap items={data.items} onPick={pick} />
            <Hardest items={data.items} onPick={pick} />
          </div>
          <Table items={data.items} open={open} setOpen={setOpen} />
        </div>
      </div>
    </div>
  );
}

/** In the panel: one line and "Generate the quiz report". */
export function QuizReportLauncher({ title, r }: { title: string; r: QuizResults }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ground px-5 py-4" aria-label="Quiz report">
      <div>
        <h5 className="text-[17px] font-extrabold tracking-[-0.01em] text-ink">Quiz report</h5>
        <p className="mt-0.5 text-[13.5px] text-muted">Scores, topics, time and all {r.questions.length} questions, for everyone combined.</p>
      </div>
      <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl bg-action px-5 text-[15px] font-bold text-white shadow-[0_2px_8px_rgb(0_80_130/0.22)] transition hover:bg-action-hover" onClick={() => setOpen(true)}>Generate the quiz report</button>
      {open && <Report title={title} r={r} onClose={() => setOpen(false)} />}
    </section>
  );
}
