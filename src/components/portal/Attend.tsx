"use client";

import { useEffect, useState } from "react";
import { Band, Problem, field } from "./Participant";
import { primaryBtn } from "./TrainingTools";
import { portalPrefix } from "@/lib/portalHost";
import { type ProposalDate, fmtProposalDate } from "@/lib/portalRules";
import type { DayWindow } from "@/lib/attendanceRules";

/*
 * Attendance on the day (owner, 13 Nov): what the coordinator's attendance QR opens. Phone-first, one decision per screen:
 * their mobile number (the phone remembers them after) → "Welcome back, Riya." → one round Present button → the PRESENT
 * stamp lands ("Attendance marked") → their own page. Someone not on the list registers here as a walk-in. Outside the
 * training's days it says when attendance opens, or that it has closed.
 */

type Me = { th: string; name: string; presentToday: boolean };
type Info = { training: string; customer: string; coordinator: string; dates: ProposalDate[]; window: DayWindow; shut: string; me: Me | null };
const first = (name: string) => name.split(" ")[0];
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const OFFLINE = "Couldn't reach Think Health. Check your connection and try again.";

export function AttendPage({ number, k }: { number: string; k: string }) {
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [me, setMe] = useState<Me | null>(null);
  const [returning, setReturning] = useState(true); // on the list already ("Welcome back") or a walk-in just registered ("Welcome")
  const [step, setStep] = useState<"phone" | "register">("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [marked, setMarked] = useState<{ name: string; already: boolean } | null>(null);

  useEffect(() => {
    fetch(`/api/portal/attend?n=${encodeURIComponent(number)}&k=${encodeURIComponent(k)}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setInfo(null); setError(j.error ?? "This page doesn't work any more."); return; }
      setInfo(j as Info);
      setMe((j as Info).me);
    }).catch(() => { setInfo(null); setError(OFFLINE); });
  }, [number, k]);

  const post = async (body: object) => {
    const r = await fetch("/api/portal/attend", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ n: number, k, ...body }) }).catch(() => null);
    return r ? ((await r.json().catch(() => ({}))) as { me?: Me; register?: boolean; error?: string; th?: string; token?: string; name?: string; already?: boolean; ok?: boolean }) : { error: OFFLINE };
  };

  const identify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    const j = await post({ action: "identify", phone });
    setBusy(false);
    if (j.register) return setStep("register");
    if (!j.me) return setError(j.error ?? "Couldn't find you");
    setReturning(true); setMe(j.me);
  };
  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    const j = await post({ action: "register", name, phone, email });
    setBusy(false);
    if (!j.me) return setError(j.error ?? "Couldn't register you");
    setReturning(false); setMe(j.me);
  };
  const present = async () => {
    setBusy(true); setError("");
    const j = await post({ action: "present" });
    setBusy(false);
    if (!j.th || !j.token) return setError(j.error ?? "Couldn't mark your attendance");
    setMarked({ name: first(j.name ?? me?.name ?? ""), already: Boolean(j.already) });
    const to = `${portalPrefix(location.host)}/${encodeURIComponent(number)}/${j.th}?p=${encodeURIComponent(j.token)}`;
    setTimeout(() => location.replace(to), reduced() ? 1200 : 3200);
  };
  const notMe = async () => {
    await post({ action: "forget" });
    setMe(null); setStep("phone"); setPhone(""); setName(""); setEmail(""); setError("");
  };

  if (info === undefined) return <div className="min-h-screen bg-ground" aria-busy />;
  if (!info) return <Problem text={error} />;

  // Attendance marked: the PRESENT stamp lands on navy, then their own page opens.
  if (marked) {
    return (
      <main className="grid min-h-screen place-items-center bg-navy px-6 text-white" role="status" aria-live="polite">
        <div className="flex max-w-xl flex-col items-center text-center">
          <span className="stamp-present inline-flex rotate-[-6deg] flex-col items-center rounded-lg border-[3px] border-navy bg-surface px-7 pb-3 pt-4 text-navy shadow-[inset_0_0_0_3px_var(--surface),inset_0_0_0_5px_var(--navy),0_10px_30px_rgb(0_20_35/0.35)]">
            <span className="text-[34px] font-extrabold uppercase leading-none tracking-[0.16em] sm:text-[42px]">Present</span>
            <span className="num mt-2 text-[12px] font-bold uppercase leading-none tracking-[0.12em]">{info.window.state === "open" ? fmtProposalDate({ date: info.window.day, time: "" }) : ""}</span>
          </span>
          <p className="welcome-line mt-10 text-[30px] font-extrabold leading-[1.1] tracking-[-0.025em] sm:text-[40px]" style={{ animationDelay: "650ms" }}>{marked.already ? "You're already marked present." : "Attendance marked."}</p>
          <p className="welcome-line mt-3 text-[19px] font-bold text-white/80" style={{ animationDelay: "1100ms" }}>Thank you for being here, {marked.name}.</p>
        </div>
      </main>
    );
  }

  const day = info.window.state === "open" ? `${fmtProposalDate({ date: info.window.day, time: "" })}${info.window.of > 1 ? ` · Day ${info.window.dayNo} of ${info.window.of}` : ""}` : "";
  return (
    <main className="min-h-screen bg-ground">
      <Band>
        <h1 className="mt-6 text-[32px] font-extrabold leading-[1.06] tracking-[-0.025em] sm:text-[40px]">{info.training}</h1>
        <p className="mt-2 text-[15.5px] leading-relaxed text-white/80">{info.customer}{day ? <> · <span className="num">{day}</span></> : ""}</p>
      </Band>
      <div className="mx-auto max-w-3xl px-5 py-8">
        {info.shut ? (
          <div>
            <p className="text-[20px] font-extrabold leading-snug tracking-[-0.01em] text-ink">{info.shut}</p>
            {info.window.state === "before" && <p className="mt-2 text-[15.5px] leading-relaxed text-ink-2">Scan this code again on the day of your training to mark your attendance.</p>}
          </div>
        ) : me ? (
          <div className="flex flex-col items-center text-center">
            <p className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.025em] text-ink sm:text-[36px]">{returning ? `Welcome back, ${first(me.name)}.` : `Welcome, ${first(me.name)}.`}</p>
            <p className="mt-2 text-[16.5px] text-ink-2">{me.presentToday ? "You're marked present for today." : "Please mark your attendance."}</p>
            <button type="button" onClick={present} disabled={busy}
              className="mt-9 grid size-44 place-items-center rounded-full bg-action text-white shadow-[0_6px_18px_rgb(0_60_100/0.3)] ring-8 ring-action/10 transition hover:bg-action-hover active:scale-[0.97] disabled:opacity-60 sm:size-48">
              <span className="text-[24px] font-extrabold tracking-[-0.01em]">{busy ? "One moment…" : me.presentToday ? "Open my page" : "Present"}</span>
            </button>
            <p className="num mt-6 text-[14px] text-muted">{me.name} · {me.th}</p>
            <button type="button" onClick={notMe} className="mt-1.5 text-[14px] font-semibold text-action hover:underline">Not you?</button>
            {error && <p className="mt-5 w-full rounded-xl bg-danger-bg px-4 py-3 text-[14.5px] text-danger" role="alert">{error}</p>}
          </div>
        ) : step === "phone" ? (
          <form onSubmit={identify} className="space-y-4" noValidate>
            <p className="text-[20px] font-extrabold leading-snug tracking-[-0.01em] text-ink">Mark your attendance</p>
            <label className="block">
              <span className="mb-1.5 block text-[14px] font-semibold text-ink-2">Your mobile number</span>
              <input className={`${field} num`} type="tel" inputMode="tel" autoComplete="tel" value={phone} maxLength={16} onChange={(e) => setPhone(e.target.value)} required autoFocus />
            </label>
            {error && <p className="rounded-xl bg-danger-bg px-4 py-3 text-[14.5px] text-danger" role="alert">{error}</p>}
            <button className={`${primaryBtn} h-12 w-full text-[16px]`} disabled={busy || !phone.trim()}>{busy ? "One moment…" : "Continue"}</button>
            <p className="text-[13px] leading-relaxed text-muted">The number you registered with. This phone will remember you for the rest of the training.</p>
          </form>
        ) : (
          <form onSubmit={register} className="space-y-4" noValidate>
            <p className="text-[20px] font-extrabold leading-snug tracking-[-0.01em] text-ink">You&apos;re not on the list yet</p>
            <p className="-mt-2 text-[15.5px] leading-relaxed text-ink-2">Add your name to join this training and mark your attendance.</p>
            <label className="block">
              <span className="mb-1.5 block text-[14px] font-semibold text-ink-2">Your name</span>
              <input className={field} autoComplete="name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} required autoFocus />
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
            <button className={`${primaryBtn} h-12 w-full text-[16px]`} disabled={busy}>{busy ? "One moment…" : "Join and continue"}</button>
            <button type="button" className="w-full text-center text-[14px] font-semibold text-action hover:underline" onClick={() => { setStep("phone"); setError(""); }}>Use a different number</button>
            <p className="text-[13px] leading-relaxed text-muted">Your details go only to Think Health and your training coordinator, for this training.</p>
          </form>
        )}
      </div>
    </main>
  );
}
