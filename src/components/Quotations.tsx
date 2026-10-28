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
 * 28 Oct (owner: "the popup is very small … that's how a zoho quote making looks"): wide like Zoho's form — the quote's
 * fields (sales person, Send to CRM and Reminder Frequency — mandatory in Zoho —, product type, lead source, deal name),
 * stock and GST per item, editable descriptions, the totals as Zoho works them out, notes and terms.
 */

type Last = { date: string; number: string; amount: number; status: string };
type Customer = { id: string; name: string; email: string | null; phone: string | null; sector: string | null; type: string | null; lastQuote: Last | null; lastInvoice: string | null };
type ListRes = { connected: { connectedAt: string; connectedBy: string } | null; scopes: string; admin: boolean; live: boolean; total: number; page: number; pageSize: number; sectors: string[]; types: string[]; customers: Customer[]; error?: string };
type Item = { id: string; name: string; group: string | null; rate: number | null; gst: number | null; unit: string | null; stock: string | null; service: boolean; onHand: number | null };
type Contact = { id: string; name: string | null; email: string | null; phone: string | null; primary: boolean };
type Line = { key: number; itemId: string; name: string; qty: number; rate: number; gst: number | null; description?: string; open?: boolean };
type Opts = { sendToCrm: string[]; reminderFrequency: string[]; productType: string[]; leadSource: string[] };
type Detail = {
  contacts: Contact[];
  customer: { gstin: string | null; state: string | null; city: string | null; place: string | null; tax: "intra" | "inter" | "none" };
  last: { number: string; date: string; salesperson: string | null; fields: Record<string, string>; lines: Omit<Line, "key">[] } | null;
  recent: { number: string; date: string; days: number } | null;
  salespeople: string[]; salesperson: string | null; options: Opts; notes: string; terms: string; today: string; error?: string;
};
/** The quote's own fields, as in Zoho's form. Send to CRM and Reminder Frequency are mandatory in Zoho. */
type Form = {
  salesperson: string; sendToCrm: string; reminderFrequency: string; productType: string; leadSource: string; dealName: string; dealTyped: boolean;
  reference: string; expiry: string; discount: string; discountPct: boolean; shipping: string; adjustment: string; notes: string; terms: string;
};

const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;
const inr2 = (v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The totals the way Zoho works them out: discount on the whole quote before tax (shared over the lines), GST per rate
 * on what's left — CGST + SGST (half each) in Maharashtra, IGST elsewhere, none abroad — then shipping and adjustment.
 */
function totals(lines: Line[], f: Form, tax: Detail["customer"]["tax"]) {
  const filled = lines.filter((l) => l.itemId);
  const sub = filled.reduce((s, l) => s + l.qty * l.rate, 0);
  const d = Number(f.discount) || 0;
  const discount = Math.min(sub, f.discountPct ? (sub * d) / 100 : d);
  const share = sub > 0 ? (sub - discount) / sub : 1;
  const byRate = new Map<number, number>();
  for (const l of filled) if (l.gst) byRate.set(l.gst, (byRate.get(l.gst) ?? 0) + l.qty * l.rate * share * (l.gst / 100));
  const taxes = tax === "none" ? [] : [...byRate].sort((a, b) => a[0] - b[0]).flatMap(([rate, amt]) =>
    tax === "intra" ? [{ label: `CGST ${rate / 2}%`, amount: round2(amt / 2) }, { label: `SGST ${rate / 2}%`, amount: round2(amt / 2) }] : [{ label: `IGST ${rate}%`, amount: round2(amt) }]);
  const shipping = Number(f.shipping) || 0;
  const adjustment = Number(f.adjustment) || 0;
  const total = round2(sub - discount + taxes.reduce((s, t) => s + t.amount, 0) + shipping + adjustment);
  return { sub, discount: round2(discount), taxes, shipping, adjustment, total, noGst: tax !== "none" && filled.some((l) => l.gst === null) };
}

/** Deal Name the way the team writes it: product type, quantity of the main item, city ("pads 2 Bengaluru Urban"). */
function dealName(productType: string, lines: Line[], city: string | null) {
  if (!productType.trim()) return "";
  const main = lines.filter((l) => l.itemId).sort((a, b) => b.qty * b.rate - a.qty * a.rate)[0];
  return [productType.trim(), main ? String(main.qty) : "", city ?? ""].filter(Boolean).join(" ");
}
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

const label = "text-[12.5px] font-bold uppercase tracking-wide text-muted";
const need = <span className="text-high"> *</span>;

/** A labelled field in the details panel. */
function Field({ name, required, wide, children }: { name: string; required?: boolean; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
      <span className={label}>{name}{required && need}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

/** One of Zoho's dropdowns (its exact values, shown trimmed). */
function Choice({ value, options, onChange, blank, aria }: { value: string; options: string[]; onChange: (v: string) => void; blank?: string; aria: string }) {
  return (
    <select className={`${inputCls} !h-9 text-[14px]`} value={value} onChange={(e) => onChange(e.target.value)} aria-label={aria}>
      {blank !== undefined && <option value="">{blank}</option>}
      {options.map((o) => <option key={o} value={o}>{o.trim()}</option>)}
    </select>
  );
}

/** Stock for a line: on hand (our stock copy) and Zoho's Stock Status field; services have none. */
function StockCell({ item }: { item: Item | undefined }) {
  if (!item) return <span className="text-faint">—</span>;
  if (item.service) return <span className="text-[13px] text-muted">Service</span>;
  const tone = /back|out/i.test(item.stock ?? "") ? "text-medium" : /in stock/i.test(item.stock ?? "") ? "text-low" : "text-muted";
  return (
    <span className="block leading-tight">
      <span className="num text-[14px] text-ink">{(item.onHand ?? 0).toLocaleString("en-IN")}</span> <span className="text-[12.5px] text-muted">on hand</span>
      {item.stock && <span className={`block text-[12.5px] ${tone}`}>{item.stock}</span>}
    </span>
  );
}

// Wide: one row per item like Zoho. Phone: the item on its own row, then quantity, rate, amount (no stock / GST).
const GRID = "grid grid-cols-[4.5rem_minmax(0,1fr)_6.5rem_2rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_5rem_7.5rem_4.5rem_7.5rem_2rem]";

function QuotePopup({ customer, live, onClose }: { customer: Customer; live: boolean; onClose: (sent: boolean) => void }) {
  const { toast } = useStore();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [to, setTo] = useState<string[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [f, setF] = useState<Form | null>(null);
  const [more, setMore] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [busy, setBusy] = useState<"" | "send" | "draft">("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ number: string; total: number; url: string; sent: boolean; ours: number } | null>(null);
  const key = useRef(0);
  const row = (l: Omit<Line, "key">): Line => ({ ...l, key: ++key.current });
  const blank = () => row({ itemId: "", name: "", qty: 1, rate: 0, gst: null });
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  useEffect(() => {
    let current = true; // a late answer (an earlier open) must not reset lines someone is already editing
    loadItems().then((i) => current && setItems(i));
    fetch(`/api/quotations?customer=${customer.id}`).then((r) => r.json()).then((j: Detail) => {
      if (!current) return;
      setDetail(j);
      if (j.error) return;
      // Who: the primary contact (with an email), else the first with one. What: their last quotation's lines.
      const withMail = j.contacts.filter((c) => c.email);
      const first = withMail.find((c) => c.primary) ?? withMail[0];
      setTo(first ? [first.id] : []);
      setLines(j.last?.lines.length ? j.last.lines.map((l) => row(l)) : [blank()]);
      // The quote's fields: Send to CRM Yes (owner, 28 Oct); the rest from their last quotation where it had them.
      const was = (k: keyof Opts, fallback: string) => { const v = j.last?.fields[k] ?? ""; return j.options[k].includes(v) ? v : fallback; };
      setF({
        salesperson: j.salesperson ?? "", sendToCrm: "Yes", reminderFrequency: was("reminderFrequency", "15 days"), productType: was("productType", ""), leadSource: was("leadSource", ""),
        dealName: "", dealTyped: false, reference: "", expiry: "", discount: "", discountPct: true, shipping: "", adjustment: "", notes: j.notes, terms: j.terms,
      });
    }).catch(() => current && setDetail({ error: "Couldn't reach the server" } as Detail));
    return () => { current = false; };
  }, [customer.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const pick = (k: number, i: Item) => {
    set(k, { itemId: i.id, name: i.name, rate: i.rate || 0, gst: i.gst, description: undefined });
    // Zoho puts the item's description on the line — read it now (and the GST %, if the item list is older than the item).
    fetch(`/api/quotations?item=${i.id}`).then((r) => r.json()).then((j: { description?: string; gst?: number | null }) => {
      setLines((ls) => ls.map((l) => (l.key === k && l.itemId === i.id ? { ...l, description: l.description ?? j.description ?? "", gst: l.gst ?? j.gst ?? null } : l)));
    }).catch(() => {});
  };
  const upd = (patch: Partial<Form>) => setF((x) => (x ? { ...x, ...patch } : x));

  const filled = lines.filter((l) => l.itemId);
  const t = f && detail?.customer ? totals(lines, f, detail.customer.tax) : null;
  const deal = f ? (f.dealTyped ? f.dealName : dealName(f.productType, lines, detail?.customer?.city ?? null)) : "";
  const why = !live ? "Only the live site creates quotations" : !filled.length ? "Add at least one item" : filled.some((l) => !(l.qty > 0)) ? "Every item needs a quantity"
    : !f?.sendToCrm || !f.reminderFrequency ? "Fill in Send to CRM and Reminder frequency" : t && t.discount > t.sub ? "The discount is more than the items" : "";
  const whySend = why || (!to.length ? "Pick who it goes to" : "");

  const submit = async (send: boolean, e: React.MouseEvent<HTMLButtonElement>) => {
    if (!f || !t) return;
    const from = e.currentTarget;
    if (send && detail?.recent && !confirm(`${detail.recent.number} went to ${customer.name} ${detail.recent.days === 0 ? "today" : `${detail.recent.days} days ago`}. Send another?`)) return;
    setBusy(send ? "send" : "draft");
    setError("");
    try {
      const details = {
        salesperson: f.salesperson || undefined, sendToCrm: f.sendToCrm, reminderFrequency: f.reminderFrequency, productType: f.productType || undefined, leadSource: f.leadSource || undefined,
        dealName: deal || undefined, reference: f.reference || undefined, expiry: f.expiry || undefined,
        discount: Number(f.discount) > 0 ? { value: Number(f.discount), percent: f.discountPct } : undefined, shipping: Number(f.shipping) || undefined, adjustment: Number(f.adjustment) || undefined,
        notes: f.notes, terms: f.terms,
      };
      const r = await fetch("/api/quotations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId: customer.id, contactPersonIds: to, send, details, lines: filled.map(({ itemId, qty, rate, description }) => ({ itemId, qty, rate, description })) }) });
      const j = (await r.json()) as { ok?: boolean; error?: string; quote?: { number: string; total: number; url: string; sent: boolean } };
      if (!r.ok || !j.quote) throw new Error(j.error ?? "Couldn't create the quotation");
      setDone({ ...j.quote, ours: t.total });
      if (send) celebrate(from);
      toast({ text: `${j.quote.number} ${send ? "sent to" : "saved as a draft for"} ${customer.name}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the quotation");
    }
    setBusy("");
  };

  const emails = detail?.contacts?.filter((c) => to.includes(c.id)).map((c) => c.email).join(", ");
  const c = detail?.customer;
  const gstLine = c && (c.tax === "none" ? "Outside India · no GST" : [c.gstin && `GSTIN ${c.gstin}`, c.state, c.tax === "intra" ? "CGST + SGST" : "IGST (outside Maharashtra)"].filter(Boolean).join(" · "));
  return (
    <div className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/30 p-3" onMouseDown={busy ? undefined : () => onClose(Boolean(done))}>
      <div role="dialog" aria-label={`Quotation for ${customer.name}`} className="modal-in flex max-h-[96vh] w-full min-w-0 max-w-6xl flex-col rounded-2xl bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-6 pt-5">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">New quotation</p>
            <h3 className="truncate text-[21px] font-bold tracking-tight text-ink" title={customer.name}>{customer.name}</h3>
            {gstLine && <p className="text-[13.5px] text-muted">{gstLine}</p>}
          </div>
          <button className={btn.quiet} onClick={() => onClose(Boolean(done))} aria-label="Close" disabled={Boolean(busy)}>✕</button>
        </div>

        {done ? (
          <div className="px-6 py-8 text-center">
            <p className="text-[22px] font-bold text-low">{done.sent ? "Sent" : "Saved as a draft"} · {done.number}</p>
            <p className="mt-1 text-[15px] text-ink-2">{done.sent ? <>Zoho Books emailed it to {emails}.</> : <>It&apos;s in Zoho Books as a draft — send it from there when ready.</>} Total incl. GST <b className="num">{inr2(done.total)}</b>.</p>
            {Math.abs(done.total - done.ours) > 1 && <p className="mt-1 text-[14px] text-medium">This page worked out {inr2(done.ours)} — Zoho&apos;s total is the one on the quotation; check it there.</p>}
            <div className="mt-5 flex justify-center gap-2">
              <a className={btn.ghost} href={done.url} target="_blank" rel="noreferrer">Open in Zoho Books</a>
              <button className={btn.primary} onClick={() => onClose(true)} autoFocus>Done</button>
            </div>
          </div>
        ) : !detail ? (
          <p className="px-6 py-10 text-center text-[15px] text-muted">Getting {customer.name}&apos;s contacts and last quotation from Zoho…</p>
        ) : detail.error || !f || !t ? (
          <p className="px-6 py-10 text-center text-[15px] text-high">{detail.error ?? "Couldn't load the quotation"}</p>
        ) : (
          <>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pb-3 pt-3">
              {detail.recent && <p className="mb-3 rounded-xl border border-medium/50 bg-medium-bg px-3 py-2 text-[14px] font-medium text-medium">⚑ {detail.recent.number} went to them {detail.recent.days === 0 ? "today" : `${detail.recent.days} days ago`} — a quotation is valid 15 days.</p>}

              <p className={label}>To</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {detail.contacts.map((p) => (
                  <label key={p.id} className={`flex max-w-full min-w-0 cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[14px] ${to.includes(p.id) ? "border-brand bg-brand-soft" : "border-line"} ${p.email ? "" : "cursor-not-allowed opacity-50"}`} title={p.email ? undefined : "No email in Zoho"}>
                    <input type="checkbox" className="accent-[var(--brand)]" disabled={!p.email} checked={to.includes(p.id)} onChange={(e) => setTo((x) => (e.target.checked ? [...x, p.id] : x.filter((y) => y !== p.id)))} />
                    <span className="text-ink">{p.name ?? p.email ?? "Contact"}</span>
                    {p.email && p.name && <span className="min-w-0 truncate text-muted">{p.email}</span>}
                    {p.primary && <span className="rounded bg-surface-2 px-1.5 text-[11px] font-bold text-muted">PRIMARY</span>}
                  </label>
                ))}
                {!detail.contacts.some((p) => p.email) && <p className="text-[14px] text-high">No contact person with an email in Zoho — add one there, or save it as a draft.</p>}
              </div>

              <div className="mt-3 grid gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
                <Field name="Sales person">
                  <Choice value={f.salesperson} options={detail.salespeople} onChange={(v) => upd({ salesperson: v })} blank="Zoho's default" aria="Sales person" />
                </Field>
                <Field name="Send to CRM" required><Choice value={f.sendToCrm} options={detail.options.sendToCrm} onChange={(v) => upd({ sendToCrm: v })} aria="Send to CRM" /></Field>
                <Field name="Reminder frequency" required><Choice value={f.reminderFrequency} options={detail.options.reminderFrequency} onChange={(v) => upd({ reminderFrequency: v })} aria="Reminder frequency" /></Field>
                <Field name="Product type"><Choice value={f.productType} options={detail.options.productType} onChange={(v) => upd({ productType: v })} blank="—" aria="Product type" /></Field>
                <Field name="Lead source"><Choice value={f.leadSource} options={detail.options.leadSource} onChange={(v) => upd({ leadSource: v })} blank="—" aria="Lead source" /></Field>
                <Field name="Deal name" wide>
                  <input className={`${inputCls} !h-9 text-[14px]`} value={deal} placeholder="Product type, quantity, city" maxLength={100} onChange={(e) => upd({ dealName: e.target.value, dealTyped: true })} aria-label="Deal name" />
                </Field>
                {more ? (
                  <>
                    <Field name="Reference #"><input className={`${inputCls} !h-9 text-[14px]`} value={f.reference} maxLength={50} onChange={(e) => upd({ reference: e.target.value })} aria-label="Reference number" /></Field>
                    <Field name="Expiry date"><input className={`${inputCls} !h-9 text-[14px]`} type="date" min={detail.today} value={f.expiry} onChange={(e) => upd({ expiry: e.target.value })} aria-label="Expiry date" /></Field>
                  </>
                ) : (
                  <div className="flex items-end"><button className={`${btn.quiet} !h-9`} onClick={() => setMore(true)}>+ Reference #, expiry date</button></div>
                )}
              </div>

              <div className="mt-3 flex items-baseline justify-between">
                <p className={label}>Items</p>
                {detail.last && <p className="text-[13px] text-muted">Started from {detail.last.number} ({fmtDay(detail.last.date)}) · <button className="font-semibold text-brand hover:underline" onClick={() => setLines([blank()])}>start empty</button></p>}
              </div>
              <div>
                <div>
                  <div className={`${GRID} mt-1 !hidden text-[13px] text-muted sm:!grid`}>
                    <span>Item</span><span>Stock</span><span className="text-right">Qty</span><span className="text-right">Rate (before tax)</span><span className="text-right">GST</span><span className="text-right">Amount</span><span />
                  </div>
                  <div className="mt-1 space-y-1.5">
                    {lines.map((l) => (
                      <div key={l.key}>
                        <div className={GRID}>
                          <div className="col-span-full min-w-0 sm:col-span-1">
                            <ItemPicker items={items} value={l.name} onPick={(i) => pick(l.key, i)} />
                          </div>
                          <span className="hidden sm:block"><StockCell item={l.itemId ? byId.get(l.itemId) : undefined} /></span>
                          <input className={`${inputCls} !h-9 text-right text-[14px] num`} type="number" min={1} value={l.qty} onChange={(e) => set(l.key, { qty: Number(e.target.value) })} aria-label="Quantity" />
                          <input className={`${inputCls} !h-9 text-right text-[14px] num`} type="number" min={0} value={l.rate} onChange={(e) => set(l.key, { rate: Number(e.target.value) })} aria-label="Rate before tax" />
                          <span className="num hidden text-right text-[14px] text-ink-2 sm:block">{!l.itemId ? "" : detail.customer.tax === "none" ? "—" : l.gst === null ? "?" : `${l.gst}%`}</span>
                          <span className="num text-right text-[14px] text-ink">{l.itemId ? inr2(l.qty * l.rate) : "—"}</span>
                          <button className="rounded-full text-[15px] text-muted hover:text-high" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blank()]))} aria-label="Remove item">✕</button>
                        </div>
                        {l.itemId && (
                          l.open ? (
                            <textarea className={`${inputCls} mt-1 !h-auto py-1.5 text-[13.5px] leading-snug`} rows={Math.min(8, Math.max(2, (l.description ?? "").split("\n").length))} value={l.description ?? ""} onChange={(e) => set(l.key, { description: e.target.value })} aria-label={`Description of ${l.name}`} autoFocus />
                          ) : (
                            <button className="mt-0.5 block w-full truncate pl-3 text-left text-[13px] text-muted hover:text-ink" onClick={() => set(l.key, { open: true })} title="Edit the description on the quotation">
                              {l.description ? <>✎ {l.description.split("\n")[0]}{l.description.includes("\n") ? " …" : ""}</> : "✎ Add a description"}
                            </button>
                          )
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <button className={`${btn.quiet} mt-1.5`} onClick={() => setLines((ls) => [...ls, blank()])}>+ Add item</button>

              <div className="mt-2 grid gap-5 border-t border-line pt-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
                <div className="min-w-0 text-[13.5px] text-muted">
                  <p>Zoho adds each item&apos;s GST and sends its standard quotation email with the PDF.{t.noGst && " An item's GST isn't known here yet (?) — Zoho adds it."}</p>
                  <button className="mt-2 font-semibold text-brand hover:underline" onClick={() => setNotesOpen((o) => !o)}>{notesOpen ? "▾" : "▸"} Customer notes &amp; terms</button>
                  {notesOpen && (
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <Field name="Customer notes"><textarea className={`${inputCls} !h-auto py-1.5 text-[13.5px]`} rows={6} value={f.notes} onChange={(e) => upd({ notes: e.target.value })} aria-label="Customer notes" /></Field>
                      <Field name="Terms & conditions"><textarea className={`${inputCls} !h-auto py-1.5 text-[13.5px]`} rows={6} value={f.terms} onChange={(e) => upd({ terms: e.target.value })} aria-label="Terms and conditions" /></Field>
                    </div>
                  )}
                </div>
                <div className="space-y-1 self-start rounded-xl bg-surface-2 px-4 py-2.5 text-[14px] sm:[&_span]:whitespace-nowrap">
                  <div className="flex justify-between"><span className="text-ink-2">Sub total</span><span className="num text-ink">{inr2(t.sub)}</span></div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink-2">Discount</span>
                    <span className="flex items-center gap-1.5">
                      <input className={`${inputCls} !h-8 !w-16 text-right text-[13.5px] num sm:!w-20`} type="number" min={0} value={f.discount} placeholder="0" onChange={(e) => upd({ discount: e.target.value })} aria-label="Discount" />
                      <select className={`${inputCls} !h-8 !w-14 px-1 text-[13.5px]`} value={f.discountPct ? "%" : "₹"} onChange={(e) => upd({ discountPct: e.target.value === "%" })} aria-label="Discount in % or ₹"><option>%</option><option>₹</option></select>
                      <span className="num w-20 text-right text-ink sm:w-24">{t.discount ? `−${inr2(t.discount)}` : "0"}</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink-2">Shipping charges</span>
                    <span className="flex items-center gap-1.5">
                      <input className={`${inputCls} !h-8 !w-24 text-right sm:!w-[8.4rem] text-[13.5px] num`} type="number" min={0} value={f.shipping} placeholder="0" onChange={(e) => upd({ shipping: e.target.value })} aria-label="Shipping charges" />
                      <span className="num w-20 text-right text-ink sm:w-24">{inr2(t.shipping)}</span>
                    </span>
                  </div>
                  {t.taxes.map((x) => <div key={x.label} className="flex justify-between"><span className="text-ink-2">{x.label}</span><span className="num text-ink">{inr2(x.amount)}</span></div>)}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink-2">Adjustment</span>
                    <span className="flex items-center gap-1.5">
                      <input className={`${inputCls} !h-8 !w-24 text-right sm:!w-[8.4rem] text-[13.5px] num`} type="number" value={f.adjustment} placeholder="0" onChange={(e) => upd({ adjustment: e.target.value })} aria-label="Adjustment" />
                      <span className="num w-20 text-right text-ink sm:w-24">{inr2(t.adjustment)}</span>
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-line pt-2 text-[17px] font-bold text-ink"><span>Total</span><span className="num">{inr2(t.total)}</span></div>
                </div>
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
