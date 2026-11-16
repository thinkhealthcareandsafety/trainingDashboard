"use client";

import { useEffect, useRef, useState } from "react";
import type { QuestionReport } from "@/lib/quizReport";

/*
 * The quiz report, question by question for the whole group (owner, 16 Nov: "all participants combined … whatever they
 * choose, all collectively comes here"; "make it separate, and fit full screen, otherwise I have to scroll through all 30
 * questions"). In the panel: one line and "Open full screen". The full-screen view shows as many compact question cards
 * as fit readably (the owner's sliding-window rule: no page scroll; ◀ ▶, ←/→ keys or swipe for the rest; Esc closes).
 * Each card: every option with how many picked it, its share and a bar. No right / wrong marking. First tries.
 */

const CARD_W = 300; // the narrowest a card stays readable
const CARD_H = 240; // fits a two-line question and four options
const GAP = 12;
const HEAD = 76; // the view's top bar

function Card({ q }: { q: QuestionReport }) {
  return (
    <li className="flex flex-col overflow-hidden rounded-xl bg-surface p-3.5 ring-1 ring-line" style={{ height: CARD_H }}>
      <p className="num text-[11.5px] font-bold uppercase tracking-[0.12em] text-muted">Question {q.n} <span className="font-semibold normal-case tracking-normal">· {q.answered} {q.answered === 1 ? "answer" : "answers"}</span></p>
      <p className="mt-1 line-clamp-2 shrink-0 text-[14px] font-bold leading-snug text-ink" title={q.text}>{q.text}</p>
      <ul className="mt-2.5 min-h-0 flex-1 space-y-2">
        {q.options.map((o, k) => (
          <li key={k} title={`${o.text}: ${o.count} (${o.pct}%)`}>
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- the quiz's own small option pictures */}
              {o.image && <img src={o.image} alt="" className="size-5 shrink-0 rounded object-cover ring-1 ring-line" />}
              <p className="min-w-0 flex-1 truncate text-[13px] leading-tight text-ink-2">{o.text}</p>
              <span className="num shrink-0 text-[12.5px] text-ink-2"><b className="text-ink">{o.count}</b> · {o.pct}%</span>
            </div>
            <span className="mt-1 block h-1.5 rounded-full bg-ground">
              <span className="block h-full rounded-l-full rounded-r-[3px] bg-navy" style={{ width: `${o.pct}%`, minWidth: o.count ? 4 : 0 }} />
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}

function FullScreen({ title, questions, onClose }: { title: string; questions: QuestionReport[]; onClose: () => void }) {
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const [page, setPage] = useState(0);
  const touch = useRef<number | null>(null);
  useEffect(() => {
    const fit = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    fit();
    window.addEventListener("resize", fit);
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // the page behind doesn't scroll
    return () => { window.removeEventListener("resize", fit); document.body.style.overflow = was; };
  }, []);
  const pad = size.w < 640 ? 16 : 24;
  const cols = Math.max(1, Math.floor((size.w - pad * 2 + GAP) / (CARD_W + GAP)));
  const rows = Math.max(1, Math.floor((size.h - HEAD - pad + GAP) / (CARD_H + GAP)));
  const per = cols * rows;
  const pages = Math.max(1, Math.ceil(questions.length / per));
  const at = Math.min(page, pages - 1);
  const shown = questions.slice(at * per, at * per + per);
  const go = (d: number) => setPage((p) => Math.max(0, Math.min(pages - 1, Math.min(p, pages - 1) + d)));
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const arrow = "grid size-10 place-items-center rounded-xl bg-surface text-ink ring-1 ring-line transition hover:bg-ground disabled:opacity-35";
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-ground" role="dialog" aria-modal="true" aria-label={`${title}: question by question`}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { if (touch.current === null) return; const dx = e.changedTouches[0].clientX - touch.current; touch.current = null; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); }}>
      <header className="flex shrink-0 items-center justify-between gap-3" style={{ height: HEAD, paddingInline: pad }}>
        <div className="min-w-0">
          <h4 className="truncate text-[18px] font-extrabold tracking-[-0.01em] text-ink sm:text-[20px]"><span className="hidden sm:inline">{title}: question by question</span><span className="sm:hidden">Question by question</span></h4>
          <p className="num truncate text-[13px] text-muted"><span className="hidden sm:inline">What everyone picked, combined (first tries) · </span>questions {questions.length ? at * per + 1 : 0}–{at * per + shown.length} of {questions.length}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {pages > 1 && <>
            <button type="button" className={arrow} onClick={() => go(-1)} disabled={at === 0} aria-label="Previous questions">
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <span className="num hidden w-12 text-center text-[13px] font-semibold text-ink-2 sm:inline">{at + 1} / {pages}</span>
            <button type="button" className={arrow} onClick={() => go(1)} disabled={at === pages - 1} aria-label="Next questions">
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </>}
          <button type="button" className="ml-1 h-10 rounded-xl bg-navy px-4 text-[14px] font-bold text-white transition hover:bg-navy-deep" onClick={onClose}>Close</button>
        </div>
      </header>
      <ol className="grid min-h-0 flex-1 content-start" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: GAP, paddingInline: pad, paddingBottom: pad }}>
        {shown.map((q) => <Card key={q.n} q={q} />)}
      </ol>
    </div>
  );
}

export function QuizCharts({ title, questions }: { title: string; questions: QuestionReport[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ground px-5 py-4" aria-label="Question by question">
      <div>
        <h5 className="text-[17px] font-extrabold tracking-[-0.01em] text-ink">Question by question</h5>
        <p className="mt-0.5 text-[13.5px] text-muted">What everyone picked on each of the {questions.length} questions, combined.</p>
      </div>
      <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl bg-action px-5 text-[15px] font-bold text-white shadow-[0_2px_8px_rgb(0_80_130/0.22)] transition hover:bg-action-hover" onClick={() => setOpen(true)}>Open full screen</button>
      {open && <FullScreen title={title} questions={questions} onClose={() => setOpen(false)} />}
    </section>
  );
}
