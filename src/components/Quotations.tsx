"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { celebrate } from "@/lib/confetti";
import { useStore } from "@/lib/store";
import { GSTIN_RE, GST_LABEL, fromGstin, gstTreatment } from "@/lib/gstin";
import { btn, inputCls } from "./ui";
import { docStatus } from "@/lib/docStatus";
import { hasFullAccess, isAdmin } from "@/lib/roles";
import { type ItemFields, STOCK_OPTIONS, UPLOAD_TEST_ITEM } from "@/lib/itemEdit";
import { useSession } from "@/lib/session";
import type { AddedPerson } from "@/lib/quotations";
import { zohoUrl } from "@/lib/zohoLinks";
import { onItemsPage } from "@/lib/itemsPage";
import { type QuoteEmailInput, TEMPLATES, type TopicId, ZIA_MAILBOX, buildQuoteEmail, mergeCc, suggestTemplate, topicsOf, ziaEmailHtml, ziaSubject } from "@/lib/quoteEmails";

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
type ListRes = { connected: { connectedAt: string; connectedBy: string; newCustomers: boolean } | null; scopes: string; states: [string, string][]; admin: boolean; live: boolean; customerTypes: string[]; customerSectors: string[]; total: number; page: number; pageSize: number; sectors: string[]; types: string[]; customers: Customer[]; error?: string };
type Item = { id: string; name: string; group: string | null; rate: number | null; gst: number | null; unit: string | null; stock: string | null; service: boolean; onHand: number | null; category: string | null; image: boolean | null; demand?: number; brochure?: string | null };
type Contact = { id: string; name: string | null; email: string | null; phone: string | null; primary: boolean };
type Line = { key: number; itemId: string; name: string; qty: number; rate: number; gst: number | null; description?: string; open?: boolean };
type Opts = { sendToCrm: string[]; reminderFrequency: string[]; productType: string[]; leadSource: string[] };
type Detail = {
  contacts: Contact[];
  customer: { gstin: string | null; state: string | null; city: string | null; place: string | null; tax: "intra" | "inter" | "none" };
  last: { number: string; date: string; salesperson: string | null; fields: Record<string, string>; lines: Omit<Line, "key">[]; draftId?: string } | null;
  recent: { number: string; date: string; days: number } | null;
  salespeople: string[]; salesperson: string | null; options: Opts; notes: string; terms: string; today: string; error?: string;
};
/** The quote's own fields, as in Zoho's form. Send to CRM and Reminder Frequency are mandatory in Zoho. */
type Form = {
  salesperson: string; sendToCrm: string; reminderFrequency: string; productType: string; ptTyped: boolean; leadSource: string; dealName: string; dealTyped: boolean;
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

/**
 * Product Type from what an item is (owner, 28 Oct: "by default they should take whatever they come under"): its name,
 * Zoho group (Item Identifier) and category, matched to Zoho's Product Type options. Most specific first.
 */
const PT_RULES: [RegExp, string][] = [
  [/cabinet/, " AED Cabinet"], [/fire blanket/, " Fire Blanket"], [/evacuat/, " Evacuation "], [/ambulance/, " Ambulance Service"],
  [/trauma/, "Trauma Kit"], [/\b5 ?su\b/, " 5SU"], [/maintenance|\bamc\b/, "AED Maintenance"], [/fire/, "Fire Safety"],
  [/(cpr|bls)[^|]*training|training[^|]*(cpr|bls)/, " CPR Training"], [/first aid[^|]*training|training[^|]*first aid/, "First Aid Training "],
  [/manikin|trainer|training product/, "Training Products"], [/training/, "Training "],
  [/pad|electrode/, "pads"], [/batter/, "Battery"], [/sign|case|bag|bracket|accessor|wall mount/, "AED Accessories "],
  [/\baed\b|defibrillator|powerheart|zoll|philips|heartsine/, "AED"], [/first aid|safety|kit|ppe|mask|glove/, "SAFETY Supplies"],
];
const NOT_MAIN = /packing|shipping|freight|courier|forwarding|transport/i;
function productTypeFor(lines: Line[], byId: Map<string, Item>, options: string[]) {
  const main = lines.filter((l) => l.itemId && !NOT_MAIN.test(l.name)).sort((a, b) => b.qty * b.rate - a.qty * a.rate)[0];
  if (!main) return "";
  const i = byId.get(main.itemId);
  const text = [main.name, i?.group, i?.category].filter(Boolean).join(" | ").toLowerCase();
  const hit = PT_RULES.find(([re]) => re.test(text))?.[1] ?? "Other";
  return options.includes(hit) ? hit : "";
}

/** Deal Name the way the team writes it: product type, quantity of the main item, city ("pads 2 Bengaluru Urban"). */
function dealName(productType: string, lines: Line[], city: string | null) {
  if (!productType.trim()) return "";
  const main = lines.filter((l) => l.itemId && !NOT_MAIN.test(l.name)).sort((a, b) => b.qty * b.rate - a.qty * a.rate)[0];
  return [productType.trim(), main ? String(main.qty) : "", city ?? ""].filter(Boolean).join(" ");
}
const fmtDay = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const ago = (ymd: string) => { const d = Math.round((Date.now() - Date.parse(`${ymd}T00:00:00+05:30`)) / 86_400_000); return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 60 ? `${d} days ago` : d < 730 ? `${Math.round(d / 30)} months ago` : `${Math.round(d / 365)} years ago`; };

/** No background scrolling while a popup is open (like the card popup). Nested popups restore in order. */
function useNoPageScroll() {
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => { root.style.overflow = prev; };
  }, []);
}

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
  const [quoting, setQuoting] = useState<{ c: Customer; fresh: boolean } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [starting, setStarting] = useState(false);
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
        <select className={`select-chevron ${inputCls} !h-10 !w-auto text-[14px]`} value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector">
          <option value="">Every sector</option>
          {res?.sectors.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={`select-chevron ${inputCls} !h-10 !w-auto text-[14px]`} value={type} onChange={(e) => setType(e.target.value)} aria-label="Customer type">
          <option value="">Every customer type</option>
          {res?.types.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={`select-chevron ${inputCls} !h-10 !w-auto text-[14px]`} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Order">
          {SORTS.map(([v, w]) => <option key={v} value={v}>{w}</option>)}
        </select>
        {connectedLine(res, () => setConnecting(true))}
        <button className={btn.primary} onClick={() => setStarting(true)} disabled={!res?.connected}>+ New quotation</button>
      </div>

      <div className="card mt-4 overflow-hidden">
        <table className="w-full text-left text-[15px]">
          <thead className="border-b border-line text-[13px] text-muted">
            <tr>
              <SortHead label="Customer" sort={sort} keys={["name", "name_desc"]} onSort={setSort} />
              <th className="hidden px-4 py-3 font-medium md:table-cell">Contact</th>
              <SortHead label="Last quotation" sort={sort} keys={["quote", "quote_old"]} onSort={setSort} className="hidden lg:table-cell" />
              <SortHead label="Last bought" sort={sort} keys={["bought"]} onSort={setSort} className="hidden xl:table-cell" />
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className={`divide-y divide-line ${loading ? "opacity-60" : ""}`}>
            {res?.customers.map((c) => (
              <tr key={c.id} className={`hover:bg-surface-2/60 ${res.connected ? "cursor-pointer" : ""}`} onClick={(e) => { if (res.connected && !(e.target as Element).closest("a, button, input")) setQuoting({ c, fresh: false }); }}>
                <td className="px-4 py-2.5">
                  <div className="font-medium text-ink">{c.name}</div>
                  <div className="text-[13px] text-muted">{[c.type, c.sector].filter(Boolean).join(" · ") || "—"}</div>
                </td>
                <td className="hidden px-4 py-2.5 md:table-cell">
                  <div className="break-all text-ink-2">{c.email ?? <span className="text-faint">no email</span>}</div>
                  <div className="num text-[13px] text-muted">{c.phone ?? ""}</div>
                </td>
                <td className="hidden px-4 py-2.5 lg:table-cell">
                  {c.lastQuote ? <><div className="flex flex-wrap items-center gap-x-1.5 text-ink-2"><span><span className="num">{inr(c.lastQuote.amount)}</span> · {c.lastQuote.number}</span><StatusChip status={c.lastQuote.status} /></div><div className="text-[13px] text-muted">{fmtDay(c.lastQuote.date)} · {ago(c.lastQuote.date)}</div></> : <span className="text-faint">never</span>}
                </td>
                <td className="hidden px-4 py-2.5 text-ink-2 xl:table-cell">{c.lastInvoice ? <>{fmtDay(c.lastInvoice)}<div className="text-[13px] text-muted">{ago(c.lastInvoice)}</div></> : <span className="text-faint">never</span>}</td>
                <td className="px-4 py-2.5 text-right">
                  <button className={btn.primary} onClick={() => setQuoting({ c, fresh: false })} disabled={!res.connected} title={res.connected ? `Make a quotation for ${c.name}` : "Zoho Books isn't connected for quotations yet"}>Quote</button>
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
      {quoting && res && createPortal(<QuotePopup customer={quoting.c} fresh={quoting.fresh} live={res.live} onClose={(sent) => { setQuoting(null); if (sent) setTick((t) => t + 1); }} />, document.body)}
      {starting && res && createPortal(<NewQuote res={res} onPick={(c) => { setStarting(false); setQuoting({ c, fresh: true }); }} onClose={() => setStarting(false)} />, document.body)}
      {connecting && res && createPortal(<ConnectBooks scopes={res.scopes} onClose={(ok) => { setConnecting(false); if (ok) setTick((t) => t + 1); }} />, document.body)}
    </div>
  );
}

/** Quick sorts (owner, 30 Oct: "we need some quick sorting here") — the server orders the whole list, then pages it. */
const SORTS: [string, string][] = [
  ["recent", "Latest quote or purchase first"], ["name", "A–Z"], ["name_desc", "Z–A"], ["quote", "Last quotation: newest first"],
  ["quote_old", "Last quotation: oldest first"], ["amount", "Last quotation: biggest first"], ["bought", "Last bought: newest first"], ["never", "Never quoted first"],
];
/** A column heading that sorts: a click picks its first order, a second click its other one (↑ / ↓). */
function SortHead({ label, sort, keys, onSort, className = "" }: { label: string; sort: string; keys: string[]; onSort: (k: string) => void; className?: string }) {
  const at = keys.indexOf(sort);
  const next = keys[(at + 1) % keys.length];
  return (
    <th className={`px-4 py-3 font-medium ${className}`} aria-sort={at < 0 ? "none" : sort.endsWith("_desc") || sort === "quote_old" ? "ascending" : "descending"}>
      <button className={`inline-flex items-center gap-1 hover:text-ink ${at >= 0 ? "text-ink" : ""}`} onClick={() => onSort(at >= 0 && keys.length === 1 ? "recent" : next)} title={`Sort by ${label.toLowerCase()}`}>
        {label}<span aria-hidden className="text-[11px]">{at < 0 ? "↕" : keys.length === 1 ? "↓" : at === 0 ? (keys[0] === "name" ? "↑" : "↓") : keys[0] === "name" ? "↓" : "↑"}</span>
      </button>
    </th>
  );
}

/** Draft / Sent / Accepted / Declined / Expired / Invoiced — the quotation's status in Zoho (docStatus.ts). */
function StatusChip({ status }: { status?: string }) {
  const s = docStatus(status);
  return s ? <span className={`rounded px-1.5 py-px text-[11.5px] font-semibold ${s.tone}`}>{s.label}</span> : null;
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
/** Type to find an item; ↑ ↓ to move, Enter picks (the first match by default), Esc closes (#150 step 6). */
function ItemPicker({ items, value, onPick, autoFocus }: { items: Item[]; value: string; onPick: (i: Item) => void; autoFocus?: boolean }) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  useEffect(() => setText(value), [value]);
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = open ? items.filter((i) => words.every((w) => i.name.toLowerCase().includes(w))).slice(0, 8) : [];
  const keys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); setAt((x) => Math.max(0, Math.min(hits.length - 1, x + (e.key === "ArrowDown" ? 1 : -1)))); }
    else if (e.key === "Enter" && hits.length) { e.preventDefault(); onPick(hits[Math.min(at, hits.length - 1)]); setOpen(false); }
    else if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); }
  };
  return (
    <div className="relative min-w-0 flex-1">
      <input className={`${inputCls} !h-9 text-[14px]`} value={text} placeholder="Type to find an item…" autoFocus={autoFocus} onKeyDown={keys} onChange={(e) => { setText(e.target.value); setOpen(true); setAt(0); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => { setOpen(false); setText(value); }, 150)} aria-label="Item" />
      {hits.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-pop">
          {hits.map((i, n) => (
            <li key={i.id}>
              <button type="button" className={`flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-[14px] hover:bg-surface-2 ${n === at ? "bg-surface-2" : ""}`} onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(i); setOpen(false); }}>
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
    <select className={`select-chevron ${inputCls} !h-9 text-[14px]`} value={value} onChange={(e) => onChange(e.target.value)} aria-label={aria}>
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

/** `fresh` ("New quotation"): from scratch — no lines or fields from their last quote (it can still be copied in). */
function QuotePopup({ customer, fresh = false, start, live, onClose }: { customer: Customer; fresh?: boolean; start?: Item[]; live: boolean; onClose: (sent: boolean) => void }) {
  useNoPageScroll();
  const { toast } = useStore();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [to, setTo] = useState<string[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  // Dragging a line by its grip (owner, 3 Nov: "let me hold n pull them up n down"): where it started, how far it moved,
  // and the rows' middles then — the drop goes where the dragged row's middle ends up.
  const rowEls = useRef(new Map<number, HTMLDivElement>());
  const [drag, setDrag] = useState<{ key: number; from: number; startY: number; dy: number; mids: number[] } | null>(null);
  const dropAt = drag ? drag.mids.filter((m, i) => i !== drag.from && m < drag.mids[drag.from] + drag.dy).length : -1;
  const moveLine = (from: number, to: number) => setLines((ls) => {
    if (to < 0 || to >= ls.length || to === from) return ls;
    const a = [...ls];
    const [x] = a.splice(from, 1);
    a.splice(to, 0, x);
    return a;
  });
  const startDrag = (e: React.PointerEvent<HTMLButtonElement>, key: number) => {
    const from = lines.findIndex((l) => l.key === key);
    const mids = lines.map((l) => { const r = rowEls.current.get(l.key)?.getBoundingClientRect(); return r ? r.top + r.height / 2 : 0; });
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ key, from, startY: e.clientY, dy: 0, mids });
  };
  const endDrag = () => { if (drag) moveLine(drag.from, dropAt); setDrag(null); };
  const [f, setF] = useState<Form | null>(null);
  const [more, setMore] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [busy, setBusy] = useState<"" | "send" | "draft">("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ estimateId: string; number: string; total: number; url: string; ours: number; emailedTo?: string } | null>(null);
  // After "Save and email…" (#150 step 5) the done screen is the email step until it's sent or skipped.
  const [emailing, setEmailing] = useState(false);
  // Their newest quotation is still a draft (owner, 30 Oct: "Save and email" → back → reopened → a second quotation was
  // made): opening them continues that draft — saving updates it in Zoho; "start a new quotation" makes another.
  const [newInstead, setNewInstead] = useState(fresh);
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
      // Ticked on the Items page (owner, 4 Nov): those, with their rate and GST; the descriptions come as when picked.
      const ticked = start?.map((i) => ({ i, line: row({ itemId: i.id, name: i.name, qty: 1, rate: i.rate || 0, gst: i.gst }) }));
      setLines(ticked?.length ? ticked.map((x) => x.line) : !fresh && j.last?.lines.length ? j.last.lines.map((l) => row(l)) : [blank()]);
      ticked?.forEach((x) => describe(x.line.key, x.i));
      // The quote's fields: Send to CRM Yes (owner, 28 Oct); the rest from their last quotation where it had them.
      const was = (k: keyof Opts, fallback: string) => { const v = (!fresh && j.last?.fields[k]) || ""; return j.options[k].includes(v) ? v : fallback; };
      setF({
        salesperson: (j.salespeople.includes(lastSalesperson()) ? lastSalesperson() : j.salesperson) ?? "", sendToCrm: "Yes", reminderFrequency: was("reminderFrequency", "15 days"), productType: was("productType", ""), ptTyped: false, leadSource: was("leadSource", "Direct "),
        dealName: "", dealTyped: false, reference: "", expiry: "", discount: "", discountPct: true, shipping: "", adjustment: "", notes: j.notes, terms: j.terms,
      });
    }).catch(() => current && setDetail({ error: "Couldn't reach the server" } as Detail));
    return () => { current = false; };
  }, [customer.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const pick = (k: number, i: Item) => {
    set(k, { itemId: i.id, name: i.name, rate: i.rate || 0, gst: i.gst, description: undefined });
    describe(k, i);
  };
  // Zoho puts the item's description on the line — read it now (and the GST %, if the item list is older than the item).
  const describe = (k: number, i: Item) => {
    fetch(`/api/quotations?item=${i.id}`).then((r) => r.json()).then((j: { description?: string; gst?: number | null }) => {
      setLines((ls) => ls.map((l) => (l.key === k && l.itemId === i.id ? { ...l, description: l.description ?? j.description ?? "", gst: l.gst ?? j.gst ?? null } : l)));
    }).catch(() => {});
  };
  /** From the catalogue: one more if it's already on the quote, else into the first empty line (or a new one). */
  const addItem = (i: Item) => {
    const have = lines.find((l) => l.itemId === i.id);
    if (have) return set(have.key, { qty: have.qty + 1 });
    const empty = lines.find((l) => !l.itemId);
    const k = empty?.key ?? ++key.current;
    if (!empty) setLines((ls) => [...ls, { key: k, itemId: "", name: "", qty: 1, rate: 0, gst: null }]);
    pick(k, i);
  };
  const upd = (patch: Partial<Form>) => setF((x) => (x ? { ...x, ...patch } : x));
  // Keyboard (#150 step 6): an item picked → its quantity; Enter in a quantity or rate → a new line, its item box.
  const [focusKey, setFocusKey] = useState(0);
  const focusQty = (k: number) => setTimeout(() => document.querySelector<HTMLInputElement>(`[data-qty="${k}"]`)?.select(), 0);
  const enterAdds = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const empty = lines.find((l) => !l.itemId);
    if (empty) return setFocusKey(empty.key);
    const b = blank();
    setLines((ls) => [...ls, b]);
    setFocusKey(b.key);
  };

  const draftId = !newInstead ? detail?.last?.draftId : undefined;
  const filled = lines.filter((l) => l.itemId);
  const t = f && detail?.customer ? totals(lines, f, detail.customer.tax) : null;
  // Product type follows the main item until someone picks one; then the deal name follows the product type.
  const pt = !f ? "" : f.ptTyped ? f.productType : productTypeFor(lines, byId, detail?.options?.productType ?? []) || f.productType;
  const deal = f ? (f.dealTyped ? f.dealName : dealName(pt, lines, detail?.customer?.city ?? null)) : "";
  const why = !live ? "Only the live site creates quotations" : !filled.length ? "Add at least one item" : filled.some((l) => !(l.qty > 0)) ? "Every item needs a quantity"
    : !f?.sendToCrm || !f.reminderFrequency ? "Fill in Send to CRM and Reminder frequency" : t && t.discount > t.sub ? "The discount is more than the items" : "";
  const whySend = why || (!to.length ? "Pick who it goes to" : "");

  // Both save the quotation in Zoho without Zoho's standard email; "Save and email…" then opens our email step
  // (Zoho's template, its PDF attached, + your attachments).
  const submit = async (send: boolean) => {
    if (!f || !t) return;
    try { if (f.salesperson) localStorage.setItem(SALESPERSON_KEY, f.salesperson); } catch {}
    if (send && detail?.recent && !draftId && !confirm(`${detail.recent.number} went to ${customer.name} ${detail.recent.days === 0 ? "today" : `${detail.recent.days} days ago`}. Send another?`)) return;
    setBusy(send ? "send" : "draft");
    setError("");
    try {
      const details = {
        salesperson: f.salesperson || undefined, sendToCrm: f.sendToCrm, reminderFrequency: f.reminderFrequency, productType: pt || undefined, leadSource: f.leadSource || undefined,
        dealName: deal || undefined, reference: f.reference || undefined, expiry: f.expiry || undefined,
        discount: Number(f.discount) > 0 ? { value: Number(f.discount), percent: f.discountPct } : undefined, shipping: Number(f.shipping) || undefined, adjustment: Number(f.adjustment) || undefined,
        notes: f.notes, terms: f.terms,
      };
      const estimateId = draftId ?? undefined;
      const r = await fetch("/api/quotations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId: customer.id, contactPersonIds: to, send: false, estimateId, details, lines: filled.map(({ itemId, qty, rate, description }) => ({ itemId, qty, rate, description })) }) });
      const j = (await r.json()) as { ok?: boolean; error?: string; quote?: { estimateId: string; number: string; total: number; url: string } };
      if (!r.ok || !j.quote) throw new Error(j.error ?? "Couldn't create the quotation");
      setDone({ ...j.quote, ours: t.total });
      setEmailing(send);
      toast({ text: `${j.quote.number} saved in Zoho Books for ${customer.name}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the quotation");
    }
    setBusy("");
  };

  const { member } = useSession();
  // A new email on the customer: it joins the list here (and in the email step) and goes on this quote.
  const addContact = (p: AddedPerson) => {
    setDetail((d) => (d && !d.contacts.some((x) => x.id === p.id) ? { ...d, contacts: [...d.contacts, { id: p.id, name: p.name, email: p.email, phone: null, primary: false }] } : d));
    setTo((x) => (x.includes(p.id) ? x : [...x, p.id]));
    toast({ text: p.existed ? `${p.email} was already on ${customer.name}` : `${p.email} added to ${customer.name} in Zoho Books` });
  };
  const emails = detail?.contacts?.filter((c) => to.includes(c.id)).map((c) => c.email).join(", ");
  const c = detail?.customer;
  const gstLine = c && (c.tax === "none" ? "Outside India · no GST" : [c.gstin && `GSTIN ${c.gstin}`, c.state, c.tax === "intra" ? "CGST + SGST" : "IGST (outside Maharashtra)"].filter(Boolean).join(" · "));
  return (
    <div className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/30 p-3" onMouseDown={busy ? undefined : () => onClose(Boolean(done))}>
      <div role="dialog" aria-label={`Quotation for ${customer.name}`} className="modal-in flex max-h-[96vh] w-full min-w-0 max-w-[88rem] flex-col rounded-2xl bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-6 pt-5">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">{draftId && !done ? `Draft ${detail?.last?.number}` : "New quotation"}</p>
            <h3 className="truncate text-[21px] font-bold tracking-tight text-ink" title={customer.name}>{customer.name}</h3>
            {gstLine && <p className="text-[13.5px] text-muted">{gstLine}</p>}
          </div>
          <button className={btn.quiet} onClick={() => onClose(Boolean(done))} aria-label="Close" disabled={Boolean(busy)}>✕</button>
        </div>

        {done && emailing ? (
          <EmailStep quote={done} live={live} customerId={customer.id} onContact={addContact} known={detail?.contacts ?? []} onBack={() => setEmailing(false)}
            compose={{
              company: customer.name, number: done.number, total: done.total, expiry: f?.expiry || null, salesperson: f?.salesperson || null,
              signer: member && !isAdmin(member) ? member.name : null,
              contact: detail?.contacts?.find((x) => to.includes(x.id))?.name ?? null,
              // Outside India the quote has no GST, whatever the item's rate says.
              lines: lines.filter((l) => l.itemId).map((l) => ({ name: l.name, qty: l.qty, group: byId.get(l.itemId)?.group ?? null, rate: l.rate, gst: c?.tax === "none" ? null : l.gst })),
            }}
            onSent={(list, from) => { setDone((d) => d && { ...d, emailedTo: list }); setEmailing(false); celebrate(from); toast({ text: `${done.number} emailed to ${list}` }); }} />
        ) : done ? (
          // The done screen (#150 step 4): Zoho's PDF to download, and the email step.
          <div className="px-6 py-8 text-center">
            <p className="text-[22px] font-bold text-low">{done.emailedTo ? "Emailed" : "Saved"} · {done.number}</p>
            <p className="mt-1 text-[15px] text-ink-2">{done.emailedTo ? <>Zoho Books emailed it to {done.emailedTo} and marked it Sent.</> : <>It&apos;s in Zoho Books as a draft.</>} Total incl. GST <b className="num">{inr2(done.total)}</b>.</p>
            {Math.abs(done.total - done.ours) > 1 && <p className="mt-1 text-[14px] text-medium">This page worked out {inr2(done.ours)} — Zoho&apos;s total is the one on the quotation; check it there.</p>}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <a className={btn.ghost} href={done.url} target="_blank" rel="noreferrer">Open in Zoho Books</a>
              <a className={btn.ghost} href={`/api/quotations?${new URLSearchParams({ pdf: done.estimateId, name: done.number })}`} download>⬇ Download PDF</a>
              {!done.emailedTo && <button className={btn.ghost} onClick={() => setEmailing(true)}>✉ Email it…</button>}
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
              {draftId && <p className="mb-3 rounded-xl border border-brand/40 bg-brand-soft px-3 py-2 text-[14px] text-ink">Continuing the draft <b>{detail.last!.number}</b> ({fmtDay(detail.last!.date)}) — saving updates it in Zoho Books, no second quotation. <button className="font-semibold text-brand hover:underline" onClick={() => { setNewInstead(true); setLines([blank()]); }}>Start a new quotation instead</button></p>}
              {detail.recent && !draftId && <p className="mb-3 rounded-xl border border-medium/50 bg-medium-bg px-3 py-2 text-[14px] font-medium text-medium">⚑ {detail.recent.number} went to them {detail.recent.days === 0 ? "today" : `${detail.recent.days} days ago`} — a quotation is valid 15 days.</p>}

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
                <AddEmail customerId={customer.id} live={live} onAdded={addContact} />
                {!detail.contacts.some((p) => p.email) && <p className="basis-full text-[14px] text-high">No contact person with an email yet. Add one here, or save it as a draft.</p>}
              </div>

              <div className="mt-3 grid gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
                <Field name="Sales person">
                  <Choice value={f.salesperson} options={detail.salespeople} onChange={(v) => upd({ salesperson: v })} blank="Zoho's default" aria="Sales person" />
                </Field>
                <Field name="Send to CRM" required><Choice value={f.sendToCrm} options={detail.options.sendToCrm} onChange={(v) => upd({ sendToCrm: v })} aria="Send to CRM" /></Field>
                <Field name="Reminder frequency" required><Choice value={f.reminderFrequency} options={detail.options.reminderFrequency} onChange={(v) => upd({ reminderFrequency: v })} aria="Reminder frequency" /></Field>
                <Field name="Product type"><Choice value={pt} options={detail.options.productType} onChange={(v) => upd({ productType: v, ptTyped: true })} blank="—" aria="Product type" /></Field>
                <Field name="Lead source"><Choice value={f.leadSource} options={detail.options.leadSource} onChange={(v) => upd({ leadSource: v })} blank="—" aria="Lead source" /></Field>
                <Field name="Deal name" wide>
                  <input className={`${inputCls} !h-9 text-[14px]`} value={deal} placeholder="Product type, quantity, city" maxLength={100} onChange={(e) => upd({ dealName: e.target.value, dealTyped: true })} aria-label="Deal name" />
                </Field>
                {more ? (
                  <>
                    <Field name="Reference #"><input className={`${inputCls} !h-9 text-[14px]`} value={f.reference} maxLength={50} onChange={(e) => upd({ reference: e.target.value })} aria-label="Reference number" /></Field>
                    <Field name="Expiry date"><input className={`${inputCls} !h-9 text-[14px]`} type="date" min={detail.today} max="9999-12-31" value={f.expiry} onChange={(e) => upd({ expiry: e.target.value })} aria-label="Expiry date" /></Field>
                  </>
                ) : (
                  <div className="flex items-end"><button className={`${btn.quiet} !h-9`} onClick={() => setMore(true)}>+ Reference #, expiry date</button></div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <p className={label}>Items</p>
                  <button className={`${btn.primary} !h-8`} onClick={() => setBrowsing(true)}>▦ Browse items</button>
                </div>
                {detail.last && fresh && <p className="text-[13px] text-muted">From scratch · <button className="font-semibold text-brand hover:underline" onClick={() => setLines(detail.last!.lines.map((l) => row(l)))}>copy {detail.last.number}</button></p>}
                {detail.last && !fresh && !draftId && <p className="text-[13px] text-muted">Started from {detail.last.number} ({fmtDay(detail.last.date)}) · <button className="font-semibold text-brand hover:underline" onClick={() => setLines([blank()])}>start empty</button></p>}
              </div>
              <div>
                <div>
                  <div className={`${GRID} mt-1 !hidden pl-7 text-[13px] text-muted sm:!grid`}>
                    <span>Item</span><span>Stock</span><span className="text-right">Qty</span><span className="text-right">Rate (before tax)</span><span className="text-right">GST</span><span className="text-right">Amount</span><span />
                  </div>
                  <div className="mt-1 space-y-1.5">
                    {lines.map((l, i) => (
                      <div
                        key={l.key}
                        ref={(el) => { if (el) rowEls.current.set(l.key, el); else rowEls.current.delete(l.key); }}
                        className={`relative rounded-lg pl-7 ${drag?.key === l.key ? "z-10 bg-surface shadow-pop" : ""}`}
                        style={drag?.key === l.key ? { transform: `translateY(${drag.dy}px)` } : undefined}
                      >
                        {/* Where the dragged line will land: above this row, or below it. */}
                        {drag && dropAt !== drag.from && i === dropAt && dropAt < drag.from && <span className="pointer-events-none absolute -top-1 left-0 right-0 h-0.5 rounded bg-brand" />}
                        {drag && dropAt !== drag.from && i === dropAt && dropAt > drag.from && <span className="pointer-events-none absolute -bottom-1 left-0 right-0 h-0.5 rounded bg-brand" />}
                        {lines.length > 1 && (
                          <button
                            type="button"
                            className={`absolute left-0 top-1.5 grid h-6 w-6 touch-none place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink ${drag?.key === l.key ? "cursor-grabbing" : "cursor-grab"}`}
                            aria-label={`Move ${l.name || "this line"} — drag, or use the arrow keys`}
                            title="Hold and drag to move this line"
                            onPointerDown={(e) => startDrag(e, l.key)}
                            onPointerMove={(e) => drag?.key === l.key && setDrag({ ...drag, dy: e.clientY - drag.startY })}
                            onPointerUp={endDrag}
                            onPointerCancel={() => setDrag(null)}
                            onKeyDown={(e) => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); moveLine(i, i + (e.key === "ArrowUp" ? -1 : 1)); } }}
                          >
                            <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden><circle cx="7.5" cy="5" r="1.4" /><circle cx="12.5" cy="5" r="1.4" /><circle cx="7.5" cy="10" r="1.4" /><circle cx="12.5" cy="10" r="1.4" /><circle cx="7.5" cy="15" r="1.4" /><circle cx="12.5" cy="15" r="1.4" /></svg>
                          </button>
                        )}
                        <div className={GRID}>
                          <div className="col-span-full min-w-0 sm:col-span-1">
                            <ItemPicker items={items} value={l.name} autoFocus={l.key === focusKey} onPick={(i) => { pick(l.key, i); focusQty(l.key); }} />
                          </div>
                          <span className="hidden sm:block"><StockCell item={l.itemId ? byId.get(l.itemId) : undefined} /></span>
                          <input className={`${inputCls} !h-9 text-right text-[14px] num`} type="number" min={1} value={l.qty} onChange={(e) => set(l.key, { qty: Number(e.target.value) })} onKeyDown={enterAdds} data-qty={l.key} aria-label="Quantity" />
                          <input className={`${inputCls} !h-9 text-right text-[14px] num`} type="number" min={0} value={l.rate} onChange={(e) => set(l.key, { rate: Number(e.target.value) })} onKeyDown={enterAdds} aria-label="Rate before tax" />
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
              <button className={`${btn.ghost} mt-2 !h-8`} onClick={() => setLines((ls) => [...ls, blank()])}>+ Add a line</button>

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
                      <select className={`select-chevron ${inputCls} !h-8 !w-[4.5rem] !pl-2.5 text-[13.5px]`} value={f.discountPct ? "%" : "₹"} onChange={(e) => upd({ discountPct: e.target.value === "%" })} aria-label="Discount in % or ₹"><option>%</option><option>₹</option></select>
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
              <button className={btn.ghost} onClick={() => submit(false)} disabled={Boolean(why) || Boolean(busy)} title={why || "Make it in Zoho Books without emailing it"}>{busy === "draft" ? "Saving…" : draftId ? "Save the draft" : "Save as draft in Zoho"}</button>
              <button className={btn.primary} onClick={() => submit(true)} disabled={Boolean(whySend) || Boolean(busy)} title={whySend || `Save it, then check the email to ${emails} before it goes`}>{busy === "send" ? "Saving…" : "Save and email…"}</button>
            </div>
          </>
        )}
      </div>
      {browsing && createPortal(<Catalogue items={items} lines={lines} onAdd={addItem} onClose={() => setBrowsing(false)} />, document.body)}
    </div>
  );
}

/** The sales person picked last on this computer (#150 step 6) — the next quote starts with them. */
const SALESPERSON_KEY = "th.quotes.salesperson";
const lastSalesperson = () => { try { return localStorage.getItem(SALESPERSON_KEY) ?? ""; } catch { return ""; } };

/** Zoho's email HTML made safe to edit here: no scripts, frames or on… handlers. */
function cleanHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach((n) => n.remove());
  doc.querySelectorAll("*").forEach((el) => { for (const a of [...el.attributes]) if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name); });
  return doc.body.innerHTML;
}
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * The email step (#150 step 5; owner, 28 Oct: "download that quotation directly … attach to email, also give option to
 * add attachments"). Starts from Zoho's own quote email (GET ?email=): To = the quote's contacts, subject and body from
 * Zoho's template, the quote's PDF attached by Zoho; + attachments from this computer (4 MB together). Sent through
 * Zoho Books, which marks the quote Sent and keeps the email in its history. Production only.
 */
function EmailStep({ quote, live, customerId, onContact, known, compose, onBack, onSent }: { quote: { estimateId: string; number: string }; live: boolean; customerId: string; onContact: (p: AddedPerson) => void; known: { email: string | null; name: string | null }[]; compose: QuoteEmailInput; onBack: () => void; onSent: (to: string, from: HTMLElement) => void }) {
  type Draft = { from?: string | null; subject: string; body: string; fileName: string | null; maxBytes: number; to: { email: string; name: string | null; selected: boolean }[]; error?: string; ziaVia?: "flow" | "mail" };
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const body = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    fetch(`/api/quotations?email=${quote.estimateId}`).then((r) => r.json()).then((j: Draft) => {
      setDraft(j);
      if (j.error) return;
      setPicked(j.to.filter((x) => x.selected).map((x) => x.email));
    }).catch(() => setDraft({ subject: "", body: "", fileName: null, maxBytes: 0, to: [], error: "Couldn't reach the server" }));
  }, [quote.estimateId]);
  // Templates (owner, 3 Nov): the tone is picked here, a paragraph per kind of item comes from the quote's items (each
  // can be switched off), names / numbers / dates filled in. "Zoho's standard email" is Zoho's own template.
  const topics = useMemo(() => topicsOf(compose.lines), [compose.lines]);
  const [tpl, setTpl] = useState(() => (compose.lines.length ? suggestTemplate(compose.lines) : "zoho"));
  const [skip, setSkip] = useState<TopicId[]>([]);
  const edited = useRef(false); // typed into the message — switching template asks first
  const fill = (t: string, s: TopicId[]) => {
    if (!draft || draft.error || !body.current) return;
    if (t === "zoho") { setSubject(draft.subject); body.current.innerHTML = cleanHtml(draft.body); }
    else { const e = buildQuoteEmail(t, compose, s); setSubject(e.subject); body.current.innerHTML = e.html; }
    edited.current = false;
  };
  const choose = (t: string, s: TopicId[]) => {
    if (edited.current && !window.confirm("Replace the message you've edited?")) return;
    setTpl(t); setSkip(s); fill(t, s);
  };
  useEffect(() => { fill(tpl, skip); }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps -- once Zoho's email is in
  // Zia (owner, 3 Nov): Zoho Mail's Zia can't be called from here — "Send to Zia" leaves the brief as a draft in
  // learn@'s Zoho Mail, someone has Zia write it there and saves, "Pull from Zia" brings the saved draft in.
  const [ziaText, setZiaText] = useState("");
  const [ziaBusy, setZiaBusy] = useState(false);
  const [ziaMsg, setZiaMsg] = useState("");
  const toZia = async () => {
    setZiaBusy(true); setZiaMsg("");
    const r = await fetch("/api/quotations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zia: { request: ziaText, quote: compose } }) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { ok?: boolean; via?: string; mailbox?: string; error?: string }) : { error: "Couldn't reach the server" };
    if (j.ok && j.via === "flow") {
      // Through Zoho Flow: Zia's email comes back by itself — check every 3 s for up to 2 minutes.
      setZiaMsg("Zia is writing it…");
      for (let i = 0; i < 40 && alive.current; i++) {
        await new Promise((res) => setTimeout(res, 3000));
        if (await fromZia(true)) return setZiaBusy(false);
      }
      setZiaBusy(false);
      if (alive.current) setZiaMsg("Zia hasn't answered in 2 minutes — check the flow in Zoho Flow, or try again.");
      return;
    }
    setZiaBusy(false);
    setZiaMsg(j.ok ? `Draft “${ziaSubject(compose)}” is in ${j.mailbox}'s Zoho Mail → open it, have Zia write the email, save the draft, then Pull from Zia.` : j.error ?? "Couldn't save the draft");
  };
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  /** Brings Zia's email in; `quiet` (while polling the flow): false = not there yet, no message. */
  const fromZia = async (quiet = false): Promise<boolean> => {
    if (!quiet) { setZiaBusy(true); setZiaMsg(""); }
    const r = await fetch(`/api/quotations?zia=${encodeURIComponent(quote.number)}`).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { subject?: string; html?: string; text?: string; error?: string; waiting?: boolean }) : { error: "Couldn't reach the server" };
    if (!quiet) setZiaBusy(false);
    // Through Zoho Flow it's just Zia's words: the item table and the sender's signature go with them. A Zoho Mail draft is the whole email.
    const html = j.text != null ? ziaEmailHtml(j.text, compose) : j.html;
    if (j.waiting || (quiet && (j.error || html == null))) return false;
    if (j.error || html == null) { setZiaMsg(j.error ?? "Nothing came back"); return false; }
    if (edited.current && !window.confirm("Replace the message you've edited?")) { setZiaMsg("Zia's email is ready — Pull from Zia to put it in."); return true; }
    // Zia may have written a subject; the draft's own one ("Zia · QT-… · …") isn't for the customer.
    const subj = (j.subject ?? "").trim();
    if (subj && subj !== ziaSubject(compose)) setSubject(subj.replace(/^Zia\s*·\s*/, ""));
    if (body.current) body.current.innerHTML = cleanHtml(html);
    edited.current = false;
    setZiaMsg("Zia wrote it — check it before sending.");
    return true;
  };
  const size = files.reduce((n, f) => n + f.size, 0);
  const max = draft?.maxBytes || 4 * 1024 * 1024;
  const to = picked;
  // Everyone on the customer: the quote's own, and emails added since (kept apart from `draft`, whose change refills the message).
  const people = draft ? [...draft.to, ...known.filter((k) => k.email && !draft.to.some((x) => x.email.toLowerCase() === k.email!.toLowerCase())).map((k) => ({ email: k.email!, name: k.name, selected: false }))] : [];
  const why = !live ? "Only the live site sends email" : !to.length ? "Pick who it goes to" : !subject.trim() ? "Type a subject" : size > max ? "Attachments are over 4 MB together" : "";
  const send = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const from = e.currentTarget;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("estimateId", quote.estimateId);
    form.set("to", to.join(","));
    form.set("cc", cc);
    form.set("subject", subject);
    form.set("body", body.current?.innerHTML ?? "");
    if (draft?.fileName) form.set("fileName", draft.fileName);
    for (const f of files) form.append("attachments", f, f.name);
    const r = await fetch("/api/quotations", { method: "POST", body: form }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }) : { error: "Couldn't reach the server" };
    setBusy(false);
    if (!j.ok) return setError(j.error ?? "Couldn't send the email");
    onSent(to.join(", "), from);
  };
  const label = "text-[12.5px] font-bold uppercase tracking-wide text-muted";
  if (!draft) return <p className="px-6 py-10 text-center text-[15px] text-muted">Getting Zoho&apos;s email for {quote.number}…</p>;
  if (draft.error) return (
    <div className="px-6 py-10 text-center"><p className="text-[15px] text-high">{draft.error}</p><button className={`${btn.ghost} mt-4`} onClick={onBack}>Back</button></div>
  );
  return (
    <>
      <div className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
        {draft.from && <p className="text-[14px] text-ink-2"><span className={label}>From</span> <span className="ml-1">{draft.from}</span></p>}
        <div>
          <span className={label}>To</span>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {people.map((x) => (
              <label key={x.email} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[14px] ${picked.includes(x.email) ? "border-brand bg-brand-soft text-ink" : "border-line text-ink-2"}`}>
                <input type="checkbox" className="accent-[var(--brand)]" checked={picked.includes(x.email)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, x.email] : p.filter((m) => m !== x.email)))} />
                {x.name ? <>{x.name} <span className="text-muted">{x.email}</span></> : x.email}
              </label>
            ))}
            <AddEmail customerId={customerId} live={live} onAdded={(p) => { onContact(p); setPicked((x) => { const have = people.find((o) => o.email.toLowerCase() === p.email)?.email ?? p.email; return x.includes(have) ? x : [...x, have]; }); }} />
          </div>
        </div>
        <div>
          <span className={label}>Cc</span>
          {/* On every quote email (owner, 4 Nov): the server adds them, so they can't be taken off. */}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {mergeCc(to, []).map((m) => <span key={m} className="rounded-full bg-surface-2 px-3 py-1 text-[14px] text-ink-2" title="Always copied on quote emails">{m}</span>)}
            <input className={`${inputCls} !h-9 min-w-0 flex-1 basis-56 text-[14px]`} value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Other emails, comma between" aria-label="Other Cc emails" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={label}>Template</span>
          <select className={`${inputCls} !h-9 !w-auto text-[14px]`} value={tpl} onChange={(e) => choose(e.target.value, skip)} aria-label="Email template">
            {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            <option value="zoho">Zoho&apos;s standard email</option>
          </select>
          {tpl !== "zoho" && tpl !== "formal" && tpl !== "short" && topics.map((t) => {
            const on = !skip.includes(t.id);
            return (
              <button key={t.id} type="button" title={`${on ? "Leave out" : "Add"} the paragraph about ${t.names.join(", ")}`}
                className={`rounded-full border px-3 py-1 text-[13.5px] ${on ? "border-brand bg-brand-soft text-ink" : "border-line text-muted line-through"}`}
                onClick={() => choose(tpl, on ? [...skip, t.id] : skip.filter((x) => x !== t.id))}>{t.label}</button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={label}>Zia</span>
          <input className={`${inputCls} !h-9 min-w-0 flex-1 basis-64 text-[14px]`} value={ziaText} onChange={(e) => setZiaText(e.target.value)} maxLength={1000}
            placeholder="Tell Zia what to write — e.g. AED email, mention training and warranty" aria-label="What Zia should write" />
          <button className={`${btn.ghost} !h-9`} onClick={toZia} disabled={!live || ziaBusy} title={live ? `Leaves a draft in ${ZIA_MAILBOX}'s Zoho Mail` : "Only the live site writes to Zoho Mail"}>Send to Zia</button>
          {draft.ziaVia !== "flow" && <a className={`${btn.ghost} !h-9`} href="https://mail.zoho.in/zm/#mail/folder/drafts" target="_blank" rel="noreferrer">Open Zoho Mail ↗</a>}
          <button className={`${btn.ghost} !h-9`} onClick={() => fromZia()} disabled={ziaBusy}>{ziaBusy && draft.ziaVia === "flow" ? "Zia is writing…" : ziaBusy ? "…" : "Pull from Zia"}</button>
          {ziaMsg && <p className="basis-full text-[13px] text-muted">{ziaMsg}</p>}
        </div>
        <label className="block"><span className={label}>Subject</span><input className={`${inputCls} mt-1 !h-10 text-[14.5px]`} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} /></label>
        <div>
          <span className={label}>Message</span>
          {/* Follows the theme (owner, 4 Nov: the white box "is burning my eyes"). Zoho's and Zia's HTML can carry its own
              black text (owner, 30 Oct: unreadable on dark), so inside this box every colour is the theme's — by CSS
              only: what's sent is the HTML untouched, so the customer gets the email as written. */}
          <div ref={body} contentEditable suppressContentEditableWarning role="textbox" aria-multiline aria-label="Message" onInput={() => { edited.current = true; }}
            className="mt-1 max-h-[38vh] min-h-40 overflow-y-auto rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-[14.5px] leading-relaxed text-ink caret-[var(--ink)] outline-none focus:border-brand [&_*]:!bg-transparent [&_*]:!text-ink [&_a]:!text-brand [&_a]:underline" />
        </div>
        <div>
          <span className={label}>Attachments</span>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-surface-2 px-3 py-1 text-[14px] text-ink-2" title="Zoho Books attaches the quotation's PDF itself">📄 {draft.fileName ?? `${quote.number}.pdf`} <span className="text-muted">(the quotation)</span></span>
            {files.map((f, i) => (
              <span key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-[14px] text-ink-2">
                {f.name} <span className="text-muted">{kb(f.size)}</span>
                <button className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-surface hover:text-high" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>×</button>
              </span>
            ))}
            <button className={`${btn.ghost} !h-8`} onClick={() => fileInput.current?.click()}>+ Add attachments</button>
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => { const add = [...(e.target.files ?? [])]; setFiles((x) => [...x, ...add].slice(0, 10)); e.target.value = ""; }} />
            {files.length > 0 && <span className={`text-[13px] ${size > max ? "font-semibold text-high" : "text-muted"}`}>{kb(size)} of 4 MB</span>}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4">
        {error && <span className="mr-auto text-[14px] font-medium text-high">{error}</span>}
        <button className={btn.ghost} onClick={onBack} disabled={busy}>Not now</button>
        <button className={btn.primary} onClick={send} disabled={Boolean(why) || busy} title={why || `Zoho Books sends it from your organisation's address`}>{busy ? "Sending…" : "Send email"}</button>
      </div>
    </>
  );
}

/** The item catalogue (owner, 28 Oct: "adding the items should be easier … you get the item images from zoho books"). */
function Catalogue({ items, lines, onAdd, onClose }: { items: Item[]; lines: Line[]; onAdd: (i: Item) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [, setMissing] = useState(0); // re-sorts when a picture turns out to be missing
  const [group, setGroup] = useState("");
  const groupOf = (i: Item) => i.group ?? i.category ?? "Other";
  const groups = useMemo(() => [...items.reduce((m, i) => m.set(groupOf(i), (m.get(groupOf(i)) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).map(([g]) => g), [items]);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = items.filter((i) => (!group || groupOf(i) === group) && words.every((w) => i.name.toLowerCase().includes(w))).sort((a, b) => Number(hasPicture(b)) - Number(hasPicture(a)) || a.name.localeCompare(b.name));
  const inQuote = new Map(lines.filter((l) => l.itemId).map((l) => [l.itemId, l.qty]));
  return (
    <div className="fade-in fixed inset-0 z-[80] grid place-items-center bg-black/30 p-3" onMouseDown={(e) => { e.stopPropagation(); onClose(); }}>
      <div role="dialog" aria-label="Items" className="modal-in flex h-[92vh] w-full min-w-0 max-w-[96rem] flex-col rounded-2xl bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <h3 className="text-[19px] font-bold tracking-tight text-ink">Items</h3>
          <select className={`select-chevron ${btn.ghost} max-w-[16rem] cursor-pointer`} value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Group">
            <option value="">All groups</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <input className={`${inputCls} !h-10 min-w-0 flex-1 basis-60 text-[15px]`} placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search items" autoFocus />
          <button className={btn.primary} onClick={onClose}>Done</button>
        </div>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6">
            {shown.slice(0, 150).map((i) => (
              <button key={i.id} className={`flex flex-col overflow-hidden rounded-xl border text-left transition-colors hover:border-brand ${inQuote.has(i.id) ? "border-brand bg-brand-soft" : "border-line"}`} onClick={() => onAdd(i)} title={`Add ${i.name}`}>
                <ItemImage item={i} onMissing={() => setMissing((n) => n + 1)} />
                <span className="flex flex-1 flex-col gap-0.5 p-2.5">
                  <span className="line-clamp-2 text-[13.5px] font-medium leading-snug text-ink">{i.name}</span>
                  <span className="text-[13px] text-ink-2"><span className="num">{i.rate ? inr(i.rate) : "—"}</span>{i.gst !== null && <span className="text-muted"> + {i.gst}% GST</span>}</span>
                  <span className="text-[12.5px] text-muted">{i.service ? "Service" : <>{(i.onHand ?? 0).toLocaleString("en-IN")} on hand{i.stock ? ` · ${i.stock}` : ""}</>}</span>
                  {inQuote.has(i.id) && <span className="mt-0.5 text-[12.5px] font-bold text-brand">In the quote × {inQuote.get(i.id)} · click for one more</span>}
                </span>
              </button>
            ))}
          </div>
          {!shown.length && <p className="py-10 text-center text-muted">No item matches.</p>}
          {shown.length > 150 && <p className="mt-3 text-center text-[13px] text-muted">{shown.length - 150} more — search to narrow it down.</p>}
        </div>
      </div>
    </div>
  );
}

/**
 * Items, under Quotations (owner, 4 Nov): active items only, most in demand first (quote lines in the last 12 months). No
 * pictures in the list: each costs a Zoho call, so only the item you open shows one.
 */
export function ItemsPage() {
  const [res, setRes] = useState<ListRes | null>(null); // whether it's connected and live, and what the customer picker needs
  const [starting, setStarting] = useState<Item[] | null>(null); // ticked, waiting for the customer
  const [quoting, setQuoting] = useState<{ c: Customer; items: Item[] } | null>(null);
  const [clear, setClear] = useState(0);
  useEffect(() => { fetch(`/api/quotations?${new URLSearchParams({ q: "", page: "0" })}`).then((r) => r.json()).then((j: ListRes) => setRes(j)).catch(() => {}); }, []);
  return (
    <div>
      {res && !res.live && <p className="mb-4 rounded-2xl bg-surface-2 px-4 py-2.5 text-[14px] text-muted">This is a local copy — quotations are created in Zoho Books only from the live site.</p>}
      <ItemsSection clear={clear} live={Boolean(res?.live)} canQuote={Boolean(res?.connected)} onQuote={setStarting} />
      {starting && res && createPortal(<NewQuote res={res} onPick={(c) => { setQuoting({ c, items: starting }); setStarting(null); }} onClose={() => setStarting(null)} />, document.body)}
      {quoting && res && createPortal(<QuotePopup customer={quoting.c} fresh start={quoting.items} live={res.live} onClose={(sent) => { setQuoting(null); if (sent) setClear((n) => n + 1); }} />, document.body)}
    </div>
  );
}

function ItemsSection({ clear, live, canQuote, onQuote }: { clear: number; live: boolean; canQuote: boolean; onQuote: (items: Item[]) => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [brochure, setBrochure] = useState<"" | "missing" | "added">("");
  const [picked, setPicked] = useState<string[]>([]);
  const [open, setOpen] = useState<Item | null>(null);
  useEffect(() => { loadItems().then((all) => setItems(all.filter(onItemsPage))); }, []);
  useEffect(() => { setPicked([]); }, [clear]); // a quotation was made from them
  const groupOf = (i: Item) => i.group ?? i.category ?? "Other";
  const groups = useMemo(() => [...new Set((items ?? []).map(groupOf))].sort((a, b) => a.localeCompare(b)), [items]);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (items ?? []).filter((i) => (!group || groupOf(i) === group) && words.every((w) => i.name.toLowerCase().includes(w))
    && (!brochure || (brochure === "added" ? Boolean(i.brochure) : i.brochure === "")))
    .sort((a, b) => (b.demand ?? 0) - (a.demand ?? 0) || a.name.localeCompare(b.name));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  // The list fills the window to just above the note under it, on any screen (owner, 4 Nov: "make it fit the window"), so the page itself doesn't scroll.
  const list = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  useEffect(() => {
    const fit = () => {
      if (!list.current) return;
      const main = list.current.closest("main");
      const note = list.current.nextElementSibling as HTMLElement;
      const below = (main ? parseFloat(getComputedStyle(main).paddingBottom) : 0) + parseFloat(getComputedStyle(list.current.parentElement!).marginBottom) + note.offsetHeight + parseFloat(getComputedStyle(note).marginTop); // the page's padding, what's pulled back from it, the note
      setHeight(Math.max(256, Math.floor(window.innerHeight - (list.current.getBoundingClientRect().top + window.scrollY) - below)));
    };
    fit();
    window.addEventListener("resize", fit);
    // Anything appearing above the list (a notice) moves it down: measure again.
    const watch = new ResizeObserver(fit);
    const page = list.current?.closest("main");
    if (page) watch.observe(page);
    return () => { window.removeEventListener("resize", fit); watch.disconnect(); };
  }, []);
  return (
    <div className="lg:-mb-10">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${inputCls} !h-10 min-w-0 flex-1 basis-72 text-[15px]`} placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search items" />
        <select className={`select-chevron ${inputCls} !h-10 !w-auto max-w-[16rem] text-[14px]`} value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select className={`select-chevron ${inputCls} !h-10 !w-auto text-[14px]`} value={brochure} onChange={(e) => setBrochure(e.target.value as typeof brochure)} aria-label="Brochure">
          <option value="">All brochures</option>
          <option value="missing">Brochure missing</option>
          <option value="added">Brochure added</option>
        </select>
        {picked.length > 0 && <span className="flex items-center gap-2 text-[14px] text-ink-2">{picked.length} ticked <button className={btn.quiet} onClick={() => setPicked([])}>Clear</button></span>}
        <button className={btn.primary} disabled={!picked.length || !canQuote} title={!canQuote ? "Zoho Books isn't connected for quotations yet" : !picked.length ? "Tick the items first" : undefined} onClick={() => onQuote(picked.map((id) => items!.find((i) => i.id === id)!).filter(Boolean))}>Create quotation</button>
      </div>
      <div ref={list} className="card no-scrollbar mt-4 overflow-y-auto" style={{ maxHeight: height }}>
        <table className="w-full text-left text-[15px]">
          <thead className="sticky top-0 z-10 border-b border-line bg-surface text-[13px] text-muted">
            <tr>
              <th className="w-10 py-3 pl-4"><span className="sr-only">Tick</span></th>
              <th className="px-3 py-3 font-medium">Item</th>
              <th className="px-3 py-3 text-right font-medium">Price</th>
              <th className="hidden px-3 py-3 text-right font-medium md:table-cell">GST</th>
              <th className="hidden px-3 py-3 text-right font-medium md:table-cell">On hand</th>
              <th className="px-3 py-3 font-medium">Brochure</th>
              <th className="px-3 py-3 pr-4 text-right font-medium" title="Quote lines in the last 12 months">Quoted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.slice(0, 200).map((i) => (
              <tr key={i.id} className={`cursor-pointer hover:bg-surface-2/70 ${picked.includes(i.id) ? "bg-brand-soft" : ""}`} onClick={() => setOpen(i)}>
                <td className="py-2.5 pl-4" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="size-4 accent-[var(--brand)]" checked={picked.includes(i.id)} onChange={() => toggle(i.id)} aria-label={`Tick ${i.name}`} /></td>
                <td className="min-w-0 px-3 py-2.5"><span className="block font-medium text-ink">{i.name}</span><span className="block text-[13px] text-muted">{groupOf(i)}</span></td>
                <td className="num whitespace-nowrap px-3 py-2.5 text-right text-ink-2">{i.rate ? inr(i.rate) : "—"}</td>
                <td className="num hidden px-3 py-2.5 text-right text-ink-2 md:table-cell">{i.gst === null ? "—" : `${i.gst}%`}</td>
                <td className="num hidden px-3 py-2.5 text-right text-ink-2 md:table-cell">{i.service ? "Service" : (i.onHand ?? 0).toLocaleString("en-IN")}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[14px]"><BrochureState item={i} /></td>
                <td className="num px-3 py-2.5 pr-4 text-right font-semibold text-ink">{i.demand ? i.demand.toLocaleString("en-IN") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items && <p className="py-10 text-center text-muted">Loading the items…</p>}
        {items && !shown.length && <p className="py-10 text-center text-muted">No item matches.</p>}
        {shown.length > 200 && <p className="py-3 text-center text-[13px] text-muted">{shown.length - 200} more — search to narrow it down.</p>}
      </div>
      <p className="mt-2 text-[13px] text-muted">{items ? `${shown.length} active items` : ""} · Quoted: quote lines in the last 12 months, from the Zoho Analytics copy.</p>
      {open && createPortal(<ItemDetails item={open} live={live} ticked={picked.includes(open.id)} onTick={() => toggle(open.id)} onClose={() => setOpen(null)}
        onSaved={(f) => {
          // The list and the quote popup's item search follow at once.
          const update = (i: Item): Item => (i.id === open.id ? { ...i, name: f.name, rate: f.rate, group: f.identifier || i.group, stock: f.stock || null } : i);
          itemsOnce = null;
          setItems((all) => all && all.map(update).filter(onItemsPage));
          setOpen(update(open));
        }} />, document.body)}
    </div>
  );
}

/** One labelled box in the item's edit form. */
function EditField({ name, wide, children }: { name: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`block min-w-0 ${wide ? "sm:col-span-2" : ""}`}><span className="mb-1 block text-[12.5px] font-bold uppercase tracking-wide text-muted">{name}</span>{children}</label>;
}

/** Added / Missing, from Books' Product Brochure field; nothing yet while the copy predates it (the hourly item read fills it). */
function BrochureState({ item }: { item: Item }) {
  if (item.brochure == null) return <span className="text-muted">—</span>;
  if (item.brochure) return <span className="font-medium text-low" title={item.brochure}>✓ Added</span>;
  // Zoho publishes no call to upload to this field (tested 4 Nov), so it's added in Books: PDF, under 1 MB by the field's own note.
  return <span className="text-medium">Missing · <a className="font-semibold text-brand hover:underline" href={zohoUrl("item", item.id)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Open this item in Zoho Books to add its brochure (PDF under 1 MB)">Add in Books ↗</a></span>;
}

/** One item: its picture, figures and Zoho's description (one Zoho call each, when opened). */
function ItemDetails({ item, live, ticked, onTick, onClose, onSaved }: { item: Item; live: boolean; ticked: boolean; onTick: () => void; onClose: () => void; onSaved: (f: ItemFields) => void }) {
  const { member } = useSession();
  const canEdit = Boolean(member && hasFullAccess(member));
  const [description, setDescription] = useState<string | null>(null);
  const [fields, setFields] = useState<ItemFields | null>(null); // Zoho's current values, when opened
  const [form, setForm] = useState<(Omit<ItemFields, "rate"> & { rate: string }) | null>(null); // editing
  const [identifiers, setIdentifiers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // TEMPORARY: the brochure upload test, on the test item only.
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string[]>([]);
  const testUpload = async (file: File | undefined) => {
    if (!file) return;
    setTesting(true); setTestResult([]);
    const body = new FormData();
    body.set("brochureTest", item.id);
    body.set("file", file);
    const r = await fetch("/api/quotations", { method: "POST", body }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { attempts?: string[]; brochure?: string | null; error?: string }) : { error: "Couldn't reach the server" };
    setTesting(false);
    setTestResult(j.error ? [j.error] : [...(j.attempts ?? []), j.brochure ? `Brochure now: ${j.brochure}` : "No brochure was attached"]);
  };
  const edit = () => {
    if (!fields) return;
    setForm({ ...fields, rate: String(fields.rate) }); setError("");
    loadItems().then((all) => setIdentifiers([...new Set(all.map((i) => i.group).filter((g): g is string => Boolean(g)))].sort((a, b) => a.localeCompare(b))));
  };
  const save = async () => {
    if (!form || saving) return;
    setSaving(true); setError("");
    const r = await fetch("/api/quotations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ editItem: { id: item.id, fields: { ...form, rate: form.rate.trim() === "" ? NaN : Number(form.rate) } } }) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { saved?: ItemFields; error?: string }) : { error: "Couldn't reach the server" };
    setSaving(false);
    if (!j.saved) return setError(j.error ?? "Couldn't save the item");
    setFields(j.saved); setDescription(j.saved.description); setForm(null);
    onSaved(j.saved);
  };
  useEffect(() => {
    let current = true;
    fetch(`/api/quotations?item=${item.id}`).then((r) => r.json()).then((j: { description?: string; fields?: ItemFields }) => { if (current) { setDescription(j.description ?? ""); setFields(j.fields ?? null); } }).catch(() => current && setDescription(""));
    return () => { current = false; };
  }, [item.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !form) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, form]);
  const rows: [string, string][] = [
    ["Category", item.group ?? item.category ?? "—"], ["Price", item.rate ? inr(item.rate) : "—"], ["GST", item.gst === null ? "—" : `${item.gst}%`], ["Unit", item.unit ?? "—"],
    ["On hand", item.service ? "Service" : (item.onHand ?? 0).toLocaleString("en-IN")], ["Quoted, last 12 months", (item.demand ?? 0).toLocaleString("en-IN")],
    ["Brochure", item.brochure == null ? "—" : item.brochure || "Missing"],
  ];
  return (
    <div className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/30 p-3" onMouseDown={form ? undefined : onClose}>
      <div role="dialog" aria-label={item.name} className="modal-in flex max-h-[92vh] w-full min-w-0 max-w-[64rem] flex-col rounded-2xl bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-6 pt-5">
          <h3 className="min-w-0 text-[20px] font-bold tracking-tight text-ink">{item.name}</h3>
          <button className={btn.quiet} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="grid gap-5 sm:grid-cols-[22rem_minmax(0,1fr)]">
            <div className="self-start overflow-hidden rounded-xl border border-line"><ItemImage item={item} tall onMissing={() => {}} /></div>
            {form ? (
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <EditField name="Name" wide><input className={`${inputCls} !h-10 text-[14.5px]`} maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Name" autoFocus /></EditField>
                <EditField name="Price (before tax)"><input className={`${inputCls} !h-10 text-[14.5px]`} inputMode="decimal" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} aria-label="Price" /></EditField>
                <EditField name="Offer price"><input className={`${inputCls} !h-10 text-[14.5px]`} inputMode="decimal" value={form.offerPrice} onChange={(e) => setForm({ ...form, offerPrice: e.target.value })} aria-label="Offer price" /></EditField>
                <EditField name="Item Identifier"><select className={`select-chevron ${inputCls} !h-10 text-[14.5px]`} value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} aria-label="Item Identifier">{!identifiers.includes(form.identifier) && <option value={form.identifier}>{form.identifier || "Pick one"}</option>}{identifiers.map((g) => <option key={g} value={g}>{g}</option>)}</select></EditField>
                <EditField name="Stock Status"><select className={`select-chevron ${inputCls} !h-10 text-[14.5px]`} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} aria-label="Stock Status"><option value="">Not set</option>{STOCK_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select></EditField>
                <EditField name="HSN code"><input className={`${inputCls} !h-10 text-[14.5px]`} maxLength={20} value={form.hsn} onChange={(e) => setForm({ ...form, hsn: e.target.value })} aria-label="HSN code" /></EditField>
                <EditField name="Description" wide><textarea className={`${inputCls} min-h-40 py-2 text-[14.5px]`} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} aria-label="Description" /></EditField>
                {error && <p className="text-[14px] font-medium text-high sm:col-span-2">{error}</p>}
              </div>
            ) : (
            <div className="min-w-0">
            <dl className="space-y-1.5 text-[14.5px]">
              {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="num text-right text-ink">{v}</dd></div>)}
            </dl>
            <p className="mt-4 whitespace-pre-line border-t border-line pt-3 text-[14.5px] leading-relaxed text-ink-2">{description === null ? "Getting the description…" : description || "No description in Zoho."}</p>
            {canEdit && item.id === UPLOAD_TEST_ITEM && (
              <div className="mt-3 rounded-xl border border-line p-3 text-[13.5px]">
                <label className={`${btn.ghost} inline-flex cursor-pointer items-center ${!live || testing ? "pointer-events-none opacity-50" : ""}`}>
                  {testing ? "Testing…" : "Test brochure upload (PDF under 1 MB)"}
                  <input type="file" accept="application/pdf" className="sr-only" disabled={!live || testing} onChange={(e) => { testUpload(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
                {testResult.length > 0 && <ul className="mt-2 space-y-1 break-words text-ink-2">{testResult.map((t, n) => <li key={n}>{t}</li>)}</ul>}
              </div>
            )}
            </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          {form ? (
            <>
              <button className={btn.ghost} disabled={saving} onClick={() => { setForm(null); setError(""); }}>Cancel</button>
              <button className={btn.primary} disabled={saving || !live} title={live ? "Saves to Zoho Books straight away" : "Only the live site changes Zoho Books"} onClick={save}>{saving ? "Saving…" : "Save to Zoho Books"}</button>
            </>
          ) : (
            <>
              {canEdit && <button className={`${btn.ghost} mr-auto`} disabled={!fields} onClick={edit}>Edit</button>}
              <button className={btn.ghost} onClick={onClose}>Close</button>
              <button className={btn.primary} onClick={() => { onTick(); onClose(); }}>{ticked ? "Untick" : "Tick"}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Items whose picture didn't load (Zoho has a name but no picture) — they go to the end, like those without one. */
const noPicture = new Set<string>();
const hasPicture = (i: Item) => i.image !== false && !noPicture.has(i.id); // unknown until the next full sync: try it

/** Zoho's picture of the item (through our server); the initials when it has none. */
function ItemImage({ item, tall = false, onMissing }: { item: Item; tall?: boolean; onMissing: () => void }) {
  const [failed, setFailed] = useState(!hasPicture(item));
  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden ${tall ? "h-64" : "h-32"} ${failed ? "bg-surface-2" : "bg-white"}`}>
      {failed ? <span className="text-[22px] font-bold text-faint">{item.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={`/api/quotations?image=${item.id}`} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain p-2" onError={() => { setFailed(true); noPicture.add(item.id); onMissing(); }} />}
    </span>
  );
}

/** "+ Add email" (owner, 4 Nov): saved on the customer in Zoho Books as a contact person, then ticked for this quote. */
function AddEmail({ customerId, live, onAdded }: { customerId: string; live: boolean; onAdded: (p: AddedPerson) => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && first.trim() && last.trim();
  const close = () => { setOpen(false); setEmail(""); setFirst(""); setLast(""); setError(""); };
  const add = async () => {
    if (!ready || busy) return;
    setBusy(true); setError("");
    const r = await fetch("/api/quotations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ addEmail: { customerId, firstName: first, lastName: last, email } }) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { person?: AddedPerson; error?: string }) : { error: "Couldn't reach the server" };
    setBusy(false);
    if (!j.person) return setError(j.error ?? "Couldn't add the email");
    onAdded(j.person);
    close();
  };
  if (!open) return <button type="button" className={`${btn.ghost} !h-9`} disabled={!live} title={live ? "Saved on this customer in Zoho Books" : "Only the live site adds contacts in Zoho Books"} onClick={() => setOpen(true)}>+ Add email</button>;
  const box = `${inputCls} !h-9 min-w-0 text-[14px]`;
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); add(); } };
  return (
    <div className="flex basis-full flex-wrap items-center gap-2">
      <input className={`${box} flex-1 basis-56`} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={enter} aria-label="New email" autoFocus />
      <input className={`${box} flex-1 basis-32`} placeholder="First name" value={first} onChange={(e) => setFirst(e.target.value)} onKeyDown={enter} aria-label="First name" />
      <input className={`${box} flex-1 basis-32`} placeholder="Last name" value={last} onChange={(e) => setLast(e.target.value)} onKeyDown={enter} aria-label="Last name" />
      <button type="button" className={`${btn.primary} !h-9`} disabled={!ready || busy} onClick={add}>{busy ? "Adding…" : "Add to customer"}</button>
      <button type="button" className={`${btn.quiet} !h-9`} disabled={busy} onClick={close}>Cancel</button>
      <p className={`basis-full text-[13px] ${error ? "text-high" : "text-muted"}`}>{error || "It's saved on this customer in Zoho Books, not as their primary contact."}</p>
    </div>
  );
}

/** A titled group of fields in the new-customer form. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 border-b border-line pb-1.5 text-[14px] font-semibold text-ink">{title}</h4>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

/** "New quotation" (owner, 28 Oct: "another option to create quotation from scratch"): any customer, or a new one made in Zoho. */
function NewQuote({ res, onPick, onClose }: { res: ListRes; onPick: (c: Customer) => void; onClose: () => void }) {
  useNoPageScroll();
  const [tab, setTab] = useState<"find" | "new">("find");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Customer[]>([]);
  const [n, setN] = useState({ kind: "business" as "business" | "individual", company: "", displayName: "", salutation: "", firstName: "", lastName: "", email: "", phone: "", workPhone: "", state: "MH", street: "", city: "", zip: "", gstin: "", type: "New Customer", sector: "" });
  // A whole GSTIN decides the state, PAN and GST treatment (gstin.ts) — the state picker follows it.
  const gst = GSTIN_RE.test(n.gstin) ? fromGstin(n.gstin) : null;
  const stateCode = gst?.state ?? n.state;
  const treatment = gstTreatment({ kind: n.kind, gstin: gst ? n.gstin : undefined });
  const displayDefault = n.kind === "individual" ? `${n.firstName} ${n.lastName}`.trim() : n.company.trim();
  const [state, setState] = useState<{ busy?: boolean; error?: string }>({});
  useEffect(() => {
    if (tab !== "find") return;
    let live = true;
    const t = setTimeout(() => fetch(`/api/quotations?${new URLSearchParams({ q, page: "0" })}`).then((r) => r.json()).then((j: ListRes) => live && setHits(j.customers?.slice(0, 8) ?? [])).catch(() => {}), q ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [q, tab]);
  const create = async () => {
    setState({ busy: true });
    const r = await fetch("/api/quotations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newCustomer: { ...n, state: stateCode } }) }).catch(() => null);
    const j = r ? ((await r.json()) as { ok?: boolean; error?: string; customer?: { id: string; name: string } }) : { error: "Couldn't reach the server" };
    if (!j.ok || !j.customer) return setState({ error: j.error ?? "Couldn't create the customer" });
    onPick({ id: j.customer.id, name: j.customer.name, email: n.email, phone: n.phone || null, sector: n.sector, type: n.type, lastQuote: null, lastInvoice: null });
  };
  const field = (k: keyof typeof n, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block"><span className="text-[12.5px] font-bold uppercase tracking-wide text-muted">{label}</span>
      <input className={`${inputCls} mt-1 !h-10 text-[14.5px]`} value={n[k]} onChange={(e) => setN((x) => ({ ...x, [k]: e.target.value }))} {...extra} /></label>
  );
  const pick = (k: "type" | "sector" | "state" | "salutation", label: React.ReactNode, opts: [string, string][], blank?: string, locked?: boolean) => (
    <label className="block"><span className="text-[12.5px] font-bold uppercase tracking-wide text-muted">{label}</span>
      <select className={`select-chevron ${inputCls} mt-1 !h-10 text-[14.5px] disabled:opacity-70`} value={k === "state" ? stateCode : n[k]} disabled={locked} onChange={(e) => setN((x) => ({ ...x, [k]: e.target.value }))}>
        {blank && <option value="" disabled>{blank}</option>}
        {opts.map(([v, name]) => <option key={v} value={v}>{name}</option>)}
      </select></label>
  );
  // Zoho refuses a customer without Type and Sector, and its CRM sync needs a last name (#151).
  const ready = (n.kind === "individual" || n.company.trim()) && n.firstName.trim() && n.lastName.trim() && n.email.trim() && n.sector && (!n.gstin || gst?.state);
  return (
    <div className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/30 p-3" onMouseDown={onClose}>
      <div role="dialog" aria-label="New quotation" className="modal-in flex max-h-[94vh] w-full min-w-0 max-w-2xl lg:max-w-4xl flex-col rounded-2xl bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-6 pt-5">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">New quotation</p>
            <h3 className="text-[21px] font-bold tracking-tight text-ink">Who is it for?</h3>
          </div>
          <button className={btn.quiet} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="mt-3 flex gap-1 px-6">
          {(["find", "new"] as const).map((t) => <button key={t} className={`rounded-full px-3.5 py-1.5 text-[14px] font-medium ${tab === t ? "bg-brand text-white" : "bg-surface-2 text-ink-2"}`} onClick={() => setTab(t)}>{t === "find" ? "A customer in Zoho" : "+ New customer"}</button>)}
        </div>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {tab === "find" ? (
            <>
              <input className={`${inputCls} !h-10 text-[15px]`} placeholder="Search a customer, email or phone…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" autoFocus />
              <div className="mt-2 divide-y divide-line">
                {hits.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0"><div className="truncate font-medium text-ink">{c.name}</div><div className="truncate text-[13px] text-muted">{c.email ?? "no email"}</div></div>
                    <button className={btn.primary} onClick={() => onPick(c)}>Quote</button>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[13.5px] text-muted">Not in Zoho yet? <button className="font-semibold text-brand hover:underline" onClick={() => { setTab("new"); setN((x) => ({ ...x, company: x.company || q })); }}>Add them as a new customer</button>.</p>
            </>
          ) : (
            // One screen with what Zoho's "New Customer" requires (#150 step 2), in sections (owner, 30 Oct: "salutation
            // goes before first name … make it section wise … name, number under separate heading, address under diff").
            <div className="space-y-4">
              <div className="flex gap-1" role="radiogroup" aria-label="Customer type">
                {(["business", "individual"] as const).map((k) => <button key={k} role="radio" aria-checked={n.kind === k} className={`rounded-full px-3 py-1 text-[13.5px] font-medium ${n.kind === k ? "bg-ink text-surface" : "bg-surface-2 text-ink-2"}`} onClick={() => setN((x) => ({ ...x, kind: k }))}>{k === "business" ? "Business" : "Individual"}</button>)}
              </div>
              <Section title={n.kind === "business" ? "Company" : "Customer"}>
                <div>
                  {field("gstin", "GSTIN (if registered)", { maxLength: 15, placeholder: "27ABCDE1234F1Z5", autoFocus: true, onChange: (e) => setN((x) => ({ ...x, gstin: e.target.value.toUpperCase().replace(/\s/g, "") })) })}
                  {n.gstin && <p className={`mt-1 text-[13px] ${gst?.state ? "text-muted" : "text-high"}`}>{!gst ? "A GSTIN has 15 characters, like 27ABCDE1234F1Z5" : !gst.state ? "Its first two digits aren't a state code" : `${res.states.find(([c]) => c === gst.state)?.[1]} · PAN ${gst.pan}`}</p>}
                </div>
                {n.kind === "business" && field("company", "Company name *", { maxLength: 200 })}
                {field("displayName", "Display name *", { maxLength: 200, placeholder: displayDefault || "As it shows in Zoho" })}
                {pick("type", "Type *", res.customerTypes.map((t) => [t, t]))}
                {pick("sector", "Sector *", res.customerSectors.map((t) => [t, t]), "Pick the sector…")}
              </Section>
              <Section title={n.kind === "business" ? "Contact person" : "Name & contact"}>
                {pick("salutation", "Salutation", [["", "—"], ...["Mr.", "Mrs.", "Ms.", "Miss", "Dr."].map((x): [string, string] => [x, x])])}
                {field("firstName", "First name *", { maxLength: 100 })}
                {field("lastName", "Last name *", { maxLength: 100 })}
                {field("email", "Email *", { type: "email", maxLength: 200 })}
                {field("phone", "Mobile", { type: "tel", maxLength: 30 })}
                {field("workPhone", "Work phone", { type: "tel", maxLength: 30 })}
              </Section>
              <Section title="Address">
                {pick("state", <>State * <span className="normal-case tracking-normal">{gst?.state ? "(from the GSTIN)" : "(decides the GST)"}</span></>, res.states, undefined, Boolean(gst?.state))}
                {field("city", "City", { maxLength: 100 })}
                {field("zip", "PIN code", { inputMode: "numeric", maxLength: 6 })}
                <div className="sm:col-span-2 lg:col-span-3">{field("street", "Street address", { maxLength: 200 })}</div>
              </Section>
              <p className="text-[13px] text-muted sm:col-span-2 lg:col-span-3">GST treatment: <b className="font-semibold text-ink-2">{GST_LABEL[treatment]}</b> · Tax: Taxable · Display name: <b className="font-semibold text-ink-2">{n.displayName.trim() || displayDefault || "—"}</b></p>
              <p className="text-[13px] text-muted sm:col-span-2 lg:col-span-3">The customer is created in Zoho Books with this contact as primary, then the quotation opens.{res.connected && !res.connected.newCustomers && <b className="text-medium"> Zoho Books needs one more permission for this — Admin: Reconnect on this page first.</b>}</p>
            </div>
          )}
        </div>
        {tab === "new" && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4">
            {state.error && <span className="mr-auto text-[14px] font-medium text-high">{state.error}</span>}
            <button className={btn.ghost} onClick={onClose}>Cancel</button>
            <button className={btn.primary} onClick={create} disabled={!ready || state.busy || !res.live} title={res.live ? undefined : "Only the live site creates customers in Zoho"}>{state.busy ? "Creating…" : "Create in Zoho and quote"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Admin: connect Zoho Books for quotations — a one-time code from the Zoho API console (Self Client). */
function ConnectBooks({ scopes, onClose }: { scopes: string; onClose: (ok: boolean) => void }) {
  useNoPageScroll();
  const [code, setCode] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [state, setState] = useState<{ busy?: boolean; error?: string; done?: string }>({});
  const [copied, setCopied] = useState(false);
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
    // The whole line has to go in, so it wraps instead of running out of the popup (4 Nov: a cut-off line was hard to copy whole).
    <>Scope, all of it <button type="button" className="font-semibold text-brand hover:underline" onClick={() => navigator.clipboard?.writeText(scopes).then(() => setCopied(true)).catch(() => {})}>{copied ? "Copied ✓" : "Copy"}</button>: <code className="select-all block break-all rounded bg-surface-2 px-2 py-1 text-[13px]">{scopes}</code> Time: 10 minutes · Description: Quotations · Create.</>,
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
