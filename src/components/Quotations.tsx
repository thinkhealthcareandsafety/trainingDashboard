"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { celebrate } from "@/lib/confetti";
import { useStore } from "@/lib/store";
import { btn, inputCls } from "./ui";

/*
 * Quotations (owner, 28 Oct): every Zoho customer, newest activity first; "Quote" opens a check — who it goes to, the
 * items (started from their last quotation), the total — then Send makes the quotation in Zoho Books and Zoho emails it
 * (standard email + PDF). Or Save as draft in Zoho. Server: /api/quotations. Ready-made quotes come later (owner).
 */

type Last = { date: string; number: string; amount: number; status: string };
type Customer = { id: string; name: string; email: string | null; phone: string | null; sector: string | null; type: string | null; lastQuote: Last | null; lastInvoice: string | null };
type ListRes = { connected: { connectedAt: string; connectedBy: string } | null; scopes: string; admin: boolean; live: boolean; total: number; page: number; pageSize: number; sectors: string[]; types: string[]; customers: Customer[]; error?: string };
type Item = { id: string; name: string; group: string | null; rate: number | null };
type Contact = { id: string; name: string | null; email: string | null; phone: string | null; primary: boolean };
type Line = { key: number; itemId: string; name: string; qty: number; rate: number; description?: string };
type Detail = { contacts: Contact[]; last: { number: string; date: string; lines: { itemId: string; name: string; qty: number; rate: number; description?: string }[] } | null; recent: { number: string; date: string; days: number } | null; error?: string };

const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;
const fmtDay = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const ago = (ymd: string) => { const d = Math.round((Date.now() - Date.parse(`${ymd}T00:00:00+05:30`)) / 86_400_000); return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 60 ? `${d} days ago` : d < 730 ? `${Math.round(d / 30)} months ago` : `${Math.round(d / 365)} years ago`; };

let itemsOnce: Promise<Item[]> | null = null; // the item list, once per page load
const loadItems = () => (itemsOnce ??= fetch("/api/quotations?items=1").then((r) => r.json()).then((j: { items?: Item[] }) => j.items ?? []).catch(() => { itemsOnce = null; return []; }));

export function Quotations() {
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(0);
  const [res, setRes] = useState<ListRes | null>(null);
  const [loading, setLoading] = useState(false);
  const [quoting, setQuoting] = useState<Customer | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => { setPage(0); }, [q, sector, type, sort]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      const p = new URLSearchParams({ q, sector, type, sort, page: String(page) });
      fetch(`/api/quotations?${p}`).then((r) => r.json()).then((j: ListRes) => { if (live) { setRes(j); setLoading(false); } }).catch(() => live && setLoading(false));
    }, q ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [q, sector, type, sort, page, tick]);

  if (res?.error && !res.customers) return <p className="text-[15px] text-high">{res.error}</p>;
  const pages = res ? Math.max(1, Math.ceil(res.total / res.pageSize)) : 1;

  return (
    <div>
      {res && !res.connected && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-medium/50 bg-medium-bg px-4 py-3 text-[14px]">
          <span className="font-semibold text-medium">Zoho Books isn&apos;t connected for quotations yet.</span>
          {res.admin ? <button className={btn.primary} onClick={() => setConnecting(true)}>Connect Zoho Books</button> : <span className="text-ink-2">Admin connects it once.</span>}
        </div>
      )}
      {res && !res.live && <p className="mb-4 rounded-2xl bg-surface-2 px-4 py-2.5 text-[14px] text-muted">This is a local copy — quotations are created in Zoho Books only from the live site.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <input className={`${inputCls} !h-10 min-w-0 flex-1 basis-72 text-[15px]`} placeholder="Search a customer, email or phone…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" autoFocus />
        <select className={`${inputCls} !h-10 !w-auto text-[14px]`} value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector">
          <option value="">Every sector</option>
          {res?.sectors.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={`${inputCls} !h-10 !w-auto text-[14px]`} value={type} onChange={(e) => setType(e.target.value)} aria-label="Customer type">
          <option value="">Every customer type</option>
          {res?.types.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={`${inputCls} !h-10 !w-auto text-[14px]`} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Order">
          <option value="recent">Latest quote or purchase first</option>
          <option value="name">A–Z</option>
        </select>
        {connectedLine(res, () => setConnecting(true))}
      </div>

      <div className="card mt-4 overflow-hidden">
        <table className="w-full text-left text-[15px]">
          <thead className="border-b border-line text-[13px] text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Contact</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">Last quotation</th>
              <th className="hidden px-4 py-3 font-medium xl:table-cell">Last bought</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className={`divide-y divide-line ${loading ? "opacity-60" : ""}`}>
            {res?.customers.map((c) => (
              <tr key={c.id} className="hover:bg-surface-2/60">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-ink">{c.name}</div>
                  <div className="text-[13px] text-muted">{[c.type, c.sector].filter(Boolean).join(" · ") || "—"}</div>
                </td>
                <td className="hidden px-4 py-2.5 md:table-cell">
                  <div className="break-all text-ink-2">{c.email ?? <span className="text-faint">no email</span>}</div>
                  <div className="num text-[13px] text-muted">{c.phone ?? ""}</div>
                </td>
                <td className="hidden px-4 py-2.5 lg:table-cell">
                  {c.lastQuote ? <><div className="text-ink-2"><span className="num">{inr(c.lastQuote.amount)}</span> · {c.lastQuote.number}</div><div className="text-[13px] text-muted">{fmtDay(c.lastQuote.date)} · {ago(c.lastQuote.date)}</div></> : <span className="text-faint">never</span>}
                </td>
                <td className="hidden px-4 py-2.5 text-ink-2 xl:table-cell">{c.lastInvoice ? <>{fmtDay(c.lastInvoice)}<div className="text-[13px] text-muted">{ago(c.lastInvoice)}</div></> : <span className="text-faint">never</span>}</td>
                <td className="px-4 py-2.5 text-right">
                  <button className={btn.primary} onClick={() => setQuoting(c)} disabled={!res.connected} title={res.connected ? `Make a quotation for ${c.name}` : "Zoho Books isn't connected for quotations yet"}>Quote</button>
                </td>
              </tr>
            ))}
            {res && !res.customers.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No customer matches.</td></tr>}
            {!res && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Loading customers…</td></tr>}
          </tbody>
        </table>
      </div>
      {res && (
        <div className="mt-3 flex items-center justify-between text-[14px] text-muted">
          <span>{res.total.toLocaleString("en-IN")} customers{q || sector || type ? " match" : " in Zoho Books"}</span>
          {pages > 1 && (
            <span className="flex items-center gap-2">
              <button className={btn.quiet} onClick={() => setPage((p) => p - 1)} disabled={page === 0}>← Previous</button>
              <span>Page {page + 1} of {pages}</span>
              <button className={btn.quiet} onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= pages}>Next →</button>
            </span>
          )}
        </div>
      )}
      {quoting && res && createPortal(<QuotePopup customer={quoting} live={res.live} onClose={(sent) => { setQuoting(null); if (sent) setTick((t) => t + 1); }} />, document.body)}
      {connecting && res && createPortal(<ConnectBooks scopes={res.scopes} onClose={(ok) => { setConnecting(false); if (ok) setTick((t) => t + 1); }} />, document.body)}
    </div>
  );
}

function connectedLine(res: ListRes | null, reconnect: () => void) {
  if (!res?.connected) return null;
  return (
    <span className="ml-auto text-[13px] text-muted" title={`Connected by ${res.connected.connectedBy}`}>
      Zoho Books connected{res.admin && <> · <button className="font-semibold text-brand hover:underline" onClick={reconnect}>Reconnect</button></>}
    </span>
  );
}

/** One item row: the item (type to search Zoho's items), quantity, price before tax, line total. */
function ItemPicker({ items, value, onPick }: { items: Item[]; value: string; onPick: (i: Item) => void }) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  useEffect(() => setText(value), [value]);
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = open ? items.filter((i) => words.every((w) => i.name.toLowerCase().includes(w))).slice(0, 8) : [];
  return (
    <div className="relative min-w-0 flex-1">
      <input className={`${inputCls} !h-9 text-[14px]`} value={text} placeholder="Type to find an item…" onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => { setOpen(false); setText(value); }, 150)} aria-label="Item" />
      {hits.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-pop">
          {hits.map((i) => (
            <li key={i.id}>
              <button type="button" className="flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-[14px] hover:bg-surface-2" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(i); setOpen(false); }}>
                <span className="text-ink">{i.name}<span className="ml-2 text-[12.5px] text-muted">{i.group ?? ""}</span></span>
                {i.rate ? <span className="num shrink-0 text-muted">{inr(i.rate)}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuotePopup({ customer, live, onClose }: { customer: Customer; live: boolean; onClose: (sent: boolean) => void }) {
  const { toast } = useStore();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [to, setTo] = useState<string[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState<"" | "send" | "draft">("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ number: string; total: number; url: string; sent: boolean } | null>(null);
  const key = useRef(0);
  const row = (l: Omit<Line, "key">): Line => ({ ...l, key: ++key.current });

  useEffect(() => {
    loadItems().then(setItems);
    fetch(`/api/quotations?customer=${customer.id}`).then((r) => r.json()).then((j: Detail) => {
      setDetail(j);
      if (j.error) return;
      // Who: the primary contact (with an email), else the first with one. What: their last quotation's lines.
      const withMail = j.contacts.filter((c) => c.email);
      setTo((withMail.find((c) => c.primary) ?? withMail[0]) ? [(withMail.find((c) => c.primary) ?? withMail[0]).id] : []);
      setLines(j.last?.lines.length ? j.last.lines.map((l) => row(l)) : [row({ itemId: "", name: "", qty: 1, rate: 0 })]);
    }).catch(() => setDetail({ contacts: [], last: null, recent: null, error: "Couldn't reach the server" }));
  }, [customer.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = lines.reduce((s, l) => s + (l.itemId ? l.qty * l.rate : 0), 0);
  const filled = lines.filter((l) => l.itemId);
  const why = !live ? "Only the live site creates quotations" : !filled.length ? "Add at least one item" : filled.some((l) => !(l.qty > 0)) ? "Every item needs a quantity" : "";
  const whySend = why || (!to.length ? "Pick who it goes to" : "");
  const set = (k: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));

  const submit = async (send: boolean, e: React.MouseEvent<HTMLButtonElement>) => {
    const from = e.currentTarget;
    if (send && detail?.recent && !confirm(`${detail.recent.number} went to ${customer.name} ${detail.recent.days === 0 ? "today" : `${detail.recent.days} days ago`}. Send another?`)) return;
    setBusy(send ? "send" : "draft");
    setError("");
    try {
      const r = await fetch("/api/quotations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId: customer.id, contactPersonIds: to, send, lines: filled.map(({ itemId, qty, rate, description }) => ({ itemId, qty, rate, description })) }) });
      const j = (await r.json()) as { ok?: boolean; error?: string; quote?: { number: string; total: number; url: string; sent: boolean } };
      if (!r.ok || !j.quote) throw new Error(j.error ?? "Couldn't create the quotation");
      setDone(j.quote);
      if (send) celebrate(from);
      toast({ text: `${j.quote.number} ${send ? "sent to" : "saved as a draft for"} ${customer.name}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the quotation");
    }
    setBusy("");
  };

  const emails = detail?.contacts.filter((c) => to.includes(c.id)).map((c) => c.email).join(", ");
  return (
    <div className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/30 p-4" onMouseDown={busy ? undefined : () => onClose(Boolean(done))}>
      <div role="dialog" aria-label={`Quotation for ${customer.name}`} className="modal-in flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-6 pt-5">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">New quotation</p>
            <h3 className="truncate text-[20px] font-bold tracking-tight text-ink" title={customer.name}>{customer.name}</h3>
          </div>
          <button className={btn.quiet} onClick={() => onClose(Boolean(done))} aria-label="Close" disabled={Boolean(busy)}>✕</button>
        </div>

        {done ? (
          <div className="px-6 py-8 text-center">
            <p className="text-[22px] font-bold text-low">{done.sent ? "Sent" : "Saved as a draft"} · {done.number}</p>
            <p className="mt-1 text-[15px] text-ink-2">{done.sent ? <>Zoho Books emailed it to {emails}.</> : <>It&apos;s in Zoho Books as a draft — send it from there when ready.</>} Total incl. GST <b className="num">{inr(done.total)}</b>.</p>
            <div className="mt-5 flex justify-center gap-2">
              <a className={btn.ghost} href={done.url} target="_blank" rel="noreferrer">Open in Zoho Books</a>
              <button className={btn.primary} onClick={() => onClose(true)} autoFocus>Done</button>
            </div>
          </div>
        ) : !detail ? (
          <p className="px-6 py-10 text-center text-[15px] text-muted">Getting {customer.name}&apos;s contacts and last quotation from Zoho…</p>
        ) : detail.error ? (
          <p className="px-6 py-10 text-center text-[15px] text-high">{detail.error}</p>
        ) : (
          <>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pb-2 pt-3">
              {detail.recent && <p className="mb-3 rounded-xl border border-medium/50 bg-medium-bg px-3 py-2 text-[14px] font-medium text-medium">⚑ {detail.recent.number} went to them {detail.recent.days === 0 ? "today" : `${detail.recent.days} days ago`} — a quotation is valid 15 days.</p>}

              <p className="text-[13px] font-bold uppercase tracking-wide text-muted">To</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {detail.contacts.map((c) => (
                  <label key={c.id} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[14px] ${to.includes(c.id) ? "border-brand bg-brand-soft" : "border-line"} ${c.email ? "" : "cursor-not-allowed opacity-50"}`} title={c.email ? undefined : "No email in Zoho"}>
                    <input type="checkbox" className="accent-[var(--brand)]" disabled={!c.email} checked={to.includes(c.id)} onChange={(e) => setTo((t) => (e.target.checked ? [...t, c.id] : t.filter((x) => x !== c.id)))} />
                    <span className="text-ink">{c.name ?? c.email ?? "Contact"}</span>
                    {c.email && c.name && <span className="text-muted">{c.email}</span>}
                    {c.primary && <span className="rounded bg-surface-2 px-1.5 text-[11px] font-bold text-muted">PRIMARY</span>}
                  </label>
                ))}
                {!detail.contacts.some((c) => c.email) && <p className="text-[14px] text-high">No contact person with an email in Zoho — add one there, or save it as a draft.</p>}
              </div>

              <div className="mt-4 flex items-baseline justify-between">
                <p className="text-[13px] font-bold uppercase tracking-wide text-muted">Items</p>
                {detail.last && <p className="text-[13px] text-muted">Started from {detail.last.number} ({fmtDay(detail.last.date)}) · <button className="font-semibold text-brand hover:underline" onClick={() => setLines([row({ itemId: "", name: "", qty: 1, rate: 0 })])}>start empty</button></p>}
              </div>
              <div className="mt-1 grid grid-cols-[minmax(0,1fr)_5.5rem_7.5rem_7rem_2rem] items-center gap-2 text-[13px] text-muted">
                <span>Item</span><span className="text-right">Qty</span><span className="text-right">Price (before tax)</span><span className="text-right">Amount</span><span />
              </div>
              <div className="mt-1 space-y-1.5">
                {lines.map((l) => (
                  <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_5.5rem_7.5rem_7rem_2rem] items-center gap-2">
                    <ItemPicker items={items} value={l.name} onPick={(i) => set(l.key, { itemId: i.id, name: i.name, rate: i.rate ?? l.rate, description: undefined })} />
                    <input className={`${inputCls} !h-9 text-right text-[14px] num`} type="number" min={1} value={l.qty} onChange={(e) => set(l.key, { qty: Number(e.target.value) })} aria-label="Quantity" />
                    <input className={`${inputCls} !h-9 text-right text-[14px] num`} type="number" min={0} value={l.rate} onChange={(e) => set(l.key, { rate: Number(e.target.value) })} aria-label="Price before tax" />
                    <span className="num text-right text-[14px] text-ink">{l.itemId ? inr(l.qty * l.rate) : "—"}</span>
                    <button className="rounded-full text-[15px] text-muted hover:text-high" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [row({ itemId: "", name: "", qty: 1, rate: 0 })]))} aria-label="Remove item">✕</button>
                  </div>
                ))}
              </div>
              <button className={`${btn.quiet} mt-1.5`} onClick={() => setLines((ls) => [...ls, row({ itemId: "", name: "", qty: 1, rate: 0 })])}>+ Add item</button>
              <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2">
                <span className="text-[13px] text-muted">Zoho adds GST and sends its standard quotation email with the PDF.</span>
                <span className="text-[16px] font-semibold text-ink">Total before tax <span className="num">{inr(total)}</span></span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4">
              {error && <span className="mr-auto text-[14px] font-medium text-high">{error}</span>}
              <button className={btn.ghost} onClick={() => onClose(false)} disabled={Boolean(busy)}>Cancel</button>
              <button className={btn.ghost} onClick={(e) => submit(false, e)} disabled={Boolean(why) || Boolean(busy)} title={why || "Make it in Zoho Books without emailing it"}>{busy === "draft" ? "Saving…" : "Save as draft in Zoho"}</button>
              <button className={btn.primary} onClick={(e) => submit(true, e)} disabled={Boolean(whySend) || Boolean(busy)} title={whySend || `Zoho Books emails it to ${emails}`}>{busy === "send" ? "Sending…" : "Send quotation"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Admin: connect Zoho Books for quotations — a one-time code from the Zoho API console (Self Client). */
function ConnectBooks({ scopes, onClose }: { scopes: string; onClose: (ok: boolean) => void }) {
  const [code, setCode] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [state, setState] = useState<{ busy?: boolean; error?: string; done?: string }>({});
  const connect = async () => {
    setState({ busy: true });
    const r = await fetch("/api/quotations", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, clientId, clientSecret }) }).catch(() => null);
    const j = r ? ((await r.json()) as { ok?: boolean; error?: string }) : { error: "Couldn't reach the server" };
    setState(j.ok ? { done: "Connected — quotations can be sent now." } : { error: j.error ?? "Couldn't connect" });
    if (j.ok) setCode("");
  };
  const steps = useMemo(() => [
    <>Sign in to <a className="font-semibold text-brand underline" href="https://api-console.zoho.in" target="_blank" rel="noreferrer">api-console.zoho.in</a> with the Zoho account that uses Zoho Books.</>,
    <>Open <b>Self Client</b> → <b>Generate Code</b>.</>,
    <>Scope: <code className="select-all rounded bg-surface-2 px-1 text-[13px]">{scopes}</code> · Time: 10 minutes · Description: Quotations · Create.</>,
    <>Paste the code here. If that Self Client isn&apos;t the one used for Zoho Books, also paste its Client ID and Secret (Client Secret tab).</>,
  ], [scopes]);
  return (
    <div className="fade-in fixed inset-0 z-[80] grid place-items-center bg-black/30 p-4" onMouseDown={() => onClose(Boolean(state.done))}>
      <div role="dialog" aria-label="Connect Zoho Books for quotations" className="modal-in w-full max-w-xl rounded-2xl bg-surface p-6 shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="text-[19px] font-bold tracking-tight text-ink">Connect Zoho Books for quotations</h3>
        <p className="mt-1 text-[14px] text-muted">The dashboard&apos;s only connection that writes to Zoho Books: it creates and emails quotations. The everyday sync stays read-only.</p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[14px] text-ink-2">{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        <div className="mt-4 space-y-2">
          <input className={inputCls} placeholder="Code (1000.…)" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
          <div className="grid gap-2 sm:grid-cols-2">
            <input className={inputCls} placeholder="Client ID (optional)" value={clientId} onChange={(e) => setClientId(e.target.value)} />
            <input className={inputCls} placeholder="Client Secret (optional)" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
          </div>
        </div>
        {state.error && <p className="mt-2 text-[14px] font-medium text-high">{state.error}</p>}
        {state.done && <p className="mt-2 text-[14px] font-medium text-low">{state.done}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button className={btn.ghost} onClick={() => onClose(Boolean(state.done))}>Close</button>
          <button className={btn.primary} onClick={connect} disabled={!code.trim() || state.busy}>{state.busy ? "Connecting…" : "Connect"}</button>
        </div>
      </div>
    </div>
  );
}
