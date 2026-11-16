"use client";

import type { QuestionReport } from "@/lib/quizReport";

/*
 * The quiz report, question by question for the whole group (owner, 16 Nov: "all participants combined … every question
 * and people's combined result"; "don't make it hard or easy, all questions are the same … whatever they choose, all
 * collectively comes here"). One card per question: every option with how many picked it, its share, and a bar — no
 * right / wrong marking, no ordering by difficulty. First tries.
 */

function Question({ q }: { q: QuestionReport }) {
  return (
    <li className="rounded-xl bg-surface p-4 ring-1 ring-line sm:p-5">
      <p className="num text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted">Question {q.n}</p>
      <p className="mt-1 text-[15.5px] font-bold leading-snug text-ink">{q.text}</p>
      <p className="num mt-1 text-[13px] text-muted">{q.answered} {q.answered === 1 ? "answer" : "answers"}</p>
      <ul className="mt-4 space-y-3">
        {q.options.map((o, k) => (
          <li key={k}>
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- the quiz's own small option pictures */}
              {o.image && <img src={o.image} alt="" className="size-9 shrink-0 rounded-md object-cover ring-1 ring-line" />}
              <p className="min-w-0 flex-1 text-[14px] leading-snug text-ink">{o.text}</p>
              <span className="num shrink-0 text-[13.5px] text-ink-2"><b className="text-ink">{o.count}</b> · {o.pct}%</span>
            </div>
            <span className="mt-1.5 block h-2.5 rounded-full bg-ground" title={`${o.text}: ${o.count} (${o.pct}%)`}>
              <span className="block h-full rounded-l-full rounded-r-[4px] bg-navy" style={{ width: `${o.pct}%`, minWidth: o.count ? 6 : 0 }} />
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}

export function QuizCharts({ questions }: { questions: QuestionReport[] }) {
  return (
    <section className="mt-6" aria-label="Question by question">
      <h5 className="text-[18px] font-extrabold tracking-[-0.01em] text-ink">Question by question</h5>
      <p className="mt-0.5 text-[13.5px] text-muted">What everyone picked, combined (first tries)</p>
      <ol className="mt-4 grid gap-4 lg:grid-cols-2">
        {questions.map((q) => <Question key={q.n} q={q} />)}
      </ol>
    </section>
  );
}
