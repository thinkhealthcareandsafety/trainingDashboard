"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { QuizResults } from "@/lib/portalTrainings";
import { type Item, accuracyColor, buildReport, fmtSeconds, insight } from "@/lib/quizReport";

/*
 * The quiz report (owner, 16 Nov: "click here to generate report for the quiz"): a full-screen dashboard in four tiers,
 * top-down — 1 KPI cards; 2 score distribution, topic mastery, time vs score; 3 the 30-question item analysis (an
 * accuracy heatmap and the questions sorted hardest first); 4 every question as a card with its own chart (owner, 16 Nov:
 * "different charts … if I see I understand nothing"): a donut for 3–4 options, a split bar for two, the pictures for
 * picture questions, and one plain-words line. Print / Save as
 * PDF. The portal's world: navy marks on white cards, hairline guides, values in text inks; the heatmap alone goes
 * red → grey → green (owner's ask) and every tile carries its number, so colour is never the only cue.
 */

const card = "rounded-xl bg-surface p-4 ring-1 ring-line sm:p-6";
const h = "text-[16px] font-extrabold tracking-[-0.01em] text-ink";
const sub = "mt-0.5 text-[13px] leading-snug text-muted";
const label = "text-[12px] font-bold uppercase tracking-[0.12em] text-muted";

function Kpi({ title, value, note, onClick }: { title: string; value: React.ReactNode; note: React.ReactNode; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag {...(onClick ? { type: "button" as const, onClick } : {})} className={`${card} text-left ${onClick ? "transition hover:ring-navy/40" : ""}`}>
      <p className={label}>{title}</p>
      <p className="num mt-2 text-[30px] font-extrabold leading-none tracking-[-0.02em] text-ink">{value}</p>
      <p className="mt-2 text-[13.5px] text-ink-2">{note}</p>
    </Tag>
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
    <section className={`${card} flex flex-col`}>
      <h5 className={h}>Hardest first</h5>
      <p className={sub}>Every question by % right, lowest on top</p>
      {/* As tall as the heatmap beside it (scrolls only past that); on phones a fixed height. */}
      <div className="relative mt-3 lg:min-h-[200px] lg:flex-1">
      <ol className="no-scrollbar max-h-[340px] space-y-1.5 overflow-y-auto pr-1 lg:absolute lg:inset-0 lg:max-h-none">
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
      </div>
    </section>
  );
}

/** The options' colours, in a fixed order (A, B, C, D), checked for colour-blind separation; every option is also labelled. */
const OPTION_COLORS = ["#1f6fb2", "#e08a1e", "#2fa37a", "#8e5bd8"];

function Correct() {
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 align-[1px] text-[11.5px] font-bold uppercase tracking-[0.08em] text-navy">
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden><circle cx="8" cy="8" r="8" fill="var(--navy)" /><path d="m4.5 8.2 2.3 2.3 4.7-4.8" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      correct
    </span>
  );
}

/** A donut of how the group split, the share who got it right in the middle (3–4 options). */
function Donut({ q }: { q: Item }) {
  const R = 44, C = 2 * Math.PI * R, GAP = q.options.filter((o) => o.count).length > 1 ? 2.5 : 0;
  let at = 0;
  return (
    <div className="flex items-center gap-5">
      <div className="relative size-[116px] shrink-0">
        <svg viewBox="0 0 116 116" className="size-full -rotate-90" aria-hidden>
          <circle cx="58" cy="58" r={R} fill="none" stroke="var(--ground)" strokeWidth="18" />
          {q.options.map((o, k) => {
            if (!o.count) return null;
            const len = (o.pct / 100) * C;
            const seg = <circle key={k} cx="58" cy="58" r={R} fill="none" stroke={OPTION_COLORS[k % 4]} strokeWidth="18" strokeDasharray={`${Math.max(0, len - GAP)} ${C}`} strokeDashoffset={-at}><title>{`${o.text}: ${o.count} (${o.pct}%)`}</title></circle>;
            at += len;
            return seg;
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center"><div><p className="num text-[20px] font-extrabold leading-none text-ink">{q.rightPct}%</p><p className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">correct</p></div></div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {q.options.map((o, k) => (
          <li key={k} className="flex items-start gap-2 text-[13.5px] leading-snug">
            <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: OPTION_COLORS[k % 4] }} aria-hidden />
            <span className={`min-w-0 flex-1 ${o.right ? "font-semibold text-ink" : "text-ink-2"}`}>{o.text}{o.right && <Correct />}</span>
            <span className="num shrink-0 text-ink-2"><b className="text-ink">{o.pct}%</b> <span className="text-muted">· {o.count}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Two options: one bar split between them. */
function Split({ q }: { q: Item }) {
  const [a, b] = q.options;
  return (
    <div>
      <div className="flex h-9 gap-[2px] overflow-hidden rounded-lg bg-ground">
        {q.options.map((o, k) => o.pct > 0 && (
          <span key={k} className="grid place-items-center text-[13px] font-extrabold text-white" style={{ width: `${o.pct}%`, background: OPTION_COLORS[k] }} title={`${o.text}: ${o.count} (${o.pct}%)`}>{o.pct >= 12 ? `${o.pct}%` : ""}</span>
        ))}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-4 text-[13.5px] leading-snug">
        {[a, b].map((o, k) => o && (
          <div key={k} className={k === 1 ? "text-right" : ""}>
            <span className={`inline-flex items-start gap-1.5 ${k === 1 ? "flex-row-reverse" : ""}`}><span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: OPTION_COLORS[k] }} aria-hidden /><span className={o.right ? "font-semibold text-ink" : "text-ink-2"}>{o.text}{o.right && <Correct />}</span></span>
            <p className="num text-muted">{o.count} {o.count === 1 ? "person" : "people"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Picture questions: the pictures themselves, the share under each. */
function Pictures({ q }: { q: Item }) {
  return (
    <div className={`grid gap-2.5 ${q.options.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
      {q.options.map((o, k) => (
        <div key={k} className={`overflow-hidden rounded-lg bg-surface ring-1 ${o.right ? "ring-2 ring-navy" : "ring-line"}`} title={`${o.text}: ${o.count} (${o.pct}%)`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the quiz's own option pictures */}
          {o.image && <img src={o.image} alt={o.text} className="aspect-square w-full bg-ground object-contain p-1" />}
          <div className="px-2 pb-2 pt-1.5">
            <p className={`line-clamp-2 min-h-[2.4em] text-[12px] leading-tight ${o.right ? "font-semibold text-ink" : "text-ink-2"}`}>{o.text}</p>
            <span className="mt-1 block h-1.5 rounded-full bg-ground"><span className="block h-full rounded-full" style={{ width: `${o.pct}%`, background: o.right ? "var(--navy)" : "var(--line-strong)" }} /></span>
            <p className="num mt-1 flex items-center gap-1 text-[13px] font-extrabold text-ink">{o.pct}%{o.right && <svg viewBox="0 0 16 16" width="13" height="13" role="img" aria-label="correct"><circle cx="8" cy="8" r="8" fill="var(--navy)" /><path d="m4.5 8.2 2.3 2.3 4.7-4.8" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function QuestionCard({ q, focus }: { q: Item; focus: boolean }) {
  const pictures = q.options.some((o) => o.image);
  const verdict = insight(q);
  return (
    <li id={`qcard-${q.n}`} className={`scroll-mt-4 rounded-xl bg-surface p-4 ring-1 sm:p-5 ${focus ? "ring-2 ring-navy" : "ring-line"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="num text-[12px] font-bold uppercase tracking-[0.12em] text-muted">Question {q.n}</p>
        {q.topic && <span className="rounded-full bg-ground px-2 py-0.5 text-[11.5px] font-semibold text-ink-2">{q.topic}</span>}
      </div>
      <p className="mt-1.5 text-[15px] font-bold leading-snug text-ink">{q.text}</p>
      <p className={`mt-1 text-[13.5px] font-semibold ${verdict.tone === "good" ? "text-navy" : verdict.tone === "bad" ? "text-danger" : "text-ink-2"}`}>{verdict.text}</p>
      <div className="mt-4">{pictures ? <Pictures q={q} /> : q.options.length === 2 ? <Split q={q} /> : <Donut q={q} />}</div>
      <p className="num mt-3 text-[12px] text-muted">{q.answered} {q.answered === 1 ? "answer" : "answers"}, first tries</p>
    </li>
  );
}

function Questions({ items, focus }: { items: Item[]; focus: number | null }) {
  const [topic, setTopic] = useState("");
  const topics = [...new Set(items.map((i) => i.topic).filter(Boolean))];
  const shown = items.filter((i) => !topic || i.topic === topic);
  const chip = (on: boolean) => `h-9 rounded-full px-3.5 text-[13.5px] font-semibold transition ${on ? "bg-navy text-white" : "bg-surface text-ink-2 ring-1 ring-line hover:text-ink"}`;
  return (
    <section aria-label="Every question">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h5 className="text-[18px] font-extrabold tracking-[-0.01em] text-ink">Question by question</h5><p className="mt-0.5 text-[13.5px] text-muted">How everyone answered each one</p></div>
        {topics.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={chip(!topic)} onClick={() => setTopic("")}>All</button>
            {topics.map((t) => <button key={t} type="button" className={chip(topic === t)} onClick={() => setTopic(t)}>{t}</button>)}
          </div>
        )}
      </div>
      <ol className="mt-4 grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        {shown.map((q) => <QuestionCard key={q.n} q={q} focus={focus === q.n} />)}
      </ol>
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
  const pick = (n: number) => { setOpen(n); setTimeout(() => body.current?.querySelector(`#qcard-${n}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 30); };
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
      {/* Owner, 17 Nov: "fit these to the screen, so these reports can have more space": the full width, wider gaps. */}
      <div ref={body} className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-7 2xl:px-12">
        <div className="space-y-5 2xl:space-y-6">
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {/* Owner, 17 Nov: no participation or pass rate (everyone should take it and pass); badges and the hardest question instead. */}
            <Kpi title="Average score" value={<>{k.avgCorrect}<span className="text-[18px] font-bold text-muted"> / {k.of}</span></>} note={<>{k.avgPct}% on best tries</>} />
            <Kpi title="Average time" value={fmtSeconds(k.avgSeconds)} note="to finish, best try" />
            <Kpi title="First Aid Badges" value={k.badges} note={k.badges === 1 ? "perfect score" : "perfect scores"} />
            <Kpi title="Needs another look" value={k.hardest ? <>Q{k.hardest.n}<span className="text-[18px] font-bold text-muted"> · {k.hardest.pct}% right</span></> : "None"} note={k.hardest ? <span className="line-clamp-1" title={k.hardest.text}>{k.hardest.text}</span> : "every question was answered right"} onClick={k.hardest ? () => pick(k.hardest!.n) : undefined} />
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <Histogram data={data.histogram} pass={`${Math.ceil((r.passPct / 100) * k.of)}+ passes`} />
            <Topics data={data.topics} />
            <Scatter dots={data.scatter} passPct={r.passPct} />
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Heatmap items={data.items} onPick={pick} />
            <Hardest items={data.items} onPick={pick} />
          </div>
          <Questions items={data.items} focus={open} />
        </div>
      </div>
    </div>
  );
}

/** In the panel: one line and "Generate the quiz report". */
export function QuizReportLauncher({ title, r, label = "Generate the quiz report" }: { title: string; r: QuizResults; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ground px-5 py-4" aria-label="Quiz report">
      <div>
        <h5 className="text-[17px] font-extrabold tracking-[-0.01em] text-ink">Quiz report</h5>
        <p className="mt-0.5 text-[13.5px] text-muted">Scores, topics, time and all {r.questions.length} questions, for everyone combined.</p>
      </div>
      <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl bg-action px-5 text-[15px] font-bold text-white shadow-[0_2px_8px_rgb(0_80_130/0.22)] transition hover:bg-action-hover" onClick={() => setOpen(true)}>{label}</button>
      {open && <Report title={title} r={r} onClose={() => setOpen(false)} />}
    </section>
  );
}
