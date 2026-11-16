"use client";

import { useEffect, useRef, useState } from "react";
import { PI_FIELDS, PI_NEED_LABEL, type PiDraft, type PiFieldKey, type PiNeed, piMissing, piStatusLabel, pickedForZohoTrainer, trainerFromZoho, zohoTrainerFor } from "@/lib/performaRules";
import { zohoUrl } from "@/lib/zohoLinks";
import { fmtDate } from "@/lib/dates";
import { btn, inputCls, selectCls } from "./ui";
import { useLive } from "@/lib/live";
import { TRAINERS } from "@/lib/pipeline";

/*
 * The Performa from an accepted training date (owner, 12 Nov: "when I convert it, it converts to draft, then I update it
 * and it updates on the draft directly"): the Zoho Draft sales order edited here — dates, PO, trainer, training date,
 * product type, the lines' description / quantity / rate, notes — saved straight to Zoho; then emailed with its PDF from
 * the Performa template (Templates → Performa emails).
 * Owner, 16 Nov ("less cluttered, it should guide you"): a red "!" on each required field still empty; Mark confirmed with
 * something missing scrolls to it and rings it; while one is off-screen a floating "↓ 1 to fill below" takes you there;
 * the Trainers picker sits beside Trainer Name.
 */

type Email = { to: string[]; cc: string[]; subject: string; text: string };
type Loaded = { draft: PiDraft; email: Email; emailedAt: string | null; live: boolean; error?: string };

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const label = "text-[12px] font-medium text-muted";
// Six before the trainer row, so the grid has no hole at two or three columns.
const FIELD_ORDER: PiFieldKey[] = ["poDate", "poNumber", "trainingDate", "productType", "trainer", "businessType", "leadSource"];
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
/** The email's own needs (Email again needs them too), without the draft's. */
const emailMissing = (e: Email) => piMissing({ date: "x", fields: { poDate: "x" } }, ["x"], e);

/** The red "!" on a required field that's still empty. */
const Need = () => <span role="img" aria-label="required, still empty" title="Required" className="ml-1 inline-grid size-[14px] place-items-center rounded-full bg-high-bg align-middle text-[10px] font-extrabold leading-none text-high ring-1 ring-high/50">!</span>;

function Arrow({ up }: { up: boolean }) {
  return <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden className={up ? "rotate-180" : ""}><path d="M8 2.5v10M3.5 8.5 8 13l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function PerformaEditor({ id, onChanged }: { id: string; onChanged?: () => void }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<PiDraft | null>(null);
  const [email, setEmail] = useState<Email | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  // Trainers before Mark confirmed (owner, 13 Nov): required; they go on the Training board (reminders go to them) and the
  // first becomes Zoho's Trainer Name. Starts from Zoho's Trainer Name, and the two follow each other (owner, 14 Nov).
  const [trainers, setTrainers] = useState<string[] | null>(null);
  const [other, setOther] = useState("");
  // The field Mark confirmed pointed at (ringed until it's filled), and which still-empty ones are off-screen.
  const [pointed, setPointed] = useState<PiNeed | null>(null);
  const [away, setAway] = useState<{ above: PiNeed[]; below: PiNeed[] }>({ above: [], below: [] });
  const root = useRef<HTMLDivElement>(null);

  const load = async () => {
    const r = await fetch(`/api/training-management?pi=${id}`).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as Loaded & { gone?: boolean }) : ({ error: "Couldn't reach the server" } as Loaded & { gone?: boolean });
    setData(j);
    if (j.gone) onChanged?.(); // deleted in Zoho: the row goes back to Accepted
    if (j.draft) {
      setDraft(j.draft); setEmail(j.email);
      const named = trainerFromZoho(j.draft.fields.trainer ?? "", TRAINERS);
      setTrainers((had) => had ?? (named ? [named] : []));
    }
  };
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Live refresh (owner, 13 Nov): a change made elsewhere (Zoho, a teammate) shows here — but never over unsaved edits or
  // while a button is working.
  useLive(() => {
    const untouched = !data?.draft || (JSON.stringify(draft) === JSON.stringify(data.draft) && JSON.stringify(email) === JSON.stringify(data.email));
    if (!busy && untouched) load();
  }, ["work", "zoho"]);

  // What's still empty (the "!" marks): the draft's required fields and trainers while it's a draft; the email's always.
  const marks: PiNeed[] = draft && email ? (draft.status === "draft" ? piMissing(draft, trainers ?? [], email) : emailMissing(email)) : [];
  const marksKey = marks.join(",");
  // Which of them are off-screen, above or below (owner: a floating "↓ 1 to fill below" while one is out of view).
  useEffect(() => {
    const el = root.current;
    if (!el || !marksKey) { setAway({ above: [], below: [] }); return; }
    const seen = new Map<Element, IntersectionObserverEntry>();
    let editorOn = false;
    const update = () => {
      const above: PiNeed[] = [], below: PiNeed[] = [];
      if (editorOn) for (const e of seen.values()) if (!e.isIntersecting) (e.boundingClientRect.top < 0 ? above : below).push((e.target as HTMLElement).dataset.need as PiNeed);
      setAway({ above, below });
    };
    const io = new IntersectionObserver((list) => { for (const e of list) seen.set(e.target, e); update(); }, { threshold: 0.6 });
    const whole = new IntersectionObserver(([e]) => { editorOn = e.isIntersecting; update(); });
    const want = marksKey.split(",");
    el.querySelectorAll<HTMLElement>("[data-need]").forEach((x) => { if (want.includes(x.dataset.need ?? "")) io.observe(x); });
    whole.observe(el);
    return () => { io.disconnect(); whole.disconnect(); };
  }, [marksKey]);

  if (!data) return <p className="text-[13.5px] text-muted">Opening the Performa from Zoho…</p>;
  if (data.error || !draft || !email) return <p className="text-[13.5px] text-high">{data.error ?? "Couldn't open the Performa"}</p>;
  const editable = draft.status === "draft";
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.draft);
  const picked = trainers ?? [];
  // Trainer Name ↔ Trainers picker: choosing one in the PI ticks them first; the first ticked sets the PI's Trainer Name.
  const setField = (k: PiFieldKey, v: string) => {
    if (k === "trainer") setTrainers(pickedForZohoTrainer(picked, draft.fields.trainer ?? "", v, TRAINERS));
    setDraft({ ...draft, fields: { ...draft.fields, [k]: v } });
  };
  const pick = (next: string[]) => {
    setTrainers(next);
    const zt = zohoTrainerFor(next);
    if ((draft.fields.trainer ?? "").trim().toLowerCase() !== zt.trim().toLowerCase()) setDraft({ ...draft, fields: { ...draft.fields, trainer: zt } });
  };
  const setLine = (i: number, patch: Partial<PiDraft["lines"][number]>) => setDraft({ ...draft, lines: draft.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const estimate = draft.lines.reduce((n, l) => n + l.qty * l.rate, 0);
  const toggle = (t: string) => pick(picked.includes(t) ? picked.filter((x) => x !== t) : [...picked, t]);
  // Take them to a field that's still needed: scroll it to the middle, ring it, put the cursor in it.
  const point = (k: PiNeed) => {
    const el = root.current?.querySelector<HTMLElement>(`[data-need="${k}"]`);
    if (!el) return;
    setPointed(null);
    requestAnimationFrame(() => setPointed(k)); // pointed again: the ring breathes again
    el.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
    el.querySelector<HTMLElement>("input, select, textarea, button")?.focus({ preventScroll: true });
  };
  const ring = (k: PiNeed) => (pointed === k && marks.includes(k) ? "need-ring" : "");
  const isNeeded = (k: PiNeed) => marks.includes(k);
  const addOther = () => { const t = other.replace(/\s+/g, " ").trim(); if (t && !picked.some((x) => x.toLowerCase() === t.toLowerCase())) pick([...picked, t]); setOther(""); };

  const save = async () => {
    setBusy("save"); setMsg("");
    const edit = { fields: draft.fields, notes: draft.notes, shipmentDate: draft.shipmentDate, date: draft.date, lines: draft.lines.map((l) => ({ lineItemId: l.lineItemId, description: l.description, qty: l.qty, rate: l.rate })) };
    const r = await fetch("/api/training-management", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pisave", id, edit }) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { draft?: PiDraft; error?: string; gone?: boolean }) : { error: "Couldn't reach the server" };
    if (j.gone) onChanged?.();
    setBusy("");
    if (!j.draft) return setMsg(j.error ?? "Couldn't save to Zoho");
    setData({ ...data, draft: j.draft }); setDraft(j.draft);
    setMsg("Saved to the Zoho draft.");
  };
  // Mark confirmed (owner, 13 Nov): unsaved edits go with it; Zoho marks it Confirmed, the portal stamps Confirmed and the
  // training goes on the Training board; "& send email" then emails it.
  const markConfirmed = async (withEmail: boolean) => {
    const miss = piMissing(draft, picked, withEmail ? email : null);
    if (miss.length) { point(miss[0]); return setMsg(`Fill in ${miss.map((k) => PI_NEED_LABEL[k]).join(", ")} first.`); }
    if (!window.confirm(withEmail
      ? `Mark ${draft.number} Confirmed in Zoho and email it to ${email.to.join(", ") || "—"}? The coordinator's portal shows Confirmed and the training goes on the Training board.`
      : `Mark ${draft.number} Confirmed in Zoho? The coordinator's portal shows Confirmed and the training goes on the Training board. Nothing is emailed.`)) return;
    setBusy(withEmail ? "confirm-send" : "confirm"); setMsg("");
    const edit = dirty ? { fields: draft.fields, notes: draft.notes, shipmentDate: draft.shipmentDate, date: draft.date, lines: draft.lines.map((l) => ({ lineItemId: l.lineItemId, description: l.description, qty: l.qty, rate: l.rate })) } : undefined;
    const body = { action: "piconfirm", id, edit, trainers: picked, ...(withEmail ? { send: true, to: email.to.join(","), cc: email.cc.join(","), subject: email.subject, text: email.text } : {}) };
    const r = await fetch("/api/training-management", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; emailError?: string; emailed?: boolean; board?: { state: string; note: string } | null; gone?: boolean }) : { error: "Couldn't reach the server" };
    if (j.gone) onChanged?.();
    setBusy("");
    if (!j.ok) return setMsg(j.error ?? "Couldn't mark it confirmed");
    setMsg([j.emailError || (j.emailed ? "Confirmed in Zoho and emailed, with its PDF." : "Confirmed in Zoho."), j.board?.note].filter(Boolean).join(" "));
    load();
    onChanged?.();
  };
  const send = async () => {
    const miss = emailMissing(email);
    if (miss.length) { point(miss[0]); return setMsg(`Fill in ${miss.map((k) => PI_NEED_LABEL[k]).join(", ")} first.`); }
    if (dirty && !window.confirm("Your changes above aren't saved to Zoho yet. Email the Performa as Zoho has it now?")) return;
    setBusy("email"); setMsg("");
    const r = await fetch("/api/training-management", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "piemail", id, to: email.to.join(","), cc: email.cc.join(","), subject: email.subject, text: email.text }) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; gone?: boolean }) : { error: "Couldn't reach the server" };
    setBusy("");
    if (j.gone) onChanged?.();
    if (!j.ok) return setMsg(j.error ?? "Couldn't send it");
    setMsg("Performa emailed, with its PDF.");
    load();
  };

  // Trainer Name beside the Trainers picker (owner, 16 Nov): one row, the whole width.
  const trainerRow = (v: string) => {
    const def = PI_FIELDS.trainer;
    return (
      <div key="trainer" className="grid gap-3 rounded-xl border border-line bg-surface-2/40 p-3 sm:col-span-2 sm:grid-cols-[200px_minmax(0,1fr)] lg:col-span-3">
        <label className="block">
          <span className={label}>{def.label}</span>
          <select className={`${selectCls} mt-1 w-full`} value={def.options.find((o) => o.trim().toLowerCase() === v.trim().toLowerCase()) ?? ""} disabled={!editable} onChange={(e) => setField("trainer", e.target.value)}>
            <option value="">—</option>
            {def.options.map((o) => <option key={o} value={o}>{o.trim()}</option>)}
          </select>
        </label>
        <div data-need="trainers" className={ring("trainers")}>
          <p className={label}>Trainers{editable && " *"}{isNeeded("trainers") && <Need />} <span className="font-normal text-faint">· go on the Training board and get the reminders</span></p>
          {editable ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {[...TRAINERS, ...picked.filter((t) => !TRAINERS.includes(t))].map((t) => {
                const on = picked.includes(t);
                return (
                  <button key={t} type="button" aria-pressed={on} onClick={() => toggle(t)}
                    className={`h-8 rounded-full px-3 text-[13px] font-semibold transition-none ${on ? "bg-brand text-brand-ink" : "border border-line text-ink-2 hover:border-brand/60"}`}>{on ? "✓ " : ""}{t}</button>
                );
              })}
              <span className="inline-flex items-center gap-1">
                <input className={`${inputCls} !h-8 w-36 text-[13px]`} placeholder="Someone else" value={other} onChange={(e) => setOther(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOther(); } }} />
                {other.trim() && <button type="button" className="text-[13px] font-semibold text-brand hover:underline" onClick={addOther}>Add</button>}
              </span>
            </div>
          ) : <p className="mt-2 text-[13.5px] text-ink-2">{picked.join(", ") || "—"}</p>}
        </div>
      </div>
    );
  };

  return (
    <div ref={root} className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-semibold">
          {draft.number} <span className={`ml-1 rounded-full px-2 py-0.5 text-[12px] font-medium ${editable ? "bg-medium-bg text-medium" : "bg-surface-2 text-ink-2"}`}>{piStatusLabel(draft.status)}</span>
        </p>
        <a className="text-[13px] text-brand hover:underline" href={zohoUrl("salesorder", draft.salesorderId)} target="_blank" rel="noopener noreferrer">Open in Zoho</a>
      </div>
      <p className="-mt-2 text-[13px] text-muted">{draft.customer} · reference {draft.reference}{draft.salesperson ? ` · ${draft.salesperson}` : ""}{draft.paymentTerms ? ` · ${draft.paymentTerms}` : ""}</p>
      {!editable && <p className="rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-ink-2">{draft.status === "open" ? "Confirmed in Zoho" : "It isn't a draft any more"}, so it&apos;s changed in Zoho now.</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label data-need="date" className={`block ${ring("date")}`}><span className={label}>Sales order date *{isNeeded("date") && <Need />}</span><input type="date" className={`${inputCls} mt-1`} value={draft.date} disabled={!editable} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
        <label className="block"><span className={label}>Expected shipment date</span><input type="date" className={`${inputCls} mt-1`} value={draft.shipmentDate} disabled={!editable} onChange={(e) => setDraft({ ...draft, shipmentDate: e.target.value })} /></label>
        {FIELD_ORDER.map((k) => {
          const def = PI_FIELDS[k];
          const v = draft.fields[k] ?? "";
          if (k === "trainer") return trainerRow(v);
          const po = k === "poDate";
          return (
            <label key={k} data-need={po ? "poDate" : undefined} className={`block ${po ? ring("poDate") : ""}`}>
              <span className={label}>{def.label}{"required" in def && def.required ? " *" : ""}{po && isNeeded("poDate") && <Need />}</span>
              {def.type === "dropdown" ? (
                <select className={`${selectCls} mt-1 w-full`} value={def.options.find((o) => o.trim().toLowerCase() === v.trim().toLowerCase()) ?? ""} disabled={!editable} onChange={(e) => setField(k, e.target.value)}>
                  <option value="">—</option>
                  {def.options.map((o) => <option key={o} value={o}>{o.trim()}</option>)}
                </select>
              ) : (
                <input type={def.type === "date" ? "date" : "text"} className={`${inputCls} mt-1`} value={v} disabled={!editable} onChange={(e) => setField(k, e.target.value)} />
              )}
            </label>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[640px] text-[13.5px]">
          <thead className="bg-surface-2 text-left text-[12px] text-muted">
            <tr><th className="px-3 py-2 font-medium">Item</th><th className="w-24 px-2 py-2 font-medium">Qty</th><th className="w-32 px-2 py-2 font-medium">Rate</th><th className="w-28 px-3 py-2 text-right font-medium">Amount</th></tr>
          </thead>
          <tbody>
            {draft.lines.map((l, i) => (
              <tr key={l.lineItemId ?? i} className="border-t border-line align-top">
                <td className="px-3 py-2">
                  <p className="font-medium">{l.name}{l.training && <span className="ml-1.5 text-[11.5px] font-normal text-muted">training</span>}</p>
                  <textarea className={`${inputCls} mt-1 !h-auto min-h-[60px] py-1.5 text-[12.5px] leading-snug`} rows={3} value={l.description} disabled={!editable} onChange={(e) => setLine(i, { description: e.target.value })} />
                </td>
                <td className="px-2 py-2"><input className={inputCls} inputMode="decimal" value={l.qty} disabled={!editable} onChange={(e) => setLine(i, { qty: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} /></td>
                <td className="px-2 py-2"><input className={inputCls} inputMode="decimal" value={l.rate} disabled={!editable} onChange={(e) => setLine(i, { rate: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} /></td>
                <td className="px-3 py-2 text-right text-ink-2">{inr(l.qty * l.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-right text-[13px] text-muted">Before tax {inr(estimate)} · Zoho&apos;s total with tax {inr(draft.total)}{dirty ? " (as last saved)" : ""}</p>

      <label className="block"><span className={label}>Notes (on the Performa)</span>
        <textarea className={`${inputCls} mt-1 !h-auto min-h-[70px] py-2 leading-relaxed`} rows={3} value={draft.notes} disabled={!editable} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
      </label>

      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn.primary} disabled={!dirty || busy === "save"} onClick={save}>{busy === "save" ? "Saving to Zoho…" : "Save to Zoho"}</button>
          {dirty && <button type="button" className={btn.ghost} onClick={() => { setDraft(data.draft); const z = trainerFromZoho(data.draft.fields.trainer ?? "", TRAINERS); setTrainers(z ? [z] : []); setMsg(""); }}>Undo changes</button>}
        </div>
      )}

      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-[15px] font-semibold">{editable ? "Confirm the Performa" : "Email the Performa"}</h4>
          <span className="text-[12.5px] text-muted">{data.emailedAt ? `Emailed ${fmtDate(data.emailedAt, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : "Not emailed yet"} · its PDF goes with it</span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label data-need="to" className={`block ${ring("to")}`}><span className={label}>To{isNeeded("to") && <Need />}</span><input className={`${inputCls} mt-1`} value={email.to.join(", ")} onChange={(e) => setEmail({ ...email, to: e.target.value.split(/[,;\s]+/).filter(Boolean) })} /></label>
          <label className="block"><span className={label}>Cc</span><input className={`${inputCls} mt-1`} value={email.cc.join(", ")} onChange={(e) => setEmail({ ...email, cc: e.target.value.split(/[,;\s]+/).filter(Boolean) })} /></label>
        </div>
        <label data-need="subject" className={`mt-2 block ${ring("subject")}`}><span className={label}>Subject{isNeeded("subject") && <Need />}</span><input className={`${inputCls} mt-1`} value={email.subject} onChange={(e) => setEmail({ ...email, subject: e.target.value })} /></label>
        <label data-need="text" className={`mt-2 block ${ring("text")}`}><span className={label}>Message{isNeeded("text") && <Need />}</span>
          <textarea className={`${inputCls} mt-1 !h-auto min-h-[200px] py-2 leading-relaxed`} rows={10} value={email.text} onChange={(e) => setEmail({ ...email, text: e.target.value })} spellCheck />
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {editable ? (
            <>
              <button type="button" className={btn.ghost} disabled={Boolean(busy)} onClick={() => markConfirmed(false)}>{busy === "confirm" ? "Marking confirmed…" : "Mark confirmed"}</button>
              <button type="button" className={btn.primary} disabled={!data.live || Boolean(busy)} onClick={() => markConfirmed(true)}>{busy === "confirm-send" ? "Confirming and sending…" : "Mark confirmed & send email"}</button>
            </>
          ) : (
            <button type="button" className={btn.primary} disabled={!data.live || busy === "email"} onClick={send}>{busy === "email" ? "Sending…" : data.emailedAt ? "Email again" : "Email the Performa"}</button>
          )}
          {!data.live && <span className="text-[12.5px] text-muted">Only the live site sends email.</span>}
          <span className="text-[12px] text-faint">Wording: Templates → Performa emails.</span>
        </div>
      </section>
      {(away.below.length > 0 || away.above.length > 0) && (() => {
        const up = !away.below.length;
        const list = up ? away.above : away.below;
        return (
          <button type="button" onClick={() => point(up ? list[list.length - 1] : list[0])}
            className={`rise fixed left-1/2 z-40 inline-flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full bg-high px-4 text-[13px] font-semibold text-white shadow-[0_4px_14px_rgb(0_0_0/0.25)] hover:brightness-110 ${up ? "top-4" : "bottom-5"}`}>
            <Arrow up={up} />{list.length} to fill {up ? "above" : "below"}
          </button>
        );
      })()}
      {msg && <p className={`text-[13px] ${/^(Saved|Confirmed in Zoho|Performa emailed)/.test(msg) && !/didn't go|Couldn't/.test(msg) ? "text-low" : "text-high"}`} role="status">{msg}</p>}
    </div>
  );
}
