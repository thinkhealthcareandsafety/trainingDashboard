import { signedInMember, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasFullAccess, isAdmin } from "@/lib/roles";
import { readAll } from "@/lib/cachedRead";
import { copyTables } from "@/lib/analytics/source";
import { day, money, nameKey, onHandByItem } from "@/lib/analytics/build";
import { type ZItem, itemGst, itemImage, zohoGet } from "@/lib/zoho";
import { INDIA_STATES, type NewCustomer, QUOTE_FIELDS, QUOTE_SCOPES, type QuoteDetails, type QuoteLine, connectQuotes, createCustomer, createQuote, quotesInfo } from "@/lib/quotations";
import type { ZohoLead } from "@/lib/types";

export const dynamic = "force-dynamic";

/*
 * Quotations page (owner, 28 Oct). Admin, Ashish, Shikha, Sumit only.
 *   GET                      — connection state + one page (50) of customers: ?q= &sector= &type= &sort=quote|name &page=
 *   GET ?customer=<id>       — the popup: contact persons, GST state, their last quotation (lines and fields, to start
 *                              from), quoted lately?, sales people, the quote fields' options, Zoho's notes and terms
 *   GET ?items=1             — the item picker (Zoho items, active, with price, GST %, stock)
 *   GET ?item=<id>           — one item's description (read when it's picked — descriptions are long)
 *   POST {customerId, contactPersonIds, lines, details, send}  — creates the quotation in Zoho Books (emails it when send)
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
async function recentSent(): Promise<Map<string, Last>> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const out = new Map<string, Last>();
  for (const s of await (await sentCol()).find({ at: { $gte: since } }).sort({ at: 1 }).toArray()) {
    out.set(s.customerId, { date: new Date(Date.parse(s.at) + 5.5 * 3600_000).toISOString().slice(0, 10), number: s.number, amount: s.total, status: s.sent ? "sent" : "draft" });
  }
  return out;
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
  if (!hasFullAccess(me)) return Response.json({ error: "Only Admin, Ashish, Shikha and Sumit send quotations" }, { status: 403 });
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
        histories(), recentSent(), salespeople(), defaultNotesTerms(),
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
      let last: { number: string; date: string; lines: LastLine[]; salesperson: string | null; fields: Record<string, string> } | null = null;
      if (e?.estimate_id) {
        const d = await zohoGet<{ estimate?: { line_items?: Record<string, unknown>[]; custom_fields?: CF[] } }>(`/estimates/${e.estimate_id}`);
        const cf = (api: string) => String(d.estimate?.custom_fields?.find((f) => f.api_name === api)?.value ?? "");
        last = {
          number: String(e.estimate_number ?? ""), date: String(e.date ?? ""), salesperson: (e.salesperson_name as string) || null,
          lines: (d.estimate?.line_items ?? []).filter((l) => l.item_id).map((l) => ({
            itemId: String(l.item_id), name: String(l.name ?? ""), qty: Number(l.quantity) || 1, rate: Number(l.rate) || 0,
            description: (l.description as string) || undefined, gst: l.tax_percentage === undefined || l.tax_percentage === "" ? null : Number(l.tax_percentage),
          })),
          fields: { sendToCrm: cf("cf_send_to_crm"), reminderFrequency: cf("cf_reminder_frequency"), productType: cf("cf_category"), leadSource: cf("cf_lead_source") },
        };
      }
      const lq = lastQuote(h.get(customerId), mine.get(customerId));
      const recent = lq && daysSince(lq.date) <= RECENT_DAYS ? { number: lq.number, date: lq.date, days: daysSince(lq.date) } : null;
      // Sales person: you, when Zoho has you as one; else whoever made their last quote.
      const same = (a: string | null | undefined, b: string) => (a ?? "").toLowerCase().replace(/\s+/g, " ") === b.toLowerCase().replace(/\s+/g, " ");
      const salesperson = people.find((p) => same(me.name, p)) ?? people.find((p) => same(last?.salesperson, p)) ?? null;
      return Response.json({ contacts, customer, last, recent, salespeople: people, salesperson, options, notes: nt.notes, terms: nt.terms, today: istToday() });
    }

    // The list: search, filters, sort, one page.
    const [{ docs }, h, mine, info] = await Promise.all([readAll<ZohoLead>("zohoCustomers"), histories(), recentSent(), quotesInfo()]);
    const text = nameKey(q.get("q") ?? "");
    const words = (q.get("q") ?? "").toLowerCase().trim();
    const sector = q.get("sector") ?? "";
    const type = q.get("type") ?? "";
    const digits = words.replace(/\D/g, "");
    const rows = docs.filter((c) => (!sector || c.sector === sector) && (!type || c.type === type)
      && (!words || nameKey(c.name).includes(text) || (c.email ?? "").toLowerCase().includes(words) || (digits.length >= 4 && (c.mobile ?? c.phone ?? "").replace(/\D/g, "").includes(digits))));
    const withLast = rows.map((c) => ({ c, quote: lastQuote(h.get(c.contactId), mine.get(c.contactId)), invoice: h.get(c.contactId)?.invoice ?? null }));
    // Default: customers quoted or billed most recently first (the ones you're working with), then A–Z.
    const latest = (x: (typeof withLast)[number]) => [x.quote?.date ?? "", x.invoice ?? ""].sort().at(-1)!;
    withLast.sort((a, b) => (q.get("sort") === "name" ? 0 : latest(b).localeCompare(latest(a))) || a.c.name.localeCompare(b.c.name));
    const page = Math.max(0, Number(q.get("page")) || 0);
    const count = (k: "sector" | "type") => [...docs.reduce((m, c) => (c[k] ? m.set(c[k]!, (m.get(c[k]!) ?? 0) + 1) : m), new Map<string, number>())].sort((a, b) => b[1] - a[1]).map(([v]) => v);
    return Response.json({
      connected: info, scopes: QUOTE_SCOPES, admin: isAdmin(me), live: process.env.VERCEL_ENV === "production", states: INDIA_STATES,
      total: withLast.length, page, pageSize: PAGE, sectors: count("sector"), types: count("type"),
      customers: withLast.slice(page * PAGE, page * PAGE + PAGE).map(({ c, quote, invoice }) => ({
        id: c.contactId, name: c.name, email: c.email ?? null, phone: c.mobile ?? c.phone ?? null, sector: c.sector ?? null, type: c.type ?? null,
        lastQuote: quote ?? null, lastInvoice: invoice,
      })),
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't load customers" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!hasFullAccess(me)) return Response.json({ error: "Only Admin, Ashish, Shikha and Sumit send quotations" }, { status: 403 });
  // Like the reminder emails: only the live site writes to Zoho Books — a local server can't make a real quote by accident.
  if (process.env.VERCEL_ENV !== "production") return Response.json({ error: "Only the live site creates quotations in Zoho Books" }, { status: 409 });
  const body = (await request.json().catch(() => ({}))) as { customerId?: string; contactPersonIds?: string[]; lines?: QuoteLine[]; details?: Partial<QuoteDetails>; send?: boolean; again?: boolean; newCustomer?: Partial<NewCustomer> };
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
    // No double clicks / two people at once: a second quotation for the same customer within 2 minutes is refused.
    const twoMin = new Date(Date.now() - 120_000).toISOString();
    const just = await (await sentCol()).findOne({ customerId, at: { $gte: twoMin } });
    if (just && !body.again) return Response.json({ error: `${just.number} was just made for this customer by ${just.by} — check Zoho first` }, { status: 409 });
    // The sales person picked in the popup — only one of Zoho's (else Zoho's default).
    if (details.salesperson && !(await salespeople()).includes(details.salesperson)) return Response.json({ error: "Pick a sales person from the list" }, { status: 400 });
    const made = await createQuote({ customerId, contactPersonIds: people, lines: lines.map((l) => ({ itemId: String(l.itemId), qty: Number(l.qty), rate: Number(l.rate), description: l.description?.slice(0, 2000) })), details, send });
    await (await sentCol()).insertOne({ _id: made.estimateId, number: made.number, customerId, customerName: customer.name, total: made.total, sent: send, status: made.status, by: me.name, byId: me.id, at: new Date().toISOString(), lines: lines.length });
    return Response.json({ ok: true, quote: { ...made, url: zohoLink(made.estimateId), sent: send } });
  } catch (e) {
    console.error("[quotations] create failed:", e);
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't create the quotation" }, { status: 502 });
  }
}

/** "New quotation" → a new customer in Zoho Books (checked here; one already in Zoho by that name is refused). */
async function newCustomer(n: Partial<NewCustomer>): Promise<Response> {
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const company = s(n.company, 200), firstName = s(n.firstName, 100), email = s(n.email, 200).toLowerCase(), gstin = s(n.gstin, 15).toUpperCase();
  const state = INDIA_STATES.find(([code]) => code === n.state);
  if (company.length < 2) return Response.json({ error: "Type the company's name" }, { status: 400 });
  if (!firstName) return Response.json({ error: "Type the contact person's name" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "That email doesn't look right" }, { status: 400 });
  if (!state) return Response.json({ error: "Pick the state (it decides the GST)" }, { status: 400 });
  if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(gstin)) return Response.json({ error: "That GSTIN doesn't look right (15 characters)" }, { status: 400 });
  try {
    const { docs } = await readAll<ZohoLead>("zohoCustomers");
    const same = docs.find((c) => nameKey(c.name) === nameKey(company));
    if (same) return Response.json({ error: `${same.name} is already in Zoho Books — pick it from the list`, existing: same.contactId }, { status: 409 });
    const made = await createCustomer({ company, firstName, lastName: s(n.lastName, 100), email, phone: s(n.phone, 30), state: state[0], stateName: state[1], city: s(n.city, 100), gstin: gstin || undefined });
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
