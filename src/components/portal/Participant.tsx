"use client";

import { useEffect, useState } from "react";
import { SIGNS, SignTile } from "./SignTiles";
import { Programmes, StayConnected } from "./PortalDashboard";
import { type PortalContent } from "@/lib/portalContent";
import { type ProposalDate, fmtProposalDate } from "@/lib/portalRules";
import { portalPrefix } from "@/lib/portalHost";
import { NeonTick, primaryBtn, secondaryBtn } from "./TrainingTools";
import { QuizScreen } from "./Quiz";
import { MyReport } from "./ParticipantReport";
import { useLive, watchChanges } from "@/lib/live";

/*
 * Participants (docs/TRAINING_MANAGER_PLAN.md step 7), phone-first and light: the join page the coordinator's QR code
 * opens, then a warm thank-you that fades into their own page — their name and TH number; On / At / For; the programme
 * videos and Stay connected. No login: their link carries a private token, and the page always shows the latest date.
 */

export const field = "h-12 w-full rounded-xl border border-line bg-surface px-4 text-[16px] text-ink placeholder:text-muted/70 transition focus:border-action focus:outline-none focus:ring-4 focus:ring-action/15";

export function Band({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <header className="bg-surface">
        <div className="mx-auto flex max-w-3xl items-center gap-3.5 px-5 py-3.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- the brand mark, a fixed small PNG */}
          <img src="/portal/think-health-logo.png" alt="Think Health" width={104} height={46} className="h-auto w-[96px]" />
          <span className="h-7 w-px bg-line" aria-hidden />
          <span className="text-[14px] font-semibold tracking-tight text-ink-2">Training</span>
        </div>
      </header>
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="relative mx-auto max-w-3xl px-5 pb-10 pt-8">
          <div className="flex gap-2">{SIGNS.map((s, i) => <SignTile key={s.key} sign={s} size={34} delay={100 + i * 100} rim />)}</div>
          {children}
        </div>
      </section>
    </>
  );
}

export const Problem = ({ text }: { text: string }) => (
  <main className="min-h-screen bg-ground">
    <Band><h1 className="mt-6 text-[30px] font-extrabold leading-tight tracking-[-0.02em]">We couldn&apos;t open this page.</h1></Band>
    <p className="mx-auto max-w-3xl px-5 py-8 text-[16px] leading-relaxed text-ink-2">{text}</p>
  </main>
);

/* ---------------- The join page ---------------- */

type Invite = { training: string; customer: string; coordinator: string; closed?: boolean; notYet?: boolean };

export function JoinPage({ number, k }: { number: string; k: string }) {
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState<{ name: string; existed: boolean } | null>(null);

  useEffect(() => {
    fetch(`/api/portal/join?n=${encodeURIComponent(number)}&k=${encodeURIComponent(k)}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (r.ok) setInvite(j as Invite); else { setInvite(null); setError(j.error ?? "This link doesn't work any more."); }
    }).catch(() => { setInvite(null); setError("Couldn't reach Think Health. Check your connection and try again."); });
  }, [number, k]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await fetch("/api/portal/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ n: number, k, name, phone, email }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : { error: "Couldn't reach Think Health. Check your connection and try again." };
    setBusy(false);
    if (!j.th) return setError(j.error ?? "Couldn't register you");
    const to = `${portalPrefix(location.host)}/${encodeURIComponent(number)}/${j.th}?p=${encodeURIComponent(j.token)}`;
    const quiet = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setThanks({ name: String(j.name).split(" ")[0], existed: Boolean(j.existed) });
    setTimeout(() => location.replace(to), quiet ? 900 : 2600);
  };

  if (invite === undefined) return <div className="min-h-screen bg-ground" aria-busy />;
  if (!invite) return <Problem text={error} />;
  // Registration closes once the training is over (owner, 13 Nov).
  if (invite.closed && !thanks) return <Problem text={`Registration for ${invite.training} has closed. For anything about it, speak to your training coordinator.`} />;
  if (invite.notYet && !thanks) return <Problem text={`Registration for ${invite.training} opens once your training coordinator confirms it with Think Health. Please try this link again later.`} />;
  if (thanks) {
    return (
      <main className="grid min-h-screen place-items-center bg-navy px-6 text-white">
        <div className="max-w-xl text-center">
          <p className="welcome-line text-[34px] font-extrabold leading-[1.1] tracking-[-0.025em] sm:text-[44px]">{thanks.existed ? `Welcome back, ${thanks.name}.` : `Thank you for giving us your time, ${thanks.name}.`}</p>
          <p className="welcome-line mt-3 text-[20px] font-bold text-white/80" style={{ animationDelay: "700ms" }}>{thanks.existed ? "You're already on the list." : "See you there."}</p>
        </div>
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-ground">
      <Band>
        <h1 className="mt-6 text-[32px] font-extrabold leading-[1.06] tracking-[-0.025em] sm:text-[40px]">{invite.training}</h1>
        <p className="mt-2 text-[15.5px] leading-relaxed text-white/80">{invite.coordinator ? <><b className="text-white">{invite.coordinator}</b> at {invite.customer} invites you to register.</> : <>{invite.customer} invites you to register.</>}</p>
      </Band>
      <form onSubmit={submit} className="mx-auto max-w-3xl space-y-4 px-5 py-8" noValidate>
        <p className="text-[17px] font-bold text-ink">Register for the training</p>
        <label className="block">
          <span className="mb-1.5 block text-[14px] font-semibold text-ink-2">Your name</span>
          <input className={field} autoComplete="name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[14px] font-semibold text-ink-2">Mobile number</span>
          <input className={`${field} num`} type="tel" inputMode="tel" autoComplete="tel" value={phone} maxLength={16} onChange={(e) => setPhone(e.target.value)} required />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[14px] font-semibold text-ink-2">Email <span className="font-normal text-muted">(your certificate goes here)</span></span>
          <input className={field} type="email" inputMode="email" autoComplete="email" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        {error && <p className="rounded-xl bg-danger-bg px-4 py-3 text-[14.5px] text-danger" role="alert">{error}</p>}
        <button className={`${primaryBtn} h-12 w-full text-[16px]`} disabled={busy}>{busy ? "One moment…" : "Join"}</button>
        <p className="text-[13px] leading-relaxed text-muted">Your details go only to Think Health and your training coordinator, for this training.</p>
      </form>
    </main>
  );
}

/* ---------------- The participant's own page ---------------- */

type Page = { th: string; name: string; number: string; training: string; customer: string; dates: ProposalDate[]; tentative: boolean; location: string; tbd?: boolean; present?: string[]; confirmed?: boolean };

type QuizInfo = {
  quiz: { title: string; questions: { text: string; options: { text: string; image?: string }[]; answer?: number; critical?: boolean; lesson?: string }[]; passPct: number }; state: "none" | "open" | "closed" | "revealed"; present: boolean; startedAt: string | null;
  result: { points: number; max: number; pct: number; correct: number; total: number; rank: number; of: number; passed: boolean; badge: boolean; bestPct: number; tries: number; seconds: number; answers: number[]; topics: { name: string; right: number; of: number }[] } | null;
  canRetake: boolean; certificate: { ready: boolean; email: string | null; emailedAt: string | null } | null;
  leaderboard?: { seconds: number }[];
};

export function ParticipantPage({ number, th, p, quiz: quizOpen = false }: { number: string; th: string; p: string; quiz?: boolean }) {
  const [data, setData] = useState<{ page: Page; content: PortalContent } | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [showQuiz, setShowQuiz] = useState(quizOpen);
  const [toAnswers, setToAnswers] = useState(false);
  const [quiz, setQuiz] = useState<QuizInfo | null>(null);
  const [report, setReport] = useState<false | "view" | "save">(false);
  // The quiz (owner, 13 Nov): checked every 15 s, so "Take the quiz" appears by itself when the coordinator starts.
  useEffect(() => {
    let on = true;
    const look = () => fetch(`/api/portal/quiz?n=${encodeURIComponent(number)}&th=${encodeURIComponent(th)}&p=${encodeURIComponent(p)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (on) setQuiz(j?.quiz ? (j as QuizInfo) : null); }).catch(() => {});
    look();
    const id = setInterval(() => { if (!document.hidden && !showQuiz) look(); }, 15000);
    return () => { on = false; clearInterval(id); };
  }, [number, th, p, showQuiz]);
  const openQuiz = (open: boolean) => {
    setShowQuiz(open);
    const url = new URL(location.href);
    if (open) url.searchParams.set("quiz", "1"); else url.searchParams.delete("quiz");
    history.replaceState(null, "", url);
  };
  const loadPage = (first: boolean) => fetch(`/api/portal/join?n=${encodeURIComponent(number)}&th=${encodeURIComponent(th)}&p=${encodeURIComponent(p)}`, { cache: "no-store" }).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (r.ok) setData(j); else if (first) { setData(null); setError(j.error ?? "We couldn't find that page."); }
  }).catch(() => { if (first) { setData(null); setError("Couldn't reach Think Health. Check your connection and try again."); } });
  useEffect(() => { loadPage(true); }, [number, th, p]); // eslint-disable-line react-hooks/exhaustive-deps
  // Live (owner, 16 Nov): a new date, Start training, their attendance — on the page within seconds, no refresh.
  useEffect(() => watchChanges("/api/portal/changes"), []);
  const lookQuiz = () => fetch(`/api/portal/quiz?n=${encodeURIComponent(number)}&th=${encodeURIComponent(th)}&p=${encodeURIComponent(p)}`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null)).then((j) => setQuiz(j?.quiz ? (j as QuizInfo) : null)).catch(() => {});
  useLive(() => { if (!showQuiz) { loadPage(false); lookQuiz(); } }, ["work", "team", "zoho"]);

  if (data === undefined) return <div className="min-h-screen bg-ground" aria-busy />;
  if (!data) return <Problem text={error} />;
  const { page, content } = data;
  if (showQuiz) return <QuizScreen number={number} th={th} token={p} name={page.name} answers={toAnswers} onClose={() => { setToAnswers(false); openQuiz(false); }} onReport={(save) => { openQuiz(false); lookQuiz(); setReport(save ? "save" : "view"); }} />;
  const reportSaved = () => { fetch("/api/portal/quiz", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ n: number, th, p, action: "saved" }) }).catch(() => {}); };
  const withVideo = content.programmes.filter((x) => x.video || x.photo);
  const row = "grid grid-cols-[64px_minmax(0,1fr)] gap-4 border-b border-line py-4 last:border-b-0";
  return (
    <div className="portal-reveal min-h-screen bg-ground">
      <Band>
        <h1 className="mt-6 text-[34px] font-extrabold leading-[1.04] tracking-[-0.025em] sm:text-[44px]">{page.name}</h1>
        <p className="num mt-3 inline-block rounded-lg bg-white/10 px-3 py-1.5 text-[18px] font-extrabold tracking-[0.06em] ring-1 ring-white/15">{page.th}</p>
      </Band>
      <main className="mx-auto max-w-3xl px-5">
        {/* Your steps (owner, 21 Nov): only the step you're on is lit. The training's details below. */}
        <Steps page={page} q={quiz} number={number} th={th} p={p} onQuiz={() => openQuiz(true)} onAnswers={() => { setToAnswers(true); openQuiz(true); }} onReport={() => setReport("view")} onEmail={lookQuiz} />
        <section className="mt-4 rounded-2xl bg-surface px-5 ring-1 ring-line sm:px-7" aria-label="Your training">
          <div className={row}>
            <p className="pt-0.5 text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted">On</p>
            <div>
              {page.dates.length ? page.dates.map((d) => <p key={d.date} className="num text-[17px] font-bold text-ink">{fmtProposalDate(d)}</p>) : <p className="text-[17px] font-bold text-ink">To be confirmed</p>}
              {page.dates.length > 0 && page.tentative && <p className="mt-0.5 text-[14px] text-muted">Tentative: this may still change. This page always shows the latest.</p>}
            </div>
          </div>
          <div className={row}>
            <p className="pt-0.5 text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted">At</p>
            <p className="text-[17px] font-bold text-ink">{page.location || "To be confirmed"}</p>
          </div>
          <div className={row}>
            <p className="pt-0.5 text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted">For</p>
            <div>
              <p className="text-[17px] font-bold text-ink">{page.training}</p>
              <p className="mt-0.5 text-[14px] text-muted">{page.customer}</p>
            </div>
          </div>
        </section>
        <p className="mt-3 text-[13.5px] text-muted">Keep this page: bookmark it or add it to your home screen.</p>
        {withVideo.length > 0 && <div className="pb-4"><Programmes list={withVideo} title="Watch before you come" /></div>}
        <div className="h-12" />
      </main>
      <StayConnected social={content.social} />
      {report && quiz?.result && <MyReport d={{ title: quiz.quiz.title, name: page.name, th: page.th, training: page.training, revealed: quiz.state === "revealed", passPct: quiz.quiz.passPct, questions: quiz.quiz.questions, everyone: (quiz.leaderboard ?? []).map((b) => b.seconds), result: quiz.result }} autoSave={report === "save"} onSaved={reportSaved} onClose={() => setReport(false)} />}
    </div>
  );
}

type StepState = "done" | "now" | "later";
type StepRow = { key: string; title: string; text: React.ReactNode; state: StepState; action?: React.ReactNode };

/**
 * A participant's steps (owner, 21 Nov: "step by step … one at a time"): Registered → Mark your attendance → Take the
 * quiz → Your result → Your certificate. Done steps get a tick, the first one not done is lit with its one button, the
 * ones after are grey. A training without a quiz has the first two only.
 */
function Steps({ page, q, number, th, p, onQuiz, onAnswers, onReport, onEmail }: { page: Page; q: QuizInfo | null; number: string; th: string; p: string; onQuiz: () => void; onAnswers: () => void; onReport: () => void; onEmail: () => void }) {
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const present = page.present ?? [];
  const days = page.dates.map((d) => d.date);
  const nextDay = days.find((d) => d >= today && !present.includes(d));
  const attended = present.length > 0 && !nextDay;
  const big = `${primaryBtn} h-12 w-full text-[16px] sm:w-auto sm:px-7`;
  const r = q?.result ?? null;
  const c = q?.certificate ?? null;
  const going = Boolean(q?.startedAt && q.state === "open");
  const when = (d?: string) => fmtProposalDate(page.dates.find((x) => x.date === d) ?? page.dates[0]);
  const rows: StepRow[] = [
    { key: "reg", title: "You're registered", text: <>Your number is <b className="num text-ink">{page.th}</b>. Keep this page: it always shows the latest.</>, state: "done" },
    {
      key: "attend", title: "Mark your attendance",
      state: attended ? "done" : "now",
      text: attended ? <>Marked present{days.length > 1 ? ` on ${present.length} of ${days.length} days` : ""}.</>
        : !page.confirmed || !days.length ? <>Your coordinator is confirming the date with Think Health. It shows here once it&apos;s set.</>
        : nextDay === today ? <><b className="text-ink">Today:</b> scan the code your coordinator shows in the room, then tap <b className="text-ink">Present</b>.</>
        : <>On <b className="num text-ink">{when(nextDay)}</b>, scan the code your coordinator shows in the room and tap <b className="text-ink">Present</b>.</>,
    },
  ];
  if (q) {
    const quizDone = Boolean(r && !going && !q.canRetake);
    rows.push({
      key: "quiz", title: `Take the ${q.quiz.title}`,
      state: quizDone ? "done" : "now",
      text: quizDone ? <>Answers sent.</>
        : going ? <>You started the quiz. Carry on where you left off.</>
        : r && q.canRetake ? <>You scored <b className="num text-ink">{r.pct}%</b>{r.tries > 1 ? <> (best <b className="num text-ink">{r.bestPct}%</b>)</> : null}. You need {q.quiz.passPct}%: you can try again while the training runs.</>
        : q.state === "open" && q.present ? <>{q.quiz.questions.length} questions, {q.quiz.passPct}% to pass. Pass it to get your certificate.</>
        : q.state === "open" ? <>Mark your attendance first. Then the quiz opens here.</>
        : q.state === "revealed" ? <>The quiz has closed.</>
        : <>It opens here by itself when your coordinator starts the training.</>,
      action: going ? <button type="button" className={big} onClick={onQuiz}>Carry on</button>
        : r && q.canRetake ? <button type="button" className={big} onClick={onQuiz}>Try again</button>
        : !r && q.state === "open" && q.present ? <button type="button" className={big} onClick={onQuiz}>Take the quiz</button> : undefined,
    });
    if (r && !going) rows.push({
      key: "result", title: "Your result", state: "done",
      text: <><b className="num text-ink">{q.canRetake ? r.bestPct : r.pct}%</b> · {r.passed ? <b className="text-ok">Passed</b> : "Not passed"} ({q.quiz.passPct}% needed) · <span className="num">{r.correct} of {r.total}</span> right. {q.state === "revealed" ? "The right answers are out." : "The right answers come when your coordinator ends the training."}</>,
      action: <div className="flex flex-wrap gap-2.5">{q.state === "revealed" && <button type="button" className={primaryBtn} onClick={onAnswers}>See my answers</button>}<button type="button" className={secondaryBtn} onClick={onReport}>My report</button></div>,
    });
    rows.push({
      key: "cert", title: "Your Good Samaritan certificate",
      state: c?.emailedAt ? "done" : "now",
      text: c?.emailedAt ? <>Emailed to <b className="break-all text-ink">{c.email}</b> with our thanks.</>
        : c?.email ? <>It goes to <b className="break-all text-ink">{c.email}</b> with a thank-you{q.state === "revealed" ? ". It's on its way." : " when the training ends."}</>
        : c ? <>You passed. Tell us where to email it.</>
        : <>Pass the quiz and it comes to you by email, with a thank-you, when the training ends.</>,
      action: c && !c.email && !c.emailedAt ? <EmailForm number={number} th={th} p={p} onSaved={onEmail} /> : undefined,
    });
  }
  // Only the first step not done is lit; anything after it waits (a waiting certificate with its address counts as done).
  const settled = (x: StepRow) => x.state === "done" || (x.key === "cert" && Boolean(c?.email));
  const first = rows.findIndex((x) => !settled(x));
  const shown = rows.map((x, i) => ({ ...x, state: (x.state === "done" ? "done" : i === first ? "now" : i < first && settled(x) ? "done" : "later") as StepState }));
  return (
    <section className="mt-8 rounded-2xl bg-surface px-5 py-2 ring-1 ring-line sm:px-7" aria-label="Your steps">
      <ol>
        {shown.map((x, i) => (
          <li key={x.key} className="flex gap-4 py-4" aria-current={x.state === "now" ? "step" : undefined}>
            <div className="flex flex-col items-center">
              <StepDot state={x.state} n={i + 1} />
              {i < shown.length - 1 && <span className={`mt-2 -mb-4 w-[2px] flex-1 rounded-full ${x.state === "done" ? "bg-navy" : "bg-line"}`} aria-hidden />}
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <p className={`text-[17px] font-extrabold leading-snug ${x.state === "later" ? "text-muted" : "text-ink"}`}>{x.title}</p>
              <p className={`mt-1 text-[15.5px] leading-relaxed ${x.state === "later" ? "text-muted" : "text-ink-2"}`}>{x.text}</p>
              {x.action && x.state !== "later" && <div className="mt-3.5">{x.action}</div>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StepDot({ state, n }: { state: StepState; n: number }) {
  if (state === "done") return <span className="grid size-8 shrink-0 place-items-center rounded-full bg-navy text-white" aria-label="Done"><svg viewBox="0 0 12 12" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2.5 6.3l2.3 2.3L9.5 3.8" /></svg></span>;
  if (state === "now") return <span className="num grid size-8 shrink-0 place-items-center rounded-full bg-action text-[15px] font-extrabold text-white shadow-[0_0_0_5px_color-mix(in_srgb,var(--action)_16%,transparent)]">{n}</span>;
  return <span className="num grid size-8 shrink-0 place-items-center rounded-full text-[15px] font-bold text-muted ring-2 ring-inset ring-line">{n}</span>;
}

/** Where the certificate goes, when they have no email yet (the quiz API's "email" action). */
function EmailForm({ number, th, p, onSaved }: { number: string; th: string; p: string; onSaved: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await fetch("/api/portal/quiz", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ n: number, th, p, action: "email", email }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : { error: "Couldn't reach Think Health. Check your connection and try again." };
    setBusy(false);
    if (!j.email) return setError(j.error ?? "Couldn't save it");
    onSaved();
  };
  return (
    <form onSubmit={save} noValidate>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <label className="sr-only" htmlFor="cert-email">Your email</label>
        <input id="cert-email" className={field} type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} />
        <button className={`${primaryBtn} h-12 shrink-0`} disabled={busy || !email.trim()}>{busy ? "Saving…" : "Save"}</button>
      </div>
      {error && <p className="mt-2.5 rounded-xl bg-danger-bg px-4 py-3 text-[14px] text-danger" role="alert">{error}</p>}
    </form>
  );
}
