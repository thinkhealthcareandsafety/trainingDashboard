import { signedInMember, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasFullAccess, isAdmin } from "@/lib/roles";
import { readAll } from "@/lib/cachedRead";
import { copyTables } from "@/lib/analytics/source";
import { day, money, nameKey } from "@/lib/analytics/build";
import { type ZItem, zohoGet } from "@/lib/zoho";
import { QUOTE_SCOPES, type QuoteLine, connectQuotes, createQuote, quotesInfo } from "@/lib/quotations";
import type { ZohoLead } from "@/lib/types";

export const dynamic = "force-dynamic";

/*
 * Quotations page (owner, 28 Oct). Admin, Ashish, Shikha, Sumit only.
 *   GET                      — connection state + one page (50) of customers: ?q= &sector= &type= &sort=quote|name &page=
 *   GET ?customer=<id>       — the popup: contact persons, their last quotation's lines (to start from), quoted lately?
 *   GET ?items=1             — the item picker (Zoho items, active, with price)
 *   POST {customerId, contactPersonIds, lines, send}  — creates the quotation in Zoho Books (and emails it when send)
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

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!hasFullAccess(me)) return Response.json({ error: "Only Admin, Ashish, Shikha and Sumit send quotations" }, { status: 403 });
  const q = new URL(request.url).searchParams;
  try {
    if (q.get("items")) {
      const doc = await (await db()).collection<{ _id: string; items?: ZItem[] }>("kv").findOne({ _id: "zoho_items" });
      const items = (doc?.items ?? []).filter((i) => i.active !== false).map((i) => ({ id: i.id, name: i.name, group: i.identifier ?? null, rate: i.rate ?? null }));
      return Response.json({ items });
    }

    const customerId = q.get("customer");
    if (customerId) {
      if (!/^\d+$/.test(customerId)) return Response.json({ error: "Unknown customer" }, { status: 400 });
      const [cp, list, h, mine] = await Promise.all([
        zohoGet<{ contact_persons?: Record<string, unknown>[] }>(`/contacts/${customerId}/contactpersons`),
        zohoGet<{ estimates?: Record<string, unknown>[] }>("/estimates", { customer_id: customerId, sort_column: "date", sort_order: "D", per_page: 1 }),
        histories(), recentSent(),
      ]);
      const contacts = (cp.contact_persons ?? []).map((p) => ({
        id: String(p.contact_person_id), name: [p.salutation, p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null,
        email: (p.email as string) || null, phone: (p.mobile as string) || (p.phone as string) || null, primary: Boolean(p.is_primary_contact),
      }));
      const e = list.estimates?.[0];
      let last: { number: string; date: string; lines: (QuoteLine & { name: string })[] } | null = null;
      if (e?.estimate_id) {
        const d = await zohoGet<{ estimate?: { line_items?: Record<string, unknown>[] } }>(`/estimates/${e.estimate_id}`);
        last = {
          number: String(e.estimate_number ?? ""), date: String(e.date ?? ""),
          lines: (d.estimate?.line_items ?? []).filter((l) => l.item_id).map((l) => ({ itemId: String(l.item_id), name: String(l.name ?? ""), qty: Number(l.quantity) || 1, rate: Number(l.rate) || 0, description: (l.description as string) || undefined })),
        };
      }
      const lq = lastQuote(h.get(customerId), mine.get(customerId));
      const recent = lq && daysSince(lq.date) <= RECENT_DAYS ? { number: lq.number, date: lq.date, days: daysSince(lq.date) } : null;
      return Response.json({ contacts, last, recent });
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
      connected: info, scopes: QUOTE_SCOPES, admin: isAdmin(me), live: process.env.VERCEL_ENV === "production",
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
  const body = (await request.json().catch(() => ({}))) as { customerId?: string; contactPersonIds?: string[]; lines?: QuoteLine[]; send?: boolean; again?: boolean };
  const customerId = String(body.customerId ?? "");
  const send = body.send !== false;
  const lines = (body.lines ?? []).filter((l) => l && /^\d+$/.test(String(l.itemId)));
  if (!/^\d+$/.test(customerId)) return Response.json({ error: "Pick a customer" }, { status: 400 });
  if (!lines.length || lines.length > 40) return Response.json({ error: "Add at least one item" }, { status: 400 });
  if (lines.some((l) => !(Number(l.qty) > 0) || Number(l.qty) > 100_000 || !(Number(l.rate) >= 0))) return Response.json({ error: "Every item needs a quantity and a price" }, { status: 400 });
  const people = (body.contactPersonIds ?? []).filter((id) => /^\d+$/.test(String(id)));
  if (send && !people.length) return Response.json({ error: "Pick who it goes to" }, { status: 400 });
  try {
    const { docs } = await readAll<ZohoLead>("zohoCustomers");
    const customer = docs.find((c) => c.contactId === customerId);
    if (!customer) return Response.json({ error: "That customer isn't in the Zoho copy" }, { status: 404 });
    // No double clicks / two people at once: a second quotation for the same customer within 2 minutes is refused.
    const twoMin = new Date(Date.now() - 120_000).toISOString();
    const just = await (await sentCol()).findOne({ customerId, at: { $gte: twoMin } });
    if (just && !body.again) return Response.json({ error: `${just.number} was just made for this customer by ${just.by} — check Zoho first` }, { status: 409 });
    // The quote's sales person = whoever sends it, when Zoho has them as a sales person (else Zoho's default).
    const t = await copyTables();
    const salesperson = (t.salespersons ?? []).map((s) => (s["Name"] ?? "").trim()).find((n) => n.toLowerCase() === me.name.toLowerCase());
    const made = await createQuote({ customerId, contactPersonIds: people, lines: lines.map((l) => ({ itemId: String(l.itemId), qty: Number(l.qty), rate: Number(l.rate), description: l.description?.slice(0, 2000) })), salesperson, send });
    await (await sentCol()).insertOne({ _id: made.estimateId, number: made.number, customerId, customerName: customer.name, total: made.total, sent: send, status: made.status, by: me.name, byId: me.id, at: new Date().toISOString(), lines: lines.length });
    return Response.json({ ok: true, quote: { ...made, url: zohoLink(made.estimateId), sent: send } });
  } catch (e) {
    console.error("[quotations] create failed:", e);
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't create the quotation" }, { status: 502 });
  }
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
