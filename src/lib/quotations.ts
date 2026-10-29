import "server-only";
import { db } from "./db";
import { clientOf, tokenRequest } from "./zohoOAuth";

/*
 * Quotations (owner, 28 Oct: "all of our contacts are here, we need to click one time and a quotation is sent through
 * zoho books"). The only place the dashboard WRITES to Zoho Books, so it has its own connection — the sync's token
 * stays read-only. Admin connects it once with a one-time code from the Zoho API console (Self Client, scopes
 * QUOTE_SCOPES); the refresh token lives only in MongoDB kv `zoho_books:quotes`, never in a browser.
 *
 * Zoho Books API v3 (India): POST /estimates?send=true|false {customer_id, contact_persons, line_items, salesperson_name,
 * custom_fields, discount, shipping_charge, adjustment, notes, terms} — `send=true` emails it with the org's standard
 * quotation email + PDF to the contact persons on it. GST: Zoho applies each item's own tax (in-state or IGST).
 */

const API = process.env.ZOHO_API_BASE ?? "https://www.zohoapis.in/books/v3";
const ORG = process.env.ZOHO_ORG_ID ?? "60016330017";
// contacts.CREATE (28 Oct): "New quotation" can add a new customer in Zoho first. Older connections lack it (`scopes`).
export const QUOTE_SCOPES = "ZohoBooks.estimates.CREATE,ZohoBooks.estimates.UPDATE,ZohoBooks.contacts.READ,ZohoBooks.contacts.CREATE";
const KEY = "zoho_books:quotes";

type Conn = { _id: string; clientId: string; clientSecret: string; refreshToken: string; token?: { value: string; expiresAt: number }; connectedAt: string; connectedBy: string; scopes?: string };
export type QuotesInfo = { connectedAt: string; connectedBy: string; newCustomers: boolean };
const kv = async () => (await db()).collection<Conn>("kv");

export async function quotesInfo(): Promise<QuotesInfo | null> {
  const c = await (await kv()).findOne({ _id: KEY });
  return c ? { connectedAt: c.connectedAt, connectedBy: c.connectedBy, newCustomers: Boolean(c.scopes?.includes("contacts.CREATE")) } : null;
}

async function accessFor(c: Conn, force = false): Promise<string> {
  if (!force && c.token && Date.now() < c.token.expiresAt - 5 * 60_000) return c.token.value;
  const t = await tokenRequest({ grant_type: "refresh_token", client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken })
    .catch((e: Error) => { throw new Error(`Zoho Books sign-in for quotations failed — Admin may need to connect it again (${e.message})`); });
  c.token = { value: t.access_token!, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 };
  await (await kv()).updateOne({ _id: c._id }, { $set: { token: c.token } });
  return c.token.value;
}

type BooksRes = Record<string, unknown> & { code?: number; message?: string };

/** One Zoho Books call with this connection; one retry after a 401. Throws Zoho's own message. */
async function books(c: Conn, method: "GET" | "POST", path: string, params: Record<string, string> = {}, body?: unknown): Promise<BooksRes> {
  const url = new URL(`${API}${path}`);
  url.searchParams.set("organization_id", ORG);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    const token = await accessFor(c, attempt > 0);
    const res = await fetch(url, { method, headers: { Authorization: `Zoho-oauthtoken ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
    if (res.status === 401 && attempt === 0) continue;
    const json = (await res.json().catch(() => ({}))) as BooksRes;
    if (!res.ok || json.code !== 0) {
      console.error(`[quotations] ${method} ${path} → ${res.status} ${json.code ?? ""} ${json.message ?? ""}`);
      throw new Error(`Zoho Books: ${json.message ?? `error ${res.status}`}`);
    }
    return json;
  }
}

/** Admin: swap the one-time code for a refresh token, check it can read contacts, save it. */
export async function connectQuotes(input: { code: string; clientId?: string; clientSecret?: string }, by: string): Promise<QuotesInfo> {
  const { clientId, clientSecret } = clientOf(input);
  const t = await tokenRequest({ grant_type: "authorization_code", code: input.code.trim(), client_id: clientId, client_secret: clientSecret });
  if (!t.refresh_token) throw new Error("Zoho gave no refresh token — generate a new code and try again");
  const c: Conn = { _id: KEY, clientId, clientSecret, refreshToken: t.refresh_token, token: { value: t.access_token!, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 }, connectedAt: new Date().toISOString(), connectedBy: by, scopes: QUOTE_SCOPES };
  await books(c, "GET", "/contacts", { per_page: "1" }); // the right organisation, and the scope works
  await (await kv()).replaceOne({ _id: KEY }, c, { upsert: true });
  return { connectedAt: c.connectedAt, connectedBy: by, newCustomers: true };
}

/** Zoho's place-of-supply codes (India) — the new-customer form's states. */
export const INDIA_STATES: [string, string][] = [
  ["MH", "Maharashtra"], ["KA", "Karnataka"], ["TN", "Tamil Nadu"], ["TS", "Telangana"], ["DL", "Delhi"], ["GJ", "Gujarat"], ["GA", "Goa"],
  ["KL", "Kerala"], ["AP", "Andhra Pradesh"], ["UP", "Uttar Pradesh"], ["WB", "West Bengal"], ["HR", "Haryana"], ["RJ", "Rajasthan"],
  ["PB", "Punjab"], ["MP", "Madhya Pradesh"], ["CG", "Chhattisgarh"], ["OR", "Odisha"], ["BR", "Bihar"], ["JH", "Jharkhand"], ["UK", "Uttarakhand"],
  ["HP", "Himachal Pradesh"], ["JK", "Jammu and Kashmir"], ["LA", "Ladakh"], ["CH", "Chandigarh"], ["AS", "Assam"], ["AR", "Arunachal Pradesh"],
  ["MN", "Manipur"], ["ML", "Meghalaya"], ["MZ", "Mizoram"], ["NL", "Nagaland"], ["SK", "Sikkim"], ["TR", "Tripura"], ["PY", "Puducherry"],
  ["AN", "Andaman and Nicobar Islands"], ["DN", "Dadra and Nagar Haveli and Daman and Diu"], ["LD", "Lakshadweep"],
];

/*
 * The customer's own mandatory fields in Zoho Books (Contacts → Field Customization, read 29 Oct with the Books
 * connector): Zoho refuses a new customer without Type and Sector (#151). Exact spelling; if they change in Zoho,
 * change them here too.
 */
export const CUSTOMER_FIELDS = {
  type: { id: "982417000008274205", label: "Type", options: ["New Customer", "Old Customer", "New Reseller", "Old Reseller", "Old Vendor", "New Vendor"] },
  sector: { id: "982417000011023041", label: "Sector", options: ["Traders", "Tourism & Hospitality", "Aviation", "School & College", "Automobile", "Manufacturing", "IT", "Energy & Power", "Real Estate", "Construction & Infrastructure", "Banking", "Merchant Navy", "Healthcare & Life Sciences", "Telecommunications", "Defence", "Media house", "Transportation", "Sports & Recreational", "NGO"] },
} as const;

export type NewCustomer = { company: string; firstName: string; lastName: string; email: string; phone?: string; state: string; city?: string; gstin?: string; type: string; sector: string };

/**
 * A new customer in Zoho Books (from "New quotation"), with its contact person as primary. GST: with a GSTIN it's a
 * registered business, without one unregistered; the state decides CGST + SGST or IGST (place of supply).
 */
export async function createCustomer(n: NewCustomer & { stateName: string }): Promise<{ id: string; name: string }> {
  const c = await (await kv()).findOne({ _id: KEY });
  if (!c) throw new Error("Zoho Books isn't connected for quotations yet — Admin connects it once");
  const j = await books(c, "POST", "/contacts", {}, {
    contact_name: n.company, company_name: n.company, contact_type: "customer",
    gst_treatment: n.gstin ? "business_gst" : "business_none", ...(n.gstin ? { gst_no: n.gstin } : {}), place_of_contact: n.state,
    billing_address: { city: n.city ?? "", state: n.stateName, country: "India" }, shipping_address: { city: n.city ?? "", state: n.stateName, country: "India" },
    contact_persons: [{ first_name: n.firstName, last_name: n.lastName, email: n.email, mobile: n.phone ?? "", is_primary_contact: true }],
    custom_fields: [{ customfield_id: CUSTOMER_FIELDS.type.id, value: n.type }, { customfield_id: CUSTOMER_FIELDS.sector.id, value: n.sector }],
  }).catch((e: Error) => {
    throw /not authori[sz]ed|scope|permission/i.test(e.message) ? new Error("Zoho Books needs one more permission for new customers — Admin: Reconnect on the Quotations page") : e;
  });
  const ct = (j.contact ?? {}) as Record<string, unknown>;
  return { id: String(ct.contact_id ?? ""), name: String(ct.contact_name ?? n.company) };
}

/*
 * The quote's own fields in Zoho Books (Settings → Quotes → Field Customization, read 28 Oct). "Send to CRM" and
 * "Reminder Frequency" are mandatory — a quote without them is refused. Options keep Zoho's exact spelling (some end
 * in a space); the popup shows them trimmed. If someone changes them in Zoho, change them here too.
 */
export const QUOTE_FIELDS = {
  sendToCrm: { id: "982417000013838167", label: "Send to CRM", options: ["Yes", "No"] },
  reminderDate: { id: "982417000017799233", label: "Reminder Date" },
  productType: { id: "982417000018678045", label: "Product Type", options: ["AED", "Battery", "pads", "Training ", "AED( Battery + Pads)", " AED Cabinet", "AED Accessories ", "Trauma Kit", "First Aid Training ", " CPR Training", "AED Maintenance", " 5SU", "SAFETY Supplies", " Ambulance Service", "Training Products", "Fire Safety", " Fire Blanket", " Evacuation ", "Sales", "Other"] },
  dealName: { id: "982417000020249005", label: "Deal Name" },
  leadSource: { id: "982417000020925237", label: "Lead Source", options: ["Indiamart", "BuyAEDINDIA ", "Direct ", "Social Media", "Events ", "Reference ", "Amazon"] },
  reminderFrequency: { id: "982417000021649418", label: "Reminder Frequency", options: ["None", "15 days", "interval of 2 days", " on each Wednesday", "on each Monday"] },
} as const;

export type QuoteLine = { itemId: string; qty: number; rate: number; description?: string };
export type QuoteDetails = {
  salesperson?: string; sendToCrm: string; reminderFrequency: string; productType?: string; leadSource?: string; dealName?: string;
  reference?: string; expiry?: string; reminderDate: string;
  discount?: { value: number; percent: boolean }; shipping?: number; adjustment?: number; notes?: string; terms?: string;
};
export type MadeQuote = { estimateId: string; number: string; total: number; status: string };

/** Creates the quotation in Zoho Books; `send` = Zoho emails it (standard email + PDF) to the contact persons on it. */
export async function createQuote(q: { customerId: string; contactPersonIds: string[]; lines: QuoteLine[]; details: QuoteDetails; send: boolean }): Promise<MadeQuote> {
  const c = await (await kv()).findOne({ _id: KEY });
  if (!c) throw new Error("Zoho Books isn't connected for quotations yet — Admin connects it once");
  const d = q.details;
  const F = QUOTE_FIELDS;
  const custom: [string, string | undefined][] = [
    [F.sendToCrm.id, d.sendToCrm], [F.reminderFrequency.id, d.reminderFrequency], [F.reminderDate.id, d.reminderDate],
    [F.productType.id, d.productType], [F.leadSource.id, d.leadSource], [F.dealName.id, d.dealName],
  ];
  const body = {
    customer_id: q.customerId,
    contact_persons: q.contactPersonIds,
    ...(d.salesperson ? { salesperson_name: d.salesperson } : {}),
    ...(d.reference ? { reference_number: d.reference } : {}),
    ...(d.expiry ? { expiry_date: d.expiry } : {}),
    custom_fields: custom.filter(([, v]) => v).map(([customfield_id, value]) => ({ customfield_id, value })),
    line_items: q.lines.map((l) => ({ item_id: l.itemId, quantity: l.qty, rate: l.rate, ...(l.description ? { description: l.description } : {}) })),
    // Like the team's quotes: a discount on the whole quote, before tax; shipping and adjustment only when used.
    ...(d.discount?.value ? { discount: d.discount.percent ? `${d.discount.value}%` : d.discount.value, is_discount_before_tax: true, discount_type: "entity_level" } : {}),
    ...(d.shipping ? { shipping_charge: d.shipping } : {}),
    ...(d.adjustment ? { adjustment: d.adjustment, adjustment_description: "Adjustment" } : {}),
    ...(d.notes !== undefined ? { notes: d.notes } : {}),
    ...(d.terms !== undefined ? { terms: d.terms } : {}),
  };
  const j = await books(c, "POST", "/estimates", { send: String(q.send) }, body);
  const e = (j.estimate ?? {}) as Record<string, unknown>;
  return { estimateId: String(e.estimate_id ?? ""), number: String(e.estimate_number ?? ""), total: Number(e.total ?? 0), status: String(e.status ?? "") };
}
