"use client";

import { useEffect, useState } from "react";
import { SIGNS, SignTile } from "./SignTiles";
import { Programmes, StayConnected } from "./PortalDashboard";
import { type PortalContent } from "@/lib/portalContent";
import { type ProposalDate, fmtProposalDate } from "@/lib/portalRules";
import { portalPrefix } from "@/lib/portalHost";
import { primaryBtn } from "./TrainingTools";

/*
 * Participants (docs/TRAINING_MANAGER_PLAN.md step 7), phone-first and light: the join page the coordinator's QR code
 * opens, then a warm thank-you that fades into their own page — their name and TH number; On / At / For; the programme
 * videos and Stay connected. No login: their link carries a private token, and the page always shows the latest date.
 */

const field = "h-12 w-full rounded-xl border border-line bg-surface px-4 text-[16px] text-ink placeholder:text-muted/70 transition focus:border-action focus:outline-none focus:ring-4 focus:ring-action/15";

function Band({ children }: { children?: React.ReactNode }) {
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
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border-[28px] border-white/[0.05]" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-5 pb-10 pt-8">
          <div className="flex gap-2">{SIGNS.map((s, i) => <SignTile key={s.key} sign={s} size={34} delay={100 + i * 100} />)}</div>
          {children}
        </div>
      </section>
    </>
  );
}

const Problem = ({ text }: { text: string }) => (
  <main className="min-h-screen bg-ground">
    <Band><h1 className="mt-6 text-[30px] font-extrabold leading-tight tracking-[-0.02em]">We couldn&apos;t open this page.</h1></Band>
    <p className="mx-auto max-w-3xl px-5 py-8 text-[16px] leading-relaxed text-ink-2">{text}</p>
  </main>
);

/* ---------------- The join page ---------------- */

type Invite = { training: string; customer: string; coordinator: string };

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
        <p className="mt-6 text-[15px] text-white/75">You&apos;re invited to</p>
        <h1 className="mt-1 text-[32px] font-extrabold leading-[1.06] tracking-[-0.025em] sm:text-[40px]">{invite.training}</h1>
        <p className="mt-2 text-[15.5px] text-white/80">{invite.coordinator ? <>by <b className="text-white">{invite.coordinator}</b>, </> : ""}{invite.customer}</p>
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

type Page = { th: string; name: string; number: string; training: string; customer: string; dates: ProposalDate[]; tentative: boolean; location: string };

export function ParticipantPage({ number, th, p }: { number: string; th: string; p: string }) {
  const [data, setData] = useState<{ page: Page; content: PortalContent } | null | undefined>(undefined);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/portal/join?n=${encodeURIComponent(number)}&th=${encodeURIComponent(th)}&p=${encodeURIComponent(p)}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (r.ok) setData(j); else { setData(null); setError(j.error ?? "We couldn't find that page."); }
    }).catch(() => { setData(null); setError("Couldn't reach Think Health. Check your connection and try again."); });
  }, [number, th, p]);

  if (data === undefined) return <div className="min-h-screen bg-ground" aria-busy />;
  if (!data) return <Problem text={error} />;
  const { page, content } = data;
  const withVideo = content.programmes.filter((x) => x.video || x.photo);
  const row = "grid grid-cols-[64px_minmax(0,1fr)] gap-4 border-b border-line py-4 last:border-b-0";
  return (
    <div className="portal-reveal min-h-screen bg-ground">
      <Band>
        <p className="mt-6 text-[15px] text-white/75">Registered</p>
        <h1 className="mt-1 text-[34px] font-extrabold leading-[1.04] tracking-[-0.025em] sm:text-[44px]">{page.name}</h1>
        <p className="num mt-3 inline-block rounded-lg bg-white/10 px-3 py-1.5 text-[18px] font-extrabold tracking-[0.06em] ring-1 ring-white/15">{page.th}</p>
      </Band>
      <main className="mx-auto max-w-3xl px-5">
        <section className="mt-8 rounded-2xl bg-surface px-5 ring-1 ring-line sm:px-7" aria-label="Your training">
          <div className={row}>
            <p className="pt-0.5 text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted">On</p>
            <div>
              {page.dates.length ? page.dates.map((d) => <p key={d.date} className="text-[17px] font-bold text-ink">{fmtProposalDate(d)}</p>) : <p className="text-[17px] font-bold text-ink">To be confirmed</p>}
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
        <p className="mt-3 text-[13.5px] text-muted">Keep this page: bookmark it or add it to your home screen. Show your number, {page.th}, on the day.</p>
        {withVideo.length > 0 && <div className="pb-4"><Programmes list={withVideo} title="Watch before you come" /></div>}
        <div className="h-12" />
      </main>
      <StayConnected social={content.social} />
    </div>
  );
}
