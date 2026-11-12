import { signedInMember, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { canQuote, isAdmin } from "@/lib/roles";
import { readAll } from "@/lib/cachedRead";
import { copyTables } from "@/lib/analytics/source";
import { day, demandByItem, money, nameKey, onHandByItem } from "@/lib/analytics/build";
import { type ZItem, brochureIdOf, estimatePdf, itemGst, itemImage, itemSets, zohoGet } from "@/lib/zoho";
import { GSTIN_RE, fromGstin } from "@/lib/gstin";
import { CUSTOMER_FIELDS, EMAIL_MAX_BYTES, INDIA_STATES, type NewCustomer, QUOTE_FIELDS, QUOTE_SCOPES, type QuoteDetails, type QuoteLine, addContactPerson, upsertCoordinator, brochurePdf, connectQuotes, editItem, uploadBrochure, uploadPicture, createCustomer, createQuote, emailQuote, quotesInfo, updateQuote } from "@/lib/quotations";
import type { ZohoLead } from "@/lib/types";
import { findDraft, saveDraft } from "@/lib/zohoMail";
import { type QuoteEmailInput, ZIA_MAILBOX, isTeamEmail, mergeCc, ziaBrief, ziaPrompt } from "@/lib/quoteEmails";
import { BROCHURE_MAX_BYTES, PICTURE_MAX_BYTES, cleanItemFields, isPicture, itemFieldsOf, itemPictures, itemProblem, type ItemFields } from "@/lib/itemEdit";
import { askZia, ziaAnswer, ziaFlowOn } from "@/lib/ziaFlow";
import { TS, type ZEstimate, buildTsQuote, parseMarkups, rollMarkups, tsQuoteNumber } from "@/lib/totalSupply";
import { tsQuotePdf } from "@/lib/totalSupplyPdf";
import { sendTsMail, tsMailOn } from "@/lib/totalSupplyMail";
import { WORKDRIVE_LINK, WORKDRIVE_SCOPES, connectWorkdrive, goodWdId, parseWdPath, workdriveFolder, workdriveInfo, workdrivePdf } from "@/lib/workdrive";
import { type Coordinator, coordinatorRecipients, isTrainingOnly, readCoordinator, toTrainingQuote } from "@/lib/trainingManager";
import { passwordForEmail } from "@/lib/portalAuth";
import { portalTemplates } from "@/lib/templateStore";
import { loginBoxHtml, trainingLink } from "@/lib/portalEmail";
import { portalBase } from "@/lib/portalHost";
import { markLoginSent } from "@/lib/portalTrainings";
import { renderTemplate } from "@/lib/templateText";

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
 *   POST {zia: {request, quote}}                       — leaves a brief for Zia as a draft in learn@'s Zoho Mail (3 Nov)
 *   GET ?zia=<quote number>  — that draft once Zia wrote it and it was saved (subject + HTML)
 *   GET ?wd=1&path=<folder ids> — Add PDF from WorkDrive (5 Nov): one folder inside the shared folder, or that it isn't connected
 *   POST {wdPick: {itemId, path, fileId}} — copies that PDF from WorkDrive onto the item in Zoho Books
 *   PUT {workdrive: true, code, ...} — Admin connects WorkDrive
 *   GET ?ts=<quote id>       — a Total Supply quotation for this quote: fresh random prices, totals, the next number (5 Nov)
 *   GET ?tsPdf=<quote id>&m=<percentages> — its PDF, to look at before sending
 *   POST form with tsEstimateId, markups — sends it from Total Supply's Gmail and keeps a record (`totalSupplyQuotes`)
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

type Last = { id?: string; date: string; number: string; amount: number; status: string };
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
    if (!h.quote || date > h.quote.date) h.quote = { id: q["Quote ID"] || undefined, date, number: q["Quote Number"] ?? "", amount: money(q["Sub Total (BCY)"]) ?? 0, status: q["Status"] ?? "" };
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
    out.set(s.customerId, { id: s._id, date: new Date(Date.parse(s.at) + 5.5 * 3600_000).toISOString().slice(0, 10), number: s.number, amount: s.total, status: s.sent ? "sent" : "draft" });
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
  const q = new URL(request.url).searchParams;
  // Every member can use the Items page (owner, 5 Nov): the list, one item, its pictures, and WorkDrive's folder for Add PDF. Customers, quotations and everything else stay with the people who quote.
  if (!canQuote(me) && !q.has("items") && !q.has("item") && !q.has("image") && !q.has("wd")) return Response.json({ error: "Only Admin, Ashish, Shikha, Sumit, Nikita, Anuj and Pranjal send quotations" }, { status: 403 });
  try {
    if (q.get("items")) {
      // The stock tables are read once per Analytics refresh and already hold Quote Items, so "demand" costs no extra reads.
      const [doc, tables] = await Promise.all([
        (await db()).collection<{ _id: string; items?: ZItem[] }>("kv").findOne({ _id: "zoho_items" }),
        copyTables(undefined, true).catch(() => null),
      ]);
      const stock = tables ? onHandByItem(tables) : new Map<string, number>();
      const demand = tables ? demandByItem(tables, new Date().toISOString().slice(0, 10)) : new Map<string, number>();
      const everything = q.get("all") === "1"; // the Items page's Everything: inactive ones too. Quotations only ever pick active ones.
      const items = (doc?.items ?? []).filter((i) => everything || i.active !== false).map((i) => ({
        id: i.id, active: i.active !== false, name: i.name, group: i.identifier ?? null, rate: i.rate ?? null, gst: i.gst ?? null, unit: i.unit ?? null,
        stock: i.stock ?? null, service: Boolean(i.service), onHand: i.service ? null : Math.round(stock.get(i.id) ?? 0),
        category: i.category ?? null, image: i.image ?? null, demand: demand.get(i.id) ?? 0, brochure: i.brochure ?? null,
      }));
      return Response.json({ items, live: process.env.VERCEL_ENV === "production" });
    }

    // An item's picture (the catalogue): kept in memory here and a week in the browser — one Zoho call per picture.
    const imageId = q.get("image");
    if (imageId) {
      if (!/^\d+$/.test(imageId)) return new Response(null, { status: 400 });
      const doc = q.get("doc");
      if (doc && !/^\d+$/.test(doc)) return new Response(null, { status: 400 });
      const cacheKey = doc ? `${imageId}:${doc}` : imageId;
      const img = images.get(cacheKey) ?? (await itemImage(imageId, doc ?? undefined).catch(() => null));
      if (!images.has(cacheKey)) { images.set(cacheKey, img); if (images.size > 400) images.delete(images.keys().next().value!); }
      // "No picture" is kept briefly: one can be added at any time (a day here hid the FRx AED's picture after the fix, owner 4 Nov).
      if (!img) return new Response(null, { status: 404, headers: { "Cache-Control": "private, max-age=300" } });
      return new Response(img.bytes, { headers: { "Content-Type": img.type, "Cache-Control": "private, max-age=604800" } });
    }

    // Add PDF from WorkDrive (owner, 5 Nov): one folder, only ever inside the shared folder.
    if (q.get("wd")) {
      const path = parseWdPath(q.get("path"));
      if (!path) return Response.json({ error: "Unknown folder" }, { status: 400 });
      const common = { admin: isAdmin(me), link: WORKDRIVE_LINK, scopes: WORKDRIVE_SCOPES };
      if (!(await workdriveInfo())) return Response.json({ ...common, connected: false, entries: [] });
      return Response.json({ ...common, connected: true, entries: await workdriveFolder(path) });
    }

    // Total Supply quotation (owner, 5 Nov): the prices to show in the email step, and the PDF to look at. Nothing is saved or numbered yet.
    const tsId = q.get("ts") ?? q.get("tsPdf");
    if (tsId) {
      if (!/^\d+$/.test(tsId)) return Response.json({ error: "Unknown quotation" }, { status: 400 });
      const e = await readEstimate(tsId);
      const count = e.line_items?.length ?? 0;
      const number = tsQuoteNumber(istToday(), (await tsCounter()) + 1);
      if (q.get("tsPdf")) {
        const m = parseMarkups(q.get("m"), count);
        if (!m) return Response.json({ error: "These prices don't match the quotation any more" }, { status: 400 });
        return new Response(Buffer.from(await tsQuotePdf(buildTsQuote(e, m, number, istToday()))), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${number}.pdf"`, "Cache-Control": "private, no-store" } });
      }
      const t = buildTsQuote(e, rollMarkups(count), number, istToday());
      return Response.json({
        ready: tsMailOn(), from: TS.sender, number, file: `${number}.pdf`, total: t.total, expiry: t.expiry, markups: t.lines.map((l) => l.percent), taxed: t.taxMode !== "none",
        lines: t.lines.map((l) => ({ name: l.name, qty: l.qty, was: l.was, rate: l.rate, percent: l.percent, gst: l.gst })),
      });
    }

    // Zoho's own PDF of a quotation, to download (#150 step 4) — read with the sync's read-only connection.
    const pdfId = q.get("pdf");
    if (pdfId) {
      if (!/^\d+$/.test(pdfId)) return new Response(null, { status: 400 });
      const name = (q.get("name") ?? "").replace(/[^A-Za-z0-9_-]/g, "") || "Quotation";
      return new Response(await estimatePdf(pdfId), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"`, "Cache-Control": "private, no-store" } });
    }

    // Zia (owner, 3 Nov): the draft Zia wrote in Zoho Mail for this quote (found by the quote number in its subject).
    const ziaFor = q.get("zia");
    if (ziaFor) {
      if (!/^[A-Za-z0-9/_-]{1,40}$/.test(ziaFor)) return Response.json({ error: "Unknown quotation" }, { status: 400 });
      // Through Zoho Flow: the answer it posted back (kv), or "still writing".
      if (ziaFlowOn()) {
        const a = await ziaAnswer(ziaFor);
        if (a === "waiting") return Response.json({ waiting: true });
        // Just Zia's words: the email step adds the signature of whoever is sending.
        if (a) return Response.json({ subject: a.subject ?? "", text: a.text });
      }
      const d = await findDraft(ZIA_MAILBOX, ziaFor).catch((e: Error) => ({ error: e.message }));
      if (!d) return Response.json({ error: `No draft for ${ziaFor} in ${ZIA_MAILBOX}'s Zoho Mail yet — have Zia write it there and save the draft` }, { status: 404 });
      if ("error" in d) return Response.json({ error: d.error }, { status: 502 });
      return Response.json({ subject: d.subject, html: d.html });
    }

    // The email step's starting point: Zoho's quote email template filled for this quote (#150 step 5).
    const emailId = q.get("email");
    if (emailId) {
      if (!/^\d+$/.test(emailId)) return Response.json({ error: "Unknown quotation" }, { status: 400 });
      type ToContact = { email?: string; first_name?: string; last_name?: string; selected?: boolean };
      // `customer`: their contact persons' numbers, for the training coordinator's "Same as original" (step 2).
      const customer = q.get("customer") ?? "";
      type Person = { email?: string; mobile?: string; phone?: string };
      const [j, brochures, persons] = await Promise.all([
        zohoGet<Record<string, unknown> & { data?: Record<string, unknown> }>(`/estimates/${emailId}/email`),
        quoteBrochures(emailId).catch(() => []),
        /^\d+$/.test(customer) ? zohoGet<{ contact?: { contact_persons?: Person[] } }>(`/contacts/${customer}`).then((c) => c.contact?.contact_persons ?? []).catch(() => [] as Person[]) : Promise.resolve([] as Person[]),
      ]);
      const phoneOf = (email: string) => { const p = persons.find((x) => (x.email ?? "").toLowerCase() === email.toLowerCase()); return (p?.mobile || p?.phone || "").trim() || null; };
      type FromEmail = { email?: string; selected?: boolean; is_org_email_id?: boolean };
      const d = (j.data ?? j) as { subject?: string; body?: string; file_name?: string; to_contacts?: ToContact[]; from_emails?: FromEmail[] };
      const senders = d.from_emails ?? [];
      return Response.json({
        from: (senders.find((x) => x.is_org_email_id) ?? senders.find((x) => x.selected))?.email ?? null, // emailQuote sends from the organisation's email
        brochures, ziaVia: ziaFlowOn() ? "flow" : "mail", subject: d.subject ?? "", body: d.body ?? "", fileName: d.file_name ?? null, maxBytes: EMAIL_MAX_BYTES,
        to: (d.to_contacts ?? []).filter((x) => x.email).map((x) => ({ email: x.email!, name: [x.first_name, x.last_name].filter(Boolean).join(" ") || null, selected: x.selected !== false, phone: phoneOf(x.email!) })),
      });
    }

    const itemId = q.get("item");
    if (itemId) {
      if (!/^\d+$/.test(itemId)) return Response.json({ error: "Unknown item" }, { status: 400 });
      const d = await zohoGet<{ item?: Record<string, unknown> }>(`/items/${itemId}`);
      const i = d.item ?? {};
      return Response.json({ description: (i.description as string) ?? "", gst: itemGst(i) ?? null, unit: (i.unit as string) || null, rate: Number(i.rate) || null, fields: itemFieldsOf(i), pictures: itemPictures(i) });
    }

    // One quotation (owner, 11 Nov): its items, status, and every email that went — ours in full, Zoho's history lines.
    const viewId = q.get("view");
    if (viewId) {
      if (!/^\d+$/.test(viewId)) return Response.json({ error: "Unknown quotation" }, { status: 400 });
      return Response.json(await quotationView(viewId));
    }

    const customerId = q.get("customer");
    if (customerId) {
      if (!/^\d+$/.test(customerId)) return Response.json({ error: "Unknown customer" }, { status: 400 });
      const fromId = /^\d+$/.test(q.get("from") ?? "") ? q.get("from")! : null;
      const [ct, list, h, mine, people, nt] = await Promise.all([
        zohoGet<{ contact?: Record<string, unknown> & { contact_persons?: Record<string, unknown>[]; billing_address?: { city?: string; state?: string } } }>(`/contacts/${customerId}`),
        fromId ? zohoGet<{ estimate?: Record<string, unknown> }>(`/estimates/${fromId}`).then((r) => ({ estimates: r.estimate && String(r.estimate.customer_id) === customerId ? [r.estimate] : [] }))
          : zohoGet<{ estimates?: Record<string, unknown>[] }>("/estimates", { customer_id: customerId, sort_column: "date", sort_order: "D", per_page: 1 }),
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
      let last: { id: string; status: string; number: string; date: string; lines: LastLine[]; salesperson: string | null; fields: Record<string, string>; draftId?: string } | null = null;
      if (e?.estimate_id) {
        const d = await zohoGet<{ estimate?: { line_items?: Record<string, unknown>[]; custom_fields?: CF[] } }>(`/estimates/${e.estimate_id}`);
        const cf = (api: string) => String(d.estimate?.custom_fields?.find((f) => f.api_name === api)?.value ?? "");
        last = {
          id: String(e.estimate_id), status: String(e.status ?? ""), number: String(e.estimate_number ?? ""), date: String(e.date ?? ""), salesperson: (e.salesperson_name as string) || null,
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
  const refused = () => Response.json({ error: "Only Admin, Ashish, Shikha, Sumit, Nikita, Anuj and Pranjal send quotations" }, { status: 403 });
  // Like the reminder emails: only the live site writes to Zoho Books — a local server can't make a real quote by accident.
  if (process.env.VERCEL_ENV !== "production") return Response.json({ error: "Only the live site creates quotations in Zoho Books" }, { status: 409 });
  if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    // Everything on an item is for every member (owner, 5 Nov).
    if (form?.get("brochure")) return saveBrochure(form, me);
    if (form?.get("picture")) return savePicture(form, me);
    if (!canQuote(me)) return refused();
    return form?.get("tsEstimateId") ? sendTotalSupply(form, me) : sendEmail(form, me.name);
  }
  const body = (await request.json().catch(() => ({}))) as { customerId?: string; contactPersonIds?: string[]; lines?: QuoteLine[]; details?: Partial<QuoteDetails>; send?: boolean; again?: boolean; newCustomer?: Partial<NewCustomer>; estimateId?: string; revise?: boolean; zia?: { request?: string; quote?: QuoteEmailInput }; addEmail?: { customerId?: string; firstName?: string; lastName?: string; email?: string }; editItem?: { id?: string; fields?: Partial<Record<keyof ItemFields, unknown>> }; wdPick?: { itemId?: string; path?: string; fileId?: string } };
  if (body.wdPick) return pickFromWorkdrive(body.wdPick, me);
  if (body.editItem) return saveItem(body.editItem, me);
  if (!canQuote(me)) return refused();
  if (body.newCustomer) return newCustomer(body.newCustomer);
  if (body.addEmail) return addEmail(body.addEmail, me.name);
  if (body.zia) return ziaDraft(body.zia);
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
      const revisable = body.revise === true ? ["draft", "sent", "declined", "expired"] : ["draft"];
      if (!revisable.includes(String(had.status))) return Response.json({ error: body.revise === true ? `${had.estimate_number ?? "That quotation"} is ${had.status} — make a new one with the same items instead` : `${had.estimate_number ?? "That quotation"} isn't a draft any more — make a new one with “start a new quotation”` }, { status: 409 });
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

/** Zia (owner, 3 Nov): leaves the brief as a draft in Zoho Mail for Zia to write the email from. Checked and trimmed. */
async function ziaDraft(z: { request?: string; quote?: QuoteEmailInput }): Promise<Response> {
  const q = z.quote;
  const s = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
  if (!q || !/^[A-Za-z0-9/_-]{1,40}$/.test(String(q.number ?? ""))) return Response.json({ error: "Save the quotation first" }, { status: 400 });
  const lines = (Array.isArray(q.lines) ? q.lines : []).slice(0, 100).map((l) => ({ name: s(l?.name, 300), qty: Number(l?.qty) || 1, group: null }));
  const quote: QuoteEmailInput = {
    company: s(q.company, 200), contact: s(q.contact, 100) || null, number: String(q.number), total: Number(q.total) || 0,
    expiry: s(q.expiry, 10) || null, salesperson: s(q.salesperson, 100) || null, lines,
  };
  try {
    // Zoho Flow set up (owner, 3 Nov): Zia writes it there and the answer comes back by itself — no Zoho Mail step.
    if (ziaFlowOn()) {
      await askZia(quote.number, ziaPrompt(s(z.request, 1000), quote));
      return Response.json({ ok: true, via: "flow" });
    }
    await saveDraft(ZIA_MAILBOX, ziaBrief(s(z.request, 1000), quote));
    return Response.json({ ok: true, via: "mail", mailbox: ZIA_MAILBOX });
  } catch (e) {
    console.error("[quotations] zia draft failed:", e);
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't save the draft in Zoho Mail" }, { status: 502 });
  }
}

/**
 * The Items page's Edit (owner, 4 Nov). Zoho shows every edit under the connected user, so `itemEdits` keeps who changed what. The
 * list's copy follows at once; the hourly item read would otherwise show the old values for up to an hour.
 */
async function saveItem(e: { id?: string; fields?: Partial<Record<keyof ItemFields, unknown>> }, me: { id: string; name: string }): Promise<Response> {
  const id = String(e.id ?? "");
  if (!/^\d+$/.test(id)) return Response.json({ error: "Unknown item" }, { status: 400 });
  const fields = cleanItemFields(e.fields ?? {});
  const problem = itemProblem(fields);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  try {
    const { changes, saved } = await editItem(id, fields);
    if (Object.keys(changes).length) {
      const d = await db();
      await d.collection<{ at: string; by: string; itemId: string; changes: object }>("itemEdits").insertOne({ at: new Date().toISOString(), by: me.name, itemId: id, changes }).catch((x) => console.error("[quotations] item edit log failed:", x));
      await d.collection<{ _id: string }>("kv").updateOne({ _id: "zoho_items", "items.id": id } as object, { $set: { "items.$.name": saved.name, "items.$.rate": saved.rate, "items.$.identifier": saved.identifier || null, "items.$.stock": saved.stock || null, "items.$.gst": saved.gst === "" ? null : Number(saved.gst) } }).catch((x) => console.error("[quotations] item copy failed:", x));
    }
    return Response.json({ ok: true, saved, changed: Object.keys(changes) });
  } catch (x) {
    console.error("[quotations] item edit failed:", x);
    return Response.json({ error: x instanceof Error ? x.message : "Couldn't save the item" }, { status: 502 });
  }
}

/** "Add PDF" on the Items page, for everyone (owner, 5 Nov); each one is in `itemEdits` with who did it: a real PDF, as big as Vercel lets through. The list's copy follows at once. */
async function saveBrochure(form: FormData, me: { id: string; name: string }): Promise<Response> {
  const id = String(form.get("brochure") ?? "");
  const file = form.get("file");
  if (!/^\d+$/.test(id)) return Response.json({ error: "Unknown item" }, { status: 400 });
  if (!(file instanceof File) || !file.size) return Response.json({ error: "Pick a PDF" }, { status: 400 });
  if (file.size >= BROCHURE_MAX_BYTES) return Response.json({ error: "Over 4 MB is too big to upload from a computer: pick it from Zoho WorkDrive instead" }, { status: 400 });
  if (Buffer.from(await file.slice(0, 5).arrayBuffer()).toString("latin1") !== "%PDF-") return Response.json({ error: "That file isn't a PDF" }, { status: 400 });
  return attachBrochure(id, async () => file, me);
}

/** "Zoho WorkDrive" in Add PDF: the same as a PDF from the computer, but the server fetches the file itself. */
async function pickFromWorkdrive(p: { itemId?: string; path?: string; fileId?: string }, me: { id: string; name: string }): Promise<Response> {
  const id = String(p.itemId ?? ""), path = parseWdPath(p.path);
  if (!/^\d+$/.test(id)) return Response.json({ error: "Unknown item" }, { status: 400 });
  if (!path || !goodWdId(p.fileId)) return Response.json({ error: "Unknown file" }, { status: 400 });
  const fileId = p.fileId;
  return attachBrochure(id, () => workdrivePdf(path, fileId), me);
}

async function attachBrochure(id: string, getFile: () => Promise<File>, me: { id: string; name: string }): Promise<Response> {
  try {
    const brochure = await uploadBrochure(id, await getFile());
    const d = await db();
    await d.collection<{ at: string; by: string; itemId: string; changes: object }>("itemEdits").insertOne({ at: new Date().toISOString(), by: me.name, itemId: id, changes: { brochure: { to: brochure } } }).catch((x) => console.error("[quotations] brochure log failed:", x));
    await d.collection<{ _id: string }>("kv").updateOne({ _id: "zoho_items", "items.id": id } as object, { $set: { "items.$.brochure": brochure } }).catch((x) => console.error("[quotations] item copy failed:", x));
    return Response.json({ ok: true, brochure });
  } catch (e) {
    console.error("[quotations] brochure failed:", e);
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't add the brochure" }, { status: 502 });
  }
}

/** "Add picture" in the item popup, for everyone who can use the Items page: a real picture under 4 MB. The list's copy follows at once. */
async function savePicture(form: FormData, me: { id: string; name: string }): Promise<Response> {
  const id = String(form.get("picture") ?? "");
  const file = form.get("file");
  if (!/^\d+$/.test(id)) return Response.json({ error: "Unknown item" }, { status: 400 });
  if (!(file instanceof File) || !file.size) return Response.json({ error: "Pick a picture" }, { status: 400 });
  if (file.size >= PICTURE_MAX_BYTES) return Response.json({ error: "The picture must be under 4 MB" }, { status: 400 });
  if (!isPicture(new Uint8Array(await file.slice(0, 12).arrayBuffer()))) return Response.json({ error: "That file isn't a JPG, PNG, GIF or WebP picture" }, { status: 400 });
  try {
    const out = await uploadPicture(id, file);
    images.delete(id); // the item may have a main picture now
    const d = await db();
    await d.collection<{ at: string; by: string; itemId: string; changes: object }>("itemEdits").insertOne({ at: new Date().toISOString(), by: me.name, itemId: id, changes: { picture: { to: file.name } } }).catch((x) => console.error("[quotations] picture log failed:", x));
    await d.collection<{ _id: string }>("kv").updateOne({ _id: "zoho_items", "items.id": id } as object, { $set: { "items.$.image": true } }).catch((x) => console.error("[quotations] item copy failed:", x));
    return Response.json({ ok: true, ...out });
  } catch (e) {
    console.error("[quotations] picture failed:", e);
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't add the picture" }, { status: 502 });
  }
}

/** "+ Add email": checked here, then a new contact person on the customer in Zoho Books. The log says who, not the address. */
async function addEmail(a: { customerId?: string; firstName?: string; lastName?: string; email?: string }, by: string): Promise<Response> {
  const s = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
  const contactId = s(a.customerId, 30), firstName = s(a.firstName, 100), lastName = s(a.lastName, 100), email = s(a.email, 200).toLowerCase();
  if (!/^\d+$/.test(contactId)) return Response.json({ error: "Pick a customer" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "That email doesn't look right" }, { status: 400 });
  if (isTeamEmail(email)) return Response.json({ error: "That's your team's address: put it in Cc instead, so it isn't saved on the customer" }, { status: 400 });
  if (!firstName || !lastName) return Response.json({ error: "Type their first and last name: Zoho needs both" }, { status: 400 });
  try {
    const person = await addContactPerson({ contactId, firstName, lastName, email });
    console.log(`[quotations] ${by} ${person.existed ? "picked an existing contact on" : "added a contact to"} customer ${contactId}`);
    return Response.json({ ok: true, person });
  } catch (e) {
    console.error("[quotations] add email failed:", e);
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't add the email" }, { status: 502 });
  }
}

/** The email step's Send (multipart: estimateId, to, cc, subject, body, fileName, attachments) — checked, then through Zoho Books. */
async function sendEmail(form: FormData | null, by: string): Promise<Response> {
  if (!form) return Response.json({ error: "Nothing to send" }, { status: 400 });
  const str = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const mails = (k: string) => str(k, 2000).split(/[,;\s]+/).map((x) => x.toLowerCase()).filter(Boolean);
  const id = str("estimateId", 30), subject = str("subject", 300), body = str("body", 100_000);
  let to = mails("to"), extraCc = mails("cc");
  // A quote with training (docs/TRAINING_MANAGER_PLAN.md step 2): the coordinator's three fields come along; it goes to
  // them first, the others picked are copied, and they're saved on the customer in Zoho before anything is sent.
  const coFields = { name: str("coName", 200), email: str("coEmail", 200), phone: str("coPhone", 30) };
  const coordinator = coFields.name || coFields.email || coFields.phone ? readCoordinator(coFields) : null;
  if (coordinator && "error" in coordinator) return Response.json({ error: coordinator.error }, { status: 400 });
  const customerId = str("customerId", 30);
  if (coordinator && !/^\d+$/.test(customerId)) return Response.json({ error: "Pick a customer" }, { status: 400 });
  if (coordinator) ({ to, cc: extraCc } = coordinatorRecipients(to, extraCc, coordinator.email));
  const cc = mergeCc(to, extraCc, mails("ccOff"));
  const files = form.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0);
  const bad = [...to, ...cc].find((m) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m));
  if (!/^\d+$/.test(id)) return Response.json({ error: "Unknown quotation" }, { status: 400 });
  if (!to.length) return Response.json({ error: "Add at least one email in To" }, { status: 400 });
  if (bad) return Response.json({ error: `${bad} doesn't look like an email` }, { status: 400 });
  if (to.length + cc.length > 20 || files.length > 10) return Response.json({ error: "At most 20 emails and 10 attachments" }, { status: 400 });
  if (!subject) return Response.json({ error: "Type a subject" }, { status: 400 });
  if (files.reduce((n, f) => n + f.size, 0) > EMAIL_MAX_BYTES) return Response.json({ error: "Attachments are over 4 MB together — leave some out" }, { status: 400 });
  // Brochures (9 Nov): only the ones on this quote's items, read from Books here, so nothing big goes through the browser.
  const wanted = form.getAll("brochureDocs").map(String).filter((x) => /^\d+$/.test(x));
  if (files.length + wanted.length > 10) return Response.json({ error: "At most 10 attachments, brochures included" }, { status: 400 });
  let box: { html: string; undo: () => Promise<void> } | null = null;
  try {
    if (wanted.length) {
      const mine = new Map((await quoteBrochures(id)).map((b) => [b.id, b]));
      for (const docId of new Set(wanted)) {
        const b = mine.get(docId);
        if (!b) return Response.json({ error: "That brochure isn't on this quotation's items" }, { status: 400 });
        files.push(await brochurePdf(b.id, b.name));
      }
    }
    if (coordinator) {
      const person = await upsertCoordinator({ contactId: customerId, ...coordinator });
      // Kept for Training Management and the coordinator's portal (steps 3–8).
      await (await db()).collection<{ _id: string } & Record<string, unknown>>("portalTrainings").updateOne({ _id: id }, {
        $set: { customerId, coordinator: { name: [coordinator.firstName, coordinator.lastName].filter(Boolean).join(" "), email: coordinator.email, phone: coordinator.phone, contactPersonId: person.id }, updatedAt: new Date().toISOString() },
        $setOnInsert: { createdAt: new Date().toISOString() },
      }, { upsert: true });
      // Step 8: a training-only quote carries the coordinator's Training Manager login under the message.
      box = await portalBox(id, coordinator);
    }
    await emailQuote(id, { to, cc, subject, body: box ? `${body}${box.html}` : body, fileName: str("fileName", 120) || undefined, files });
    if (box) await markLoginSent(id).catch((e) => console.error("[quotations] couldn't note the login as sent:", e));
    await (await db()).collection<EmailRecord>("quoteEmailLog").insertOne({
      estimateId: id, at: new Date().toISOString(), by, to, cc, subject,
      attachments: [str("fileName", 120) || "the quotation PDF", ...files.map((f) => f.name)],
      ...(coordinator ? { coordinator: [coordinator.firstName, coordinator.lastName].filter(Boolean).join(" ") } : {}),
    }).catch((e) => console.error("[quotations] couldn't keep the email's details:", e));
    // Zoho marked it Sent — so does our record ("went to them N days ago" counts it from now).
    await (await sentCol()).updateOne({ _id: id }, { $set: { sent: true, status: "sent" } }).catch(() => undefined);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[quotations] email failed:", e);
    // The login goes back to how it was when this email never went out (the old password still works).
    if (box) await box.undo().catch(() => undefined);
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't send the email" }, { status: 502 });
  }
}

/**
 * The Training Manager login box for a quote email (docs/TRAINING_MANAGER_PLAN.md step 8): only for a training-only quote,
 * read from Zoho now (a quote made minutes ago isn't in the hourly copy yet). A fresh password every time, unless the
 * coordinator chose their own (then the box says to use it). `undo`: the login back as it was, if the email fails.
 */
async function portalBox(id: string, co: Coordinator): Promise<{ html: string; undo: () => Promise<void> } | null> {
  const [est, doc] = await Promise.all([
    zohoGet<{ estimate?: Record<string, unknown> }>(`/estimates/${id}`),
    (await db()).collection<{ _id: string; items?: ZItem[] }>("kv").findOne({ _id: "zoho_items" }),
  ]);
  const e = est.estimate;
  const training = itemSets(doc?.items ?? []).training;
  if (!e || !isTrainingOnly(e, training)) return null;
  const q = toTrainingQuote(e, training);
  const name = [co.firstName, co.lastName].filter(Boolean).join(" ");
  const { password, undo } = await passwordForEmail(co.email, name);
  const t = await portalTemplates();
  const vars = { name: co.firstName, training: q.lines.map((l) => l.name).join(" + ") || "your training", number: q.number };
  return { html: loginBoxHtml({ intro: renderTemplate(t.box, vars), link: trainingLink(portalBase(), q.number), email: co.email, password }), undo };
}

/** The brochures of a quotation's items, each once: from the items copy, or the item itself when the copy doesn't have its file id yet (added since the last sync). */
async function quoteBrochures(estimateId: string): Promise<{ id: string; name: string; item: string }[]> {
  const [est, doc] = await Promise.all([
    zohoGet<{ estimate?: { line_items?: { item_id?: unknown }[] } }>(`/estimates/${estimateId}`),
    (await db()).collection<{ _id: string; items?: ZItem[] }>("kv").findOne({ _id: "zoho_items" }),
  ]);
  const byId = new Map((doc?.items ?? []).map((i) => [i.id, i]));
  const out = new Map<string, { id: string; name: string; item: string }>();
  for (const itemId of new Set((est.estimate?.line_items ?? []).map((l) => String(l.item_id ?? "")).filter(Boolean))) {
    const i = byId.get(itemId);
    if (!i?.brochure) continue;
    const id = i.brochureId ?? brochureIdOf((await zohoGet<{ item?: Record<string, unknown> }>(`/items/${itemId}`)).item ?? {});
    if (id && !out.has(id)) out.set(id, { id, name: i.brochure, item: i.name });
  }
  return [...out.values()];
}

const readEstimate = async (id: string): Promise<ZEstimate> => (await zohoGet<{ estimate?: ZEstimate }>(`/estimates/${id}`)).estimate ?? {};
const TS_COUNTER = "ts_quote_no"; // one running number, never reset (owner, 5 Nov)
const tsCounter = async () => (await (await db()).collection<{ _id: string; n?: number }>("kv").findOne({ _id: TS_COUNTER }))?.n ?? 0;

/**
 * Total Supply quotation (owner, 5 Nov): the main quote's lines at the prices shown in the email step, from Total Supply's Gmail with our
 * own PDF. Zoho is only read: the main quote stays as it is, and isn't marked Sent by this. A number is taken only once the email is ready to go.
 */
async function sendTotalSupply(form: FormData, me: { id: string; name: string }): Promise<Response> {
  const str = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const mails = (k: string) => str(k, 2000).split(/[,;\s]+/).map((x) => x.toLowerCase()).filter(Boolean);
  const id = str("tsEstimateId", 30), to = mails("to"), subject = str("subject", 300), body = str("body", 100_000);
  const cc = [...new Set(mails("cc"))].filter((m) => !to.includes(m));
  const files = form.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0);
  const bad = [...to, ...cc].find((m) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m));
  if (!/^\d+$/.test(id)) return Response.json({ error: "Unknown quotation" }, { status: 400 });
  if (!to.length) return Response.json({ error: "Add at least one email in To" }, { status: 400 });
  if (bad) return Response.json({ error: `${bad} doesn't look like an email` }, { status: 400 });
  if (to.length + cc.length > 20 || files.length > 10) return Response.json({ error: "At most 20 emails and 10 attachments" }, { status: 400 });
  if (!subject) return Response.json({ error: "Type a subject" }, { status: 400 });
  if (files.reduce((n, f) => n + f.size, 0) > EMAIL_MAX_BYTES) return Response.json({ error: "Attachments are over 4 MB together — leave some out" }, { status: 400 });
  if (!tsMailOn()) return Response.json({ error: "Total Supply's Gmail isn't connected yet" }, { status: 409 });
  try {
    const e = await readEstimate(id);
    const markups = parseMarkups(str("markups", 500), e.line_items?.length ?? 0);
    if (!markups) return Response.json({ error: "The quotation changed: open Total Supply quotation again" }, { status: 409 });
    const today = istToday();
    const seq = await (await db()).collection<{ _id: string; n: number }>("kv").findOneAndUpdate({ _id: TS_COUNTER }, { $inc: { n: 1 } }, { upsert: true, returnDocument: "after" });
    const number = tsQuoteNumber(today, seq?.n ?? 1);
    const quote = buildTsQuote(e, markups, number, today);
    // Someone else may have sent one since this was opened: the email shows the number it really gets.
    const shown = str("number", 60);
    const swap = (s: string) => (shown && shown !== number ? s.split(shown).join(number) : s);
    await sendTsMail({
      to, cc, subject: swap(subject), html: swap(body),
      attachments: [
        { filename: `${number}.pdf`, content: Buffer.from(await tsQuotePdf(quote)), contentType: "application/pdf" },
        ...(await Promise.all(files.map(async (f) => ({ filename: f.name, content: Buffer.from(await f.arrayBuffer()), contentType: f.type || undefined })))),
      ],
    });
    await (await db()).collection<{ _id: string }>("totalSupplyQuotes").insertOne({
      _id: number, estimateId: id, mainNumber: quote.mainNumber, customerId: quote.customer.id, customerName: quote.customer.name, to, cc, by: me.name, byId: me.id, at: new Date().toISOString(),
      total: quote.total, lines: quote.lines.map((l) => ({ name: l.name, qty: l.qty, was: l.was, rate: l.rate, percent: l.percent })),
    } as { _id: string }).catch((err) => console.error("[quotations] Total Supply record failed:", err));
    return Response.json({ ok: true, number });
  } catch (err) {
    console.error("[quotations] Total Supply email failed:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Couldn't send the email" }, { status: 502 });
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
  const body = (await request.json().catch(() => ({}))) as { code?: string; clientId?: string; clientSecret?: string; workdrive?: boolean };
  if (!body.code?.trim()) return Response.json({ error: "Paste the code from the Zoho API console" }, { status: 400 });
  try {
    if (body.workdrive) return Response.json({ ok: true, connected: await connectWorkdrive({ code: body.code, clientId: body.clientId, clientSecret: body.clientSecret }, me.name) });
    return Response.json({ ok: true, connected: await connectQuotes({ code: body.code, clientId: body.clientId, clientSecret: body.clientSecret }, me.name) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't connect" }, { status: 400 });
  }
}

/* ---------------- One quotation's view (owner, 11 Nov) ---------------- */

type EmailRecord = { estimateId: string; at: string; by: string; to: string[]; cc: string[]; subject: string; attachments: string[]; coordinator?: string };
type ZLine = { item_id?: unknown; name?: string; quantity?: unknown; rate?: unknown; tax_percentage?: unknown; item_total?: unknown };
type ZComment = { description?: string; commented_by?: string; date?: string; time?: string; date_description?: string };

async function quotationView(id: string) {
  const d = await db();
  const [est, history, emails, portal, itemsDoc] = await Promise.all([
    zohoGet<{ estimate?: Record<string, unknown> & { line_items?: ZLine[] } }>(`/estimates/${id}`),
    // Zoho's own history of the quote (created, emailed, status changes): also covers emails sent from Zoho itself.
    zohoGet<{ comments?: ZComment[] }>(`/estimates/${id}/comments`).then((r) => r.comments ?? []).catch(() => [] as ZComment[]),
    d.collection<EmailRecord>("quoteEmailLog").find({ estimateId: id }).sort({ at: -1 }).toArray(),
    d.collection<{ _id: string; coordinator?: { name: string; email: string; phone: string }; rejected?: { at: string; reason: string } }>("portalTrainings").findOne({ _id: id }),
    d.collection<{ _id: string; items?: ZItem[] }>("kv").findOne({ _id: "zoho_items" }),
  ]);
  // A training quote (any training item) gets the training, certificate and logistics phases in its story.
  const trainingIds = itemSets(itemsDoc?.items ?? []).training;
  const e = est.estimate;
  if (!e) return { error: "That quotation isn't in Zoho Books any more" };
  const n = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));
  return {
    id, number: String(e.estimate_number ?? ""), date: String(e.date ?? ""), expiry: (e.expiry_date as string) || null, status: String(e.status ?? ""),
    total: Number(e.total) || 0, reference: (e.reference_number as string) || null, salesperson: (e.salesperson_name as string) || null,
    customerId: String(e.customer_id ?? ""), customer: String(e.customer_name ?? ""), url: zohoLink(id),
    lines: (e.line_items ?? []).map((l) => ({ name: String(l.name ?? "").replace(/\s*\(I\)\s*/gi, " ").trim(), qty: Number(l.quantity) || 0, rate: Number(l.rate) || 0, gst: n(l.tax_percentage), total: Number(l.item_total) || 0 })),
    emails: emails.map(({ at, by, to, cc, subject, attachments, coordinator }) => ({ at, by, to, cc, subject, attachments, coordinator: coordinator ?? null })),
    history: history.map((c) => ({ text: String(c.description ?? "").trim(), by: c.commented_by ?? null, when: [c.date_description || c.date, c.time].filter(Boolean).join(" ") })).filter((c) => c.text),
    coordinator: portal?.coordinator ?? null,
    rejection: portal?.rejected ? { at: portal.rejected.at, reason: portal.rejected.reason } : null,
    training: (est.estimate?.line_items ?? []).some((l) => trainingIds.has(String(l.item_id))),
  };
}
