import { signedInMember, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { canQuote, isAdmin } from "@/lib/roles";
import { readAll } from "@/lib/cachedRead";
import { copyTables } from "@/lib/analytics/source";
import { day, money, nameKey, onHandByItem } from "@/lib/analytics/build";
import { type ZItem, estimatePdf, itemGst, itemImage, zohoGet } from "@/lib/zoho";
import { GSTIN_RE, fromGstin } from "@/lib/gstin";
import { CUSTOMER_FIELDS, EMAIL_MAX_BYTES, INDIA_STATES, type NewCustomer, QUOTE_FIELDS, QUOTE_SCOPES, type QuoteDetails, type QuoteLine, connectQuotes, createCustomer, createQuote, emailQuote, quotesInfo, updateQuote } from "@/lib/quotations";
import type { ZohoLead } from "@/lib/types";

export const dynamic = "force-dynamic";

/*
 * Quotations page (owner, 28 Oct). Admin, Ashish, Shikha, Sumit only.
 *   GET                      — connection state + one page (50) of customers: ?q= &sector= &type= &sort= &page=
 *                              (sort: recent | name | name_desc | quote | quote_old | amount | bought | never)
 *   GET ?customer=<id>       — the popup: contact persons, GST state, their last quotation (lines and fields, to start
 *                              from), quoted lately?, sales people, the quote fields' options, Zoho's notes and terms
 *   GET ?items=1             — the item picker (Zoho items, active, with price, GST %, stock)
 *   GET ?item=<id>           — one item's description (read when it's picked — descriptions are long)
 *   POST {customerId, contactPersonIds, lines, details, send, estimateId?}  — creates the quotation in Zoho Books (emails
 *                              it when send); with estimateId, saves that draft again instead (no second quotation)
 *   PUT {code, clientId?, clientSecret?}               — Admin connects Zoho Books for quotations
 * Customers come from the Zoho copy (zohoCustomers); last quote / invoice from the Reports copy (Zoho Analytics, ≤ 6 h
 * old) plus quotations sent from here (`quotationsSent`). The popup's look-ups are live Zoho reads (sync's token).
 */

const PAGE = 50;
const RECENT_DAYS = 15; // a quote is valid 15 days (owner) — sending another within that asks first
const ORG = process.env.ZOHO_ORG_ID ?? "60016330017";
const zohoLink = (id: string) => `https://books.zoho.in/app/${ORG}#/quotes/${id}`;
const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const daysSince = (ymd: string) => Math.round((Date.parse(istToday()) - Date.parse(ymd)) / 86_400_000);

type Sent = { _id: string; number: string; customerId: string; customerName: string; total: number; sent: boolean; status: string; by: string; byId: string; at: string; lines: number };
const sentCol = async () => (await db()).collection<Sent>("quotationsSent");

type Last = { date: string; number: string; amount: number; status: string };
type History = { quote?: Last; invoice?: string };
let history: { key: string; map: Map<string, History> } | null = null;

/** Each customer's last quote and last invoice, from the Reports copy (rebuilt when the copy changes). */
async function histories(): Promise<Map<string, History>> {
  const t = await copyTables();
  const key = `${t.quotes?.length ?? 0}|${t.invoices?.length ?? 0}|${t.quotes?.[0]?.["Quote ID"] ?? ""}`;
  if (history?.key === key) return history.map;
  const map = new Map<string, History>();
  const get = (id: string) => map.get(id) ?? map.set(id, {}).get(id)!;
  for (const q of t.quotes ?? []) {
    const date = day(q["Quote Date"]);
    if (!date || /draft/i.test(q["Status"] ?? "")) continue;
    const h = get(q["Customer ID"]);
    if (!h.quote || date > h.quote.date) h.quote = { date, number: q["Quote Number"] ?? "", amount: money(q["Sub Total (BCY)"]) ?? 0, status: q["Status"] ?? "" };
  }
  for (const i of t.invoices ?? []) {
    const date = day(i["Invoice Date"]);
    if (!date || /void|draft/i.test(i["Invoice Status"] ?? "")) continue;
    const h = get(i["Customer ID"]);
    if (!h.invoice || date > h.invoice) h.invoice = date;
  }
  history = { key, map };
  return map;
}

/** Quotations sent from here lately — newer than the Reports copy, so they count for "quoted lately" at once. */
async function recentSent(gone?: Span): Promise<Map<string, Last>> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const out = new Map<string, Last>();
  for (const s of await (await sentCol()).find({ at: { $gte: since } }).sort({ at: 1 }).toArray()) {
    if (goneFrom(gone, s._id, s.at)) continue; // deleted in Zoho since
    out.set(s.customerId, { date: new Date(Date.parse(s.at) + 5.5 * 3600_000).toISOString().slice(0, 10), number: s.number, amount: s.total, status: s.sent ? "sent" : "draft" });
  }
  return out;
}

/**
 * What Zoho deleted lately (owner, 30 Oct: "if quotes … or customers do not exist, that should not show up"): Zoho's
 * newest 200 customers and quotations (2 calls, kept 10 minutes) — one of ours created within that span but missing from
 * it was deleted there. Older deletions leave with the sync's full check (9 am / 2 pm / Sync now). Unreachable = hide nothing.
 */
type Span = { ids: Set<string>; since: number };
let zohoNow: { at: number; customers: Span; quotes: Span } | null = null;
const zohoTime = (t: unknown) => Date.parse(String(t ?? "").replace(/([+-]\d\d)(\d\d)$/, "$1:$2"));
async function zohoLatest(): Promise<{ customers: Span; quotes: Span } | null> {
  if (zohoNow && Date.now() - zohoNow.at < 600_000) return zohoNow;
  try {
    const [c, e] = await Promise.all([
      zohoGet<{ contacts?: Record<string, unknown>[] }>("/contacts", { contact_type: "customer", filter_by: "Status.All", sort_column: "created_time", sort_order: "D", per_page: 200 }),
      zohoGet<{ estimates?: Record<string, unknown>[] }>("/estimates", { sort_column: "created_time", sort_order: "D", per_page: 200 }),
    ]);
    // A full page: only what was created since its oldest can be judged. Less than a page: that's everything.
    const span = (rows: Record<string, unknown>[], id: string): Span => ({ ids: new Set(rows.map((r) => String(r[id]))), since: rows.length >= 200 ? zohoTime(rows.at(-1)!.created_time) || Infinity : -Infinity });
    zohoNow = { at: Date.now(), customers: span(c.contacts ?? [], "contact_id"), quotes: span(e.estimates ?? [], "estimate_id") };
    return zohoNow;
  } catch (e) {
    console.error("[quotations] Zoho's latest customers / quotations:", e);
    return null;
  }
}
const goneFrom = (s: Span | undefined, id: string, created: string) => Boolean(s && Date.parse(created) >= s.since && !s.ids.has(id));

/**
 * Each quotation's status now (owner, 30 Oct: "how would I know which is sent or declined or draft"): from the Sales
 * board's copy, synced hourly (salesSync.ts) — fresher than the Reports copy. Re-read only when that copy changed.
 */
let quoteStatus: { v: number; map: Map<string, string> } | null = null;
async function freshQuoteStatus(): Promise<Map<string, string>> {
  const d = await db();
  const v = Number((await d.collection<{ _id: string; version?: number }>("kv").findOne({ _id: "sales_state" }, { projection: { version: 1 } }))?.version ?? -1);
  if (quoteStatus?.v === v) return quoteStatus.map;
  const rows = await d.collection<{ _id: string; kind: string; row: Record<string, unknown> }>("salesDocs").find({ kind: "estimates" }, { projection: { "row.estimate_number": 1, "row.status": 1 } }).toArray();
  quoteStatus = { v, map: new Map(rows.map((r) => [String(r.row?.estimate_number ?? ""), String(r.row?.status ?? "")])) };
  return quoteStatus.map;
}

const lastQuote = (h: History | undefined, mine: Last | undefined) => (mine && (!h?.quote || mine.date >= h.quote.date) ? mine : h?.quote);

/**
 * Zoho's sales people who made a quote in the last year, busiest first. Zoho has some twice in different capitals
 * ("Nikita Shah" / "Nikita shah"): one each, the spelling on most of their quotes.
 */
async function salespeople(): Promise<string[]> {
  const t = await copyTables();
  const since = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const byId = new Map<string, number>();
  for (const q of t.quotes ?? []) if ((day(q["Quote Date"]) ?? "") >= since && q["Salesperson ID"]) byId.set(q["Salesperson ID"], (byId.get(q["Salesperson ID"]) ?? 0) + 1);
  const names = new Map((t.salespersons ?? []).map((s) => [s["Salesperson ID"], (s["Name"] ?? "").trim()]));
  const people = new Map<string, { name: string; n: number; best: number }>();
  for (const [id, n] of byId) {
    const name = names.get(id);
    if (!name) continue;
    const key = name.toLowerCase().replace(/\s+/g, " ");
    const p = people.get(key) ?? { name, n: 0, best: 0 };
    if (n > p.best) Object.assign(p, { name, best: n });
    p.n += n;
    people.set(key, p);
  }
  return [...people.values()].sort((a, b) => b.n - a.n).map((p) => p.name);
}

/** Zoho's default customer notes and terms (bank details) — from the newest quotation, so a change in Zoho shows up within 6 h. */
let notesTerms: { at: number; notes: string; terms: string } | null = null;
async function defaultNotesTerms(): Promise<{ notes: string; terms: string }> {
  if (notesTerms && Date.now() - notesTerms.at < 6 * 3600_000) return notesTerms;
  const list = await zohoGet<{ estimates?: Record<string, unknown>[] }>("/estimates", { sort_column: "created_time", sort_order: "D", per_page: 1 });
  const id = list.estimates?.[0]?.estimate_id;
  const d = id ? await zohoGet<{ estimate?: { notes?: string; terms?: string } }>(`/estimates/${id}`) : {};
  notesTerms = { at: Date.now(), notes: d.estimate?.notes ?? "", terms: d.estimate?.terms ?? "" };
  return notesTerms;
}

const images = new Map<string, { bytes: ArrayBuffer; type: string } | null>();
const ORG_STATE = "MH"; // Think Health's place of supply (Maharashtra): customers here pay CGST + SGST, others IGST
const options = Object.fromEntries(Object.entries(QUOTE_FIELDS).filter(([, f]) => "options" in f).map(([k, f]) => [k, (f as { options: readonly string[] }).options]));
type CF = { api_name?: string; value?: unknown };

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!canQuote(me)) return Response.json({ error: "Only Admin, Ashish, Shikha, Sumit, Nikita and Pranjal send quotations" }, { status: 403 });
  const q = new URL(request.url).searchParams;
  try {
    if (q.get("items")) {
      const [doc, stock] = await Promise.all([
        (await db()).collection<{ _id: string; items?: ZItem[] }>("kv").findOne({ _id: "zoho_items" }),
        copyTables(undefined, true).then(onHandByItem).catch(() => new Map<string, number>()),
      ]);
      const items = (doc?.items ?? []).filter((i) => i.active !== false).map((i) => ({
        id: i.id, name: i.name, group: i.identifier ?? null, rate: i.rate ?? null, gst: i.gst ?? null, unit: i.unit ?? null,
        stock: i.stock ?? null, service: Boolean(i.service), onHand: i.service ? null : Math.round(stock.get(i.id) ?? 0),
        category: i.category ?? null, image: i.image ?? null,
      }));
      return Response.json({ items });
    }

    // An item's picture (the catalogue): kept in memory here and a week in the browser — one Zoho call per picture.
    const imageId = q.get("image");
    if (imageId) {
      if (!/^\d+$/.test(imageId)) return new Response(null, { status: 400 });
      const img = images.get(imageId) ?? (await itemImage(imageId).catch(() => null));
      if (!images.has(imageId)) { images.set(imageId, img); if (images.size > 400) images.delete(images.keys().next().value!); }
      if (!img) return new Response(null, { status: 404, headers: { "Cache-Control": "private, max-age=86400" } });
      return new Response(img.bytes, { headers: { "Content-Type": img.type, "Cache-Control": "private, max-age=604800" } });
    }

    // Zoho's own PDF of a quotation, to download (#150 step 4) — read with the sync's read-only connection.
    const pdfId = q.get("pdf");
    if (pdfId) {
      if (!/^\d+$/.test(pdfId)) return new Response(null, { status: 400 });
      const name = (q.get("name") ?? "").replace(/[^A-Za-z0-9_-]/g, "") || "Quotation";
      return new Response(await estimatePdf(pdfId), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"`, "Cache-Control": "private, no-store" } });
    }

    // The email step's starting point: Zoho's quote email template filled for this quote (#150 step 5).
    const emailId = q.get("email");
    if (emailId) {
      if (!/^\d+$/.test(emailId)) return Response.json({ error: "Unknown quotation" }, { status: 400 });
      type ToContact = { email?: string; first_name?: string; last_name?: string; selected?: boolean };
      const j = await zohoGet<Record<string, unknown> & { data?: Record<string, unknown> }>(`/estimates/${emailId}/email`);
      const d = (j.data ?? j) as { subject?: string; body?: string; file_name?: string; to_contacts?: ToContact[] };
      return Response.json({
        subject: d.subject ?? "", body: d.body ?? "", fileName: d.file_name ?? null, maxBytes: EMAIL_MAX_BYTES,
        to: (d.to_contacts ?? []).filter((x) => x.email).map((x) => ({ email: x.email!, name: [x.first_name, x.last_name].filter(Boolean).join(" ") || null, selected: x.selected !== false })),
      });
    }

    const itemId = q.get("item");
    if (itemId) {
      if (!/^\d+$/.test(itemId)) return Response.json({ error: "Unknown item" }, { status: 400 });
      const d = await zohoGet<{ item?: Record<string, unknown> }>(`/items/${itemId}`);
      const i = d.item ?? {};
      return Response.json({ description: (i.description as string) ?? "", gst: itemGst(i) ?? null, unit: (i.unit as string) || null, rate: Number(i.rate) || null });
    }

    const customerId = q.get("customer");
    if (customerId) {
      if (!/^\d+$/.test(customerId)) return Response.json({ error: "Unknown customer" }, { status: 400 });
      const [ct, list, h, mine, people, nt] = await Promise.all([
        zohoGet<{ contact?: Record<string, unknown> & { contact_persons?: Record<string, unknown>[]; billing_address?: { city?: string; state?: string } } }>(`/contacts/${customerId}`),
        zohoGet<{ estimates?: Record<string, unknown>[] }>("/estimates", { customer_id: customerId, sort_column: "date", sort_order: "D", per_page: 1 }),
        histories(), zohoLatest().then((z) => recentSent(z?.quotes)), salespeople(), defaultNotesTerms(),
      ]);
      const c = ct.contact ?? {};
      const contacts = (c.contact_persons ?? []).map((p) => ({
        id: String(p.contact_person_id), name: [p.salutation, p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null,
        email: (p.email as string) || null, phone: (p.mobile as string) || (p.phone as string) || null, primary: Boolean(p.is_primary_contact),
      }));
      // GST: in Maharashtra CGST + SGST, elsewhere in India IGST, abroad none (Zoho decides; the popup shows the same).
      const place = String(c.place_of_contact ?? "");
      const overseas = c.gst_treatment === "overseas";
      const customer = {
        gstin: (c.gst_no as string) || null, state: c.billing_address?.state || null, city: c.billing_address?.city?.trim() || null, place: place || null,
        tax: overseas ? "none" : !place || place === ORG_STATE ? "intra" : "inter",
      };
      const e = list.estimates?.[0];
      type LastLine = QuoteLine & { name: string; gst: number | null };
      // `draftId`: their newest quotation is still a draft — the popup saves that one again instead of making another.
      let last: { number: string; date: string; lines: LastLine[]; salesperson: string | null; fields: Record<string, string>; draftId?: string } | null = null;
      if (e?.estimate_id) {
        const d = await zohoGet<{ estimate?: { line_items?: Record<string, unknown>[]; custom_fields?: CF[] } }>(`/estimates/${e.estimate_id}`);
        const cf = (api: string) => String(d.estimate?.custom_fields?.find((f) => f.api_name === api)?.value ?? "");
        last = {
          number: String(e.estimate_number ?? ""), date: String(e.date ?? ""), salesperson: (e.salesperson_name as string) || null,
          ...(e.status === "draft" ? { draftId: String(e.estimate_id) } : {}),
          lines: (d.estimate?.line_items ?? []).filter((l) => l.item_id).map((l) => ({
            itemId: String(l.item_id), name: String(l.name ?? ""), qty: Number(l.quantity) || 1, rate: Number(l.rate) || 0,
            description: (l.description as string) || undefined, gst: l.tax_percentage === undefined || l.tax_percentage === "" ? null : Number(l.tax_percentage),
          })),
          fields: { sendToCrm: cf("cf_send_to_crm"), reminderFrequency: cf("cf_reminder_frequency"), productType: cf("cf_category"), leadSource: cf("cf_lead_source") },
        };
      }
      // "Went to them N days ago" counts quotations that went — a draft never left (owner, 30 Oct).
      const m = mine.get(customerId);
      const lq = lastQuote(h.get(customerId), m?.status === "draft" ? undefined : m);
      const recent = lq && daysSince(lq.date) <= RECENT_DAYS ? { number: lq.number, date: lq.date, days: daysSince(lq.date) } : null;
      // Sales person: you, when Zoho has you as one; else whoever made their last quote.
      const same = (a: string | null | undefined, b: string) => (a ?? "").toLowerCase().replace(/\s+/g, " ") === b.toLowerCase().replace(/\s+/g, " ");
      const salesperson = people.find((p) => same(me.name, p)) ?? people.find((p) => same(last?.salesperson, p)) ?? null;
      return Response.json({ contacts, customer, last, recent, salespeople: people, salesperson, options, notes: nt.notes, terms: nt.terms, today: istToday() });
    }

    // The list: search, filters, sort, one page.
    const [{ docs: all }, h, z, info, status] = await Promise.all([readAll<ZohoLead>("zohoCustomers"), histories(), zohoLatest(), quotesInfo(), freshQuoteStatus().catch(() => new Map<string, string>())]);
    const mine = await recentSent(z?.quotes);
    const docs = all.filter((c) => !goneFrom(z?.customers, c.contactId, c.createdAt));
    const text = nameKey(q.get("q") ?? "");
    const words = (q.get("q") ?? "").toLowerCase().trim();
    const sector = q.get("sector") ?? "";
    const type = q.get("type") ?? "";
    const digits = words.replace(/\D/g, "");
    const rows = docs.filter((c) => (!sector || c.sector === sector) && (!type || c.type === type)
      && (!words || nameKey(c.name).includes(text) || (c.email ?? "").toLowerCase().includes(words) || (digits.length >= 4 && (c.mobile ?? c.phone ?? "").replace(/\D/g, "").includes(digits))));
    const withLast = rows.map((c) => ({ c, quote: lastQuote(h.get(c.contactId), mine.get(c.contactId)), invoice: h.get(c.contactId)?.invoice ?? null }));
    // Default: customers quoted or billed most recently first (the ones you're working with), then A–Z. Quick sorts
    // (owner, 30 Oct): by name, by last quotation (newest / oldest / biggest), by last bought, never quoted first.
    type Row = (typeof withLast)[number];
    const latest = (x: Row) => [x.quote?.date ?? "", x.invoice ?? ""].sort().at(-1)!;
    const az = (a: Row, b: Row) => a.c.name.localeCompare(b.c.name);
    const has = (v: unknown) => (v ? 0 : 1); // the ones without go last
    const SORTS: Record<string, (a: Row, b: Row) => number> = {
      recent: (a, b) => latest(b).localeCompare(latest(a)),
      name: () => 0,
      name_desc: (a, b) => b.c.name.localeCompare(a.c.name),
      quote: (a, b) => has(a.quote) - has(b.quote) || (b.quote?.date ?? "").localeCompare(a.quote?.date ?? ""),
      quote_old: (a, b) => has(a.quote) - has(b.quote) || (a.quote?.date ?? "").localeCompare(b.quote?.date ?? ""),
      amount: (a, b) => has(a.quote) - has(b.quote) || (b.quote?.amount ?? 0) - (a.quote?.amount ?? 0),
      bought: (a, b) => has(a.invoice) - has(b.invoice) || (b.invoice ?? "").localeCompare(a.invoice ?? ""),
      never: (a, b) => has(!a.quote) - has(!b.quote) || latest(b).localeCompare(latest(a)),
    };
    const order = SORTS[q.get("sort") ?? ""] ?? SORTS.recent;
    withLast.sort((a, b) => order(a, b) || az(a, b));
    const page = Math.max(0, Number(q.get("page")) || 0);
    const count = (k: "sector" | "type") => [...docs.reduce((m, c) => (c[k] ? m.set(c[k]!, (m.get(c[k]!) ?? 0) + 1) : m), new Map<string, number>())].sort((a, b) => b[1] - a[1]).map(([v]) => v);
    return Response.json({
      connected: info, scopes: QUOTE_SCOPES, admin: isAdmin(me), live: process.env.VERCEL_ENV === "production", states: INDIA_STATES,
      customerTypes: CUSTOMER_FIELDS.type.options, customerSectors: CUSTOMER_FIELDS.sector.options,
      total: withLast.length, page, pageSize: PAGE, sectors: count("sector"), types: count("type"),
      customers: withLast.slice(page * PAGE, page * PAGE + PAGE).map(({ c, quote, invoice }) => ({
        id: c.contactId, name: c.name, email: c.email ?? null, phone: c.mobile ?? c.phone ?? null, sector: c.sector ?? null, type: c.type ?? null,
        lastQuote: quote ? { ...quote, status: status.get(quote.number) || quote.status } : null, lastInvoice: invoice,
      })),
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't load customers" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!canQuote(me)) return Response.json({ error: "Only Admin, Ashish, Shikha, Sumit, Nikita and Pranjal send quotations" }, { status: 403 });
  // Like the reminder emails: only the live site writes to Zoho Books — a local server can't make a real quote by accident.
  if (process.env.VERCEL_ENV !== "production") return Response.json({ error: "Only the live site creates quotations in Zoho Books" }, { status: 409 });
  if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) return sendEmail(await request.formData().catch(() => null));
  const body = (await request.json().catch(() => ({}))) as { customerId?: string; contactPersonIds?: string[]; lines?: QuoteLine[]; details?: Partial<QuoteDetails>; send?: boolean; again?: boolean; newCustomer?: Partial<NewCustomer>; estimateId?: string };
  if (body.newCustomer) return newCustomer(body.newCustomer);
  const customerId = String(body.customerId ?? "");
  const send = body.send !== false;
  const lines = (body.lines ?? []).filter((l) => l && /^\d+$/.test(String(l.itemId)));
  if (!/^\d+$/.test(customerId)) return Response.json({ error: "Pick a customer" }, { status: 400 });
  if (!lines.length || lines.length > 40) return Response.json({ error: "Add at least one item" }, { status: 400 });
  if (lines.some((l) => !(Number(l.qty) > 0) || Number(l.qty) > 100_000 || !(Number(l.rate) >= 0))) return Response.json({ error: "Every item needs a quantity and a price" }, { status: 400 });
  const people = (body.contactPersonIds ?? []).filter((id) => /^\d+$/.test(String(id)));
  if (send && !people.length) return Response.json({ error: "Pick who it goes to" }, { status: 400 });
  const details = checkDetails(body.details ?? {}, lines.reduce((s, l) => s + Number(l.qty) * Number(l.rate), 0));
  if (typeof details === "string") return Response.json({ error: details }, { status: 400 });
  try {
    const { docs } = await readAll<ZohoLead>("zohoCustomers");
    // A customer made a minute ago ("New quotation") isn't in the copy until the next sync: ask Zoho.
    const customer = docs.find((c) => c.contactId === customerId)
      ?? await zohoGet<{ contact?: { contact_name?: string } }>(`/contacts/${customerId}`).then((r) => (r.contact?.contact_name ? { name: r.contact.contact_name } : null)).catch(() => null);
    if (!customer) return Response.json({ error: "That customer isn't in Zoho Books" }, { status: 404 });
    // The sales person picked in the popup — only one of Zoho's (else Zoho's default).
    if (details.salesperson && !(await salespeople()).includes(details.salesperson)) return Response.json({ error: "Pick a sales person from the list" }, { status: 400 });
    const quoteLines = lines.map((l) => ({ itemId: String(l.itemId), qty: Number(l.qty), rate: Number(l.rate), description: l.description?.slice(0, 2000) }));
    // Their draft saved again (owner, 30 Oct) — only while it's still a draft of this customer's in Zoho.
    if (body.estimateId) {
      const id = String(body.estimateId);
      if (!/^\d+$/.test(id)) return Response.json({ error: "Unknown quotation" }, { status: 400 });
      const had = (await zohoGet<{ estimate?: { status?: string; customer_id?: string; estimate_number?: string } }>(`/estimates/${id}`).catch(() => ({ estimate: undefined }))).estimate;
      if (!had || String(had.customer_id) !== customerId) return Response.json({ error: "That draft isn't in Zoho Books any more — close this and quote again" }, { status: 404 });
      if (had.status !== "draft") return Response.json({ error: `${had.estimate_number ?? "That quotation"} isn't a draft any more — make a new one with “start a new quotation”` }, { status: 409 });
      const saved = await updateQuote(id, { customerId, contactPersonIds: people, lines: quoteLines, details });
      const now = new Date().toISOString();
      await (await sentCol()).updateOne({ _id: id }, { $set: { number: saved.number, customerId, customerName: customer.name, total: saved.total, status: saved.status, lines: lines.length }, $setOnInsert: { sent: false, by: me.name, byId: me.id, at: now } }, { upsert: true });
      return Response.json({ ok: true, quote: { ...saved, url: zohoLink(id), sent: false } });
    }
    // No double clicks / two people at once: a second quotation for the same customer within 2 minutes is refused.
    const twoMin = new Date(Date.now() - 120_000).toISOString();
    const just = await (await sentCol()).findOne({ customerId, at: { $gte: twoMin } });
    if (just && !body.again) return Response.json({ error: `${just.number} was just made for this customer by ${just.by} — check Zoho first` }, { status: 409 });
    const made = await createQuote({ customerId, contactPersonIds: people, lines: quoteLines, details, send });
    await (await sentCol()).insertOne({ _id: made.estimateId, number: made.number, customerId, customerName: customer.name, total: made.total, sent: send, status: made.status, by: me.name, byId: me.id, at: new Date().toISOString(), lines: lines.length });
    return Response.json({ ok: true, quote: { ...made, url: zohoLink(made.estimateId), sent: send } });
  } catch (e) {
    console.error("[quotations] create failed:", e);
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't create the quotation" }, { status: 502 });
  }
}

/** The email step's Send (multipart: estimateId, to, cc, subject, body, fileName, attachments) — checked, then through Zoho Books. */
async function sendEmail(form: FormData | null): Promise<Response> {
  if (!form) return Response.json({ error: "Nothing to send" }, { status: 400 });
  const str = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const mails = (k: string) => str(k, 2000).split(/[,;\s]+/).map((x) => x.toLowerCase()).filter(Boolean);
  const id = str("estimateId", 30), to = mails("to"), cc = mails("cc"), subject = str("subject", 300), body = str("body", 100_000);
  const files = form.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0);
  const bad = [...to, ...cc].find((m) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m));
  if (!/^\d+$/.test(id)) return Response.json({ error: "Unknown quotation" }, { status: 400 });
  if (!to.length) return Response.json({ error: "Add at least one email in To" }, { status: 400 });
  if (bad) return Response.json({ error: `${bad} doesn't look like an email` }, { status: 400 });
  if (to.length + cc.length > 20 || files.length > 10) return Response.json({ error: "At most 20 emails and 10 attachments" }, { status: 400 });
  if (!subject) return Response.json({ error: "Type a subject" }, { status: 400 });
  if (files.reduce((n, f) => n + f.size, 0) > EMAIL_MAX_BYTES) return Response.json({ error: "Attachments are over 4 MB together — leave some out" }, { status: 400 });
  try {
    await emailQuote(id, { to, cc, subject, body, fileName: str("fileName", 120) || undefined, files });
    // Zoho marked it Sent — so does our record ("went to them N days ago" counts it from now).
    await (await sentCol()).updateOne({ _id: id }, { $set: { sent: true, status: "sent" } }).catch(() => undefined);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[quotations] email failed:", e);
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't send the email" }, { status: 502 });
  }
}

/** "New quotation" → a new customer in Zoho Books (checked here; one already in Zoho by that name is refused). */
async function newCustomer(n: Partial<NewCustomer>): Promise<Response> {
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const kind = n.kind === "individual" ? "individual" : "business";
  const firstName = s(n.firstName, 100), lastName = s(n.lastName, 100), email = s(n.email, 200).toLowerCase(), gstin = s(n.gstin, 15).toUpperCase();
  // A person's display name is their own unless one is typed; a business's is its company name (Zoho: Display Name*).
  const company = s(n.company, 200), displayName = s(n.displayName, 200) || (kind === "individual" ? `${firstName} ${lastName}`.trim() : company);
  // With a GSTIN its first two digits are the state (and decide the GST), whatever was picked.
  const state = INDIA_STATES.find(([code]) => code === (gstin ? fromGstin(gstin).state : n.state));
  // Zoho's mandatory Type (default New Customer) and Sector, and the Last Name its CRM sync needs (#151).
  const type = (CUSTOMER_FIELDS.type.options as readonly string[]).includes(n.type ?? "") ? n.type! : "New Customer";
  const sector = (CUSTOMER_FIELDS.sector.options as readonly string[]).find((x) => x === n.sector);
  const salutation = ["Mr.", "Mrs.", "Ms.", "Miss", "Dr."].includes(n.salutation ?? "") ? n.salutation : undefined;
  if (kind === "business" && company.length < 2) return Response.json({ error: "Type the company's name" }, { status: 400 });
  if (!firstName) return Response.json({ error: "Type the contact person's name" }, { status: 400 });
  if (!lastName) return Response.json({ error: "Type the contact's last name (Zoho needs it to sync with CRM)" }, { status: 400 });
  if (displayName.length < 2) return Response.json({ error: "Type the display name" }, { status: 400 });
  if (!sector) return Response.json({ error: "Pick the sector" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "That email doesn't look right" }, { status: 400 });
  if (gstin && !GSTIN_RE.test(gstin)) return Response.json({ error: "That GSTIN doesn't look right (15 characters)" }, { status: 400 });
  if (!state) return Response.json({ error: gstin ? "That GSTIN's state code (its first two digits) isn't a state" : "Pick the state (it decides the GST)" }, { status: 400 });
  const zip = s(n.zip, 6);
  if (zip && !/^\d{6}$/.test(zip)) return Response.json({ error: "The PIN code has 6 digits" }, { status: 400 });
  try {
    const { docs } = await readAll<ZohoLead>("zohoCustomers");
    const same = docs.find((c) => nameKey(c.name) === nameKey(displayName));
    if (same) return Response.json({ error: `${same.name} is already in Zoho Books — pick it from the list`, existing: same.contactId }, { status: 409 });
    const made = await createCustomer({
      kind, company, displayName, salutation, firstName, lastName, email, phone: s(n.phone, 30), workPhone: s(n.workPhone, 30),
      state: state[0], stateName: state[1], street: s(n.street, 200), city: s(n.city, 100), zip, gstin: gstin || undefined, type, sector,
    });
    return Response.json({ ok: true, customer: made });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't create the customer" }, { status: 502 });
  }
}

/** The popup's quote fields, checked: Zoho's options only, the two mandatory ones present, sane amounts. Error text or the details. */
function checkDetails(d: Partial<QuoteDetails>, subTotal: number): QuoteDetails | string {
  const F = QUOTE_FIELDS;
  const pick = (v: unknown, opts: readonly string[]) => (typeof v === "string" && opts.includes(v) ? v : undefined);
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const num = (v: unknown) => (v === undefined || v === null || v === "" ? 0 : Number(v));
  const sendToCrm = pick(d.sendToCrm, F.sendToCrm.options);
  const reminderFrequency = pick(d.reminderFrequency, F.reminderFrequency.options);
  if (!sendToCrm) return "Pick Send to CRM (Yes or No)";
  if (!reminderFrequency) return "Pick a reminder frequency";
  if (d.productType && !pick(d.productType, F.productType.options)) return "Pick a product type from the list";
  if (d.leadSource && !pick(d.leadSource, F.leadSource.options)) return "Pick a lead source from the list";
  const expiry = str(d.expiry, 10);
  if (expiry && (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || expiry < istToday())) return "The expiry date has to be today or later";
  const discount = d.discount && num(d.discount.value) > 0 ? { value: num(d.discount.value), percent: Boolean(d.discount.percent) } : undefined;
  if (discount && (!Number.isFinite(discount.value) || (discount.percent ? discount.value > 100 : discount.value > subTotal))) return "The discount can't be more than the items";
  const shipping = num(d.shipping);
  const adjustment = num(d.adjustment);
  if (!Number.isFinite(shipping) || shipping < 0 || shipping > 10_000_000) return "Shipping charges look wrong";
  if (!Number.isFinite(adjustment) || Math.abs(adjustment) > 10_000_000) return "The adjustment looks wrong";
  return {
    salesperson: str(d.salesperson, 100), sendToCrm, reminderFrequency, reminderDate: istToday(),
    productType: pick(d.productType, F.productType.options), leadSource: pick(d.leadSource, F.leadSource.options), dealName: str(d.dealName, 100),
    reference: str(d.reference, 50), expiry, discount, shipping: shipping || undefined, adjustment: adjustment || undefined,
    notes: typeof d.notes === "string" ? d.notes.slice(0, 5000) : undefined, terms: typeof d.terms === "string" ? d.terms.slice(0, 5000) : undefined,
  };
}

export async function PUT(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!isAdmin(me)) return Response.json({ error: "Admin connects Zoho Books" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { code?: string; clientId?: string; clientSecret?: string };
  if (!body.code?.trim()) return Response.json({ error: "Paste the code from the Zoho API console" }, { status: 400 });
  try {
    return Response.json({ ok: true, connected: await connectQuotes({ code: body.code, clientId: body.clientId, clientSecret: body.clientSecret }, me.name) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't connect" }, { status: 400 });
  }
}
