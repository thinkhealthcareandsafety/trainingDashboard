"use client";

import { useEffect, useState } from "react";
import { SIGNS, SignTile } from "./SignTiles";
import { type PortalContent, type Programme, type Social, type SocialKey, youtube } from "@/lib/portalContent";
import { type Proposal, type ProposalDate, fmtProposalDate } from "@/lib/portalRules";
import type { DayWindow } from "@/lib/attendanceRules";
import { AttendQr, type Live, Participants, ProposalView, ProposeForm, RejectForm, act, primaryBtn, secondaryBtn } from "./TrainingTools";
import type { QuizResults } from "@/lib/portalTrainings";

/*
 * The Training Manager after sign-in (docs/TRAINING_MANAGER_PLAN.md step 4), Safety-sign direction: the welcome (once,
 * right after signing in; tap to skip; none with "reduce motion"), then Our Programmes as identical sign tiles, Your
 * trainings as sign panels with a state stamp, and Stay connected. Prices are never shown here.
 */
type Me = { email: string; name: string };
type Training = { id: string; number: string; customer: string; date: string; lines: { name: string; description: string; qty: number }[]; expected: number; stamp: string; proposal: Proposal | null; history: Proposal[]; joinKey: string; registered: number; confirmedAt: string | null; locked: boolean; rejected: { at: string; reason: string } | null;
  dates: ProposalDate[]; datesWas: ProposalDate[] | null; tbd: boolean; trainers: string[]; completedAt: string | null; attendKey: string; window: DayWindow; attended: number;
  quiz: { title: string; state: "none" | "open" | "closed" | "revealed" } | null; session: { startedAt: string; endedAt: string | null } | null };
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

  useEffect(() => {
    fetch("/api/portal/home").then(async (r) => {
      if (r.status === 401) return onOut();
      const j = await r.json().catch(() => ({}));
      if (j.me) setHome(j as Home); else setError(j.error ?? "Couldn't load your trainings. Try again in a minute.");
    }).catch(() => setError("Couldn't reach Think Health. Check your connection and try again."));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The training the link was for (training.thinkhealth.in/<number>): brought into view once the page is there.
  useEffect(() => {
    if (!home || intro || !number) return;
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
  const [attendKey, setAttendKey] = useState(t.attendKey);
  const [live, setLive] = useState<Live>({ present: 0, total: t.registered });
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
  return (
    <article id={`training-${t.number}`} className={`scroll-mt-6 overflow-hidden rounded-2xl bg-surface ring-1 ${focused || onTheDay ? "ring-2 ring-navy" : "ring-line"}`}>
      <div className="flex items-start gap-4 border-b border-line p-5 sm:gap-5 sm:p-7">
        <SignTile sign={sign} size={52} />
        <div className="min-w-0 flex-1">
          <p className="num text-[13px] font-semibold text-muted">{t.number}{t.date ? ` · ${fmtDate(t.date)}` : ""}</p>
          <h3 className="mt-1 text-[21px] font-extrabold leading-tight tracking-[-0.015em] text-ink sm:text-[24px]">{title}</h3>
          {t.customer && <p className="mt-1 text-[14.5px] text-ink-2">{t.customer}</p>}
          <div className="mt-3 sm:hidden"><Stamps t={t} /></div>
        </div>
        <div className="hidden sm:block"><Stamps t={t} /></div>
      </div>

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
          <ConfirmedView t={t} p={t.proposal} title={title} live={live} attendKey={attendKey} onNewKey={setAttendKey} onTheDay={onTheDay} onChanged={reload} />
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

      {/* Steps 6–7: the attendee list. The toggle doesn't animate its colour (transition-none), so no frame shows it blank. */}
      {!t.rejected && <div className="border-b border-line p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={sub}>Participants</p>
            <p className="mt-1 text-[15.5px] text-ink"><b className="num">{t.registered}</b> registered{t.proposal ? <> of <b className="num">{t.proposal.headcount}</b> attending</> : t.expected ? <> of <b className="num">{t.expected}</b> expected</> : ""}</p>
          </div>
          <button type="button" className={(people ? secondaryBtn : primaryBtn).replace(/(^|\s)transition(?=\s|$)/, "$1transition-none")} onClick={() => setPeople((x) => !x)} aria-expanded={people}>{people ? "Done adding" : "Add participants"}</button>
        </div>
        <div className="mt-5"><Participants t={tool} adding={people} onCount={(registered) => setT((x) => ({ ...x, registered }))} onLive={setLive} /></div>
      </div>}

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

/** The state stamps (Awaiting decision → Accepted → Confirmed, or → Rejected): each lands like an ink stamp and none ever goes;
 * the earlier ones stay on the panel, faded, with the date they landed. */
function Stamps({ t }: { t: Training }) {
  const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const list = [
    { label: "Awaiting decision", date: t.date ? shortDate(`${t.date}T00:00:00`) : "" },
    ...(t.rejected ? [{ label: "Rejected", date: t.rejected.at ? shortDate(t.rejected.at) : "" }] : []),
    ...(!t.rejected && t.proposal ? [{ label: "Accepted", date: shortDate(t.proposal.at) }] : []),
    ...(!t.rejected && t.confirmedAt ? [{ label: "Confirmed", date: shortDate(t.confirmedAt) }] : []),
    ...(!t.rejected && t.confirmedAt && t.completedAt ? [{ label: "Completed", date: shortDate(t.completedAt) }] : []),
  ];
  return (
    <div className="flex flex-wrap items-center gap-2.5 sm:flex-col sm:items-end">
      {list.map((st, i) => <Stamp key={st.label} label={st.label} date={st.date} past={i < list.length - 1} />)}
    </div>
  );
}

function Stamp({ label, date, past }: { label: string; date: string; past: boolean }) {
  const ink = label === "Rejected" ? "border-danger text-danger shadow-[inset_0_0_0_2px_var(--surface),inset_0_0_0_3.5px_var(--danger)]" : "border-navy text-navy shadow-[inset_0_0_0_2px_var(--surface),inset_0_0_0_3.5px_var(--navy)]";
  return (
    <span className={`${past ? "scale-90 opacity-40" : "stamp"} inline-flex rotate-[-4deg] flex-col items-center rounded-md border-2 px-2.5 pb-1 pt-1.5 ${ink}`}>
      <span className="text-[11.5px] font-extrabold uppercase leading-none tracking-[0.14em]">{label}</span>
      {date && <span className="num mt-1 text-[10px] font-bold uppercase leading-none tracking-[0.1em]">{date}</span>}
    </span>
  );
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

function ConfirmedView({ t, p, title, live, attendKey, onNewKey, onTheDay, onChanged }: { t: Training; p: Proposal; title: string; live: Live; attendKey: string; onNewKey: (k: string) => void; onTheDay: boolean; onChanged: () => void }) {
  const qr = attendKey ? <AttendQr id={t.id} number={t.number} title={title} attendKey={attendKey} onNew={onNewKey} big={onTheDay} /> : null;
  if (t.completedAt) {
    return (
      <>
        <h4 className="mb-4 text-[18px] font-extrabold tracking-[-0.01em] text-ink">Training completed</h4>
        <ConfirmedDetails t={t} p={p} title={title} />
        <p className="mt-5 text-[14.5px] text-ink-2"><b className="num text-ink">{t.attended} of {t.registered}</b> attended. Thank you for organising it with us.</p>
        {t.quiz && t.quiz.state !== "none" && <Results id={t.id} quiz={t.quiz} />}
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
        <div className="mt-6 grid items-center gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-10">
          {qr}
          <div className="text-center sm:text-left" aria-live="polite">
            <p className="num text-[64px] font-extrabold leading-none tracking-[-0.03em] text-ink">{live.present}<span className="text-[28px] font-bold tracking-normal text-muted"> of {live.total}</span></p>
            <p className="mt-2 text-[17px] font-bold text-ink">present today</p>
            <p className="mt-1.5 max-w-[34ch] text-[14px] leading-relaxed text-muted sm:max-w-none">Show this code in the room. Each person scans it and taps Present; the ticks below fill in by themselves.</p>
          </div>
        </div>
        {t.quiz && t.quiz.state !== "none" && <Results id={t.id} quiz={t.quiz} />}
        <div className="mt-7 border-t border-line pt-6"><ConfirmedDetails t={t} p={p} title={title} /></div>
        <p className="mt-5 text-[14.5px] text-ink-2">To change anything now, {contact}.</p>
      </>
    );
  }
  return (
    <>
      <h4 className="mb-4 text-[18px] font-extrabold tracking-[-0.01em] text-ink">Training confirmed</h4>
      <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-10">
        <ConfirmedDetails t={t} p={p} title={title} />
        {qr && (
          <div className="sm:w-[184px]">
            <p className={`${valueLabel} mb-2 text-center sm:text-left`}>Attendance QR</p>
            {qr}
            <p className="mt-2 text-center text-[13px] leading-snug text-muted sm:text-left">{t.window.state === "after" ? "Attendance has closed." : "Works on the training day only. Print it, or show it on a screen."}</p>
          </div>
        )}
      </div>
      {t.quiz && t.quiz.state !== "none" && <Results id={t.id} quiz={t.quiz} />}
      <p className="mt-6 text-[14.5px] text-ink-2"><b className="text-ink">Confirmed by Think Health.</b> To change anything now, {contact}.</p>
    </>
  );
}

/** Today's strip (owner, 13 Nov): Start training opens attendance and the quiz; End training closes them. */
function TodayStrip({ t, meta, onChanged }: { t: Training; meta: string[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const state = t.window.state;
  const run = async (action: "start" | "end") => {
    if (action === "end" && !window.confirm("End today's training? Attendance and the quiz close for today. On the last day, everyone's right answers show.")) return;
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
    : `Attendance${t.quiz ? " and the quiz open" : " opens"} when you start.`;
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

/** The quiz's live results (owner, 13 Nov: "it will start displaying on the coordinator's board"): leaderboard and, per question, the picks. */
function Results({ id, quiz }: { id: string; quiz: NonNullable<Training["quiz"]> }) {
  const [r, setR] = useState<QuizResults | null>(null);
  const [byQuestion, setByQuestion] = useState(false);
  useEffect(() => {
    let on = true;
    const load = () => act<QuizResults & { none?: boolean }>({ action: "results", id }).then((j) => { if (on && j.leaderboard) setR(j); });
    load();
    if (quiz.state !== "open") return () => { on = false; };
    const t = setInterval(() => { if (!document.hidden) load(); }, 5000);
    return () => { on = false; clearInterval(t); };
  }, [id, quiz.state]);
  const sub = "text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted";
  return (
    <section className="mt-7 border-t border-line pt-6" aria-label="Quiz results">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[18px] font-extrabold tracking-[-0.01em] text-ink">{quiz.title} results</h4>
        <span className="text-[13.5px] text-muted">{quiz.state === "open" ? "Live: updates as people finish" : quiz.state === "revealed" ? "Closed: right answers shown" : quiz.state === "closed" ? "Closed until the training restarts" : "Opens when you start the training"}</span>
      </div>
      {!r ? <p className="mt-3 text-[14px] text-muted">Loading the results…</p> : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[[`${r.taken} of ${r.present}`, "present have taken it"], [String(r.passed), `passed (70%+)`], [`${r.avgPct}%`, "average score"]].map(([v, l]) => (
              <div key={l} className="rounded-xl bg-ground px-3 py-3 text-center">
                <p className="num text-[22px] font-extrabold leading-none text-ink">{v}</p>
                <p className="mt-1.5 text-[12.5px] leading-snug text-muted">{l}</p>
              </div>
            ))}
          </div>
          {r.leaderboard.length === 0 ? <p className="mt-4 text-[14.5px] text-muted">No one has finished yet.</p> : (
            <ol className="mt-4 divide-y divide-line overflow-hidden rounded-xl ring-1 ring-line">
              {r.leaderboard.map((b) => (
                <li key={b.th} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 bg-surface px-3.5 py-2.5">
                  <span className={`num text-center text-[15px] font-extrabold ${b.rank === 1 ? "text-navy" : "text-muted"}`}>{b.rank}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-ink">{b.name}</span>
                    <span className="num block text-[12.5px] text-muted">{b.th} · {Math.floor(b.seconds / 60)}m {b.seconds % 60}s{b.badge ? " · First Aid Badge" : b.passed ? " · Passed" : " · Not passed"}</span>
                  </span>
                  <span className="num text-right text-[15px] font-bold text-ink">{b.points}<span className="ml-1.5 text-[12.5px] font-semibold text-muted">{b.pct}%</span></span>
                </li>
              ))}
            </ol>
          )}
          {r.taken > 0 && (
            <div className="mt-4">
              <button type="button" className="text-[14px] font-semibold text-action hover:underline" onClick={() => setByQuestion((x) => !x)} aria-expanded={byQuestion}>{byQuestion ? "Hide the answers by question" : "See the answers by question"}</button>
              {byQuestion && (
                <ol className="mt-3 space-y-4">
                  {r.questions.map((q, i) => {
                    const most = Math.max(1, ...q.options.map((o) => o.picked));
                    return (
                      <li key={q.id}>
                        <p className="text-[14.5px] font-semibold text-ink"><span className="num text-muted">{i + 1}. </span>{q.text} <span className="num font-normal text-muted">· {q.correctPct}% right</span></p>
                        <ul className="mt-1.5 space-y-1">
                          {q.options.map((o, k) => (
                            <li key={k} className="grid grid-cols-[minmax(0,1fr)_minmax(60px,34%)_32px] items-center gap-2 text-[13.5px]">
                              <span className={`truncate ${k === q.answer ? "font-bold text-ink" : "text-ink-2"}`}>{k === q.answer ? "Right: " : ""}{o.text}</span>
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
