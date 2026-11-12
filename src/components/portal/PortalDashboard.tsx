"use client";

import { useEffect, useState } from "react";
import { SIGNS, SignTile } from "./SignTiles";
import { type PortalContent, type Programme, type Social, type SocialKey, youtube } from "@/lib/portalContent";

/*
 * The Training Manager after sign-in (docs/TRAINING_MANAGER_PLAN.md step 4), Safety-sign direction: the welcome (once,
 * right after signing in; tap to skip; none with "reduce motion"), then Our Programmes as identical sign tiles, Your
 * trainings as sign panels with a state stamp, and Stay connected. Prices are never shown here.
 */
type Me = { email: string; name: string };
type Training = { id: string; number: string; customer: string; date: string; lines: { name: string; description: string; qty: number }[]; expected: number; stamp: string };
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
      <div className={intro ? "invisible" : "portal-reveal"}>
        <header className="bg-surface">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
            <div className="flex items-center gap-3.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- the brand mark, a fixed small PNG */}
              <img src="/portal/think-health-logo.png" alt="Think Health" width={112} height={50} className="h-auto w-[96px] sm:w-[112px]" />
              <span className="h-7 w-px bg-line" aria-hidden />
              <span className="text-[14px] font-semibold tracking-tight text-ink-2 sm:text-[15px]">Training Manager</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden max-w-[28ch] truncate text-[13.5px] text-muted md:inline">{me.email}</span>
              <button type="button" onClick={out} className="rounded-lg px-3 py-2 text-[14px] font-semibold text-action hover:bg-ground">Sign out</button>
            </div>
          </div>
        </header>

        <section className="relative overflow-hidden bg-navy text-white">
          <div className="pointer-events-none absolute -right-28 -top-28 h-96 w-96 rounded-full border-[32px] border-white/[0.05]" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-5 pb-12 pt-10 sm:px-8 sm:pb-16 sm:pt-14">
            <div className="flex gap-2.5">{SIGNS.map((s, i) => <SignTile key={s.key} sign={s} size={40} delay={intro ? 0 : 150 + i * 120} />)}</div>
            <h1 className="mt-6 text-[36px] font-extrabold leading-[1.04] tracking-[-0.025em] sm:text-[52px]">Welcome, {firstName(me)}.</h1>
            <p className="mt-3 max-w-[52ch] text-[16px] leading-relaxed text-white/80 sm:text-[17px]">
              {home ? summary(home.trainings) : "Your trainings with Think Health, in one place."}
            </p>
          </div>
        </section>

        <main className="mx-auto max-w-6xl px-5 sm:px-8">
          {error && <p className="mt-8 rounded-xl bg-danger-bg px-4 py-3 text-[14.5px] text-danger" role="alert">{error}</p>}
          {!home && !error && <div className="h-[60vh]" aria-busy aria-label="Loading your trainings" />}
          {home && (
            <>
              <Programmes list={home.content.programmes} />
              <Trainings list={home.trainings} focus={number} />
            </>
          )}
        </main>
        {home && <StayConnected social={home.content.social} />}
      </div>
    </>
  );
}

function summary(t: Training[]): string {
  if (!t.length) return "Your trainings with Think Health, in one place.";
  const customers = [...new Set(t.map((x) => x.customer).filter(Boolean))];
  return `${t.length === 1 ? "One training" : `${t.length} trainings`}${customers.length === 1 ? ` for ${customers[0]}` : ""}, managed here with Think Health.`;
}

/* ---------------- The welcome: three lines, then the dashboard ---------------- */

const WELCOME_MS = 4200;

function Welcome({ name, onDone }: { name: string; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setLeaving(true), WELCOME_MS - 600);
    const b = setTimeout(onDone, WELCOME_MS);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") onDone(); };
    window.addEventListener("keydown", key);
    return () => { clearTimeout(a); clearTimeout(b); window.removeEventListener("keydown", key); };
  }, [onDone]);
  const lines = [`Welcome, ${name}.`, "Your trainings, managed in a single touch.", "Every attendee, accounted for."];
  return (
    <div role="dialog" aria-label="Welcome" onClick={onDone}
      className={`fixed inset-0 z-50 flex cursor-pointer flex-col justify-center bg-navy px-6 text-white transition-opacity duration-500 sm:px-16 ${leaving ? "opacity-0" : "opacity-100"}`}>
      <div className="pointer-events-none absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full border-[36px] border-white/[0.05]" aria-hidden />
      <div className="mx-auto w-full max-w-5xl">
        {lines.map((l, i) => (
          <p key={l} className={`welcome-line ${i === 0 ? "text-[40px] sm:text-[72px]" : "mt-3 text-[24px] text-white/85 sm:mt-4 sm:text-[40px]"} font-extrabold leading-[1.06] tracking-[-0.03em]`}
            style={{ animationDelay: `${i * 850}ms` }}>{l}</p>
        ))}
      </div>
      <p className="absolute inset-x-0 bottom-8 text-center text-[13px] text-white/55">Tap anywhere to continue</p>
    </div>
  );
}

/* ---------------- Our Programmes ---------------- */

function Programmes({ list }: { list: Programme[] }) {
  return (
    <section className="pt-12 sm:pt-16" aria-labelledby="programmes">
      <h2 id="programmes" className="text-[13px] font-bold uppercase tracking-[0.14em] text-muted">Our Programmes</h2>
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
      <div className="relative aspect-video overflow-hidden" style={poster ? undefined : { background: sign.bg }}>
        {playing && yt ? (
          <iframe src={yt.embed} title={`${p.name} video`} className="absolute inset-0 h-full w-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
        ) : (
          <>
            {poster ? (
              // eslint-disable-next-line @next/next/no-img-element -- small photos and YouTube thumbnails, lazily loaded
              <img src={poster} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 grid place-items-center" aria-hidden>
                <svg viewBox="0 0 32 32" className="h-[46%] w-auto opacity-95">{sign.icon}</svg>
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
      <div className="flex flex-1 flex-col gap-2.5 p-3.5 sm:flex-row sm:gap-3.5 sm:p-4">
        <SignTile sign={sign} size={34} />
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
    <section className="pb-16 pt-12 sm:pb-20 sm:pt-16" aria-labelledby="trainings">
      <h2 id="trainings" className="text-[13px] font-bold uppercase tracking-[0.14em] text-muted">Your trainings</h2>
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

function TrainingPanel({ t, focused }: { t: Training; focused: boolean }) {
  const title = t.lines.map((l) => l.name).join(" + ") || "Training";
  const sign = signFor(title);
  return (
    <article id={`training-${t.number}`} className={`scroll-mt-6 overflow-hidden rounded-2xl bg-surface ring-1 ${focused ? "ring-2 ring-navy" : "ring-line"}`}>
      <div className="flex items-start gap-4 border-b border-line p-5 sm:gap-5 sm:p-7">
        <SignTile sign={sign} size={52} />
        <div className="min-w-0 flex-1">
          <p className="num text-[13px] font-semibold text-muted">{t.number}{t.date ? ` · ${fmtDate(t.date)}` : ""}</p>
          <h3 className="mt-1 text-[21px] font-extrabold leading-tight tracking-[-0.015em] text-ink sm:text-[24px]">{title}</h3>
          {t.customer && <p className="mt-1 text-[14.5px] text-ink-2">{t.customer}</p>}
          <div className="mt-3 sm:hidden"><Stamp label={t.stamp} /></div>
        </div>
        <div className="hidden sm:block"><Stamp label={t.stamp} /></div>
      </div>
      <div className="grid gap-6 p-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-8 sm:p-7">
        <div>
          <p className="text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted">Expected participants</p>
          <p className="num mt-1 text-[44px] font-extrabold leading-none tracking-[-0.03em] text-navy">{t.expected || "—"}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted">What&apos;s included</p>
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

/** A state stamp (Awaiting date → Proposed → Confirmed → Done): it stamps onto the panel and never vanishes. */
function Stamp({ label }: { label: string }) {
  return (
    <span className="stamp inline-block shrink-0 rotate-[-4deg] rounded-md border-2 border-navy/70 px-2.5 py-1 text-[11.5px] font-extrabold uppercase tracking-[0.14em] text-navy/80">{label}</span>
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
            <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-white/60">Stay connected</h2>
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
