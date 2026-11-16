"use client";

import { useEffect, useRef } from "react";

/*
 * A participant's own quiz report (owner, 16 Nov: "in similar fashion let user see and download their report"): full
 * screen, the portal's look — their score, whether they passed, time, re-takes and rank; their score by topic; then every
 * question with the answer they gave (and, once the coordinator ends the training, the right one). Print / Save as PDF.
 */

export type MyReportData = {
  title: string; name: string; th: string; training: string; revealed: boolean; passPct: number;
  questions: { text: string; options: { text: string; image?: string }[]; answer?: number }[];
  result: { pct: number; correct: number; total: number; passed: boolean; badge: boolean; rank: number; of: number; tries: number; seconds: number; answers: number[]; topics: { name: string; right: number; of: number }[] };
};

const card = "rounded-xl bg-surface p-4 ring-1 ring-line sm:p-5";
const label = "text-[12px] font-bold uppercase tracking-[0.12em] text-muted";
const time = (s: number) => `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;

export function MyReport({ d, onClose }: { d: MyReportData; onClose: () => void }) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => { document.body.style.overflow = was; window.removeEventListener("keydown", key); };
  }, [onClose]);
  const print = () => {
    const w = window.open("", "_blank");
    if (!w || !body.current) return window.print();
    const styles = [...document.querySelectorAll("link[rel=stylesheet], style")].map((n) => n.outerHTML).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${d.name} · ${d.title}</title>${styles}<style>body{background:#fff;padding:24px}</style></head><body>${body.current.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 500);
  };
  const r = d.result;
  const kpis: [string, React.ReactNode, string][] = [
    ["Score", `${r.pct}%`, `${r.correct} of ${r.total} right`],
    ["Result", r.badge ? "Badge" : r.passed ? "Passed" : "Not yet", r.passed ? `${d.passPct}% or more` : `${d.passPct}% passes`],
    ["Time", time(r.seconds), "on the try that counts"],
    ["Rank", `#${r.rank}`, `of ${r.of} · re-takes: ${r.tries - 1}`],
  ];
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ground" role="dialog" aria-modal="true" aria-label="My report">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
        <div className="min-w-0"><h4 className="truncate text-[18px] font-extrabold tracking-[-0.01em] text-ink">My report</h4><p className="truncate text-[13px] text-muted">{d.name} · {d.th}</p></div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={print} className="h-10 rounded-xl px-3.5 text-[14px] font-bold text-action ring-1 ring-inset ring-action/35 hover:bg-action/5"><span className="sm:hidden">Print</span><span className="hidden sm:inline">Print / Save as PDF</span></button>
          <button type="button" onClick={onClose} className="h-10 rounded-xl bg-navy px-4 text-[14px] font-bold text-white hover:bg-navy-deep">Close</button>
        </div>
      </header>
      <div ref={body} className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <div>
            <p className="text-[22px] font-extrabold tracking-[-0.02em] text-ink">{d.title}</p>
            <p className="text-[14px] text-muted">{d.training} · {d.name} ({d.th})</p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map(([t, v, n]) => (
              <div key={t} className={card}>
                <p className={label}>{t}</p>
                <p className="num mt-2 text-[26px] font-extrabold leading-none text-ink">{v}</p>
                <p className="mt-1.5 text-[13px] text-ink-2">{n}</p>
              </div>
            ))}
          </div>
          {r.topics.length > 0 && (
            <section className={card}>
              <p className="text-[16px] font-extrabold text-ink">By topic</p>
              <ul className="mt-3 space-y-3">
                {r.topics.map((t) => {
                  const pct = t.of ? Math.round((t.right / t.of) * 100) : 0;
                  return (
                    <li key={t.name}>
                      <div className="flex justify-between text-[14px]"><span className="font-semibold text-ink">{t.name}</span><span className="num text-ink-2"><b className="text-ink">{t.right}</b> of {t.of}</span></div>
                      <span className="mt-1.5 block h-2.5 rounded-full bg-ground"><span className="block h-full rounded-l-full rounded-r-[4px] bg-navy" style={{ width: `${pct}%` }} /></span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          <section className={card}>
            <p className="text-[16px] font-extrabold text-ink">My answers</p>
            <p className="mt-0.5 text-[13px] text-muted">{d.revealed ? "The right answers are shown." : "The right answers show here once your coordinator ends the training."}</p>
            <ol className="mt-4 divide-y divide-line">
              {d.questions.map((q, i) => {
                const mine = r.answers[i];
                const right = d.revealed && q.answer !== undefined ? mine === q.answer : null;
                return (
                  <li key={i} className="py-3">
                    <p className="text-[14.5px] font-semibold text-ink"><span className="num text-muted">{i + 1}. </span>{q.text}</p>
                    <p className="mt-1 text-[14px] text-ink-2">
                      My answer: <b className="font-semibold text-ink">{q.options[mine]?.text ?? "—"}</b>
                      {right === true && <span className="ml-2 rounded-full bg-navy px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-white">Right</span>}
                      {right === false && <span className="ml-2 text-[13px] text-muted">· Right answer: <b className="font-semibold text-ink">{q.options[q.answer!]?.text}</b></span>}
                    </p>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
