"use client";

import { useEffect, useState } from "react";
import { SIGNS, SignTile } from "./SignTiles";

/*
 * The Training Manager's sign-in (docs/TRAINING_MANAGER_PLAN.md step 3), Safety-sign direction. A navy panel with the
 * programme signs and one sentence; a white panel with the logo, the title and the form. Forgot / reset: email → a code
 * from learn@ → a password of their choice. After signing in, the dashboard (step 4) — until then, a short welcome.
 */
type Mode = "signin" | "code" | "reset";
type Me = { email: string; name: string };

const field = "h-12 w-full rounded-xl border border-line bg-surface px-4 text-[15.5px] text-ink placeholder:text-muted/80 transition focus:border-action focus:outline-none focus:ring-4 focus:ring-action/15";
const primary = "inline-flex h-12 w-full items-center justify-center rounded-xl bg-action px-5 text-[15.5px] font-bold text-white shadow-[0_2px_8px_rgb(0_80_130/0.25)] transition hover:bg-action-hover active:scale-[0.99] disabled:opacity-50";
const link = "font-semibold text-action underline-offset-4 hover:underline";

async function post(body: object): Promise<{ ok?: boolean; name?: string; error?: string }> {
  const r = await fetch("/api/portal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  return r ? r.json().catch(() => ({ error: "Something went wrong. Try again." })) : { error: "Couldn't reach Think Health. Check your connection and try again." };
}

export function PortalLogin({ number }: { number?: string }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => {
    fetch("/api/portal").then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => setMe(null));
  }, []);
  if (me === undefined) return <div className="min-h-screen bg-ground" aria-busy />;
  if (me) return <SignedIn me={me} onOut={() => setMe(null)} />;
  return <SignInScreen number={number} onIn={setMe} />;
}

function SignInScreen({ number, onIn }: { number?: string; onIn: (m: Me) => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const go = (m: Mode) => { setMode(m); setError(""); setNote(""); setPassword(""); setCode(""); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(""); setNote("");
    if (mode === "signin") {
      const r = await post({ action: "signin", email, password });
      if (r.ok) return onIn({ email: email.trim().toLowerCase(), name: r.name ?? "" });
      setError(r.error ?? "Couldn't sign you in");
    } else if (mode === "code") {
      const r = await post({ action: "code", email });
      if (r.ok) { setMode("reset"); setNote(`If ${email.trim()} has a Training Manager login, a 6-digit code is on its way from learn@thinkhealth.in. It works for 10 minutes.`); }
      else setError(r.error ?? "Couldn't send the code");
    } else {
      const r = await post({ action: "reset", email, code, password });
      if (r.ok) return onIn({ email: email.trim().toLowerCase(), name: r.name ?? "" });
      setError(r.error ?? "Couldn't change the password");
    }
    setBusy(false);
  };

  const heading = mode === "signin" ? "Sign in" : mode === "code" ? "Reset your password" : "Choose a new password";
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* The navy panel: the programmes in safety-sign language, and what this place is for. */}
      <section className="relative flex flex-col justify-between overflow-hidden bg-navy px-6 py-8 text-white sm:px-10 lg:min-h-screen lg:px-14 lg:py-14">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full border-[28px] border-white/5" aria-hidden />
        <div className="hidden lg:block" aria-hidden />
        <div>
          <div className="flex flex-wrap gap-2.5 sm:gap-3">
            {SIGNS.map((s, i) => <SignTile key={s.key} sign={s} size={48} delay={120 + i * 110} />)}
          </div>
          <h2 className="mt-5 max-w-[15ch] text-[28px] font-extrabold leading-[1.08] tracking-[-0.02em] sm:mt-8 sm:text-[44px] lg:text-[52px]">Your trainings, in one place.</h2>
          <p className="mt-4 hidden max-w-[46ch] text-[16px] leading-relaxed text-white/80 sm:block">Propose a date, confirm how many will attend, and gather your attendee list. Think Health sees it the moment you do.</p>
        </div>
        <p className="hidden text-[13px] text-white/60 lg:block">CPR · First Aid · AED · Fire Safety</p>
      </section>

      {/* The white panel: logo, title, the form. */}
      <section className="flex items-center justify-center bg-surface px-6 py-10 sm:px-10">
        <div className="w-full max-w-[400px]">
          {/* eslint-disable-next-line @next/next/no-img-element -- the brand mark, a fixed small PNG */}
          <img src="/portal/think-health-logo.png" alt="Think Health" width={150} height={67} className="h-auto w-[150px]" />
          <h1 className="mt-7 text-[26px] font-extrabold leading-tight tracking-[-0.015em] text-ink">Think Health Training Manager</h1>
          {number && <p className="mt-1 text-[14px] text-muted">Training <span className="num font-semibold text-ink-2">{number}</span></p>}
          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            <p className="text-[17px] font-bold text-ink">{heading}</p>
            {mode === "signin" && <p className="-mt-2 text-[14.5px] leading-relaxed text-muted">Use the email and password from our email to you.</p>}
            {mode === "code" && <p className="-mt-2 text-[14.5px] leading-relaxed text-muted">We&apos;ll email a 6-digit code to the address your login was sent to.</p>}
            <label className="block">
              <span className="mb-1.5 block text-[13.5px] font-semibold text-ink-2">Email</span>
              <input className={field} type="email" inputMode="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} disabled={mode === "reset"} required />
            </label>
            {mode === "reset" && (
              <label className="block">
                <span className="mb-1.5 block text-[13.5px] font-semibold text-ink-2">6-digit code</span>
                <input className={`${field} num tracking-[0.4em]`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
              </label>
            )}
            {mode !== "code" && (
              <label className="block">
                <span className="mb-1.5 flex items-baseline justify-between text-[13.5px] font-semibold text-ink-2">
                  {mode === "reset" ? "New password" : "Password"}
                  <button type="button" className="text-[13px] font-semibold text-action" onClick={() => setShow((x) => !x)}>{show ? "Hide" : "Show"}</button>
                </span>
                <input className={field} type={show ? "text" : "password"} autoComplete={mode === "reset" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} required />
                {mode === "reset" && <span className="mt-1.5 block text-[13px] text-muted">At least 8 characters.</span>}
              </label>
            )}
            {note && <p className="rounded-xl bg-ok-bg px-4 py-3 text-[14px] leading-relaxed text-ink-2" role="status">{note}</p>}
            {error && <p className="rounded-xl bg-danger-bg px-4 py-3 text-[14px] leading-relaxed text-danger" role="alert">{error}</p>}
            <button className={primary} disabled={busy}>{busy ? "One moment…" : mode === "signin" ? "Sign in" : mode === "code" ? "Send the code" : "Set password and sign in"}</button>
          </form>
          <p className="mt-6 text-[14.5px] text-muted">
            {mode === "signin" ? <button type="button" className={link} onClick={() => go("code")}>Forgot or want to change your password?</button>
              : <>{mode === "reset" && <><button type="button" className={link} onClick={() => go("code")}>Send a new code</button> · </>}<button type="button" className={link} onClick={() => go("signin")}>Back to sign in</button></>}
          </p>
          <p className="mt-10 text-[13px] leading-relaxed text-muted">Trouble signing in? Write to <a className={link} href="mailto:learn@thinkhealth.in">learn@thinkhealth.in</a>.</p>
        </div>
      </section>
    </main>
  );
}

/** Until the dashboard (step 4): a short welcome and Sign out. */
function SignedIn({ me, onOut }: { me: Me; onOut: () => void }) {
  const first = (me.name || me.email).split(/[\s@]/)[0];
  const out = async () => { await post({ action: "signout" }); onOut(); };
  return (
    <main className="min-h-screen bg-ground">
      <header className="flex items-center justify-between bg-navy px-6 py-4 text-white sm:px-10">
        <p className="text-[15px] font-bold tracking-tight">Think Health <span className="font-medium text-white/70">Training Manager</span></p>
        <button className="rounded-lg px-3 py-1.5 text-[14px] font-semibold text-white/85 hover:bg-white/10" onClick={out}>Sign out</button>
      </header>
      <section className="mx-auto max-w-3xl px-6 py-16 sm:px-10">
        <div className="flex gap-3">{SIGNS.map((s, i) => <SignTile key={s.key} sign={s} size={44} delay={i * 90} />)}</div>
        <h1 className="mt-8 text-[36px] font-extrabold leading-tight tracking-[-0.02em] text-ink">Welcome, {first}.</h1>
        <p className="mt-3 max-w-[52ch] text-[16px] leading-relaxed text-ink-2">You&apos;re signed in as <b>{me.email}</b>. Your trainings will appear here shortly.</p>
      </section>
    </main>
  );
}
