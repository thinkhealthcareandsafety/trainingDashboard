"use client";

import { useEffect, useState } from "react";
import { SIGNS, SignTile } from "./SignTiles";
import { portalPrefix } from "@/lib/portalHost";
import { secondaryBtn } from "./TrainingTools";

/*
 * Decline the quotation straight from the login email (owner, 12 Nov): no sign-in, an optional reason, one button.
 * Opening the page changes nothing (email scanners open links); only the button declines.
 */
type Info = { training: string; customer: string; number: string; state: "open" | "rejected" | "accepted" | "confirmed" };

export function DeclinePage({ number, k }: { number: string; k: string }) {
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/portal/decline?n=${encodeURIComponent(number)}&k=${encodeURIComponent(k)}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (r.ok) setInfo(j as Info); else { setInfo(null); setError(j.error ?? "This link doesn't work any more."); }
    }).catch(() => { setInfo(null); setError("Couldn't reach Think Health. Check your connection and try again."); });
  }, [number, k]);

  const decline = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await fetch("/api/portal/decline", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ n: number, k, reason }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : { error: "Couldn't reach Think Health. Check your connection and try again." };
    setBusy(false);
    if (!j.ok) return setError(j.error ?? "Couldn't decline it");
    setDone(true);
  };

  if (info === undefined) return <div className="min-h-screen bg-ground" aria-busy />;
  const portal = typeof window === "undefined" ? "" : `${portalPrefix(location.host)}/${encodeURIComponent(number)}`;
  return (
    <main className="min-h-screen bg-ground">
      <header className="bg-navy text-white">
        <div className="mx-auto max-w-2xl px-5 pb-9 pt-5">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-white px-2.5 py-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- the brand mark, a fixed small PNG */}
              <img src="/portal/think-health-logo.png" alt="Think Health" width={88} height={39} className="h-auto w-[80px]" />
            </span>
            <span className="text-[14px] font-semibold text-white/90">Training Manager</span>
          </div>
          <div className="mt-7 flex gap-2">{SIGNS.map((s, i) => <SignTile key={s.key} sign={s} size={30} delay={100 + i * 90} rim />)}</div>
          <h1 className="mt-4 text-[30px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[36px]">{info ? info.training : "Decline the quotation"}</h1>
          {info && <p className="mt-1.5 text-[15.5px] text-white/80">{info.customer} · {info.number}</p>}
        </div>
      </header>
      <section className="mx-auto max-w-2xl px-5 py-8">
        {!info ? <p className="text-[16px] text-ink-2">{error}</p>
          : done || info.state === "rejected" ? (
            <div>
              <p className="text-[19px] font-bold text-ink">{done ? "Thank you for letting us know." : "You've already declined this quotation."}</p>
              <p className="mt-2 text-[15.5px] leading-relaxed text-ink-2">If you change your mind, write to <a className="font-semibold text-action hover:underline" href="mailto:learn@thinkhealth.in">learn@thinkhealth.in</a> and we&apos;ll reopen it.</p>
            </div>
          ) : info.state === "confirmed" ? (
            <p className="text-[16px] leading-relaxed text-ink-2">Think Health has already confirmed this training. To cancel it, write to <a className="font-semibold text-action hover:underline" href="mailto:learn@thinkhealth.in">learn@thinkhealth.in</a>.</p>
          ) : (
            <form onSubmit={decline} className="space-y-4" noValidate>
              <p className="text-[19px] font-bold text-ink">Not going ahead with this training?</p>
              {info.state === "accepted" && <p className="rounded-xl bg-warn-bg px-4 py-3 text-[14.5px] text-warn">You accepted this quotation earlier. Declining now withdraws that.</p>}
              <label className="block">
                <span className="mb-1.5 block text-[14px] font-semibold text-ink-2">Tell us why <span className="font-normal text-muted">(optional)</span></span>
                <textarea className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-[15.5px] leading-relaxed text-ink focus:border-action focus:outline-none focus:ring-4 focus:ring-action/15" rows={4} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              {error && <p className="rounded-xl bg-danger-bg px-4 py-3 text-[14.5px] text-danger" role="alert">{error}</p>}
              <div className="flex flex-wrap gap-2.5">
                <button className="inline-flex h-12 items-center justify-center rounded-xl bg-danger px-6 text-[16px] font-bold text-white transition hover:brightness-110 disabled:opacity-50" disabled={busy}>{busy ? "One moment…" : "Decline the quotation"}</button>
                {portal && <a className={`${secondaryBtn} h-12`} href={portal}>Go to the Training Manager instead</a>}
              </div>
            </form>
          )}
      </section>
    </main>
  );
}
