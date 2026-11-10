import "server-only";
import { parseZoho, zohoGet } from "./zoho";
import { type ItemChanges, type ItemFields, gstKnown, itemBody, itemPictures, itemChanges, itemFieldsOf } from "./itemEdit";
import { db } from "./db";
import { clientsToTry, tokenRequest } from "./zohoOAuth";
import { fromGstin, gstTreatment } from "./gstin";

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
// fullaccess (owner, 4 Nov: "ill just give you full access"): the Items page edits items and uploads brochures. POST /documents, which the upload
// needs, answered "not authorized" with narrower scopes, and Zoho documents none for it.
export const QUOTE_SCOPES = "ZohoBooks.fullaccess.all";
const KEY = "zoho_books:quotes";

type Conn = { _id: string; clientId: string; clientSecret: string; refreshToken: string; token?: { value: string; expiresAt: number }; connectedAt: string; connectedBy: string; scopes?: string };
export type QuotesInfo = { connectedAt: string; connectedBy: string; newCustomers: boolean };
const kv = async () => (await db()).collection<Conn>("kv");

export async function quotesInfo(): Promise<QuotesInfo | null> {
  const c = await (await kv()).findOne({ _id: KEY });
  return c ? { connectedAt: c.connectedAt, connectedBy: c.connectedBy, newCustomers: /contacts\.CREATE|fullaccess/.test(c.scopes ?? "") } : null;
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
/** `body` as JSON, or a FormData sent as multipart (files: the quote email's attachments). */
async function books(c: Conn, method: "GET" | "POST" | "PUT" | "DELETE", path: string, params: Record<string, string> = {}, body?: unknown): Promise<BooksRes> {
  const url = new URL(`${API}${path}`);
  url.searchParams.set("organization_id", ORG);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    const token = await accessFor(c, attempt > 0);
    const form = body instanceof FormData;
    const res = await fetch(url, { method, headers: { Authorization: `Zoho-oauthtoken ${token}`, ...(body && !form ? { "Content-Type": "application/json" } : {}) }, body: form ? body : body ? JSON.stringify(body) : undefined, cache: "no-store" });
    if (res.status === 401 && attempt === 0) continue;
    const json = (await res.text().then(parseZoho).catch(() => ({}))) as BooksRes;
    if (!res.ok || json.code !== 0) {
      console.error(`[quotations] ${method} ${path} → ${res.status} ${json.code ?? ""} ${json.message ?? ""}`);
      throw new Error(`Zoho Books: ${json.message ?? `error ${res.status}`}`);
    }
    return json;
  }
}

/** Admin: swap the one-time code for a refresh token, check it can read contacts, save it. */
export async function connectQuotes(input: { code: string; clientId?: string; clientSecret?: string }, by: string): Promise<QuotesInfo> {
  const clients = clientsToTry(input, await (await kv()).findOne({ _id: KEY }));
  let t: Awaited<ReturnType<typeof tokenRequest>> | undefined;
  let refused: unknown;
  let clientId = "", clientSecret = "";
  for (const k of clients) {
    try {
      t = await tokenRequest({ grant_type: "authorization_code", code: input.code.trim(), client_id: k.clientId, client_secret: k.clientSecret });
      ({ clientId, clientSecret } = k);
      break;
    } catch (e) { refused = e; } // a code only works with the Self Client that made it
  }
  if (!t) throw refused;
  if (!t.refresh_token) throw new Error("Zoho gave no refresh token — generate a new code and try again");
  const c: Conn = { _id: KEY, clientId, clientSecret, refreshToken: t.refresh_token, token: { value: t.access_token!, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 }, connectedAt: new Date().toISOString(), connectedBy: by, scopes: QUOTE_SCOPES };
  // The right organisation, and the scope works. Failing here leaves the working connection as it was: it's replaced only below.
  await books(c, "GET", "/contacts", { per_page: "1" }).catch((e: Error) => {
    throw /not authori[sz]ed/i.test(e.message) ? new Error("Zoho took the code, but it can't read your customers, so nothing changed. Generate a new code with the whole Scope line, signed in as the Zoho user who has Books access. Your current connection still works.") : e;
  });
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

export type NewCustomer = {
  /** Zoho's Customer Type: a business (default) or an individual. */
  kind: "business" | "individual";
  company: string; displayName: string; salutation?: string; firstName: string; lastName: string; email: string; phone?: string; workPhone?: string;
  state: string; street?: string; city?: string; zip?: string; gstin?: string; type: string; sector: string;
};

/**
 * A new customer in Zoho Books (from "New quotation"), with its contact person as primary — every field Zoho's own
 * "New Customer" form requires (#150 step 2). The state decides CGST + SGST or IGST (place of supply).
 */
/**
 * Another email for a customer (owner, 4 Nov: "they may have a separate email … should also be added for the customer in
 * zoho books"): a new contact person, never the primary. An email already on the customer is simply returned. Zoho needs a
 * first name, the CRM sync a last name. POST /contacts/contactpersons, scope ZohoBooks.contacts.CREATE.
 */
/**
 * Saves an item's edits to Zoho Books and checks what Zoho answered. Read with the sync's read-only token, written with this
 * connection (PUT /items/{id}, scope ZohoBooks.settings.UPDATE). Nothing changed: no write.
 */
export async function editItem(id: string, after: ItemFields): Promise<{ changes: ItemChanges; saved: ItemFields }> {
  const c = await (await kv()).findOne({ _id: KEY });
  if (!c) throw new Error("Zoho Books isn't connected for quotations yet — Admin connects it once");
  const before = itemFieldsOf((await zohoGet<{ item?: Record<string, unknown> }>(`/items/${id}`)).item ?? {});
  const changes = itemChanges(before, after);
  if (!Object.keys(changes).length) return { changes, saved: before };
  if (changes.gst && !gstKnown(after.gst)) throw new Error("Pick a GST rate from the list"); // an old rate may stay, but not be chosen
  const j = await books(c, "PUT", `/items/${id}`, {}, itemBody(after, changes)).catch((e: Error) => {
    throw /not authori[sz]ed|scope|permission/i.test(e.message) ? new Error("Zoho Books needs one more permission to edit items — Admin: Reconnect on the Quotations page") : e;
  });
  const saved = itemFieldsOf((j.item ?? {}) as Record<string, unknown>);
  const missed = Object.keys(itemChanges(saved, after));
  if (missed.length) throw new Error(`Zoho Books answered, but these didn't change: ${missed.join(", ")}. Check the item.`);
  return { changes, saved };
}

/**
 * A PDF on an item's Product Brochure field, from the Items page (owner, 4 Nov: "i want to add pdf in my dashboard"). Zoho documents no call
 * for this; tested on Hot Water Bag Standard the same day: POST /documents takes the file (multipart "document", needs full access), then
 * PUT /items/{id} takes its id in the field, and Zoho's answer names the file. If attaching fails the uploaded file is removed again.
 */
const BROCHURE_FIELD = "982417000023514003";
export async function uploadBrochure(id: string, file: File): Promise<string> {
  const c = await (await kv()).findOne({ _id: KEY });
  if (!c) throw new Error("Zoho Books isn't connected for quotations yet — Admin connects it once");
  const form = new FormData();
  form.append("document", file, file.name);
  const up = await books(c, "POST", "/documents", {}, form).catch((e: Error) => {
    throw /not authori[sz]ed|scope|permission/i.test(e.message) ? new Error("Zoho Books needs more permission to take files — Admin: Reconnect on the Quotations page") : e;
  });
  const docs = up.documents as { document_id?: unknown } | { document_id?: unknown }[] | undefined;
  const doc = String((Array.isArray(docs) ? docs[0] : docs)?.document_id ?? "");
  if (!doc) throw new Error("Zoho Books took the file but didn't say where it put it");
  try {
    const item = (await zohoGet<{ item?: Record<string, unknown> }>(`/items/${id}`)).item ?? {};
    const j = await books(c, "PUT", `/items/${id}`, {}, { name: item.name, rate: item.rate, custom_fields: [{ customfield_id: BROCHURE_FIELD, value: doc }] });
    const brochure = String((j.item as { custom_field_hash?: Record<string, unknown> } | undefined)?.custom_field_hash?.cf_product_brochure ?? "");
    if (!brochure) throw new Error("Zoho Books answered, but the brochure isn't on the item");
    return brochure;
  } catch (e) {
    await books(c, "DELETE", `/documents/${doc}`).catch(() => undefined);
    throw e;
  }
}

/**
 * Adds a picture to an item (owner, 4 Nov: "let me add pictures from here too"). Zoho documents replacing the main image, not adding one, so:
 * POST /items/{id}/images, which keeps the pictures already there. Only an item with no main image may fall back to /image, which could
 * replace it. Read back afterwards: the new picture must be on the item, and none of the old ones gone.
 */
export async function uploadPicture(id: string, file: File): Promise<{ pictures: string[]; added: string }> {
  const c = await (await kv()).findOne({ _id: KEY });
  if (!c) throw new Error("Zoho Books isn't connected for quotations yet — Admin connects it once");
  const read = async () => (await zohoGet<{ item?: Record<string, unknown> }>(`/items/${id}`)).item ?? {};
  const before = await read();
  const had = itemPictures(before);
  const send = (path: string) => { const form = new FormData(); form.append("image", file, file.name); return books(c, "POST", path, {}, form); };
  await send(`/items/${id}/images`).catch((e: Error) => {
    if (/invalid url/i.test(e.message) && !before.image_name && !had.length) return send(`/items/${id}/image`);
    throw e;
  });
  const pictures = itemPictures(await read());
  const added = pictures.find((p) => !had.includes(p));
  if (!added) throw new Error("Zoho Books answered, but the new picture isn't on the item");
  const lost = had.filter((p) => !pictures.includes(p));
  if (lost.length) console.error(`[quotations] adding a picture to item ${id} removed ${lost.length} of its pictures`);
  return { pictures, added };
}

export type AddedPerson = { id: string; name: string | null; email: string; existed: boolean };
export async function addContactPerson(p: { contactId: string; firstName: string; lastName: string; email: string }): Promise<AddedPerson> {
  const c = await (await kv()).findOne({ _id: KEY });
  if (!c) throw new Error("Zoho Books isn't connected for quotations yet — Admin connects it once");
  type Person = { contact_person_id?: unknown; salutation?: string; first_name?: string; last_name?: string; email?: string };
  const people = async () => (((await books(c, "GET", `/contacts/${p.contactId}`)).contact as { contact_persons?: Person[] } | undefined)?.contact_persons ?? []);
  const mine = (x: Person) => (x.email ?? "").toLowerCase() === p.email;
  const shape = (x: Person, existed: boolean): AddedPerson => ({ id: String(x.contact_person_id), name: [x.salutation, x.first_name, x.last_name].filter(Boolean).join(" ").trim() || null, email: p.email, existed });
  const had = (await people()).find(mine);
  if (had) return shape(had, true);
  const j = await books(c, "POST", "/contacts/contactpersons", {}, { contact_id: p.contactId, first_name: p.firstName, last_name: p.lastName, email: p.email }).catch((e: Error) => {
    throw /not authori[sz]ed|scope|permission/i.test(e.message) ? new Error("Zoho Books needs one more permission to add contacts — Admin: Reconnect on the Quotations page") : e;
  });
  // Zoho's answer isn't the same shape everywhere; if it names nobody, the customer's list does.
  const raw = (j.contact_person ?? j.contact_persons) as Person | Person[] | undefined;
  const answered = Array.isArray(raw) ? raw.find(mine) ?? raw[0] : raw;
  const made = answered?.contact_person_id ? answered : (await people()).find(mine);
  if (!made?.contact_person_id) throw new Error("Zoho Books took it but didn't say who was added — check the customer in Zoho");
  return shape({ first_name: p.firstName, last_name: p.lastName, ...made }, false);
}

export async function createCustomer(n: NewCustomer & { stateName: string }): Promise<{ id: string; name: string }> {
  const c = await (await kv()).findOne({ _id: KEY });
  if (!c) throw new Error("Zoho Books isn't connected for quotations yet — Admin connects it once");
  const address = { attention: `${n.firstName} ${n.lastName}`, address: n.street ?? "", city: n.city ?? "", zip: n.zip ?? "", state: n.stateName, country: "India" };
  const j = await books(c, "POST", "/contacts", {}, {
    contact_name: n.displayName, company_name: n.company, contact_type: "customer", customer_sub_type: n.kind,
    gst_treatment: gstTreatment(n), ...(n.gstin ? { gst_no: n.gstin, pan_no: fromGstin(n.gstin).pan } : {}), place_of_contact: n.state,
    billing_address: address, shipping_address: address,
    contact_persons: [{ salutation: n.salutation ?? "", first_name: n.firstName, last_name: n.lastName, email: n.email, mobile: n.phone ?? "", phone: n.workPhone ?? "", is_primary_contact: true }],
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

type QuoteInput = { customerId: string; contactPersonIds: string[]; lines: QuoteLine[]; details: QuoteDetails };

/** A quotation as Zoho Books takes it — the same for a new one and for a draft saved again. */
function quoteBody(q: QuoteInput) {
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
  return body;
}
const made = (j: BooksRes): MadeQuote => {
  const e = (j.estimate ?? {}) as Record<string, unknown>;
  return { estimateId: String(e.estimate_id ?? ""), number: String(e.estimate_number ?? ""), total: Number(e.total ?? 0), status: String(e.status ?? "") };
};
const connection = async () => {
  const c = await (await kv()).findOne({ _id: KEY });
  if (!c) throw new Error("Zoho Books isn't connected for quotations yet — Admin connects it once");
  return c;
};

/** Creates the quotation in Zoho Books; `send` = Zoho emails it (standard email + PDF) to the contact persons on it. */
export async function createQuote(q: QuoteInput & { send: boolean }): Promise<MadeQuote> {
  return made(await books(await connection(), "POST", "/estimates", { send: String(q.send) }, quoteBody(q)));
}

/**
 * A draft saved again (owner, 30 Oct: "Save and email" → back → reopened → "Save and email" made a second quotation):
 * PUT /estimates/{id} — same number, same draft, new lines and fields (ZohoBooks.estimates.UPDATE, in QUOTE_SCOPES).
 */
export async function updateQuote(estimateId: string, q: QuoteInput): Promise<MadeQuote> {
  return made(await books(await connection(), "PUT", `/estimates/${estimateId}`, {}, quoteBody(q)));
}

/*
 * Emailing a quotation from Zoho Books (#150 step 5): POST /estimates/{id}/email — Zoho sends it from the organisation's
 * address with the quote's PDF attached (file_name), keeps it in the quote's history and marks a draft Sent. Extra
 * files go as multipart `attachments` with the fields in `JSONString` (Zoho's multipart convention). Scope:
 * ZohoBooks.estimates.CREATE (already in QUOTE_SCOPES). Production only — the route checks.
 */
export const EMAIL_MAX_BYTES = 4 * 1024 * 1024; // Vercel refuses request bodies over 4.5 MB
export type QuoteEmail = { to: string[]; cc: string[]; subject: string; body: string; fileName?: string; files: File[] };

/** A brochure's PDF, read back from Books (GET /documents/{id} gives the file; tried 9 Nov on the test item). For the quote email. */
export async function brochurePdf(docId: string, name: string): Promise<File> {
  const c = await (await kv()).findOne({ _id: KEY });
  if (!c) throw new Error("Zoho Books isn't connected for quotations yet — Admin connects it once");
  const url = new URL(`${API}/documents/${docId}`);
  url.searchParams.set("organization_id", ORG);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${await accessFor(c, attempt > 0)}` }, cache: "no-store" });
    if (res.status === 401 && attempt === 0) continue;
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("pdf")) throw new Error(`Zoho Books didn't give the brochure ${name} (${res.status})`);
    return new File([Buffer.from(await res.arrayBuffer())], /\.pdf$/i.test(name) ? name : `${name}.pdf`, { type: "application/pdf" });
  }
}

export async function emailQuote(estimateId: string, m: QuoteEmail): Promise<void> {
  const c = await (await kv()).findOne({ _id: KEY });
  if (!c) throw new Error("Zoho Books isn't connected for quotations yet — Admin connects it once");
  // Sent from the organisation's email, quotations@ since 4 Nov (owner). Without this Zoho uses the connected user's Gmail.
  const fields = { send_from_org_email_id: true, to_mail_ids: m.to, cc_mail_ids: m.cc, subject: m.subject, body: m.body };
  const params: Record<string, string> = m.fileName ? { file_name: m.fileName } : {};
  if (!m.files.length) { await books(c, "POST", `/estimates/${estimateId}/email`, params, fields); return; }
  const form = new FormData();
  form.set("JSONString", JSON.stringify(fields));
  for (const f of m.files) form.append("attachments", f, f.name);
  await books(c, "POST", `/estimates/${estimateId}/email`, params, form);
}
