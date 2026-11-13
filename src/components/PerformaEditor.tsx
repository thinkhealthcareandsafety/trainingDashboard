"use client";

import { useEffect, useState } from "react";
import { PI_FIELDS, type PiDraft, type PiFieldKey, piStatusLabel } from "@/lib/performaRules";
import { zohoUrl } from "@/lib/zohoLinks";
import { fmtDate } from "@/lib/dates";
import { btn, inputCls, selectCls } from "./ui";
import { useLive } from "@/lib/live";

/*
 * The Performa from an accepted training date (owner, 12 Nov: "when I convert it, it converts to draft, then I update it
 * and it updates on the draft directly"): the Zoho Draft sales order edited here — dates, PO, trainer, training date,
 * product type, the lines' description / quantity / rate, notes — saved straight to Zoho; then emailed with its PDF from
 * the Performa template (Templates → Performa emails).
 */

type Email = { to: string[]; cc: string[]; subject: string; text: string };
type Loaded = { draft: PiDraft; email: Email; emailedAt: string | null; live: boolean; error?: string };

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const label = "text-[12px] font-medium text-muted";
const FIELD_ORDER: PiFieldKey[] = ["poDate", "poNumber", "trainingDate", "trainer", "productType", "businessType", "leadSource"];

export function PerformaEditor({ id, onChanged }: { id: string; onChanged?: () => void }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<PiDraft | null>(null);
  const [email, setEmail] = useState<Email | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    const r = await fetch(`/api/training-management?pi=${id}`).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as Loaded) : ({ error: "Couldn't reach the server" } as Loaded);
    setData(j);
    if (j.draft) { setDraft(j.draft); setEmail(j.email); }
  };
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Live refresh (owner, 13 Nov): a change made elsewhere (Zoho, a teammate) shows here — but never over unsaved edits or
  // while a button is working.
  useLive(() => {
    const untouched = !data?.draft || (JSON.stringify(draft) === JSON.stringify(data.draft) && JSON.stringify(email) === JSON.stringify(data.email));
    if (!busy && untouched) load();
  }, ["work", "zoho"]);

  if (!data) return <p className="text-[13.5px] text-muted">Opening the Performa from Zoho…</p>;
  if (data.error || !draft || !email) return <p className="text-[13.5px] text-high">{data.error ?? "Couldn't open the Performa"}</p>;
  const editable = draft.status === "draft";
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.draft);
  const setField = (k: PiFieldKey, v: string) => setDraft({ ...draft, fields: { ...draft.fields, [k]: v } });
  const setLine = (i: number, patch: Partial<PiDraft["lines"][number]>) => setDraft({ ...draft, lines: draft.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const estimate = draft.lines.reduce((n, l) => n + l.qty * l.rate, 0);

  const save = async () => {
    setBusy("save"); setMsg("");
    const edit = { fields: draft.fields, notes: draft.notes, shipmentDate: draft.shipmentDate, date: draft.date, lines: draft.lines.map((l) => ({ lineItemId: l.lineItemId, description: l.description, qty: l.qty, rate: l.rate })) };
    const r = await fetch("/api/training-management", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pisave", id, edit }) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { draft?: PiDraft; error?: string }) : { error: "Couldn't reach the server" };
    setBusy("");
    if (!j.draft) return setMsg(j.error ?? "Couldn't save to Zoho");
    setData({ ...data, draft: j.draft }); setDraft(j.draft);
    setMsg("Saved to the Zoho draft.");
  };
  // Mark confirmed (owner, 13 Nov): unsaved edits go with it; Zoho marks it Confirmed, the portal stamps Confirmed and the
  // training goes on the Training board; "& send email" then emails it.
  const markConfirmed = async (withEmail: boolean) => {
    if (!window.confirm(withEmail
      ? `Mark ${draft.number} Confirmed in Zoho and email it to ${email.to.join(", ") || "—"}? The coordinator's portal shows Confirmed and the training goes on the Training board.`
      : `Mark ${draft.number} Confirmed in Zoho? The coordinator's portal shows Confirmed and the training goes on the Training board. Nothing is emailed.`)) return;
    setBusy(withEmail ? "confirm-send" : "confirm"); setMsg("");
    const edit = dirty ? { fields: draft.fields, notes: draft.notes, shipmentDate: draft.shipmentDate, date: draft.date, lines: draft.lines.map((l) => ({ lineItemId: l.lineItemId, description: l.description, qty: l.qty, rate: l.rate })) } : undefined;
    const body = { action: "piconfirm", id, edit, ...(withEmail ? { send: true, to: email.to.join(","), cc: email.cc.join(","), subject: email.subject, text: email.text } : {}) };
    const r = await fetch("/api/training-management", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; emailError?: string; emailed?: boolean; board?: { state: string; note: string } | null }) : { error: "Couldn't reach the server" };
    setBusy("");
    if (!j.ok) return setMsg(j.error ?? "Couldn't mark it confirmed");
    setMsg([j.emailError || (j.emailed ? "Confirmed in Zoho and emailed, with its PDF." : "Confirmed in Zoho."), j.board?.note].filter(Boolean).join(" "));
    load();
    onChanged?.();
  };
  const send = async () => {
    if (dirty && !window.confirm("Your changes above aren't saved to Zoho yet. Email the Performa as Zoho has it now?")) return;
    setBusy("email"); setMsg("");
    const r = await fetch("/api/training-management", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "piemail", id, to: email.to.join(","), cc: email.cc.join(","), subject: email.subject, text: email.text }) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }) : { error: "Couldn't reach the server" };
    setBusy("");
    if (!j.ok) return setMsg(j.error ?? "Couldn't send it");
    setMsg("Performa emailed, with its PDF.");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-semibold">
          {draft.number} <span className={`ml-1 rounded-full px-2 py-0.5 text-[12px] font-medium ${editable ? "bg-medium-bg text-medium" : "bg-surface-2 text-ink-2"}`}>{piStatusLabel(draft.status)}</span>
        </p>
        <a className="text-[13px] text-brand hover:underline" href={zohoUrl("salesorder", draft.salesorderId)} target="_blank" rel="noopener noreferrer">Open in Zoho</a>
      </div>
      <p className="-mt-2 text-[13px] text-muted">{draft.customer} · reference {draft.reference}{draft.salesperson ? ` · ${draft.salesperson}` : ""}{draft.paymentTerms ? ` · ${draft.paymentTerms}` : ""}</p>
      {!editable && <p className="rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-ink-2">{draft.status === "open" ? "Confirmed in Zoho" : "It isn't a draft any more"}, so it&apos;s changed in Zoho now.</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block"><span className={label}>Sales order date *</span><input type="date" className={`${inputCls} mt-1`} value={draft.date} disabled={!editable} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
        <label className="block"><span className={label}>Expected shipment date</span><input type="date" className={`${inputCls} mt-1`} value={draft.shipmentDate} disabled={!editable} onChange={(e) => setDraft({ ...draft, shipmentDate: e.target.value })} /></label>
        {FIELD_ORDER.map((k) => {
          const def = PI_FIELDS[k];
          const v = draft.fields[k] ?? "";
          return (
            <label key={k} className="block">
              <span className={label}>{def.label}{"required" in def && def.required ? " *" : ""}</span>
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
          {dirty && <button type="button" className={btn.ghost} onClick={() => { setDraft(data.draft); setMsg(""); }}>Undo changes</button>}
        </div>
      )}

      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-[15px] font-semibold">{editable ? "Confirm the Performa" : "Email the Performa"}</h4>
          <span className="text-[12.5px] text-muted">{data.emailedAt ? `Emailed ${fmtDate(data.emailedAt, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : "Not emailed yet"} · its PDF goes with it</span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="block"><span className={label}>To</span><input className={`${inputCls} mt-1`} value={email.to.join(", ")} onChange={(e) => setEmail({ ...email, to: e.target.value.split(/[,;\s]+/).filter(Boolean) })} /></label>
          <label className="block"><span className={label}>Cc</span><input className={`${inputCls} mt-1`} value={email.cc.join(", ")} onChange={(e) => setEmail({ ...email, cc: e.target.value.split(/[,;\s]+/).filter(Boolean) })} /></label>
        </div>
        <label className="mt-2 block"><span className={label}>Subject</span><input className={`${inputCls} mt-1`} value={email.subject} onChange={(e) => setEmail({ ...email, subject: e.target.value })} /></label>
        <label className="mt-2 block"><span className={label}>Message</span>
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
          <span className="text-[12px] text-faint">The wording comes from Templates → Performa emails.</span>
        </div>
      </section>
      {msg && <p className={`text-[13px] ${/^(Saved|Confirmed in Zoho|Performa emailed)/.test(msg) && !/didn't go|Couldn't/.test(msg) ? "text-low" : "text-high"}`} role="status">{msg}</p>}
    </div>
  );
}
