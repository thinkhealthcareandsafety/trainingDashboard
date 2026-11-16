"use client";

import type { QuizReport } from "@/lib/quizReport";

/*
 * The quiz report as charts (owner, 16 Nov: "these answers should instead be reports … bar charts, pie charts, any
 * interesting chart"). The portal's world: navy marks on white cards, line-strong for what didn't pass, cerulean only for
 * the badge; thin bars (≤ 24px) with 4px rounded data-ends, hairline guides, values at the tips, text in text inks. Each
 * mark says its value on hover (title). Pass / not passed also differ by shape where colour alone is weak (hollow dots).
 */

const card = "rounded-xl bg-surface p-4 ring-1 ring-line sm:p-5";
const h = "text-[16px] font-extrabold tracking-[-0.01em] text-ink";
const sub = "mt-0.5 text-[13px] leading-snug text-muted";
const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

function Legend({ items }: { items: { label: string; swatch: string; hollow?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-[13px] text-ink-2">
          <span className={`inline-block size-2.5 rounded-full ${i.hollow ? "bg-surface ring-2 ring-inset" : ""}`} style={i.hollow ? { ["--tw-ring-color" as string]: i.swatch } : { background: i.swatch }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Passed / badge / not passed, as a ring with the pass rate in the middle. */
function Outcome({ o }: { o: QuizReport["outcome"] }) {
  const R = 54, C = 2 * Math.PI * R, GAP = 3;
  const parts = [
    { label: "Passed", n: o.passed, color: "var(--navy)" },
    { label: "100%, badge", n: o.badge, color: "var(--cerulean)" },
    { label: "Not passed yet", n: o.notPassed, color: "var(--line-strong)" },
  ].filter((p) => p.n > 0);
  let at = 0;
  return (
    <section className={card} aria-label="Pass rate">
      <h5 className={h}>Pass rate</h5>
      <p className={sub}>Each person&apos;s best try</p>
      <div className="mt-4 flex flex-wrap items-center gap-6">
        <div className="relative size-[148px] shrink-0">
          <svg viewBox="0 0 148 148" className="size-full -rotate-90" role="img" aria-label={`${o.passPct}% passed`}>
            <circle cx="74" cy="74" r={R} fill="none" stroke="var(--ground)" strokeWidth="20" />
            {parts.map((p) => {
              const len = (p.n / o.total) * C;
              const seg = <circle key={p.label} cx="74" cy="74" r={R} fill="none" stroke={p.color} strokeWidth="20" strokeDasharray={`${Math.max(0, len - (parts.length > 1 ? GAP : 0))} ${C}`} strokeDashoffset={-at}><title>{`${p.label}: ${people(p.n)}`}</title></circle>;
              at += len;
              return seg;
            })}
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div><p className="num text-[30px] font-extrabold leading-none text-ink">{o.passPct}%</p><p className="mt-1 text-[12.5px] font-semibold text-muted">passed</p></div>
          </div>
        </div>
        <ul className="min-w-0 space-y-2">
          {[{ label: "Passed", n: o.passed, color: "var(--navy)" }, { label: "100%, badge", n: o.badge, color: "var(--cerulean)" }, { label: "Not passed yet", n: o.notPassed, color: "var(--line-strong)" }].map((p) => (
            <li key={p.label} className="flex items-center gap-2 text-[14px] text-ink-2">
              <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
              <span>{p.label}</span><b className="num ml-1 text-ink">{p.n}</b>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Columns from one baseline, value on the cap. `mark`: a rule before the first passing column ("70% to pass"). */
function Columns({ title, note, data, mark }: { title: string; note: string; data: { label: string; count: number; passing: boolean }[]; mark?: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const firstPass = data.findIndex((d) => d.passing);
  return (
    <section className={card} aria-label={title}>
      <h5 className={h}>{title}</h5>
      <p className={sub}>{note}</p>
      <div className="mt-4 flex h-[168px] items-end gap-1.5 border-b border-line pb-px sm:gap-3">
        {data.map((d, i) => (
          <div key={d.label} className={`relative flex h-full min-w-0 flex-1 flex-col items-center justify-end ${mark && i === firstPass ? "border-l border-ink-2/40 pl-1.5 sm:pl-3" : ""}`}>
            {mark && i === firstPass && <span className="absolute -top-0.5 left-1.5 whitespace-nowrap text-[11.5px] font-semibold text-ink-2 sm:left-3">{mark}</span>}
            <span className="num mb-1 text-[13px] font-bold text-ink">{d.count}</span>
            <span className="w-full max-w-[24px] rounded-t-[4px]" style={{ height: `${d.count ? Math.max(4, (d.count / max) * 120) : 0}px`, background: d.passing ? "var(--navy)" : "var(--line-strong)" }} title={`${d.label}: ${people(d.count)}`} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5 sm:gap-3">
        {data.map((d, i) => <span key={d.label} className={`num min-w-0 flex-1 text-center text-[11.5px] leading-tight text-muted ${mark && i === firstPass ? "pl-1.5 sm:pl-3" : ""}`}>{d.label}</span>)}
      </div>
    </section>
  );
}

/** Horizontal bars, 0–100%, value at the tip. */
function Bars({ rows }: { rows: { key: string; label: React.ReactNode; pct: number; note?: React.ReactNode }[] }) {
  return (
    <ul className="mt-4 space-y-3.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="text-[14px] font-semibold leading-snug text-ink">{r.label}</div>
          <div className="mt-1.5 flex items-center gap-2.5">
            <span className="h-3 min-w-0 flex-1 rounded-full bg-ground">
              <span className="block h-full rounded-r-[4px] rounded-l-full bg-navy" style={{ width: `${Math.max(r.pct ? 2 : 0, r.pct)}%` }} title={`${r.pct}% right`} />
            </span>
            <span className="num w-11 shrink-0 text-right text-[13.5px] font-bold text-ink">{r.pct}%</span>
          </div>
          {r.note && <p className="mt-1 text-[13px] leading-snug text-muted">{r.note}</p>}
        </li>
      ))}
    </ul>
  );
}

/** Time against score, a dot per person; the pass mark as a rule. Passed: navy dots; not passed: hollow. */
function Scatter({ dots, passPct }: { dots: QuizReport["scatter"]; passPct: number }) {
  const maxMin = Math.max(5, Math.ceil(Math.max(...dots.map((d) => d.minutes), 0) / 5) * 5);
  const ticks = [0, maxMin / 2, maxMin];
  return (
    <section className={card} aria-label="Time against score">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div><h5 className={h}>Time against score</h5><p className={sub}>Minutes on their best try · each dot is one person</p></div>
        <Legend items={[{ label: "Passed", swatch: "var(--navy)" }, { label: "Not passed yet", swatch: "var(--muted)", hollow: true }]} />
      </div>
      <div className="mt-4 flex gap-2">
        <div className="relative w-8 shrink-0 text-right">
          {[0, 50, 100].map((v) => <span key={v} className="num absolute right-0 text-[11.5px] leading-none text-muted" style={{ bottom: `${v}%`, transform: "translateY(50%)" }}>{v}%</span>)}
        </div>
        <div className="relative h-[200px] min-w-0 flex-1 border-b border-l border-line">
          {[50, 100].map((v) => <span key={v} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${v}%` }} aria-hidden />)}
          <span className="absolute inset-x-0 border-t border-ink-2/50" style={{ bottom: `${passPct}%` }} aria-hidden />
          <span className="absolute left-1.5 z-10 rounded bg-surface px-1 text-[11.5px] font-semibold text-ink-2" style={{ bottom: `calc(${passPct}% + 3px)` }}>{passPct}% to pass</span>
          {dots.map((d) => (
            <span key={d.name + d.minutes} title={`${d.name}: ${d.pct}% in ${d.minutes} min`}
              className={`absolute size-3 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-surface ${d.passed ? "bg-navy" : "bg-surface shadow-[inset_0_0_0_2px_var(--muted)]"}`}
              style={{ left: `${(d.minutes / maxMin) * 100}%`, bottom: `${d.pct}%` }} />
          ))}
        </div>
      </div>
      <div className="ml-10 mt-1.5 flex justify-between">
        {ticks.map((t) => <span key={t} className="num text-[11.5px] text-muted">{t} min</span>)}
      </div>
    </section>
  );
}

export function QuizCharts({ report, passPct }: { report: QuizReport; passPct: number }) {
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Outcome o={report.outcome} />
      <Columns title="Score spread" note="Best scores, by band" data={report.bands} mark={`${passPct}% to pass`} />
      {report.topics.length > 0 && (
        <section className={card} aria-label="By topic">
          <h5 className={h}>By topic</h5>
          <p className={sub}>% of answers right, first tries</p>
          <Bars rows={report.topics.map((t) => ({ key: t.name, label: <>{t.name} <span className="font-normal text-muted">· {t.questions} questions</span></>, pct: t.pct }))} />
        </section>
      )}
      <Columns title="Re-takes" note="How many tries it took to pass" data={report.retakes} />
      {report.hardest.length > 0 && (
        <section className={`${card} lg:col-span-2`} aria-label="Hardest questions">
          <h5 className={h}>Hardest questions</h5>
          <p className={sub}>Fewest right on the first try</p>
          <Bars rows={report.hardest.map((q) => ({
            key: String(q.n), pct: q.pct,
            label: <><span className="num text-muted">{q.n}. </span>{q.text}</>,
            note: q.wrong ? <>Most picked wrong answer: <b className="font-semibold text-ink-2">{q.wrong.text}</b> <span className="num">({q.wrong.pct}%)</span></> : null,
          }))} />
        </section>
      )}
      {report.scatter.length > 0 && <div className="lg:col-span-2"><Scatter dots={report.scatter} passPct={passPct} /></div>}
    </div>
  );
}
