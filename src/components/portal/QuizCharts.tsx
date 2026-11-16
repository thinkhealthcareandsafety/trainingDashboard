"use client";

import { useState } from "react";
import { type QuestionReport, hardestFirst } from "@/lib/quizReport";

/*
 * The quiz report, question by question for the whole group (owner, 16 Nov: "not for one individual but for all
 * participants combined … every question and people's combined result"). One card per question: a ring with the share
 * who got it right, then a bar per option (how many picked it, and the share), the right answer in navy and named, the
 * others in line-strong. First tries, so a retake doesn't hide what people knew. Thin bars, 4px rounded ends, values in
 * text inks, each bar's numbers on hover.
 */

function Ring({ pct }: { pct: number }) {
  const R = 22, C = 2 * Math.PI * R;
  return (
    <div className="relative size-[60px] shrink-0" role="img" aria-label={`${pct}% got it right`}>
      <svg viewBox="0 0 60 60" className="size-full -rotate-90" aria-hidden>
        <circle cx="30" cy="30" r={R} fill="none" stroke="var(--ground)" strokeWidth="7" />
        {pct > 0 && <circle cx="30" cy="30" r={R} fill="none" stroke="var(--navy)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(pct / 100) * C} ${C}`} />}
      </svg>
      <span className={`num absolute inset-0 grid place-items-center font-extrabold text-ink ${pct === 100 ? "text-[12px]" : "text-[13.5px]"}`}>{pct}%</span>
    </div>
  );
}

function Question({ q }: { q: QuestionReport }) {
  return (
    <li className="rounded-xl bg-surface p-4 ring-1 ring-line sm:p-5">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="num text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted">Question {q.n}</p>
          <p className="mt-1 text-[15.5px] font-bold leading-snug text-ink">{q.text}</p>
          <p className="num mt-1 text-[13px] text-muted">{q.answered} answered · {q.rightPct}% got it right</p>
        </div>
        <Ring pct={q.rightPct} />
      </div>
      <ul className="mt-4 space-y-3">
        {q.options.map((o, k) => (
          <li key={k}>
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- the quiz's own small option pictures */}
              {o.image && <img src={o.image} alt="" className="size-9 shrink-0 rounded-md object-cover ring-1 ring-line" />}
              <p className={`min-w-0 flex-1 text-[14px] leading-snug ${o.right ? "font-bold text-ink" : "text-ink-2"}`}>
                {o.text}{o.right && <span className="ml-2 inline-block rounded-full bg-navy px-2 py-0.5 align-[1px] text-[10.5px] font-bold uppercase tracking-[0.08em] text-white">Right answer</span>}
              </p>
              <span className="num shrink-0 text-[13.5px] text-ink-2"><b className="text-ink">{o.count}</b> · {o.pct}%</span>
            </div>
            <span className="mt-1.5 block h-2.5 rounded-full bg-ground" title={`${o.text}: ${o.count} (${o.pct}%)`}>
              <span className="block h-full rounded-l-full rounded-r-[4px]" style={{ width: `${o.pct}%`, minWidth: o.count ? 6 : 0, background: o.right ? "var(--navy)" : "var(--line-strong)" }} />
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}

export function QuizCharts({ questions }: { questions: QuestionReport[] }) {
  const [hard, setHard] = useState(false);
  const list = hard ? hardestFirst(questions) : questions;
  const pill = (on: boolean) => `h-9 rounded-lg px-3.5 text-[14px] font-bold transition ${on ? "bg-surface text-ink shadow-[0_1px_3px_rgb(2_40_60/0.12)]" : "text-muted hover:text-ink"}`;
  return (
    <section className="mt-6" aria-label="Question by question">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h5 className="text-[18px] font-extrabold tracking-[-0.01em] text-ink">Question by question</h5>
          <p className="mt-0.5 text-[13.5px] text-muted">Everyone&apos;s first try, combined</p>
        </div>
        <div className="flex gap-1 rounded-xl bg-ground p-1" role="tablist" aria-label="Order">
          <button type="button" role="tab" aria-selected={!hard} className={pill(!hard)} onClick={() => setHard(false)}>In order</button>
          <button type="button" role="tab" aria-selected={hard} className={pill(hard)} onClick={() => setHard(true)}>Hardest first</button>
        </div>
      </div>
      <ol className="mt-4 grid gap-4 lg:grid-cols-2">
        {list.map((q) => <Question key={q.n} q={q} />)}
      </ol>
    </section>
  );
}
