"use client";

import { useEffect, useState } from "react";
import { SIGNS, SignTile } from "./SignTiles";
import { Programmes, StayConnected } from "./PortalDashboard";
import { type PortalContent } from "@/lib/portalContent";
import { type ProposalDate, fmtProposalDate } from "@/lib/portalRules";
import { portalPrefix } from "@/lib/portalHost";
import { primaryBtn, secondaryBtn } from "./TrainingTools";
import { QuizScreen } from "./Quiz";

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

type Invite = { training: string; customer: string; coordinator: string; closed?: boolean };

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
          <span className="mb-1.5 block text-[14px] font-semibold text-ink-2">Email <span className="font-normal text-muted">(optional)</span></span>
          <input className={field} type="email" inputMode="email" autoComplete="email" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} />
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
  quiz: { title: string; questions: unknown[]; passPct: number }; state: "none" | "open" | "closed" | "revealed"; present: boolean; startedAt: string | null;
  result: { points: number; max: number; pct: number; rank: number; of: number; passed: boolean; bestPct: number; tries: number } | null;
  canRetake: boolean; certificate: { ready: boolean; email: string | null; emailedAt: string | null } | null;
};

export function ParticipantPage({ number, th, p, quiz: quizOpen = false }: { number: string; th: string; p: string; quiz?: boolean }) {
  const [data, setData] = useState<{ page: Page; content: PortalContent } | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [showQuiz, setShowQuiz] = useState(quizOpen);
  const [quiz, setQuiz] = useState<QuizInfo | null>(null);
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
  useEffect(() => {
    fetch(`/api/portal/join?n=${encodeURIComponent(number)}&th=${encodeURIComponent(th)}&p=${encodeURIComponent(p)}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (r.ok) setData(j); else { setData(null); setError(j.error ?? "We couldn't find that page."); }
    }).catch(() => { setData(null); setError("Couldn't reach Think Health. Check your connection and try again."); });
  }, [number, th, p]);

  if (data === undefined) return <div className="min-h-screen bg-ground" aria-busy />;
  if (!data) return <Problem text={error} />;
  const { page, content } = data;
  if (showQuiz) return <QuizScreen number={number} th={th} token={p} name={page.name} onClose={() => openQuiz(false)} />;
  const withVideo = content.programmes.filter((x) => x.video || x.photo);
  const row = "grid grid-cols-[64px_minmax(0,1fr)] gap-4 border-b border-line py-4 last:border-b-0";
  return (
    <div className="portal-reveal min-h-screen bg-ground">
      <Band>
        <h1 className="mt-6 text-[34px] font-extrabold leading-[1.04] tracking-[-0.025em] sm:text-[44px]">{page.name}</h1>
        <p className="num mt-3 inline-block rounded-lg bg-white/10 px-3 py-1.5 text-[18px] font-extrabold tracking-[0.06em] ring-1 ring-white/15">{page.th}</p>
      </Band>
      <main className="mx-auto max-w-3xl px-5">
        <section className="mt-8 rounded-2xl bg-surface px-5 ring-1 ring-line sm:px-7" aria-label="Your training">
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
        {quiz && quiz.state !== "none" && <QuizPanel q={quiz} onOpen={() => openQuiz(true)} certHref={`/api/portal/certificate?n=${encodeURIComponent(number)}&th=${encodeURIComponent(th)}&p=${encodeURIComponent(p)}`} />}
        {page.confirmed && page.dates.length > 0 && <Attendance dates={page.dates} present={page.present ?? []} />}
        <p className="mt-3 text-[13.5px] text-muted">Keep this page: bookmark it or add it to your home screen. Show your number, {page.th}, on the day.</p>
        {withVideo.length > 0 && <div className="pb-4"><Programmes list={withVideo} title="Watch before you come" /></div>}
        <div className="h-12" />
      </main>
      <StayConnected social={content.social} />
    </div>
  );
}

/** Their attendance, a row per training day (owner, 13 Nov): a PRESENT stamp on the days they marked, nothing on the others. */
function Attendance({ dates, present }: { dates: ProposalDate[]; present: string[] }) {
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  return (
    <section className="mt-4 rounded-2xl bg-surface px-5 ring-1 ring-line sm:px-7" aria-label="Your attendance">
      <p className="border-b border-line py-4 text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted">Attendance</p>
      {dates.map((d) => {
        const here = present.includes(d.date);
        return (
          <div key={d.date} className="flex min-h-16 items-center justify-between gap-4 border-b border-line py-3 last:border-b-0">
            <p className="num text-[16px] font-bold text-ink">{fmtProposalDate({ date: d.date, time: "" })}</p>
            {here ? (
              <span className="inline-flex rotate-[-4deg] rounded-md border-2 border-navy px-2.5 pb-1 pt-1.5 text-navy shadow-[inset_0_0_0_2px_var(--surface),inset_0_0_0_3.5px_var(--navy)]">
                <span className="text-[11.5px] font-extrabold uppercase leading-none tracking-[0.14em]">Present</span>
              </span>
            ) : <span className="text-[14px] text-muted">{d.date > today ? "Mark it on the day" : d.date === today ? "Not marked yet" : "Not marked"}</span>}
          </div>
        );
      })}
    </section>
  );
}

/**
 * Their quiz on their page (owner, 13 Nov): open while the training runs, for those marked present; then their result.
 * Owner, 14 Nov: after a fail, Try again while it runs; after a pass, the certificate (emailed once the coordinator ends
 * the training, and downloadable here).
 */
function QuizPanel({ q, onOpen, certHref }: { q: QuizInfo; onOpen: () => void; certHref: string }) {
  const r = q.result;
  const c = q.certificate;
  const going = q.startedAt && q.state === "open";
  const [line, action] = going ? [<>Your try is in progress.</>, "Carry on"]
    : r && q.canRetake ? [<>You scored <b className="num text-ink">{r.pct}%</b>{r.tries > 1 ? <> (best so far <b className="num text-ink">{r.bestPct}%</b>)</> : null}. {q.quiz.passPct}% passes, and you can try again while the training runs.</>, "Try again"]
    : r ? [<>You scored <b className="num text-ink">{r.points} of {r.max}</b> ({r.pct}%), <b className="num text-ink">#{r.rank}</b> of {r.of}{r.passed ? ". Passed." : "."}</>, "See results"]
    : q.state === "open" && q.present ? [<>Your training has started. {q.quiz.questions.length} questions; {q.quiz.passPct}% to pass.</>, "Take the quiz"]
    : q.state === "open" ? [<>Mark your attendance first (scan your coordinator&apos;s attendance code and tap Present), then the quiz opens here.</>, null]
    : q.state === "revealed" ? [<>The quiz has closed.</>, "See the leaderboard"]
    : [<>The quiz opens when your coordinator starts the training.</>, null];
  const strong = Boolean(going || (!r && q.state === "open" && q.present) || (r && q.canRetake));
  return (
    <section className={`mt-4 rounded-2xl bg-surface px-5 py-5 sm:px-7 ${strong ? "ring-2 ring-navy" : "ring-1 ring-line"}`} aria-label="Quiz">
      <p className="text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted">{q.quiz.title}</p>
      <p className="mt-2 text-[16px] leading-relaxed text-ink-2">{line}</p>
      {c && (
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          {c.emailedAt ? <>Your certificate was emailed to <b className="break-all text-ink">{c.email}</b>.</>
            : c.ready ? <>Your certificate is ready.</>
            : <>Your certificate comes by email once your coordinator ends the training.</>}
        </p>
      )}
      {(action || c?.ready) && (
        <div className="mt-4 flex flex-wrap gap-3">
          {action && <button type="button" className={`${strong ? primaryBtn : secondaryBtn} ${strong ? "h-12 w-full text-[16px]" : ""}`} onClick={onOpen}>{action}</button>}
          {c?.ready && <a className={primaryBtn} href={certHref} download>Download certificate</a>}
        </div>
      )}
    </section>
  );
}
