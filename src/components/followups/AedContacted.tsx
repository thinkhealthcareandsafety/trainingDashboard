"use client";

import { useCallback, useEffect, useState } from "react";
import type { Member } from "@/lib/types";
import { type CardView, aedCustomerId, aedMailStep, fmtStamp, normEmail, normPhone } from "@/lib/pipeline";
import { useStore } from "@/lib/store";
import { isAdmin } from "@/lib/roles";
import { btn, inputCls } from "../ui";
import { Section } from "./CardModal";

/*
 * AedSmartx · Contacted (Priyanka). Who she called (and how often), the email she writes to, and the onboarding emails
 * sent from Zoho Mail (hello@thinkhealth.in): the first email, then the 1st and 2nd reminders as replies in the same
 * thread. Numbers and emails she adds belong to the customer name — every AED invoice of theirs shows them, on this
 * board only. Calls and emails are counted per invoice, with the date and time of each.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAILBOX = "hello@thinkhealth.in";

type Ask = { title: string; text: string; onYes: () => void };

/** "Remove the non-concerned person's contact details?" — Yes / Keep it. */
function AskRemove({ ask, onClose }: { ask: Ask; onClose: () => void }) {
  return (
    <div className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/30 p-4" onMouseDown={onClose}>
      <div role="alertdialog" aria-label={ask.title} className="modal-in w-full max-w-sm rounded-2xl bg-surface p-5 shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="text-[17px] font-bold tracking-tight text-ink">{ask.title}</h3>
        <p className="mt-1 text-[13.5px] text-muted">{ask.text}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button className={btn.ghost} onClick={onClose} autoFocus>Keep it</button>
          <button className="press inline-flex h-9 items-center justify-center rounded-full bg-high px-4 text-[13px] font-semibold text-white hover:brightness-110" onClick={() => { ask.onYes(); onClose(); }}>Yes, remove</button>
        </div>
      </div>
    </div>
  );
}

type Preview = { connected: boolean; from: string; to: string; step: number; label: string; subject: string; text: string; replyTo: { at: string } | null; count: number; error?: string };

/** The email about to go out: from, to, subject and the template — sent only on "Send". */
function SendEmail({ card, to, onClose, onConnect }: { card: CardView; to: string; onClose: () => void; onConnect: () => void }) {
  const { recordCardEvents, toast } = useStore();
  const [p, setP] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [tested, setTested] = useState("");
  const sendTest = async () => {
    if (!p) return;
    setBusy(true);
    setError("");
    setTested("");
    try {
      const r = await fetch("/api/mail/aed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ card: card.id, to, step: p.step, testTo }) });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Couldn't send the test");
      setTested(`Test sent to ${testTo.trim()} — not counted on the card.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the test");
    }
    setBusy(false);
  };
  useEffect(() => {
    fetch(`/api/mail/aed?card=${encodeURIComponent(card.id)}&to=${encodeURIComponent(to)}`)
      .then(async (r) => { const j = (await r.json()) as Preview; if (!r.ok) setError(j.error ?? "Couldn't prepare the email"); else setP(j); })
      .catch(() => setError("Couldn't reach the server"));
  }, [card.id, to]);
  const send = async () => {
    if (!p) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/mail/aed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ card: card.id, to, step: p.step }) });
      const j = (await r.json()) as { ok?: boolean; event?: Parameters<typeof recordCardEvents>[0][number]; error?: string };
      if (!r.ok || !j.event) throw new Error(j.error ?? "Couldn't send the email");
      recordCardEvents([j.event]);
      toast({ text: `Email ${p.step} (${p.label}) sent to ${to}` });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the email");
      setBusy(false);
    }
  };
  return (
    <div className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/30 p-4" onMouseDown={busy ? undefined : onClose}>
      <div role="dialog" aria-label="Send email" className="modal-in flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5">
          <h3 className="text-[17px] font-bold tracking-tight text-ink">
            {p ? <>Email {p.step} · {p.label}</> : "Send email"}
          </h3>
          {p?.replyTo && <p className="mt-0.5 text-[12.5px] text-muted">Goes as a reply in the same thread as the first email ({fmtStamp(p.replyTo.at)}), with the earlier emails below it.</p>}
        </div>
        {p ? (
          <>
            <dl className="mx-5 mt-3 grid grid-cols-[64px_1fr] gap-x-3 gap-y-1 border-b border-line pb-2 text-[13px]">
              <dt className="text-muted">From</dt><dd className="font-medium text-ink">{p.from}</dd>
              <dt className="text-muted">To</dt><dd className="font-medium text-ink">{p.to}</dd>
              <dt className="text-muted">Subject</dt><dd className="font-medium text-ink">{p.subject}</dd>
            </dl>
            <div className="no-scrollbar mx-5 mt-2 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-xl bg-surface-2/70 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-2">{p.text}</div>
            {p.connected && (
              <div className="mx-5 mt-2 flex flex-wrap items-center gap-1.5 text-[12.5px]">
                <span className="text-muted">Send a test to</span>
                <input className={`${inputCls} !h-8 min-w-0 flex-1 text-[13px]`} type="email" placeholder="your email" value={testTo} onChange={(e) => setTestTo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && EMAIL_RE.test(testTo.trim()) && sendTest()} />
                <button className={`${btn.ghost} !h-8`} onClick={sendTest} disabled={busy || !EMAIL_RE.test(testTo.trim())}>Send test</button>
                {tested && <span className="w-full font-medium text-low">{tested}</span>}
              </div>
            )}
          </>
        ) : !error && <div className="px-5 py-6 text-[13px] text-muted">Preparing the email…</div>}
        <div className="flex flex-wrap items-center justify-end gap-2 p-5">
          {error && <span className="mr-auto text-[13px] font-medium text-high">{error}</span>}
          {p && !p.connected && (
            <span className="mr-auto text-[13px] font-medium text-medium">
              Zoho Mail ({p.from}) isn&apos;t connected yet.{" "}
              <button className="font-semibold text-brand underline" onClick={onConnect}>Connect it</button>
            </span>
          )}
          <button className={btn.ghost} onClick={onClose} disabled={busy}>Cancel</button>
          <button className={btn.primary} onClick={send} disabled={!p || !p.connected || busy} autoFocus>{busy ? "Sending…" : "Send"}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Admin connects a mailbox once, with a one-time code from the Zoho API console, signed in as the mailbox that owns the
 * address (`signInAs`: an alias's own mailbox, e.g. learn@ → Shikha's).
 */
export function ConnectMailbox({ member, onClose, address = MAILBOX, signInAs, where = "any Contacted card" }: { member: Member; onClose: () => void; address?: string; signInAs?: string; where?: string }) {
  const [code, setCode] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [state, setState] = useState<{ busy?: boolean; error?: string; done?: string }>({});
  const [scopes, setScopes] = useState("ZohoMail.messages.ALL,ZohoMail.accounts.READ");
  useEffect(() => {
    fetch(`/api/mail/connect?address=${encodeURIComponent(address)}`).then((r) => r.json()).then((j: { scopes?: string; mailbox?: { connectedAt: string; connectedBy: string } | null }) => {
      if (j.scopes) setScopes(j.scopes);
      if (j.mailbox) setState({ done: `Connected by ${j.mailbox.connectedBy} on ${fmtStamp(j.mailbox.connectedAt)}. Connect again only if sending stops working.` });
    }).catch(() => {});
  }, [address]);
  const connect = async () => {
    setState({ busy: true });
    const r = await fetch("/api/mail/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address, code, clientId, clientSecret }) }).catch(() => null);
    const j = r ? ((await r.json()) as { ok?: boolean; error?: string }) : { error: "Couldn't reach the server" };
    setState(j.ok ? { done: "Connected — emails can be sent now." } : { error: j.error ?? "Couldn't connect" });
    if (j.ok) setCode("");
  };
  return (
    <div className="fade-in fixed inset-0 z-[80] grid place-items-center bg-black/30 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-label="Connect Zoho Mail" className="modal-in w-full max-w-lg rounded-2xl bg-surface p-5 shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="text-[17px] font-bold tracking-tight text-ink">Connect Zoho Mail · {address}</h3>
        {!isAdmin(member) ? (
          <p className="mt-2 text-[13.5px] text-muted">Admin connects the mailbox once. Ask Admin to open {where} and press <b>Connect it</b>.</p>
        ) : (
          <>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-ink-2">
              <li>Sign in to <a className="font-semibold text-brand underline" href="https://api-console.zoho.in" target="_blank" rel="noreferrer">api-console.zoho.in</a> as <b>{signInAs ?? address}</b>{signInAs && <> ({address} is an alias of that mailbox)</>}.</li>
              <li>Open <b>Self Client</b> (create one if asked) → <b>Generate Code</b>.</li>
              <li>Scope: <code className="select-all rounded bg-surface-2 px-1 text-[12px]">{scopes}</code> · Time: 10 minutes · Create.</li>
              <li>Paste the code here. If that Self Client isn&apos;t the one used for Zoho Books, also paste its Client ID and Secret (Client Secret tab).</li>
            </ol>
            <div className="mt-3 space-y-2">
              <input className={inputCls} placeholder="Code (1000.…)" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
              <div className="grid gap-2 sm:grid-cols-2">
                <input className={inputCls} placeholder="Client ID (optional)" value={clientId} onChange={(e) => setClientId(e.target.value)} />
                <input className={inputCls} placeholder="Client Secret (optional)" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
              </div>
            </div>
          </>
        )}
        {state.error && <p className="mt-2 text-[13px] font-medium text-high">{state.error}</p>}
        {state.done && <p className="mt-2 text-[13px] font-medium text-low">{state.done}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button className={btn.ghost} onClick={onClose}>Close</button>
          {isAdmin(member) && <button className={btn.primary} onClick={connect} disabled={!code.trim() || state.busy}>{state.busy ? "Connecting…" : "Connect"}</button>}
        </div>
      </div>
    </div>
  );
}

/** One line of the history window: a call or an email, to the minute. */
function History({ card, onClose }: { card: CardView; onClose: () => void }) {
  const o = card.outreach!;
  const rows = [
    ...o.calls.map((c, i) => ({ at: c.at, text: `Call ${i + 1} · ${c.to}${c.person ? ` (${c.person})` : ""}`, by: c.by })),
    ...o.sent.map((m, i) => ({ at: m.at, text: `Email ${i + 1} · ${aedMailStep(m.step)} · ${m.to}`, by: m.by })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/30 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-label="Calls and emails" className="modal-in flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-surface p-5 shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="text-[17px] font-bold tracking-tight text-ink">Calls &amp; emails · {card.docNumber}</h3>
        <ul className="no-scrollbar mt-2 min-h-0 flex-1 divide-y divide-line overflow-y-auto">
          {rows.length === 0 && <li className="py-2 text-[13px] text-muted">Nothing yet.</li>}
          {rows.map((r) => (
            <li key={r.at + r.text} className="py-1.5 text-[13px]">
              <div className="text-ink">{r.text}</div>
              <div className="num text-[12px] text-muted">{fmtStamp(r.at)} · {r.by}</div>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-end"><button className={btn.ghost} onClick={onClose} autoFocus>Close</button></div>
      </div>
    </div>
  );
}

export function ContactedSection({ card, member }: { card: CardView; member: Member }) {
  const { addCardEvents, toast, revertCardEvent } = useStore();
  const o = card.outreach!;
  const ids = [aedCustomerId(card.customerId), card.id]; // customer-wide entries: logged on the customer and this invoice
  const [picked, setPicked] = useState<string>("");
  const [adding, setAdding] = useState<null | { person: string; phone: string }>(null);
  const [editingMail, setEditingMail] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [sending, setSending] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [history, setHistory] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setPicked(""); setAdding(null); setEditingMail(null); setError(""); }, [card.id]);

  // Who she's calling: her pick, else whoever she called last (any invoice of this customer), else the first number.
  const last = o.lastCall && o.phones.find((p) => normPhone(p.value) === normPhone(o.lastCall!.to));
  const current = o.phones.find((p) => normPhone(p.value) === picked) ?? last ?? o.phones[0];
  const lastCall = o.calls.at(-1);
  const lastMail = o.sent.at(-1);

  const removePhone = useCallback((value: string) => addCardEvents([{ cardIds: ids, ref: card.customerId, kind: "aed_remove_phone", value, by: member.name }]), [ids.join(), card.customerId, member.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const addPhone = () => {
    if (!adding) return;
    const phone = adding.phone.trim();
    if (normPhone(phone).length < 8) return setError("Enter a full contact number.");
    const prev = current;
    addCardEvents([{ cardIds: ids, ref: card.customerId, kind: "aed_add_phone", value: phone, person: adding.person.trim() || undefined, by: member.name }]);
    setPicked(normPhone(phone));
    setAdding(null);
    setError("");
    if (prev && normPhone(prev.value) !== normPhone(phone)) {
      setAsk({
        title: "Remove the non-concerned person's contact details?",
        text: `${prev.value}${prev.person ? ` (${prev.person})` : ""} won't show on this customer's AED cards any more. It stays in Zoho Books.`,
        onYes: () => removePhone(prev.value),
      });
    }
  };

  const logCall = () => {
    if (!current) return;
    const [ev] = addCardEvents([{ cardIds: [card.id, aedCustomerId(card.customerId)], ref: card.customerId, kind: "aed_call", value: current.value, person: current.person, by: member.name }]);
    toast({ text: `Call ${o.calls.length + 1} logged · ${current.value}`, actionLabel: "Undo", onAction: () => revertCardEvent(ev.id, member.name) });
  };

  const saveEmail = () => {
    const next = (editingMail ?? "").trim();
    if (!EMAIL_RE.test(next)) return setError("Enter a valid email.");
    const prev = o.email;
    setEditingMail(null);
    setError("");
    if (prev && normEmail(prev) === normEmail(next)) {
      addCardEvents([{ cardIds: [card.id], kind: "aed_confirm_email", value: prev, by: member.name }]);
      return;
    }
    addCardEvents([{ cardIds: ids, ref: card.customerId, kind: "aed_set_email", value: next, before: prev, by: member.name }]);
    if (prev) {
      setAsk({
        title: "Remove the previous email?",
        text: `${prev} won't show on this customer's AED cards any more. It stays in Zoho Books.`,
        onYes: () => addCardEvents([{ cardIds: ids, ref: card.customerId, kind: "aed_remove_email", value: prev, by: member.name }]),
      });
    }
  };

  const nextStep = o.sent.length + 1;
  const chip = (text: string, tone: string) => <span className={`rounded px-1.5 py-px text-[11px] font-bold ${tone}`}>{text}</span>;

  return (
    <Section
      title="Contacted"
      aside={<span className="text-[12px] text-muted">In process · {o.inProcess!.by.split(" ")[0]}, {fmtStamp(o.inProcess!.at)}</span>}
    >
      {/* Calls: who she spoke to, how many times, when last. */}
      <div className="rounded-xl border border-line px-3 py-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-[12px] font-bold uppercase tracking-wide text-muted">Last contacted</span>
          <span className="text-[12px] text-muted">
            Calls {chip(String(o.calls.length), "bg-info-bg text-info")}
            {lastCall && <> · last <span className="num">{fmtStamp(lastCall.at)}</span></>}
          </span>
        </div>
        <div className="mt-0.5 text-[14px] text-ink">
          {o.lastCall ? (
            <><b className="num">{o.lastCall.to}</b>{o.lastCall.person && <> · {o.lastCall.person}</>} <span className="text-[12px] text-muted">· {fmtStamp(o.lastCall.at)}{o.lastCall.cardId !== card.id && " (another invoice)"}</span></>
          ) : <span className="text-faint">Not called yet</span>}
        </div>
        <div className="mt-1.5 space-y-1" role="radiogroup" aria-label="Contact called">
          {o.phones.length === 0 && <div className="text-[13px] text-high">No contact number — add the one you called.</div>}
          {o.phones.map((p) => {
            const on = current && normPhone(current.value) === normPhone(p.value);
            return (
              <div key={p.value} className={`flex items-center gap-2 rounded-lg border px-2 py-1 text-[13px] ${on ? "border-info bg-info-bg" : "border-line"}`}>
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                  <input type="radio" name={`called-${card.id}`} className="size-3.5 accent-[var(--info)]" checked={Boolean(on)} onChange={() => setPicked(normPhone(p.value))} />
                  <span className="num font-semibold text-ink">{p.value}</span>
                  <span className="truncate text-muted">{p.person ? `${p.person} · ` : ""}{p.source}</span>
                </label>
                <button
                  className="shrink-0 rounded px-1.5 text-[12px] font-medium text-muted hover:bg-high-bg hover:text-high"
                  title="Not the concerned person — hide this number on this customer's AED cards"
                  onClick={() => setAsk({ title: "Remove the non-concerned person's contact details?", text: `${p.value}${p.person ? ` (${p.person})` : ""} won't show on this customer's AED cards any more. It stays in Zoho Books.`, onYes: () => removePhone(p.value) })}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
        {adding ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <input className={`${inputCls} !h-8 !w-36 text-[13px]`} placeholder="Name (optional)" value={adding.person} onChange={(e) => setAdding({ ...adding, person: e.target.value })} />
            <input className={`${inputCls} !h-8 !w-40 text-[13px]`} placeholder="Contact number" inputMode="tel" value={adding.phone} onChange={(e) => setAdding({ ...adding, phone: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addPhone()} autoFocus />
            <button className={`${btn.primary} !h-8`} onClick={addPhone}>Add</button>
            <button className={btn.quiet} onClick={() => { setAdding(null); setError(""); }}>Cancel</button>
          </div>
        ) : (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <button className="press inline-flex h-8 items-center justify-center rounded-full bg-info px-3.5 text-[12.5px] font-semibold text-white hover:brightness-110 disabled:opacity-40" onClick={logCall} disabled={!current}>
              Log call{current ? ` · ${current.value}` : ""}
            </button>
            <button className={btn.quiet} onClick={() => setAdding({ person: "", phone: "" })}>+ Add contact</button>
          </div>
        )}
      </div>

      {/* Email: check it's the right person's, change it if not, then send the next template. */}
      <div className="mt-2 rounded-xl border border-line px-3 py-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-[12px] font-bold uppercase tracking-wide text-muted">Email</span>
          <span className="text-[12px] text-muted">
            Emails {chip(String(o.sent.length), "bg-info-bg text-info")}
            {lastMail && <> · last <span className="num">{fmtStamp(lastMail.at)}</span> ({aedMailStep(lastMail.step)})</>}
          </span>
        </div>
        {editingMail !== null ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <input className={`${inputCls} !h-8 min-w-0 flex-1 text-[13px]`} type="email" placeholder="name@company.com" value={editingMail} onChange={(e) => setEditingMail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEmail()} autoFocus />
            <button className={`${btn.primary} !h-8`} onClick={saveEmail}>Save</button>
            <button className={btn.quiet} onClick={() => { setEditingMail(null); setError(""); }}>Cancel</button>
          </div>
        ) : (
          <>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[14px]">
              {o.email ? <b className="break-all text-ink">{o.email}</b> : <span className="text-high">No email — add the concerned person&apos;s email.</span>}
              <button className={`${btn.quiet} !h-7`} onClick={() => setEditingMail(o.email ?? "")}>{o.email ? "Change" : "+ Add email"}</button>
            </div>
            {o.email && !o.emailConfirmed && (
              <div className="mt-1 flex flex-wrap items-center gap-2 rounded-lg border border-medium/50 bg-medium-bg px-2.5 py-1.5 text-[12.5px]">
                <span className="font-semibold text-medium">⚑ Is this the concerned person&apos;s email? You might want to change it.</span>
                <span className="ml-auto inline-flex gap-1.5">
                  <button className="rounded-full bg-surface px-2.5 py-0.5 font-semibold text-ink hover:bg-line" onClick={() => addCardEvents([{ cardIds: [card.id], kind: "aed_confirm_email", value: o.email, by: member.name }])}>Same email</button>
                  <button className="rounded-full bg-surface px-2.5 py-0.5 font-semibold text-ink hover:bg-line" onClick={() => setEditingMail(o.email ?? "")}>Change</button>
                </span>
              </div>
            )}
          </>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <button
            className={btn.primary}
            onClick={() => setSending(true)}
            disabled={!o.email || !o.emailConfirmed || editingMail !== null}
            title={!o.email ? "Add an email first" : !o.emailConfirmed ? "Check the email first: Same email or Change" : undefined}
          >
            Send email · {aedMailStep(nextStep)}
          </button>
          <span className="text-[12px] text-muted">from {MAILBOX} · email {nextStep}</span>
          {(o.calls.length > 0 || o.sent.length > 0) && <button className={`${btn.quiet} ml-auto !h-7`} onClick={() => setHistory(true)}>All calls &amp; emails</button>}
        </div>
      </div>
      {error && <p className="mt-1 text-[13px] font-medium text-high">{error}</p>}

      {ask && <AskRemove ask={ask} onClose={() => setAsk(null)} />}
      {sending && o.email && <SendEmail card={card} to={o.email} onClose={() => setSending(false)} onConnect={() => setConnecting(true)} />}
      {connecting && <ConnectMailbox member={member} onClose={() => setConnecting(false)} />}
      {history && <History card={card} onClose={() => setHistory(false)} />}
    </Section>
  );
}
