"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicQuiz, Ranked, Score } from "@/lib/quizRules";

/*
 * The participant's quiz (owner, 13 Nov), in the AED Readiness Campaign's design (quiz.css): an intro with the pass mark,
 * one question per screen with segmented step dots and an "Answered" pill, option rows or picture cards, a review step,
 * then the stamped seal with their score, pass / badge and rank, and the live leaderboard. The right answers show only
 * once the coordinator ends the training (state "revealed"). Opens only while the training runs, for people marked present.
 * Owner, 14 Nov: a fail may try again while the training runs (best score counts); a pass gets the certificate by email
 * once the coordinator ends the training, and a download here.
 */
type Certificate = { ready: boolean; email: string | null; emailedAt: string | null; certNo: string | null };
type QuizData = {
  quiz: PublicQuiz; state: "none" | "open" | "closed" | "revealed"; present: boolean; startedAt: string | null;
  result: (Score & { rank: number; of: number; answers: number[]; tries: number; bestPct: number; passedEver: boolean }) | null;
  canRetake: boolean; certificate: Certificate | null; leaderboard: Ranked[];
};

const OFFLINE = "Couldn't reach Think Health. Check your connection and try again.";
const Check = () => <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2.5 6.3l2.3 2.3 4.7-5" /></svg>;
const Warn = () => <svg viewBox="0 0 20 20" fill="none" aria-hidden><path d="M10 2.5 18 17H2L10 2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M10 8v4M10 14.5v.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;

export function QuizScreen({ number, th, token, name, onClose }: { number: string; th: string; token: string; name: string; onClose: () => void }) {
  const [data, setData] = useState<QuizData | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [step, setStep] = useState(-1); // -1 intro, 0..n-1 questions, n review
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [pulse, setPulse] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const draftKey = `th_quiz_${number}_${th}`;

  const load = useCallback(async () => {
    const r = await fetch(`/api/portal/quiz?n=${encodeURIComponent(number)}&th=${encodeURIComponent(th)}&p=${encodeURIComponent(token)}`, { cache: "no-store" }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as QuizData & { error?: string }) : ({ error: OFFLINE } as QuizData & { error?: string });
    if (!r?.ok || !j.quiz) { setData((had) => had ?? null); setError(j.error ?? OFFLINE); return; }
    setData(j);
    setAnswers((had) => {
      if (had.length) return had;
      // An unsent quiz survives a reload on this phone.
      try { const saved = JSON.parse(localStorage.getItem(draftKey) ?? "null") as (number | null)[] | null; if (saved?.length === j.quiz.questions.length) return saved; } catch {}
      return j.quiz.questions.map(() => null);
    });
  }, [number, th, token, draftKey]);
  useEffect(() => { load(); }, [load]);
  // Live leaderboard while the quiz is open, after they've finished.
  useEffect(() => {
    if (!data?.result || data.state !== "open") return;
    const id = setInterval(() => { if (!document.hidden) load(); }, 10000);
    return () => clearInterval(id);
  }, [data?.result, data?.state, load]);
  useEffect(() => { try { if (answers.some((a) => a !== null)) localStorage.setItem(draftKey, JSON.stringify(answers)); } catch {} }, [answers, draftKey]);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }, [step]);

  if (data === undefined) return <div className="qz"><div className="qz-page" aria-busy /></div>;
  if (!data) return <Frame onClose={onClose}><div className="qz-card"><p className="qz-lede">{error}</p></div></Frame>;
  const { quiz } = data;
  const n = quiz.questions.length;
  const done = answers.filter((a) => a !== null).length;

  const start = async () => {
    setBusy(true); setError("");
    const r = await fetch("/api/portal/quiz", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ n: number, th, p: token, action: "start" }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : { error: OFFLINE };
    setBusy(false);
    if (!j.startedAt) return setError(j.error ?? "Couldn't open the quiz");
    const fresh = data.result && !data.startedAt ? quiz.questions.map(() => null) : answers;
    if (fresh !== answers) { setAnswers(fresh); try { localStorage.removeItem(draftKey); } catch {} }
    setData({ ...data, startedAt: j.startedAt });
    setStep(Math.max(0, fresh.findIndex((a) => a === null)));
  };
  const pick = (i: number, o: number) => {
    setAnswers((a) => a.map((x, k) => (k === i ? o : x)));
    setPulse(true); setTimeout(() => setPulse(false), 420);
    setError("");
    // On to the next question after a beat, so the choice is seen.
    if (answers[i] === null) setTimeout(() => setStep((s) => (s === i ? Math.min(i + 1, n) : s)), 380);
  };
  const submit = async () => {
    if (done < n) { setError(`Answer all ${n} questions first: ${n - done} left.`); return; }
    setBusy(true); setError("");
    const r = await fetch("/api/portal/quiz", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ n: number, th, p: token, action: "submit", answers }) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as QuizData & { error?: string }) : ({ error: OFFLINE } as QuizData & { error?: string });
    setBusy(false);
    if (!j.result) return setError(j.error ?? "Couldn't send your answers");
    try { localStorage.removeItem(draftKey); } catch {}
    setData(j);
  };

  // Finished: the seal, the result, the certificate or another try, the live leaderboard (and, once revealed, each answer).
  if (data.result && !(data.startedAt && data.state === "open")) {
    const r = data.result;
    if (review && data.state === "revealed") return <Frame onClose={onClose} title={quiz.title}><Review quiz={quiz} answers={r.answers} onBack={() => setReview(false)} /></Frame>;
    return (
      <Frame onClose={onClose} title={quiz.title}>
        <div className="qz-card qz-complete">
          <div className={`qz-seal${r.passed ? "" : " fail"}`} aria-hidden>
            <span className="qz-seal-pulse" />
            <svg viewBox="0 0 80 80"><circle className="ring" cx="40" cy="40" r="34" fill="none" strokeWidth="3" /><path className="tick" d="M25 41.5 L35.5 52 L56 30" fill="none" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <h2 className="qz-complete-title" ref={headingRef} tabIndex={-1}>Quiz complete</h2>
          <p className="qz-complete-sub">{name.split(" ")[0]}, here&apos;s how you did{r.tries > 1 ? ` on try ${r.tries}` : ""}.</p>
          <div className="qz-stats">
            <div className="qz-stat"><span className="qz-stat-val tabular">{r.points}</span><span className="qz-stat-label">of {r.max} points</span></div>
            <div className="qz-stat"><span className="qz-stat-val tabular">{r.pct}%</span><span className="qz-stat-label">{r.correct} of {r.total} right</span></div>
            <div className="qz-stat"><span className="qz-stat-val tabular">#{r.rank}</span><span className="qz-stat-label">of {r.of} so far</span></div>
          </div>
          {r.badge ? <span className="qz-verdict badge">Perfect score: you&apos;ve earned a free {quiz.badge}</span>
            : r.passed ? <span className="qz-verdict pass">Passed: {quiz.passPct}% was needed</span>
            : <span className="qz-verdict fail">Not passed this time: {quiz.passPct}% is needed</span>}
          {data.canRetake ? (
            <>
              <p className="qz-lede">You can try again while the training runs. {r.tries > 1 ? <>Your best so far is <b className="tabular">{r.bestPct}%</b>. </> : null}Your best score counts.</p>
              {error && <p className="qz-error" style={{ marginTop: 14, justifyContent: "center" }} role="alert"><Warn /><span>{error}</span></p>}
              <div style={{ marginTop: 18 }}><button type="button" className="qz-btn qz-btn-primary qz-btn-big" onClick={start} disabled={busy}>{busy ? "Opening…" : "Try again"}</button></div>
            </>
          ) : !r.passed && data.state !== "open" ? <p className="qz-lede">The quiz has closed.</p> : null}
          {(r.passed || !data.canRetake) && <p className="qz-lede">{data.state === "revealed" ? "The right answers are out." : "The right answers show once your coordinator ends the training."}</p>}
          {data.state === "revealed" && <div style={{ marginTop: 14 }}><button type="button" className="qz-btn qz-btn-ghost" onClick={() => setReview(true)}>See the right answers</button></div>}
        </div>
        {data.certificate && <CertificateCard c={data.certificate} number={number} th={th} token={token} onSaved={load} />}
        <Board list={data.leaderboard} me={th} live={data.state === "open"} />
      </Frame>
    );
  }

  // Not open (yet, or any more), or not marked present.
  if (data.state !== "open" || !data.present) {
    const text = !data.present && data.state === "open" ? "Mark your attendance first: scan your coordinator's attendance code and tap Present. Then the quiz opens here."
      : data.state === "none" || data.state === "closed" ? "The quiz opens when your coordinator starts the training. Come back to this page then."
      : "The quiz has closed.";
    return (
      <Frame onClose={onClose} title={quiz.title}>
        <div className="qz-card">
          <h2 className="qz-display" ref={headingRef} tabIndex={-1}>{quiz.title}</h2>
          <p className="qz-lede">{text}</p>
        </div>
        {data.leaderboard.length > 0 && <Board list={data.leaderboard} me={th} live={false} />}
      </Frame>
    );
  }

  // The intro.
  if (step < 0 || !data.startedAt) {
    return (
      <Frame onClose={onClose} title={quiz.title}>
        <div className="qz-card">
          <h2 className="qz-display" ref={headingRef} tabIndex={-1}>{data.result ? `Try ${data.result.tries + 1}` : quiz.title}</h2>
          <p className="qz-lede">{data.result ? <>Your best so far is <b className="tabular">{data.result.bestPct}%</b>; {quiz.passPct}% passes. Answer every question, then send.</> : <>{quiz.intro[0]}. Answer every question, then send your answers.</>}</p>
          <div className="qz-facts">
            <div className="qz-fact"><span className="qz-fact-val tabular">{n}</span><span className="qz-fact-label">questions, {quiz.pointsEach} points each</span></div>
            <div className="qz-fact"><span className="qz-fact-val tabular">{quiz.passPct}%</span><span className="qz-fact-label">to pass</span></div>
            <div className="qz-fact"><span className="qz-fact-val tabular">{quiz.badgePct}%</span><span className="qz-fact-label">earns a free {quiz.badge}</span></div>
          </div>
          <div className="qz-callout">If you don&apos;t pass, you can try again while the training runs; your best score counts. The clock starts when you begin, and breaks ties on the leaderboard.</div>
          {error && <p className="qz-error" style={{ marginTop: 14 }} role="alert"><Warn /><span>{error}</span></p>}
          <div style={{ marginTop: 20 }}>
            <button type="button" className="qz-btn qz-btn-primary qz-btn-big" onClick={data.startedAt ? () => setStep(Math.max(0, answers.findIndex((a) => a === null))) : start} disabled={busy}>
              {busy ? "Opening…" : data.startedAt ? (done ? "Carry on" : "Begin") : "Start the quiz"}
            </button>
          </div>
        </div>
      </Frame>
    );
  }

  // A question, or the review step.
  const q = step < n ? quiz.questions[step] : null;
  const pictures = q?.options.some((o) => o.image);
  return (
    <Frame onClose={onClose} title={quiz.title} top={(
      <>
        <div className="qz-meta" style={{ marginLeft: 0 }}>
          <span className={`qz-pill${pulse ? " pulse" : ""}`} aria-live="polite"><span className="qz-pill-cap">Answered</span><span className="qz-pill-value tabular">{done}</span><span className="qz-pill-max tabular">/ {n}</span></span>
          <span className="qz-step-label">{q ? `Q ${step + 1} / ${n}` : "Review"}</span>
        </div>
      </>
    )} dots={(
      <div className="qz-dots">
        {quiz.questions.map((x, i) => (
          <button key={x.id} type="button" className={`qz-dot${i === step ? " current" : answers[i] !== null ? " answered" : ""}`} onClick={() => setStep(i)} aria-label={`Question ${i + 1}${answers[i] !== null ? ", answered" : ""}`} aria-current={i === step ? "step" : undefined} />
        ))}
      </div>
    )} footer={(
      <>
        {error && <div className="qz-error" role="alert"><Warn /><span>{error}</span></div>}
        <div className="qz-footer-nav">
          <button type="button" className="qz-btn qz-btn-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy}>Back</button>
          {q ? <button type="button" className="qz-btn qz-btn-primary" onClick={() => setStep((s) => Math.min(n, s + 1))}>{step === n - 1 ? "Review" : "Next"}</button>
            : <button type="button" className="qz-btn qz-btn-primary" onClick={submit} disabled={busy}>{busy ? "Sending…" : "Send my answers"}</button>}
        </div>
      </>
    )}>
      {q ? (
        <div className="qz-card" key={q.id}>
          <div className="qz-eyebrow"><span className="qz-letter tabular">{step + 1}</span><span className="qz-pts">{quiz.pointsEach} pts</span></div>
          <h2 className="qz-title" ref={headingRef} tabIndex={-1}>{q.text}</h2>
          {pictures ? (
            <div className={`qz-grid cols-${Math.min(4, q.options.length)}`} role="radiogroup" aria-label={q.text}>
              {q.options.map((o, k) => (
                <label key={k} className={`qz-card-opt${answers[step] === k ? " selected" : ""}`}>
                  <input type="radio" name={q.id} checked={answers[step] === k} onChange={() => pick(step, k)} />
                  <span className="qz-card-check"><Check /></span>
                  {/* eslint-disable-next-line @next/next/no-img-element -- the form's own pictures, small and fixed */}
                  <span className="qz-card-art">{o.image && <img src={o.image} alt="" loading="lazy" />}</span>
                  <span className="qz-card-label">{o.text}</span>
                </label>
              ))}
            </div>
          ) : (
            <div className="qz-options" role="radiogroup" aria-label={q.text}>
              {q.options.map((o, k) => (
                <label key={k} className={`qz-option${answers[step] === k ? " selected" : ""}`}>
                  <input type="radio" name={q.id} checked={answers[step] === k} onChange={() => pick(step, k)} />
                  <span className="qz-option-text">{o.text}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="qz-card">
          <div className="qz-eyebrow"><span className="qz-letter" style={{ width: 26, height: 26, display: "inline-flex" }}><Check /></span></div>
          <h2 className="qz-title" ref={headingRef} tabIndex={-1}>{done === n ? "Ready to send" : `${n - done} question${n - done === 1 ? "" : "s"} left`}</h2>
          <p className="qz-lede" style={{ marginTop: 0 }}>{done === n ? "Check any answer by tapping its number, then send." : "Tap a number to go back to it."}</p>
          <div className="qz-review">
            {answers.map((a, i) => <button key={i} type="button" className={a !== null ? "done" : "missing"} onClick={() => setStep(i)} aria-label={`Question ${i + 1}${a !== null ? ", answered" : ", not answered"}`}>{i + 1}</button>)}
          </div>
        </div>
      )}
    </Frame>
  );
}

function Frame({ children, onClose, title = "Quiz", top, dots, footer }: { children: React.ReactNode; onClose: () => void; title?: string; top?: React.ReactNode; dots?: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="qz">
      <div className="qz-page">
        <div className="qz-topbar">
          <div className="qz-brandrow">
            <div className="qz-brand">
              {/* eslint-disable-next-line @next/next/no-img-element -- the brand mark, a fixed small PNG */}
              <img src="/portal/think-health-logo.png" alt="Think Health" />
              <span>{title}<small>Think Health &middot; Basic Life Support</small></span>
            </div>
            {top ?? <button type="button" className="qz-btn qz-btn-ghost" onClick={onClose}>My page</button>}
          </div>
          {dots}
        </div>
        <div className="qz-main">{children}</div>
        {footer && <div className="qz-footer"><div className="qz-footer-inner">{footer}</div></div>}
      </div>
    </div>
  );
}

/** After a pass: where the certificate goes, and the download once the training has ended. */
function CertificateCard({ c, number, th, token, onSaved }: { c: Certificate; number: string; th: string; token: string; onSaved: () => void }) {
  const [email, setEmail] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await fetch("/api/portal/quiz", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ n: number, th, p: token, action: "email", email }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : { error: OFFLINE };
    setBusy(false);
    if (!j.email) return setError(j.error ?? "Couldn't save it");
    setEditing(false); setEmail("");
    onSaved();
  };
  const href = `/api/portal/certificate?n=${encodeURIComponent(number)}&th=${encodeURIComponent(th)}&p=${encodeURIComponent(token)}`;
  const askEmail = !c.emailedAt && (!c.email || editing);
  const text = c.emailedAt ? <>We&apos;ve emailed it to <b>{c.email}</b>. You can also download it here.</>
    : c.ready && c.email ? <>It&apos;s on its way to <b>{c.email}</b>. You can also download it here.</>
    : c.ready ? <>Download it here, or tell us where to email it.</>
    : c.email ? <>It comes by email to <b>{c.email}</b> once your coordinator ends the training.</>
    : <>It comes by email once your coordinator ends the training. Where shall we send it?</>;
  return (
    <div className="qz-card">
      <h3 className="qz-board-title">Your certificate</h3>
      <p className="qz-note" style={{ fontSize: "1rem" }}>{text}</p>
      {askEmail && (
        <form className="qz-field" onSubmit={save}>
          <label className="sr-only" htmlFor="qz-email">Your email</label>
          <input id="qz-email" className="qz-input" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} required />
          <button type="submit" className="qz-btn qz-btn-primary" disabled={busy || !email.trim()}>{busy ? "Saving…" : c.ready ? "Email it to me" : "Save"}</button>
        </form>
      )}
      {error && <p className="qz-error" style={{ marginTop: 10 }} role="alert"><Warn /><span>{error}</span></p>}
      <div className="qz-actions">
        {c.ready && <a className="qz-btn qz-btn-primary" href={href} download>Download certificate</a>}
        {!c.emailedAt && c.email && !editing && <button type="button" className="qz-btn qz-btn-ghost" onClick={() => setEditing(true)}>Use another email</button>}
      </div>
      {c.certNo && <p className="qz-note tabular">Certificate no. {c.certNo}</p>}
    </div>
  );
}

function Board({ list, me, live }: { list: Ranked[]; me: string; live: boolean }) {
  return (
    <div className="qz-card">
      <h3 className="qz-board-title">Leaderboard</h3>
      <p className="qz-lede" style={{ marginTop: 0 }}>{list.length} {list.length === 1 ? "person has" : "people have"} finished{live ? " so far; it updates by itself" : ""}. A tie goes to the faster finish.</p>
      <ol className="qz-board">
        {list.map((b) => (
          <li key={b.th} className={b.th === me ? "me" : ""}>
            <span className="qz-rank tabular">{b.rank}</span>
            <span className="qz-board-name">{b.name}{b.th === me ? " (you)" : ""}</span>
            <span className="qz-board-score tabular">{b.points}<small>{b.pct}%</small></span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** After the training ends: every question with their answer and the right one. */
function Review({ quiz, answers, onBack }: { quiz: PublicQuiz; answers: number[]; onBack: () => void }) {
  return (
    <>
      <div className="qz-card">
        <h2 className="qz-display">The right answers</h2>
        <p className="qz-lede">Green is the right answer; red is yours where it differed.</p>
        <div style={{ marginTop: 16 }}><button type="button" className="qz-btn qz-btn-ghost" onClick={onBack}>Back to my result</button></div>
      </div>
      {quiz.questions.map((q, i) => {
        const pictures = q.options.some((o) => o.image);
        const cls = (k: number) => (k === q.answer ? " right" : k === answers[i] ? " wrong" : "") + " locked";
        return (
          <div className="qz-card" key={q.id}>
            <div className="qz-eyebrow"><span className="qz-letter tabular">{i + 1}</span><span className="qz-pts">{answers[i] === q.answer ? `+${quiz.pointsEach}` : "0"} pts</span></div>
            <h3 className="qz-title">{q.text}</h3>
            {pictures ? (
              <div className={`qz-grid cols-${Math.min(4, q.options.length)}`}>
                {q.options.map((o, k) => (
                  <div key={k} className={`qz-card-opt${cls(k)}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- the form's own pictures */}
                    <span className="qz-card-art">{o.image && <img src={o.image} alt="" loading="lazy" />}</span>
                    <span className="qz-card-label">{o.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="qz-options">
                {q.options.map((o, k) => <div key={k} className={`qz-option${cls(k)}`}><span className="qz-option-text">{o.text}</span></div>)}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
