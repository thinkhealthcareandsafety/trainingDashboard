"use client";

import { useEffect, useRef, useState } from "react";
import { SIGNS, SignTile } from "./SignTiles";
import { type PortalContent, type Programme, type Social, type SocialKey, youtube } from "@/lib/portalContent";
import { type Proposal, type ProposalDate, fmtProposalDate } from "@/lib/portalRules";
import { type DayWindow, fmtLength, ranMs, sessionMs } from "@/lib/attendanceRules";
import { AttendQr, type Live, Participants, ProposalView, ProposeForm, RejectForm, act, primaryBtn, secondaryBtn } from "./TrainingTools";
import { portalPrefix } from "@/lib/portalHost";
import type { QuizResults } from "@/lib/portalTrainings";
import { passedCsv } from "@/lib/portalCertRules";
import { useLive, watchChanges } from "@/lib/live";
import type { QuoteSheet } from "@/lib/trainingManager";
import { quizReport } from "@/lib/quizReport";
import { QuizCharts } from "./QuizCharts";

/*
 * The Training Manager after sign-in (docs/TRAINING_MANAGER_PLAN.md step 4), Safety-sign direction: the welcome (once,
 * right after signing in; tap to skip; none with "reduce motion"), then Our Programmes as identical sign tiles, Your
 * trainings as sign panels with a progress track and their quotation (prices included, owner 16 Nov), and Stay connected.
 */
type Me = { email: string; name: string };
type Training = { id: string; number: string; customer: string; date: string; lines: { name: string; description: string; qty: number }[]; quote: QuoteSheet; expected: number; stamp: string; proposal: Proposal | null; history: Proposal[]; joinKey: string; registered: number; confirmedAt: string | null; locked: boolean; rejected: { at: string; reason: string } | null;
  dates: ProposalDate[]; datesWas: ProposalDate[] | null; tbd: boolean; trainers: string[]; completedAt: string | null; attendKey: string; window: DayWindow; attended: number;
  quiz: { title: string; state: "none" | "open" | "closed" | "revealed" } | null; session: { startedAt: string; endedAt: string | null } | null; sessions: { day: string; startedAt: string; endedAt: string | null }[];
  selfPrompt: "self" | "team" | null; me: { th: string; token: string } | null; self: { name: string; phone: string; email: string } };
type Home = { me: Me; trainings: Training[]; content: PortalContent };

const signOf = (key: string) => SIGNS.find((s) => s.key === key) ?? SIGNS[0];
/** A training's sign, from its name (the programme it belongs to). */
const signFor = (name: string) => signOf(/fire/i.test(name) ? "fire" : /\baed\b|defib/i.test(name) ? "aed" : /first\s*aid/i.test(name) ? "first-aid" : "cpr");
const firstName = (me: Me) => (me.name || me.email).split(/[\s@]/)[0];
const fmtDate = (iso: string) => { const d = new Date(`${iso}T00:00:00`); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function PortalDashboard({ me, number, welcome, onOut }: { me: Me; number?: string; welcome: boolean; onOut: () => void }) {
  const [home, setHome] = useState<Home | null>(null);
  const [error, setError] = useState("");
  const [intro, setIntro] = useState(() => welcome && !reducedMotion());

  const load = (first: boolean) => fetch("/api/portal/home", { cache: "no-store" }).then(async (r) => {
    if (r.status === 401) return onOut();
    const j = await r.json().catch(() => ({}));
    if (j.me) { setHome(j as Home); setError(""); } else if (first) setError(j.error ?? "Couldn't load your trainings. Try again in a minute.");
  }).catch(() => { if (first) setError("Couldn't reach Think Health. Check your connection and try again."); });
  useEffect(() => { load(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Live (owner, 16 Nov: "any changes should be live at all times immediately"): whatever we or anyone changes (a Performa
  // confirmed, a date moved on the board, someone joining) shows within seconds, no refresh.
  useEffect(() => watchChanges("/api/portal/changes"), []);
  useLive(() => load(false), ["work", "team", "zoho"]);

  // The training the link was for (training.thinkhealth.in/<number>): brought into view once, when the page first shows (not
  // on every live refresh: owner, 16 Nov, "how does this auto scroll down").
  const scrolled = useRef(false);
  useEffect(() => {
    if (!home || intro || !number || scrolled.current) return;
    scrolled.current = true;
    document.getElementById(`training-${number}`)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
  }, [home, intro, number]);

  const out = async () => {
    await fetch("/api/portal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "signout" }) }).catch(() => null);
    onOut();
  };

  return (
    <>
      {intro && <Welcome name={firstName(me)} onDone={() => setIntro(false)} />}
      {!intro && (
        <div className="portal-reveal">
          <header className="bg-navy text-white">
            <div className="mx-auto max-w-6xl px-5 sm:px-8">
              <div className="flex items-center justify-between gap-4 py-4">
                <div className="flex items-center gap-3.5">
                  {/* The wordmark on a white plate, the way it is mounted on a sign: the logo is blue on white. */}
                  <span className="rounded-lg bg-white px-2.5 py-1.5 shadow-[0_2px_6px_rgb(0_20_35/0.3)]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- the brand mark, a fixed small PNG */}
                    <img src="/portal/think-health-logo.png" alt="Think Health" width={96} height={43} className="h-auto w-[80px] sm:w-[92px]" />
                  </span>
                  <span className="text-[14px] font-semibold tracking-tight text-white/90 sm:text-[15px]">Training Manager</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="hidden max-w-[28ch] truncate text-[13.5px] text-white/65 md:inline">{me.email}</span>
                  <button type="button" onClick={out} className="rounded-lg px-3 py-2 text-[14px] font-semibold text-white ring-1 ring-inset ring-white/25 transition hover:bg-white/10">Sign out</button>
                </div>
              </div>
              <div className="flex flex-col gap-6 pb-8 pt-4 sm:pb-10 sm:pt-6 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h1 className="text-[34px] font-extrabold leading-[1.04] tracking-[-0.025em] sm:text-[48px]">Welcome, {firstName(me)}.</h1>
                  <p className="mt-2.5 max-w-[56ch] text-[16px] leading-relaxed text-white/80 sm:text-[17px]">
                    {home ? summary(home.trainings) : "Your trainings with Think Health, in one place."}
                  </p>
                </div>
                <ul className="flex gap-4 sm:gap-5" aria-label="Our programmes">
                  {SIGNS.map((s, i) => (
                    <li key={s.key} className="flex w-14 flex-col items-center gap-1.5 text-center">
                      <SignTile sign={s} size={40} delay={150 + i * 120} rim />
                      <span className="text-[11.5px] font-semibold leading-tight text-white/75">{s.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-5 sm:px-8">
            {error && <p className="mt-8 rounded-xl bg-danger-bg px-4 py-3 text-[14.5px] text-danger" role="alert">{error}</p>}
            {!home && !error && <div className="h-[60vh]" aria-busy aria-label="Loading your trainings" />}
            {home && (
              <>
                <Trainings list={home.trainings} focus={number} />
                <Programmes list={home.content.programmes} />
                <div className="h-16 sm:h-20" />
              </>
            )}
          </main>
          {home && <StayConnected social={home.content.social} />}
        </div>
      )}
    </>
  );
}

function summary(t: Training[]): string {
  if (!t.length) return "Your trainings with Think Health, in one place.";
  const customers = [...new Set(t.map((x) => x.customer).filter(Boolean))];
  return `${t.length === 1 ? "One training" : `${t.length} trainings`}${customers.length === 1 ? ` for ${customers[0]}` : ""}, managed here with Think Health.`;
}

/* ---------------- The welcome: three lines, then the dashboard ---------------- */

const WELCOME_MS = 4600;

function Welcome({ name, onDone }: { name: string; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setLeaving(true), WELCOME_MS - 600);
    const b = setTimeout(onDone, WELCOME_MS);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") onDone(); };
    window.addEventListener("keydown", key);
    return () => { clearTimeout(a); clearTimeout(b); window.removeEventListener("keydown", key); };
  }, [onDone]);
  const lines = [`Welcome, ${name}.`, "Your trainings, managed in one place.", "Every attendee, accounted for."];
  return (
    <div role="dialog" aria-label="Welcome" onClick={onDone}
      className={`fixed inset-0 z-50 flex cursor-pointer flex-col justify-center bg-navy px-6 text-white transition-opacity duration-500 sm:px-16 ${leaving ? "opacity-0" : "opacity-100"}`}>
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-8 flex gap-3 sm:mb-10">{SIGNS.map((s, i) => <SignTile key={s.key} sign={s} size={52} delay={i * 140} rim />)}</div>
        {lines.map((l, i) => (
          <p key={l} className={`welcome-line ${i === 0 ? "text-[40px] sm:text-[72px]" : "mt-3 text-[24px] text-white/85 sm:mt-4 sm:text-[40px]"} font-extrabold leading-[1.06] tracking-[-0.03em]`}
            style={{ animationDelay: `${650 + i * 800}ms` }}>{l}</p>
        ))}
      </div>
      <p className="absolute inset-x-0 bottom-8 text-center text-[13px] text-white/55">Tap anywhere to continue</p>
    </div>
  );
}

/* ---------------- Our Programmes ---------------- */

export function Programmes({ list, title = "Our programmes" }: { list: Programme[]; title?: string }) {
  return (
    <section className="pt-4 sm:pt-6" aria-labelledby="programmes">
      <h2 id="programmes" className="text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-ink sm:text-[32px]">{title}</h2>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {list.map((p, i) => <ProgrammeTile key={p.key} p={p} delay={250 + i * 110} />)}
      </div>
    </section>
  );
}

function ProgrammeTile({ p, delay }: { p: Programme; delay: number }) {
  const sign = signOf(p.sign);
  const yt = p.video ? youtube(p.video) : null;
  const [playing, setPlaying] = useState(false);
  const poster = p.photo ? `/api/portal/photo?id=${p.photo}` : yt?.kind === "video" ? `https://i.ytimg.com/vi/${yt.id}/hqdefault.jpg` : "";
  return (
    <article className="sign-tile flex flex-col overflow-hidden rounded-2xl bg-surface shadow-[0_1px_2px_rgb(2_40_60/0.06)] ring-1 ring-line" style={{ animationDelay: `${delay}ms` }}>
      <div className="relative aspect-video overflow-hidden bg-ground">
        {playing && yt ? (
          <iframe src={yt.embed} title={`${p.name} video`} className="absolute inset-0 h-full w-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
        ) : (
          <>
            {poster ? (
              // eslint-disable-next-line @next/next/no-img-element -- small photos and YouTube thumbnails, lazily loaded
              <img src={poster} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 grid place-items-center">
                <SignTile sign={sign} size={76} delay={delay + 120} />
              </div>
            )}
            {yt && (
              <button type="button" onClick={() => setPlaying(true)} aria-label={`Play the ${p.name} video`}
                className="group absolute inset-0 grid place-items-center bg-[linear-gradient(to_top,rgb(2_30_45/0.45),transparent_60%)] transition hover:bg-[rgb(2_30_45/0.25)]">
                <span className="grid size-14 place-items-center rounded-full bg-action text-white shadow-[0_6px_18px_rgb(0_40_70/0.35)] transition group-hover:scale-105">
                  <svg viewBox="0 0 24 24" className="ml-0.5 size-6" fill="currentColor" aria-hidden><path d="M8 5.5v13l10.5-6.5z" /></svg>
                </span>
              </button>
            )}
          </>
        )}
      </div>
      <div className="flex-1 p-3.5 sm:p-4">
        <div className="min-w-0">
          <h3 className="text-[16px] font-extrabold sm:text-[17px] leading-tight tracking-[-0.01em] text-ink">{p.name}</h3>
          {p.line && <p className="mt-1 text-[13px] leading-snug text-ink-2 sm:text-[14px]">{p.line}</p>}
        </div>
      </div>
    </article>
  );
}

/* ---------------- Your trainings ---------------- */

function Trainings({ list, focus }: { list: Training[]; focus?: string }) {
  return (
    <section className="pb-14 pt-9 sm:pb-16 sm:pt-11" aria-labelledby="trainings">
      <h2 id="trainings" className="text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-ink sm:text-[32px]">Your trainings</h2>
      {list.length ? (
        <div className="mt-5 space-y-4">{list.map((t) => <TrainingPanel key={t.id} t={t} focused={t.number === focus} />)}</div>
      ) : (
        <div className="mt-5 rounded-2xl bg-surface px-6 py-10 text-center ring-1 ring-line">
          <p className="text-[17px] font-bold text-ink">Your trainings will appear here.</p>
          <p className="mx-auto mt-2 max-w-[48ch] text-[14.5px] leading-relaxed text-muted">
            Once we send a training quotation naming you as its coordinator, it shows here. Questions? Write to <a className="font-semibold text-action hover:underline" href="mailto:learn@thinkhealth.in">learn@thinkhealth.in</a>.
          </p>
        </div>
      )}
    </section>
  );
}

function TrainingPanel({ t: initial, focused }: { t: Training; focused: boolean }) {
  const [t, setT] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [people, setPeople] = useState(false);
  const [openTab, setOpenTab] = useState<{ tab: "type" | "excel"; n: number } | undefined>(undefined);
  const [attendKey, setAttendKey] = useState(t.attendKey);
  const [live, setLive] = useState<Live>({ present: 0, total: t.registered });
  // A fresh copy from the live refresh: taken in, except while they're filling in Accept / Decline (their form stays).
  useEffect(() => {
    if (editing || declining) return;
    setT((x) => ({ ...x, ...initial }));
    if (initial.attendKey) setAttendKey(initial.attendKey);
  }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps
  const title = t.lines.map((l) => l.name).join(" + ") || "Training";
  // A training day (owner, 13 Nov: the coordinator starts it): before Start, while it runs, and after End.
  const onTheDay = Boolean(t.confirmedAt) && !t.completedAt && ["waiting", "open", "ended"].includes(t.window.state);
  // Start / End change the day's state: read this training again from the server.
  const reload = async () => {
    const j = await fetch("/api/portal/home", { cache: "no-store" }).then((r) => r.json()).catch(() => null) as { trainings?: Training[] } | null;
    const fresh = j?.trainings?.find((x) => x.id === t.id);
    if (fresh) setT((x) => ({ ...x, ...fresh }));
  };
  const sign = signFor(title);
  const tool = { id: t.id, number: t.number, title, expected: t.expected, proposal: t.proposal, history: t.history, joinKey: t.joinKey, registered: t.registered };
  const sub = "text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted";
  // Confirmed (owner, 16 Nov): the QR first, then the leaderboard, participants, details; the quotation goes to the bottom.
  const confirmed = Boolean(t.proposal && t.confirmedAt && !t.rejected);
  const myPage = t.me ? `${typeof location !== "undefined" ? portalPrefix(location.host) : ""}/${encodeURIComponent(t.number)}/${t.me.th}?p=${encodeURIComponent(t.me.token)}` : "";
  // From the team ask: "Share the QR code" goes to the one QR card; "Add names" opens Type names (owner, 16 Nov).
  const goPeople = (to: "type" | "qr") => {
    if (to === "type") { setPeople(true); setOpenTab({ tab: "type", n: Date.now() }); }
    setTimeout(() => document.getElementById(to === "qr" ? `qr-${t.number}` : `people-${t.number}`)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: to === "qr" ? "center" : "start" }), 50);
  };
  // Accepted, not yet confirmed: the one QR sits above the list, so they can start registering people (owner, 16 Nov).
  const earlyQr = !confirmed && t.proposal && !t.rejected && attendKey ? (
    <div id={`qr-${t.number}`} className="mb-6 scroll-mt-24 border-b border-line pb-6">
      <AttendQr id={t.id} number={t.number} title={title} attendKey={attendKey} onNew={setAttendKey}>
        <p className={sub}>Your training&apos;s QR</p>
        <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-2">Your team scans it (or opens the link) to register with their name and mobile number. On the training day the same code marks their attendance.</p>
      </AttendQr>
    </div>
  ) : null;
  const peopleBlock = (
    <div id={`people-${t.number}`} className="scroll-mt-6">
      {earlyQr}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={sub}>Participants</p>
          <p className="mt-1 text-[15.5px] text-ink"><b className="num">{t.registered}</b> registered{t.proposal ? <> of <b className="num">{t.proposal.headcount}</b> attending</> : t.expected ? <> of <b className="num">{t.expected}</b> expected</> : ""}</p>
          {myPage && <a className="mt-1 inline-block text-[14px] font-semibold text-action hover:underline" href={myPage}>Your own page ({t.me!.th})</a>}
          {/* Not on the list (skipped the ask, or a different number): register yourself here (owner, 16 Nov). */}
          {!t.me && t.proposal && !t.rejected && t.selfPrompt !== "self" && (
            <button type="button" className="mt-1 inline-block text-[14px] font-semibold text-action hover:underline"
              onClick={() => { setT((x) => ({ ...x, selfPrompt: "self" })); setTimeout(() => document.getElementById(`self-${t.number}`)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" }), 50); }}>
              Attending too? Add yourself
            </button>
          )}
        </div>
        {/* One way in at a time (owner, 16 Nov): while "get your team registered" is asked, its buttons are the way in. */}
        {!(confirmed && t.selfPrompt === "team") && <button type="button" className={(people ? secondaryBtn : primaryBtn).replace(/(^|\s)transition(?=\s|$)/, "$1transition-none")} onClick={() => setPeople((x) => !x)} aria-expanded={people}>{people ? "Done adding" : "Add participants"}</button>}
      </div>
      <div className="mt-5"><Participants t={tool} adding={people} openTab={openTab} meTh={t.me?.th} onCount={(registered) => setT((x) => ({ ...x, registered }))} onLive={setLive} /></div>
    </div>
  );
  return (
    <article id={`training-${t.number}`} className={`scroll-mt-6 overflow-hidden rounded-2xl bg-surface ring-1 ${focused || onTheDay ? "ring-2 ring-navy" : "ring-line"}`}>
      <div className="border-b border-line p-5 sm:p-7">
        <div className="flex items-start gap-4 sm:gap-5">
          <SignTile sign={sign} size={52} />
          <div className="min-w-0 flex-1">
            <p className="num text-[13px] font-semibold text-muted">{t.number}{t.date ? ` · ${fmtDate(t.date)}` : ""}</p>
            <h3 className="mt-1 text-[21px] font-extrabold leading-tight tracking-[-0.015em] text-ink sm:text-[24px]">{title}</h3>
            {t.customer && <p className="mt-1 text-[14.5px] text-ink-2">{t.customer}</p>}
          </div>
        </div>
        <Progress t={t} />
      </div>

      {/* Asked once after Mark confirmed (owner, 16 Nov): register yourself, then get your team registered. */}
      {t.proposal && !t.rejected && t.selfPrompt && (confirmed || t.selfPrompt === "self") && <SelfPrompt t={t} myPage={myPage} onDone={(patch) => setT((x) => ({ ...x, ...patch }))} onPeople={goPeople} />}

      {/* The quotation itself (owner, 16 Nov): open until they decide, folded after; at the bottom once confirmed. */}
      {!confirmed && <QuoteSection t={t} key={t.proposal || t.rejected ? "decided" : "open"} />}

      {/* The decision (owner, 12 Nov): accept with the date, "course conducted at" and headcount, or reject. */}
      <div className="border-b border-line p-5 sm:p-7">
        {t.rejected ? (
          <div>
            <p className="text-[16px] font-bold text-ink">You declined this quotation{t.rejected.at ? ` on ${fmtDate(t.rejected.at.slice(0, 10))}` : ""}.</p>
            {t.rejected.reason && <p className="mt-1.5 text-[14.5px] text-ink-2">&ldquo;{t.rejected.reason}&rdquo;</p>}
            <p className="mt-2 text-[14.5px] text-muted">Changed your mind? Write to <a className="font-semibold text-action hover:underline" href="mailto:learn@thinkhealth.in">learn@thinkhealth.in</a> and we&apos;ll reopen it.</p>
          </div>
        ) : editing ? (
          <>
            <h4 className="mb-4 text-[18px] font-extrabold tracking-[-0.01em] text-ink">{t.proposal ? "Change the date, place or headcount" : "Accept the quotation"}</h4>
            <ProposeForm t={tool} onCancel={() => setEditing(false)} onSaved={(proposal, history) => { setT({ ...t, proposal, history, stamp: "Accepted" }); setEditing(false); }} />
          </>
        ) : declining ? (
          <>
            <h4 className="mb-4 text-[18px] font-extrabold tracking-[-0.01em] text-ink">Decline the quotation</h4>
            <RejectForm id={t.id} onCancel={() => setDeclining(false)} onDone={(reason) => { setT({ ...t, stamp: "Rejected", rejected: { at: new Date().toISOString(), reason } }); setDeclining(false); setPeople(false); }} />
          </>
        ) : t.proposal && t.confirmedAt ? (
          <ConfirmedView t={t} p={t.proposal} title={title} live={live} attendKey={attendKey} onNewKey={setAttendKey} onTheDay={onTheDay} onChanged={reload} people={peopleBlock} />
        ) : t.proposal ? (
          <>
            <ProposalView p={t.proposal} history={t.history} expected={t.expected} />
            {t.confirmedAt ? (
              <p className="mt-5 text-[14.5px] text-ink-2"><b className="text-ink">Confirmed by Think Health.</b> To change anything now, write to <a className="font-semibold text-action hover:underline" href="mailto:learn@thinkhealth.in">learn@thinkhealth.in</a>.</p>
            ) : t.locked ? (
              // The Performa is made from this date (owner, 13 Nov): fixed, but not stamped Confirmed until we mark it so.
              <p className="mt-5 text-[14.5px] text-ink-2"><b className="text-ink">Think Health is preparing your Performa Invoice.</b> To change anything now, write to <a className="font-semibold text-action hover:underline" href="mailto:learn@thinkhealth.in">learn@thinkhealth.in</a>.</p>
            ) : (
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <button type="button" className={secondaryBtn} onClick={() => setEditing(true)}>Change</button>
                <span className="text-[13.5px] text-muted">Accepted and sent to Think Health. We&apos;ll confirm with you.</span>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-[48ch] text-[15.5px] leading-relaxed text-ink-2">Would you like to go ahead? Accept with the training date, where the course is conducted and how many will attend; it comes straight to us.</p>
            <div className="flex shrink-0 flex-wrap gap-2.5">
              <button type="button" className={primaryBtn} onClick={() => setEditing(true)}>Accept quotation</button>
              <button type="button" className={secondaryBtn} onClick={() => setDeclining(true)}>Decline</button>
            </div>
          </div>
        )}
      </div>

      {/* Steps 6–7: the attendee list, once they've accepted (owner, 16 Nov: "first they accept, only then they add participants").
          The toggle doesn't animate its colour (transition-none), so no frame shows it blank. */}
      {!t.rejected && t.proposal && !confirmed && <div className="border-b border-line p-5 sm:p-7">{peopleBlock}</div>}

      {confirmed && <QuoteSection t={t} key="decided" />}

      <div className="p-5 sm:p-7">
        <div className="min-w-0">
          <p className={sub}>What&apos;s included</p>
          <div className="mt-2 space-y-4">
            {t.lines.map((l, i) => <Included key={i} name={t.lines.length > 1 ? l.name : ""} text={l.description} />)}
          </div>
        </div>
      </div>
    </article>
  );
}

/** Rupees as the quotation prints them: ₹45,000, or ₹1,234.50 when there are paise. */
const money = (n: number, currency = "INR") =>
  n.toLocaleString("en-IN", { style: "currency", currency, minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });

/**
 * The quotation as Zoho has it (owner, 16 Nov: "otherwise what do they know what they are accepting"): open before they
 * decide, a one-line summary after. Every line with quantity × rate and amount, then the subtotal, discount, taxes and
 * total; Download PDF is Zoho's own PDF.
 */
function QuoteSection({ t }: { t: Training }) {
  const q = t.quote;
  const [open, setOpen] = useState(!t.proposal && !t.rejected);
  const cur = q.currency;
  const pdf = `/api/portal/training?pdf=${encodeURIComponent(t.id)}`;
  const sum = "flex items-baseline justify-between gap-4 text-[15px]";
  const expires = q.expiry ? fmtDate(q.expiry) : "";
  return (
    <section className="border-b border-line p-5 sm:p-7" aria-label="Quotation">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted">Quotation</p>
          <p className="mt-1 text-[15.5px] text-ink-2">
            <b className="num text-[17px] text-ink">{money(q.total, cur)}</b>{q.taxes.length ? (q.taxInclusive ? " incl. GST" : " with GST") : ""}
            {expires && <> · valid until <span className="num">{expires}</span></>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <a className={secondaryBtn} href={pdf} download>Download PDF</a>
          <button type="button" className="text-[14px] font-semibold text-action hover:underline" onClick={() => setOpen((x) => !x)} aria-expanded={open}>
            {open ? "Hide the details" : "See the details"}
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-5 rounded-xl bg-ground px-4 py-1 sm:px-5">
          <ul className="divide-y divide-line">
            {q.lines.map((l, i) => (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 py-3.5">
                <p className="text-[15.5px] font-bold leading-snug text-ink">{l.name}</p>
                <p className="num text-right text-[15.5px] font-bold text-ink">{money(l.amount, cur)}</p>
                <p className="num mt-0.5 text-[14px] text-muted">{l.qty}{l.unit ? ` ${l.unit}` : ""} × {money(l.rate, cur)}{l.gst !== null && l.gst > 0 ? ` · GST ${l.gst}%` : ""}</p>
                {l.description && <p className="col-span-full mt-1 line-clamp-2 whitespace-pre-line text-[14px] leading-relaxed text-ink-2">{l.description}</p>}
              </li>
            ))}
          </ul>
          <div className="space-y-1.5 border-t border-line-strong py-3.5">
            {(q.discount > 0 || q.taxes.length > 0 || q.shipping > 0 || q.adjustment !== 0) && <p className={`${sum} text-ink-2`}><span>Subtotal</span><span className="num">{money(q.subTotal, cur)}</span></p>}
            {q.discount > 0 && <p className={`${sum} text-ink-2`}><span>Discount</span><span className="num">−{money(q.discount, cur)}</span></p>}
            {q.taxes.map((x) => <p key={x.name} className={`${sum} text-ink-2`}><span>{x.name}</span><span className="num">{money(x.amount, cur)}</span></p>)}
            {q.shipping > 0 && <p className={`${sum} text-ink-2`}><span>Shipping</span><span className="num">{money(q.shipping, cur)}</span></p>}
            {q.adjustment !== 0 && <p className={`${sum} text-ink-2`}><span>{q.adjustmentLabel}</span><span className="num">{money(q.adjustment, cur)}</span></p>}
            <p className={`${sum} pt-1.5 text-ink`}><span className="text-[16px] font-extrabold">Total</span><span className="num text-[18px] font-extrabold">{money(q.total, cur)}</span></p>
          </div>
        </div>
      )}
    </section>
  );
}

/** The item's description from Zoho, as written; long ones fold after a few lines. */
function Included({ name, text }: { name: string; text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 360 || text.split("\n").length > 7;
  return (
    <div>
      {name && <p className="text-[15px] font-bold text-ink">{name}</p>}
      {text ? (
        <>
          <p className={`whitespace-pre-line text-[15px] leading-relaxed text-ink-2 ${long && !open ? "line-clamp-6" : ""}`}>{text}</p>
          {long && <button type="button" onClick={() => setOpen((x) => !x)} className="mt-1.5 text-[14px] font-semibold text-action hover:underline">{open ? "Show less" : "Show all"}</button>}
        </>
      ) : <p className="text-[15px] text-muted">We&apos;ll share the full outline with you.</p>}
    </div>
  );
}

/**
 * Where the training stands (owner, 16 Nov: "remove the stamp, make it something else"): a progress track across the panel.
 * Quotation → Accepted → Confirmed → Training (Completed), each done step with its date, the current one saying who it waits
 * on, the ones ahead in muted; a declined quotation ends the track in red.
 */
type Step = { label: string; sub: string; state: "done" | "now" | "next" | "stop" };
function stepsOf(t: Training): Step[] {
  const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const quote: Step = { label: "Quotation", sub: t.date ? day(t.date) : "", state: "done" };
  if (t.rejected) return [quote, { label: "Declined", sub: t.rejected.at ? day(t.rejected.at) : "", state: "stop" }];
  const first = t.dates[0]?.date ?? t.proposal?.dates[0]?.date ?? "";
  return [
    quote,
    t.proposal ? { label: "Accepted", sub: day(t.proposal.at), state: "done" } : { label: "Your decision", sub: "Waiting for you", state: "now" },
    t.confirmedAt ? { label: "Confirmed", sub: day(t.confirmedAt), state: "done" }
      : t.proposal ? { label: "Confirmation", sub: t.locked ? "Performa on its way" : "With Think Health", state: "now" }
      : { label: "Confirmation", sub: "", state: "next" },
    t.completedAt ? { label: "Completed", sub: day(t.completedAt), state: "done" }
      : t.confirmedAt ? { label: "Training", sub: t.tbd ? "Date to be confirmed" : first ? day(first) : "", state: "now" }
      : { label: "Training", sub: "", state: "next" },
  ];
}

function Progress({ t }: { t: Training }) {
  const steps = stepsOf(t);
  return (
    // Phones: a vertical track (label and date on one line); from 640px: across the panel.
    <ol className="mt-5 grid sm:mt-6 sm:grid-cols-[repeat(var(--steps),minmax(0,1fr))]" style={{ "--steps": Math.max(4, steps.length) } as React.CSSProperties} aria-label="Where this training stands">
      {steps.map((st, i) => {
        const next = steps[i + 1];
        const reached = next && next.state !== "next";
        return (
          <li key={st.label} className="flex min-w-0 gap-3 sm:block" aria-current={st.state === "now" ? "step" : undefined}>
            <div className="flex flex-col items-center sm:flex-row">
              <Node state={st.state} />
              {next && <span className={`my-1 min-h-3 w-[2px] flex-1 rounded-full sm:mx-1.5 sm:my-0 sm:h-[2px] sm:min-h-0 sm:w-auto ${reached ? (next.state === "stop" ? "bg-danger/60" : "bg-navy") : "bg-line"}`} aria-hidden />}
            </div>
            <div className={`flex min-w-0 flex-wrap items-baseline gap-x-2 sm:block ${next ? "pb-3 sm:pb-0" : ""}`}>
              <p className={`pt-px text-[14px] leading-tight sm:mt-2.5 sm:pr-2 sm:pt-0 sm:text-[13.5px] ${st.state === "stop" ? "font-bold text-danger" : st.state === "next" ? "font-semibold text-muted" : "font-bold text-ink"}`}>{st.label}</p>
              {st.sub && <p className={`num text-[13px] leading-snug sm:mt-0.5 sm:pr-2 sm:text-[12.5px] ${st.state === "now" ? "text-ink-2" : "text-muted"}`}>{st.sub}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Node({ state }: { state: Step["state"] }) {
  if (state === "done") return (
    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-navy text-white" aria-hidden>
      <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.3l2.3 2.3L9.5 3.8" /></svg>
    </span>
  );
  if (state === "stop") return (
    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-danger text-white" aria-hidden>
      <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3.5 3.5l5 5M8.5 3.5l-5 5" /></svg>
    </span>
  );
  if (state === "now") return (
    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface shadow-[inset_0_0_0_2.5px_var(--navy),0_0_0_4px_color-mix(in_srgb,var(--navy)_12%,transparent)]" aria-hidden>
      <span className="size-2 rounded-full bg-navy" />
    </span>
  );
  return <span className="size-5 shrink-0 rounded-full bg-surface shadow-[inset_0_0_0_2px_var(--line-strong)]" aria-hidden />;
}

/* ---------------- Confirmed: the training, the attendance QR, and on the day the live count (owner, 13 Nov) ---------------- */

const valueLabel = "pt-0.5 text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted";
const clock = (time: string) => { if (!time) return ""; const [h, m] = time.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
const contact = <>write to <a className="font-semibold text-action hover:underline" href="mailto:learn@thinkhealth.in">learn@thinkhealth.in</a></>;

/** On / At / For, stacked: the days follow the Training board (a moved date shows the old one struck through). */
function ConfirmedDetails({ t, p, title }: { t: Training; p: Proposal; title: string }) {
  const row = "grid grid-cols-[56px_minmax(0,1fr)] gap-4 py-3 first:pt-0 last:pb-0";
  return (
    <div className="divide-y divide-line">
      <div className={row}>
        <p className={valueLabel}>On</p>
        <div>
          {t.tbd || !t.dates.length ? <p className="text-[16px] font-bold text-ink">To be confirmed</p> : t.dates.map((d) => <p key={d.date} className="num text-[16px] font-bold text-ink">{fmtProposalDate(d)}</p>)}
          {t.datesWas && t.datesWas.map((d) => <p key={d.date} className="num text-[13.5px] text-muted line-through">{fmtProposalDate(d)}</p>)}
        </div>
      </div>
      <div className={row}>
        <p className={valueLabel}>At</p>
        <p className="text-[16px] font-bold text-ink">{p.location}</p>
      </div>
      <div className={row}>
        <p className={valueLabel}>For</p>
        <div>
          <p className="text-[16px] font-bold text-ink">{title}</p>
          <p className="num mt-0.5 text-[14px] text-muted">{p.headcount} attending</p>
        </div>
      </div>
    </div>
  );
}

function ConfirmedView({ t, p, title, live, attendKey, onNewKey, onTheDay, onChanged, people }: { t: Training; p: Proposal; title: string; live: Live; attendKey: string; onNewKey: (k: string) => void; onTheDay: boolean; onChanged: () => void; people: React.ReactNode }) {
  const peopleHere = <div className="mt-7 border-t border-line pt-6">{people}</div>;
  const qr = attendKey && onTheDay ? <AttendQr id={t.id} number={t.number} title={title} attendKey={attendKey} onNew={onNewKey} big /> : null;
  // The report (owner, 16 Nov): once the coordinator ends a day (and isn't running or about to start another), and after it's completed.
  const ended = t.sessions.some((s) => s.endedAt);
  if (t.completedAt || (ended && t.window.state !== "open" && t.window.state !== "waiting")) {
    const w = t.window;
    const meta = w.state === "ended" ? [w.of > 1 ? `Day ${w.dayNo} of ${w.of}` : "", p.location, t.trainers.length ? `With ${t.trainers.join(", ")}` : ""].filter(Boolean) : [];
    return (
      <>
        <TrainingReport t={t} />
        {t.quiz && t.quiz.state !== "none" && <Results id={t.id} quiz={t.quiz} report />}
        {/* Ended by mistake: Start again is still there on the day. */}
        {w.state === "ended" && !t.completedAt && <div className="mt-7"><TodayStrip t={t} meta={meta} onChanged={onChanged} /></div>}
        {peopleHere}
        <div className="mt-7 border-t border-line pt-6"><ConfirmedDetails t={t} p={p} title={title} /></div>
        <p className="mt-5 text-[14.5px] text-ink-2">{t.completedAt ? "Thank you for organising it with us." : <>To change anything now, {contact}.</>}</p>
      </>
    );
  }
  if (onTheDay && (t.window.state === "open" || t.window.state === "waiting" || t.window.state === "ended")) {
    const w = t.window;
    const time = clock(t.dates.find((d) => d.date === w.day)?.time ?? "");
    const meta = [w.of > 1 ? `Day ${w.dayNo} of ${w.of}` : "", time, p.location, t.trainers.length ? `With ${t.trainers.join(", ")}` : ""].filter(Boolean);
    return (
      <>
        {/* Training today (owner, 13 Nov): the strip with Start / End, then the QR large with the live count; the details below. */}
        <TodayStrip t={t} meta={meta} onChanged={onChanged} />
        <div id={`qr-${t.number}`} className="mt-6 grid scroll-mt-24 items-center gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-10">
          {qr}
          <div className="text-center sm:text-left" aria-live="polite">
            <p className="num text-[64px] font-extrabold leading-none tracking-[-0.03em] text-ink"><CountUp value={live.present} /><span className="text-[28px] font-bold tracking-normal text-muted"> of {live.total}</span></p>
            <p className="mt-2 text-[17px] font-bold text-ink">present today</p>
            <p className="mt-1.5 max-w-[34ch] text-[14px] leading-relaxed text-muted sm:max-w-none">Show this code in the room. Each person scans it and taps Present; their PRESENT stamps land below by themselves.</p>
          </div>
        </div>
        {t.quiz && t.quiz.state !== "none" && <Results id={t.id} quiz={t.quiz} />}
        {peopleHere}
        <div className="mt-7 border-t border-line pt-6"><ConfirmedDetails t={t} p={p} title={title} /></div>
        <p className="mt-5 text-[14.5px] text-ink-2">To change anything now, {contact}.</p>
      </>
    );
  }
  return (
    <>
      <h4 className="mb-4 text-[18px] font-extrabold tracking-[-0.01em] text-ink">Training confirmed</h4>
      {attendKey && (
        <div id={`qr-${t.number}`} className="scroll-mt-24">
          <AttendQr id={t.id} number={t.number} title={title} attendKey={attendKey} onNew={onNewKey}>
            <p className={valueLabel}>Your training&apos;s QR</p>
            <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-2">{t.window.state === "after" ? "Registration and attendance have closed." : "Your team scans it (or opens the link) to register now. On the training day the same code marks their attendance: print it, or show it on a screen."}</p>
          </AttendQr>
        </div>
      )}
      {t.quiz && t.quiz.state !== "none" && <Results id={t.id} quiz={t.quiz} />}
      {peopleHere}
      <div className="mt-7 border-t border-line pt-6"><ConfirmedDetails t={t} p={p} title={title} /></div>
      <p className="mt-6 text-[14.5px] text-ink-2"><b className="text-ink">Confirmed by Think Health.</b> To change anything now, {contact}.</p>
    </>
  );
}

/**
 * Asked once after Mark confirmed (owner, 16 Nov): "ask them once when they first open this after it's confirmed to register
 * themselves, then once they do or skip, ask them to get others registered … tell them they can do it later themselves too".
 */
function SelfPrompt({ t, myPage, onDone, onPeople }: { t: Training; myPage: string; onDone: (patch: Partial<Training>) => void; onPeople: (tab: "type" | "qr") => void }) {
  const [name, setName] = useState(t.self.name);
  const [phone, setPhone] = useState(t.self.phone);
  const [email, setEmail] = useState(t.self.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const field = "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink transition focus:border-action focus:outline-none focus:ring-4 focus:ring-action/15";
  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await act<{ th?: string; token?: string }>({ action: "self", id: t.id, person: { name, phone, email } });
    setBusy(false);
    if (!r.th || !r.token) return setError(r.error ?? "Couldn't register you");
    onDone({ selfPrompt: "team", me: { th: r.th, token: r.token }, registered: t.registered + (t.me ? 0 : 1) });
  };
  const answer = async (action: "selfskip" | "teamdone", then?: () => void) => {
    setBusy(true);
    await act({ action, id: t.id });
    setBusy(false);
    onDone({ selfPrompt: action === "selfskip" ? "team" : null });
    then?.();
  };
  if (t.selfPrompt === "self") {
    return (
      <section id={`self-${t.number}`} className="scroll-mt-24 border-b border-line p-5 sm:p-7" aria-label="Register yourself">
        <div className="rounded-xl bg-ground px-5 py-5 sm:px-6">
          <h4 className="text-[21px] font-extrabold leading-tight tracking-[-0.015em] text-ink">Are you attending too?</h4>
          <p className="mt-1.5 max-w-[60ch] text-[15px] leading-relaxed text-ink-2">Register yourself and you get your own page, like everyone else: mark your attendance, take the quiz, get your certificate. You can do this once; your row in the list then says <b className="text-ink">You</b>.</p>
          <form onSubmit={register} className="mt-4 grid gap-3 sm:grid-cols-3" noValidate>
            <label className="block"><span className="mb-1.5 block text-[13.5px] font-semibold text-ink-2">Your name</span><input className={field} autoComplete="name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></label>
            <label className="block"><span className="mb-1.5 block text-[13.5px] font-semibold text-ink-2">Mobile number</span><input className={`${field} num`} type="tel" inputMode="tel" autoComplete="tel" value={phone} maxLength={16} onChange={(e) => setPhone(e.target.value)} /></label>
            <label className="block"><span className="mb-1.5 block text-[13.5px] font-semibold text-ink-2">Email <span className="font-normal text-muted">(for your certificate)</span></span><input className={field} type="email" inputMode="email" autoComplete="email" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} /></label>
            {error && <p className="rounded-xl bg-danger-bg px-4 py-3 text-[14px] text-danger sm:col-span-3" role="alert">{error}</p>}
            <div className="flex flex-wrap items-center gap-2.5 sm:col-span-3">
              <button className={primaryBtn} disabled={busy}>{busy ? "One moment…" : "Register me"}</button>
              <button type="button" className={secondaryBtn} disabled={busy} onClick={() => answer("selfskip")}>Skip</button>
            </div>
          </form>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted">You can also do this later yourself: scan the attendance QR on the day, or add yourself to the list.</p>
        </div>
      </section>
    );
  }
  return (
    <section className="border-b border-line p-5 sm:p-7" aria-label="Get your team registered">
      <div className="flex flex-col gap-4 rounded-xl bg-ground px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          {t.me && <p className="num mb-1.5 text-[14px] font-semibold text-ink-2">You&apos;re registered as <b className="text-ink">{t.me.th}</b>. <a className="text-action hover:underline" href={myPage}>Open your page</a></p>}
          <h4 className="text-[21px] font-extrabold leading-tight tracking-[-0.015em] text-ink">Now get your team registered</h4>
          <p className="mt-1.5 max-w-[56ch] text-[15px] leading-relaxed text-ink-2">Share the QR code so each person joins from their phone, or type the names or import a file.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2.5">
          <button type="button" className={primaryBtn} disabled={busy} onClick={() => answer("teamdone", () => onPeople("qr"))}>Share the QR code</button>
          <button type="button" className={secondaryBtn} disabled={busy} onClick={() => answer("teamdone", () => onPeople("type"))}>Add names</button>
          <button type="button" className="px-2 text-[14px] font-semibold text-muted hover:text-ink" disabled={busy} onClick={() => answer("teamdone")}>Later</button>
        </div>
      </div>
    </section>
  );
}

/**
 * The training report's head (owner, 16 Nov: "when training ends, the top of it shows training time (how long the training
 * was)"): a mist well with the training time and who came, and each day's Start → End below.
 */
function TrainingReport({ t }: { t: Training }) {
  const ran = t.sessions.filter((s) => s.endedAt);
  const total = ranMs(ran);
  const at = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const lastDone = Boolean(t.completedAt) || t.window.state === "after" || (t.window.state === "ended" && t.window.dayNo === t.window.of);
  const of = t.window.state !== "none" ? t.window.of : t.dates.length;
  const figure = "num text-[40px] font-extrabold leading-none tracking-[-0.03em] text-ink sm:text-[48px]";
  return (
    <section className="rounded-xl bg-ground px-5 py-5 sm:px-6" aria-label="Training report">
      <h4 className="text-[21px] font-extrabold leading-tight tracking-[-0.015em] text-ink">{t.completedAt ? "Training completed" : "Training report"}</h4>
      {!lastDone && of > 1 && <p className="num mt-1 text-[14px] text-muted">Day {ran.length} of {of} done. The report grows with each day.</p>}
      <div className="mt-5 flex flex-wrap gap-x-12 gap-y-5">
        {total > 0 && (
          <div>
            <p className={figure}>{fmtLength(total)}</p>
            <p className="mt-2 text-[15px] font-bold text-ink">training time</p>
          </div>
        )}
        <div>
          <p className={figure}>{t.attended}<span className="text-[24px] font-bold tracking-normal text-muted"> of {t.registered}</span></p>
          <p className="mt-2 text-[15px] font-bold text-ink">present</p>
        </div>
      </div>
      {ran.length > 0 && (
        <ul className="mt-5 space-y-1 border-t border-line pt-4">
          {ran.map((s) => (
            <li key={s.day} className="num flex flex-wrap gap-x-2 text-[14px] text-ink-2">
              <span className="font-semibold text-ink">{fmtProposalDate({ date: s.day, time: "" })}</span>
              <span>· {at(s.startedAt)} – {at(s.endedAt!)}</span>
              <span className="text-muted">· {fmtLength(sessionMs(s))}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** "X of Y present" counts up as people mark themselves (owner, 16 Nov); straight to the number with reduced motion. */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (start === value || reducedMotion()) { setShown(value); return; }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700);
      setShown(Math.round(start + (value - start) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown}</>;
}

/** Today's strip (owner, 13 Nov): Start training opens the quiz; End training closes it and attendance. Attendance is open
 * from the morning of the day, before Start too (owner, 16 Nov). */
function TodayStrip({ t, meta, onChanged }: { t: Training; meta: string[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const state = t.window.state;
  const run = async (action: "start" | "end") => {
    if (action === "end" && !window.confirm(`End today's training? Attendance and the quiz close for today.${t.quiz && t.window.state === "open" && t.window.dayNo === t.window.of ? " This is the last day: the right answers show, and everyone who passed the quiz is emailed their certificate." : ""}`)) return;
    setBusy(true); setError("");
    const r = await act<{ window?: DayWindow }>({ action, id: t.id });
    setBusy(false);
    if (!r.window) return setError(r.error ?? "Couldn't do that");
    onChanged();
  };
  const at = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "");
  const heading = state === "open" ? "Training in progress" : state === "ended" ? "Today's training has ended" : "Training today";
  const note = state === "open" ? `Started at ${at(t.session?.startedAt)}. Attendance${t.quiz ? " and the quiz are" : " is"} open.`
    : state === "ended" ? `Ended at ${at(t.session?.endedAt)}. Attendance${t.quiz ? " and the quiz are" : " is"} closed for today.`
    : `People can mark their attendance now.${t.quiz ? " The quiz opens when you start." : " Press Start when the training begins."}`;
  return (
    <div className={`rounded-xl px-5 py-4 ${state === "open" ? "bg-navy text-white" : "bg-ground"}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h4 className={`text-[21px] font-extrabold leading-tight tracking-[-0.015em] ${state === "open" ? "text-white" : "text-ink"}`}>{heading}</h4>
          <p className={`num mt-1 text-[15px] ${state === "open" ? "text-white/80" : "text-ink-2"}`}>{meta.join(" · ")}</p>
          <p className={`mt-1 text-[14px] ${state === "open" ? "text-white/80" : "text-muted"}`}>{note}</p>
        </div>
        {state === "waiting" && <button type="button" className={`${primaryBtn} h-12 px-6 text-[16px]`} onClick={() => run("start")} disabled={busy}>{busy ? "Starting…" : "Start training"}</button>}
        {state === "open" && <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl px-5 text-[15px] font-bold text-white ring-1 ring-inset ring-white/40 transition hover:bg-white/10 disabled:opacity-50" onClick={() => run("end")} disabled={busy}>{busy ? "Ending…" : "End training"}</button>}
        {state === "ended" && <button type="button" className={secondaryBtn} onClick={() => run("start")} disabled={busy}>{busy ? "Starting…" : "Start again"}</button>}
      </div>
      {error && <p className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-[14px] text-danger" role="alert">{error}</p>}
    </div>
  );
}

/**
 * The quiz's live results (owner, 13 Nov: "it will start displaying on the coordinator's board"): leaderboard (best tries)
 * and, per question, the picks (first tries). Owner, 14 Nov: tries, each passed person's certificate, the passed list as CSV.
 */
function Results({ id, quiz, report = false }: { id: string; quiz: NonNullable<Training["quiz"]>; report?: boolean }) {
  const [r, setR] = useState<QuizResults | null>(null);
  // Owner, 16 Nov: the charts are the report; every question's picks fold under "Every question".
  const [byQuestion, setByQuestion] = useState(false);
  // A certificate goes the moment its person passes (owner, 16 Nov): keep checking until each one with an email has gone.
  const sending = Boolean(r?.certificates.list.some((c) => c.email && !c.emailedAt && !c.error));
  useEffect(() => {
    let on = true;
    const load = () => act<QuizResults & { none?: boolean }>({ action: "results", id }).then((j) => { if (on && j.leaderboard) setR(j); });
    load();
    if (quiz.state !== "open" && !sending) return () => { on = false; };
    const t = setInterval(() => { if (!document.hidden) load(); }, 5000);
    return () => { on = false; clearInterval(t); };
  }, [id, quiz.state, sending]);
  const sub = "text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted";
  return (
    <section className="mt-7 border-t border-line pt-6" aria-label="Quiz results">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[18px] font-extrabold tracking-[-0.01em] text-ink">{quiz.title} {report ? "report" : "results"}</h4>
        <span className="text-[13.5px] text-muted">{quiz.state === "open" ? "Live: updates as people finish" : quiz.state === "revealed" ? "Closed: right answers shown" : quiz.state === "closed" ? "Closed until the training restarts" : "Opens when you start the training"}</span>
      </div>
      {!r ? <p className="mt-3 text-[14px] text-muted">Loading the results…</p> : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[[`${r.taken} of ${r.present}`, "present have taken it"], [String(r.passed), `passed (${r.passPct}%+)`], [`${r.avgPct}%`, "average best score"]].map(([v, l]) => (
              <div key={l} className="rounded-xl bg-ground px-3 py-3 text-center">
                <p className="num text-[22px] font-extrabold leading-none text-ink">{v}</p>
                <p className="mt-1.5 text-[12.5px] leading-snug text-muted">{l}</p>
              </div>
            ))}
          </div>
          {r.passed > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-ground px-4 py-3">
              <p className="min-w-0 text-[14px] leading-snug text-ink-2">
                Certificates: <b className="num text-ink">{r.certificates.list.filter((c) => c.emailedAt).length} of {r.certificates.list.length}</b> emailed, each the moment its person passed{r.certificates.list.some((c) => !c.email) ? "; those without an email can add one on their page" : ""}.
              </p>
              <button type="button" className="text-[14px] font-semibold text-action hover:underline" onClick={() => downloadCsv(r)}>Download passed list</button>
            </div>
          )}
          {r.leaderboard.length === 0 ? <p className="mt-4 text-[14.5px] text-muted">No one has finished yet.</p> : (
            <ol className="mt-4 divide-y divide-line overflow-hidden rounded-xl ring-1 ring-line">
              {r.leaderboard.map((b) => (
                <li key={b.th} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 bg-surface px-3.5 py-2.5">
                  <span className={`num text-center text-[15px] font-extrabold ${b.rank === 1 ? "text-navy" : "text-muted"}`}>{b.rank}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-ink">{b.name}</span>
                    <span className="num block text-[12.5px] text-muted">{b.th} · {Math.floor(b.seconds / 60)}m {b.seconds % 60}s · Re-takes: {b.tries - 1}{b.badge ? " · First Aid Badge" : b.passed ? " · Passed" : " · Not passed"}{certNote(r, b.th)}</span>
                  </span>
                  <span className="num text-right text-[16px] font-extrabold text-ink">{b.pct}%</span>
                </li>
              ))}
            </ol>
          )}
          {r.taken > 0 && (
            <div className="mt-4">
              {/* The report as charts (owner, 16 Nov: "reports … bar charts, pie charts"). */}
              <QuizCharts report={quizReport(r)} passPct={r.passPct} />
              <button type="button" className="mt-5 text-[14px] font-semibold text-action hover:underline" onClick={() => setByQuestion((x) => !x)} aria-expanded={byQuestion}>{byQuestion ? "Hide every question" : "Every question: what people picked (first tries)"}</button>
              {byQuestion && (
                <ol className="mt-3 space-y-4">
                  {r.questions.map((q, i) => {
                    const most = Math.max(1, ...q.options.map((o) => o.picked));
                    return (
                      <li key={q.id}>
                        <p className="text-[14.5px] font-semibold text-ink"><span className="num text-muted">{i + 1}. </span>{q.text} <span className="num font-normal text-muted">· {q.correctPct}% right</span></p>
                        <ul className="mt-1.5 space-y-1">
                          {q.options.map((o, k) => (
                            <li key={k} className="grid grid-cols-[minmax(0,1fr)_32px] items-center gap-x-2 gap-y-1 text-[13.5px] sm:grid-cols-[minmax(0,1fr)_minmax(60px,34%)_32px]">
                              {/* Phones: the option on its own line, its bar and count under it (nothing cut off). */}
                              <span className={`col-span-2 sm:col-span-1 sm:truncate ${k === q.answer ? "font-bold text-ink" : "text-ink-2"}`}>{k === q.answer ? "Right: " : ""}{o.text}</span>
                              <span className="h-2 overflow-hidden rounded-full bg-ground"><span className={`block h-full rounded-full ${k === q.answer ? "bg-navy" : "bg-line-strong"}`} style={{ width: `${(o.picked / most) * 100}%` }} /></span>
                              <span className="num text-right text-muted">{o.picked}</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}
        </>
      )}
      <p className={`${sub} sr-only`}>Quiz results</p>
    </section>
  );
}

/** A passed person's certificate, in their row: emailed, or why not yet. */
function certNote(r: QuizResults, th: string): string {
  const c = r.certificates.list.find((x) => x.th === th);
  if (!c) return "";
  return c.emailedAt ? " · Certificate emailed" : !c.email ? " · Certificate: no email yet" : c.error ? " · Certificate not sent yet" : " · Certificate on its way";
}

/** The passed list as a CSV file (opens in Excel). */
function downloadCsv(r: QuizResults) {
  const url = URL.createObjectURL(new Blob([passedCsv(r.certificates.list)], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${r.title} - passed.csv` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------------- Stay connected ---------------- */

const ICONS: Record<SocialKey, React.ReactNode> = {
  website: <><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" fill="none" stroke="currentColor" strokeWidth="1.8" /></>,
  linkedin: <path fill="currentColor" d="M4.5 3A1.5 1.5 0 0 0 3 4.5v15A1.5 1.5 0 0 0 4.5 21h15a1.5 1.5 0 0 0 1.5-1.5v-15A1.5 1.5 0 0 0 19.5 3zm2.9 3.4a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2zM6 10.8h2.8V18H6zm4.6 0h2.7v1c.4-.7 1.4-1.2 2.6-1.2 2.4 0 3 1.5 3 3.6V18h-2.8v-3.3c0-.9-.2-1.8-1.3-1.8s-1.4.8-1.4 1.8V18h-2.8z" />,
  instagram: <><rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" /></>,
  youtube: <path fill="currentColor" d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.6 2.6 0 0 0-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8a2.6 2.6 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15.1V8.9l5.3 3.1z" />,
  whatsapp: <><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path fill="currentColor" d="M9.2 7.8c.3-.1.6 0 .7.3l.7 1.6c.1.3 0 .5-.2.7l-.5.5c.6 1.2 1.6 2.2 2.8 2.8l.5-.5c.2-.2.5-.3.7-.2l1.6.7c.3.1.4.4.3.7l-.3 1c-.1.4-.5.6-.9.6-3.6-.3-6.5-3.2-6.8-6.8 0-.4.2-.8.6-.9z" /></>,
  facebook: <path fill="currentColor" d="M13.4 21v-7.6h2.6l.4-3h-3V8.5c0-.9.3-1.5 1.5-1.5h1.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.7v3h2.6V21z" />,
};

export function StayConnected({ social }: { social: Social[] }) {
  const shown = social.filter((s) => s.url);
  return (
    <footer className="bg-navy-deep text-white">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-14">
        {shown.length > 0 && (
          <>
            <h2 className="text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-white sm:text-[28px]">Stay connected</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((s) => (
                <a key={s.key} href={s.url} target="_blank" rel="noopener noreferrer"
                  className="group flex items-center gap-3.5 rounded-xl bg-white/[0.06] px-4 py-3.5 ring-1 ring-white/10 transition hover:bg-white/[0.11]">
                  <svg viewBox="0 0 24 24" className="size-6 shrink-0 text-white" aria-hidden>{ICONS[s.key]}</svg>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold">{s.label}</span>
                    {s.line && <span className="mt-0.5 block text-[13px] leading-snug text-white/65">{s.line}</span>}
                  </span>
                </a>
              ))}
            </div>
          </>
        )}
        <p className={`${shown.length ? "mt-10" : ""} text-[13px] text-white/55`}>Think Health, Pune · <a className="underline-offset-4 hover:underline" href="mailto:learn@thinkhealth.in">learn@thinkhealth.in</a></p>
      </div>
    </footer>
  );
}
