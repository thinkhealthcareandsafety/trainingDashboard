"use client";

import { useEffect, useRef } from "react";
import { learningMoments, persona, speed } from "@/lib/myReport";

/*
 * A participant's own report as a story (owner, 16 Nov: "replace confusing statistical jargon with metrics that tell a
 * story about the participant"; 16 Nov: no superpower / kryptonite): their persona badge, a speed flashcard against everyone's
 * average, and their one or two most critical mistakes as real-world learning moments (once the answers are out). No
 * wall of 30 questions. The portal's look; Print / Save as PDF.
 */

export type MyReportData = {
  title: string; name: string; th: string; training: string; revealed: boolean; passPct: number;
  questions: { text: string; options: { text: string; image?: string }[]; answer?: number; critical?: boolean; lesson?: string }[];
  /** Everyone's time on their best try (seconds), for the speed card. */
  everyone: number[];
  result: { pct: number; correct: number; total: number; passed: boolean; badge: boolean; rank: number; of: number; tries: number; seconds: number; answers: number[]; topics: { name: string; right: number; of: number }[] };
};

const card = "rounded-2xl bg-surface p-5 ring-1 ring-line sm:p-6";
const label = "text-[12px] font-bold uppercase tracking-[0.12em] text-muted";
const time = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} s` : ""}`.trim() : `${s} s`);

function Shield({ tier }: { tier: "rookie" | "lifesaver" | "maestro" }) {
  // A badge in the portal's sign language: a white shield on the navy card, a navy heart-beat, one to three stars by tier.
  const stars = tier === "maestro" ? 3 : tier === "lifesaver" ? 2 : 1;
  return (
    <svg viewBox="0 0 96 108" className="h-[104px] w-[92px] shrink-0 drop-shadow-[0_4px_10px_rgb(2_40_60/0.25)]" aria-hidden>
      <path d="M48 4 88 18v34c0 26-17 44-40 52C25 96 8 78 8 52V18Z" fill="#fff" />
      <path d="M22 60h14l6-12 8 22 6-14h18" fill="none" stroke="var(--navy)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      {Array.from({ length: stars }, (_, i) => <path key={i} transform={`translate(${48 + (i - (stars - 1) / 2) * 15 - 6} 24)`} d="M6 0l1.8 3.9 4.2.5-3.1 2.9.8 4.2L6 9.4 2.3 11.5l.8-4.2L0 4.4l4.2-.5Z" fill="var(--navy)" />)}
    </svg>
  );
}

export function MyReport({ d, onClose, autoSave = false, onSaved }: { d: MyReportData; onClose: () => void; autoSave?: boolean; onSaved?: () => void }) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => { document.body.style.overflow = was; window.removeEventListener("keydown", key); };
  }, [onClose]);
  const print = () => {
    onSaved?.(); // owner, 17 Nov: saved, so the thank-you email doesn't attach it again
    const w = window.open("", "_blank");
    if (!w || !body.current) return window.print();
    const styles = [...document.querySelectorAll("link[rel=stylesheet], style")].map((n) => n.outerHTML).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${d.name} · ${d.title}</title>${styles}<style>body{background:#fff;padding:24px}</style></head><body>${body.current.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 500);
  };
  // "Download (save as PDF)" from the quiz: the print dialog opens as soon as the report is drawn.
  const saved = useRef(false);
  useEffect(() => { if (autoSave && !saved.current) { saved.current = true; const id = setTimeout(print, 350); return () => clearTimeout(id); } }); // eslint-disable-line react-hooks/exhaustive-deps
  const r = d.result;
  const who = persona(r.pct, d.passPct);
  const pace = speed(r.seconds, d.everyone, r.passed);
  const moments = learningMoments(d.questions, r.answers);
  const max = Math.max(pace.seconds, pace.avg, 1);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ground" role="dialog" aria-modal="true" aria-label="My report">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
        <div className="min-w-0"><h4 className="truncate text-[18px] font-extrabold tracking-[-0.01em] text-ink">My report</h4><p className="truncate text-[13px] text-muted">{d.title} · {d.training}</p></div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={print} className="h-10 rounded-xl px-3.5 text-[14px] font-bold text-action ring-1 ring-inset ring-action/35 hover:bg-action/5"><span className="sm:hidden">Download</span><span className="hidden sm:inline">Download (save as PDF)</span></button>
          <button type="button" onClick={onClose} className="h-10 rounded-xl bg-navy px-4 text-[14px] font-bold text-white hover:bg-navy-deep">Close</button>
        </div>
      </header>
      <div ref={body} className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {/* The persona badge */}
          <section className="flex flex-col items-center gap-5 rounded-2xl bg-navy px-6 py-7 text-center text-white sm:flex-row sm:text-left">
            <Shield tier={who.tier} />
            <div className="min-w-0">
              <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-white/70">{d.name} is a</p>
              <p className="mt-1 text-[32px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[38px]">{who.title}</p>
              <p className="mt-2 text-[15.5px] leading-relaxed text-white/85">{who.line}</p>
              <p className="num mt-3 text-[14px] font-semibold text-white/75">{r.pct}% · {r.correct} of {r.total} right · #{r.rank} of {r.of}</p>
            </div>
          </section>

          {/* Speed flashcard */}
          <section className={card}>
            <p className={label}>Your speed</p>
            <p className="mt-2 text-[22px] font-extrabold leading-tight tracking-[-0.01em] text-ink">
              Finished in {time(pace.seconds)}{d.everyone.length > 1 && pace.diff !== 0 ? <span className="text-ink-2">, {time(Math.abs(pace.diff))} {pace.diff < 0 ? "faster" : "slower"} than average</span> : null}
            </p>
            <p className="mt-1.5 text-[15px] text-ink-2">{pace.line}</p>
            {d.everyone.length > 1 && (
              <div className="mt-4 space-y-2">
                {[["You", pace.seconds, "var(--navy)"], ["Average", pace.avg, "var(--line-strong)"]].map(([who2, s, c]) => (
                  <div key={who2 as string} className="grid grid-cols-[72px_minmax(0,1fr)_64px] items-center gap-3 text-[13.5px]">
                    <span className="font-semibold text-ink">{who2}</span>
                    <span className="h-2.5 rounded-full bg-ground"><span className="block h-full rounded-l-full rounded-r-[4px]" style={{ width: `${((s as number) / max) * 100}%`, background: c as string }} /></span>
                    <span className="num text-right text-ink-2">{time(s as number)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Learning moments */}
          <section className={card}>
            <p className={label}>Learning moments</p>
            {!d.revealed ? (
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">Your most important learning moments appear here once your coordinator ends the training and the right answers are out.</p>
            ) : !moments.length ? (
              <p className="mt-2 text-[18px] font-extrabold text-ink">Nothing to fix. You got every question right.</p>
            ) : (
              <ol className="mt-3 space-y-4">
                {moments.map((m) => (
                  <li key={m.n} className="rounded-xl bg-ground p-4">
                    <p className="text-[13px] font-bold uppercase tracking-[0.1em] text-muted">{m.critical ? "In a real emergency" : `Question ${m.n}`}</p>
                    <p className="mt-1 text-[16px] font-bold leading-snug text-ink">{m.text}</p>
                    <p className="mt-2 text-[14.5px] text-ink-2">You chose <b className="font-semibold text-ink">{m.chose}</b>. The right answer: <b className="font-semibold text-ink">{m.right}</b>.</p>
                    <p className="mt-2 text-[14.5px] leading-relaxed text-ink">{m.lesson}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
