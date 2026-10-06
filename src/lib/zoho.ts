import "server-only";
import type { AedInvoice, PipelineDoc, Priority, Training, ZohoInvoice, ZohoLead, ZohoPayment, ZohoPI, ZohoQuote, ZohoStatus } from "./types";
import { tidyName } from "./format";
import { db, mongoConfigured } from "./db";

export { tidyName };

// Zoho Books client (India data centre). Runs only on the server: secrets never reach the browser.
// Configure in .env.local — see .env.example. Without credentials the API route serves mock data.

const ACCOUNTS = process.env.ZOHO_ACCOUNTS_URL ?? "https://accounts.zoho.in";
const API = process.env.ZOHO_API_BASE ?? "https://www.zohoapis.in/books/v3";
const ORG = process.env.ZOHO_ORG_ID ?? "60016330017";

const ITEM_IDENTIFIER_FIELD = "cf_item_identifier";
const ALL_AEDS = "All AEDs";
/** Tagged "All AEDs" in Zoho but not AEDs a customer is trained on: trainers and rentals. */
const AED_EXCLUDED = new Set(["Defibtch Lifeline AED Trainer DCF-E350T", "FRX AED Trainer Full set", "XFT-120C AED Trainer", "AED Rental"].map((n) => n.toLowerCase()));
const TRAINING_SERVICES = "Training Services";

export function zohoConfigured(): boolean {
  return Boolean(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN);
}

// Shared across reloads/requests (dev hot-reload re-imports modules; the process keeps globalThis).
type ZohoState = {
  token: { value: string; expiresAt: number } | null;
  refreshing: Promise<string> | null;
  cooldownUntil: number;
  calls: number; // Zoho API calls since the sync last counted them
};
const G: ZohoState = ((globalThis as unknown as { __thZoho?: ZohoState }).__thZoho ??= {
  token: null,
  refreshing: null,
  cooldownUntil: 0,
  calls: 0,
});

const TOKEN_KEY = "zoho_access_token";

async function loadSavedToken(): Promise<ZohoState["token"]> {
  if (!mongoConfigured()) return null;
  try {
    const doc = await (await db()).collection("kv").findOne({ _id: TOKEN_KEY as never });
    return doc && doc.clientId === process.env.ZOHO_CLIENT_ID ? { value: String(doc.value), expiresAt: Number(doc.expiresAt) } : null;
  } catch {
    return null;
  }
}

async function saveToken(t: NonNullable<ZohoState["token"]>) {
  if (!mongoConfigured()) return;
  try {
    await (await db()).collection("kv").replaceOne(
      { _id: TOKEN_KEY as never },
      { _id: TOKEN_KEY as never, value: t.value, expiresAt: t.expiresAt, clientId: process.env.ZOHO_CLIENT_ID },
      { upsert: true },
    );
  } catch {}
}

/** Zoho refused this token: remove it from MongoDB too (only if it's still the saved one), so nobody reuses it. */
async function forgetSavedToken(value: string) {
  if (!mongoConfigured()) return;
  try {
    await (await db()).collection("kv").deleteOne({ _id: TOKEN_KEY as never, value });
  } catch {}
}

/**
 * Zoho access token (valid 1 hour). Reused across reloads and server restarts (saved in MongoDB),
 * refreshed at most once at a time, and never hammered: after a refusal we wait before asking again.
 */
export async function accessToken(): Promise<string> {
  const fresh = (t: ZohoState["token"]) => t && Date.now() < t.expiresAt - 5 * 60_000;
  if (fresh(G.token)) return G.token!.value;
  // Always try the shared token first (another server instance may have refreshed it already): every refresh
  // creates a new Zoho token, and Zoho caps how many can be live at once.
  const saved = await loadSavedToken();
  if (fresh(saved) && saved!.value !== G.token?.value) {
    G.token = saved;
    return saved!.value;
  }
  if (Date.now() < G.cooldownUntil) throw new Error("Zoho asked us to slow down — retrying shortly");
  G.refreshing ??= (async () => {
    try {
      const body = new URLSearchParams({
        refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
        client_id: process.env.ZOHO_CLIENT_ID!,
        client_secret: process.env.ZOHO_CLIENT_SECRET!,
        grant_type: "refresh_token",
      });
      const res = await fetch(`${ACCOUNTS}/oauth/v2/token`, { method: "POST", body, cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.access_token) {
        G.cooldownUntil = Date.now() + 2 * 60_000; // Zoho limits token requests; back off
        throw new Error(`Zoho token refresh failed: ${json.error ?? res.status}`);
      }
      G.token = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
      await saveToken(G.token);
      return G.token.value;
    } finally {
      G.refreshing = null;
    }
  })();
  return G.refreshing;
}

async function zget<T = Record<string, unknown>>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${API}${path}`);
  url.searchParams.set("organization_id", ORG);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  for (let attempt = 0; ; attempt++) {
    G.calls = (G.calls ?? 0) + 1;
    const token = await accessToken();
    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      cache: "no-store",
    });
    // Token revoked or replaced on Zoho's side before it expired: drop it and try once more with a fresh one.
    if (res.status === 401 && attempt < 1) {
      if (G.token?.value === token) G.token = null;
      await forgetSavedToken(token);
      continue;
    }
    // Back off on rate limit / transient errors. Zoho's limit is per minute, so 429s wait longer.
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, (res.status === 429 ? 5000 : 1000) * 2 ** attempt));
      continue;
    }
    const json = await res.json();
    if (!res.ok || json.code !== 0) throw new Error(`Zoho ${path} failed: ${json.message ?? res.status}`);
    return json as T;
  }
}

type ZCustomField = { api_name?: string; label?: string; value?: unknown; value_formatted?: string };
type ZRecord = Record<string, unknown> & { custom_fields?: ZCustomField[]; custom_field_hash?: Record<string, unknown> };

function cf(rec: ZRecord, apiName: string): string | undefined {
  const fromArr = rec.custom_fields?.find((f) => f.api_name === apiName)?.value;
  const v = fromArr ?? rec.custom_field_hash?.[apiName] ?? rec[apiName];
  return v === undefined || v === null || v === "" ? undefined : String(v);
}

async function paged(path: string, key: string, params: Record<string, string | number>): Promise<ZRecord[]> {
  const all: ZRecord[] = [];
  for (let page = 1; ; page++) {
    const json = await zget<Record<string, unknown>>(path, { ...params, page, per_page: 200 });
    all.push(...((json[key] as ZRecord[]) ?? []));
    const ctx = json.page_context as { has_more_page?: boolean } | undefined;
    if (!ctx?.has_more_page) return all;
  }
}

/** Like paged(), but fetches pages in parallel batches — for large lists such as contacts. */
async function pagedParallel(path: string, key: string, params: Record<string, string | number>, batch = 4): Promise<ZRecord[]> {
  const all: ZRecord[] = [];
  for (let start = 1; ; start += batch) {
    const pages = await Promise.all(
      Array.from({ length: batch }, (_, i) => zget<Record<string, unknown>>(path, { ...params, page: start + i, per_page: 200 })),
    );
    for (const json of pages) all.push(...((json[key] as ZRecord[]) ?? []));
    const last = pages[pages.length - 1].page_context as { has_more_page?: boolean } | undefined;
    const short = pages.some((j) => ((j[key] as unknown[]) ?? []).length < 200);
    if (!last?.has_more_page || short) return all;
  }
}

/** Zoho API calls made since the last call to this (the sync adds them to the daily counter). */
export function takeZohoCalls(): number {
  const n = G.calls ?? 0;
  G.calls = 0;
  return n;
}

async function pool<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, xs.length) }, async () => {
      while (i < xs.length) {
        const idx = i++;
        out[idx] = await fn(xs[idx]);
      }
    }),
  );
  return out;
}

/** Zoho returns dates as yyyy-mm-dd, but formatted custom fields can arrive as dd/mm/yyyy. */
function normDate(v?: string): string | undefined {
  if (!v) return undefined;
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : v.slice(0, 10);
}

/** "THCAS First Aid Training 2025 (I)" -> "First Aid Training". Raw name is kept as itemName. */
export function displayTrainingName(name: string): string {
  return name
    .replace(/^THCAS\s+/i, "")
    .replace(/\s*\((I|M)\)\s*$/i, "")
    .replace(/\s+20\d{2}$/, "")
    .trim();
}

const PRIORITY_MAP: Record<string, Priority> = { high: "high", medium: "medium", low: "low", neutral: "low" };

export type Kind = "invoices" | "salesorders" | "estimates";
export const KINDS: Kind[] = ["estimates", "salesorders", "invoices"];
const DETAIL_KEY: Record<Kind, string> = { invoices: "invoice", salesorders: "salesorder", estimates: "estimate" };
const ID_KEY: Record<Kind, string> = { invoices: "invoice_id", salesorders: "salesorder_id", estimates: "estimate_id" };
export type ZDoc = ZRecord;

export const ZOHO_ORG_ID = ORG;

const str = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : String(v));

/** Zoho's "2026-09-24T12:14:04+0530" -> UTC ISO, so it sorts alongside our own timestamps. */
export function isoTime(v: unknown, fallback = ""): string {
  const s = str(v);
  if (!s) return fallback;
  const d = new Date(s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

/* ---------------- Items: which documents are tracked ---------------- */

export type ZItem = { id: string; name: string; identifier?: string };

/** Every Zoho item with its Item Identifier (a few list calls; the sync keeps the result in MongoDB). */
export async function fetchItems(): Promise<ZItem[]> {
  const rows = await paged("/items", "items", { filter_by: "Status.All" });
  return rows.map((i) => ({ id: String(i.item_id), name: String(i.name), identifier: cf(i, ITEM_IDENTIFIER_FIELD) }));
}

/** Quotations are picked up when they contain one of these items (all have Item Identifier "Training Services"). */
export const QUOTE_TRAINING_ITEMS = [
  "Fire Safety Evacuation Training and Drill",
  "THCAS BLS Training 2025 (I)",
  "THCAS CPR Training 2026 (I)",
  "THCAS First Aid Training (I)",
];

/** training: Item Identifier "Training Services" (Overview); quoteTraining: the four Follow-ups items; aed: "All AEDs" minus trainers/rentals. */
export interface ItemSets { training: Set<string>; quoteTraining: Set<string>; aed: Set<string> }
export function itemSets(items: ZItem[]): ItemSets {
  return {
    training: new Set(items.filter((i) => i.identifier === TRAINING_SERVICES || QUOTE_TRAINING_ITEMS.includes(i.name)).map((i) => i.id)),
    quoteTraining: new Set(items.filter((i) => QUOTE_TRAINING_ITEMS.includes(i.name)).map((i) => i.id)),
    aed: new Set(items.filter((i) => i.identifier === ALL_AEDS && !AED_EXCLUDED.has(i.name.trim().toLowerCase())).map((i) => i.id)),
  };
}

/* ---------------- Lists and details (building blocks for the sync in zohoSync.ts) ---------------- */

export const docIdOf = (kind: Kind, r: ZRecord) => String(r[ID_KEY[kind]]);
export const lmtOf = (r: ZRecord) => isoTime(r.last_modified_time);

/**
 * Documents of a kind changed after `cursor` (UTC ISO), newest change first. Zoho sorts the list by
 * last_modified_time, so a quiet sync is a single call; paging stops at the first already-seen change.
 */
export async function listChangedSince(kind: Kind, since: string, cursor?: string): Promise<ZRecord[]> {
  const out: ZRecord[] = [];
  for (let page = 1; page <= 25; page++) {
    const json = await zget<Record<string, unknown>>(`/${kind}`, { sort_column: "last_modified_time", sort_order: "D", date_start: since, page, per_page: 200 });
    const rows = (json[kind] as ZRecord[]) ?? [];
    for (const r of rows) {
      if (cursor && lmtOf(r) <= cursor) return out;
      out.push(r);
    }
    if (!(json.page_context as { has_more_page?: boolean } | undefined)?.has_more_page) return out;
  }
  return out;
}

/** The latest last-modified time of a kind's documents (one call) — where incremental syncing starts. */
export async function newestChange(kind: Kind, since: string): Promise<string | undefined> {
  const json = await zget<Record<string, unknown>>(`/${kind}`, { sort_column: "last_modified_time", sort_order: "D", date_start: since, per_page: 1 });
  const r = ((json[kind] as ZRecord[]) ?? [])[0];
  return r ? lmtOf(r) : undefined;
}

/** Every document of a kind containing an item (used by the periodic full check). */
export const listByItem = (kind: Kind, itemId: string, since: string) => paged(`/${kind}`, kind, { item_id: itemId, date_start: since });

export async function fetchDetail(kind: Kind, id: string): Promise<ZRecord> {
  return (await zget<Record<string, ZRecord>>(`/${kind}/${id}`))[DETAIL_KEY[kind]];
}

/** Payments recorded against an invoice (the token has no customer-payments scope; this route works). */
export async function fetchInvoicePaymentRows(invoiceId: string): Promise<ZRecord[]> {
  return ((await zget<Record<string, unknown>>(`/invoices/${invoiceId}/payments`)).payments as ZRecord[]) ?? [];
}

export { pool };

/* ---------------- Mapping Zoho documents to the board's shapes (pure) ---------------- */

function priorityOf(doc: ZRecord): Priority | undefined {
  const pr = cf(doc, "cf_priority")?.toLowerCase();
  return pr ? PRIORITY_MAP[pr] : undefined;
}

export function toTrainings(inv: ZRecord, itemIds: Set<string>): Training[] {
  const status = String(inv.status) as ZohoStatus;
  return ((inv.line_items as ZRecord[]) ?? [])
    .filter((li) => itemIds.has(String(li.item_id)))
    .map((li) => ({
      id: `invoice:${li.line_item_id}`,
      zohoDocType: "invoice" as const,
      zohoDocId: String(inv.invoice_id),
      docNumber: String(inv.invoice_number),
      customerId: String(inv.customer_id),
      customerName: tidyName(String(inv.customer_name)),
      trainingType: displayTrainingName(String(li.name)),
      itemName: String(li.name),
      trainingDate: normDate(cf(inv, "cf_training_date")) ?? String(inv.date),
      trainer: cf(inv, "cf_trainer_name") ?? "None",
      participants: Number(li.quantity) || 0,
      amount: Number(li.item_total) || 0,
      status,
      dueDate: inv.due_date ? String(inv.due_date) : undefined,
      certExpiry: normDate(cf(inv, "cf_certificate_expiry")),
      leadSource: cf(inv, "cf_lead_source"),
      zohoPriority: priorityOf(inv),
    }));
}

export function toPipeline(kind: "salesorders" | "estimates", doc: ZRecord, itemIds: Set<string>): PipelineDoc | null {
  const lines = ((doc.line_items as ZRecord[]) ?? []).filter((li) => itemIds.has(String(li.item_id)));
  if (!lines.length) return null;
  const docId = String(doc[ID_KEY[kind]]);
  const k = kind === "salesorders" ? "salesorder" : "estimate";
  return {
    id: `${k}:${docId}`,
    kind: k,
    docId,
    docNumber: String(doc.salesorder_number ?? doc.estimate_number ?? ""),
    customerName: tidyName(String(doc.customer_name)),
    date: String(doc.date),
    trainingDate: normDate(cf(doc, "cf_training_date")),
    expiryDate: doc.expiry_date ? String(doc.expiry_date) : undefined,
    status: String(doc.status),
    trainingType: [...new Set(lines.map((li) => displayTrainingName(String(li.name))))].join(", "),
    participants: lines.reduce((s, li) => s + (Number(li.quantity) || 0), 0),
    amount: lines.reduce((s, li) => s + (Number(li.item_total) || 0), 0),
    zohoPriority: priorityOf(doc),
  };
}

// Quotes still in play, and sales orders confirmed but not (fully) invoiced.
export const OPEN_QUOTE = new Set(["draft", "sent", "accepted"]);
export const OPEN_ORDER = new Set(["open", "partially_invoiced"]);

/** Fields every Follow-ups document shares; `ids` = the items that make it a tracked document. */
function common(d: ZRecord, ids: Set<string>) {
  // Quotes call it contact_persons_details, sales orders contact_person_details.
  const selected = new Set(((d.contact_persons as unknown[]) ?? []).map(String));
  const details = ((d.contact_persons_details ?? d.contact_person_details) as ZRecord[]) ?? [];
  const people = details.filter((p) => (selected.size === 0 ? p.is_primary_contact : selected.has(String(p.contact_person_id))));
  return {
    date: String(d.date),
    createdAt: isoTime(d.created_time, `${d.date}T00:00:00.000Z`),
    status: String(d.status),
    customerId: String(d.customer_id),
    customerName: tidyName(String(d.customer_name)),
    salesperson: str(d.salesperson_name),
    contacts: people.map((p) => ({
      name: [p.first_name, p.last_name].filter(Boolean).join(" ") || undefined,
      email: str(p.email),
      phone: str(p.phone),
      mobile: str(p.mobile),
    })),
    items: ((d.line_items as ZRecord[]) ?? [])
      .filter((li) => ids.has(String(li.item_id)))
      .map((li) => ({ name: String(li.name), qty: Number(li.quantity) || 0 })),
  };
}

/** Phase 2: a quotation with a tracked training item. */
export const toQuote = (d: ZRecord, ids: Set<string>): ZohoQuote => ({ ...common(d, ids), estimateId: String(d.estimate_id), number: String(d.estimate_number) });

/** Phase 3: a sales order — the org's Performa Invoice (numbered Performa-…). */
export const toPI = (d: ZRecord, ids: Set<string>): ZohoPI => ({
  ...common(d, ids),
  salesorderId: String(d.salesorder_id),
  number: String(d.salesorder_number),
  reference: str(d.reference_number),
});

/** Phase 6: an invoice; its reference cites the PI (Performa-…) it came from. */
export const toInvoice = (d: ZRecord, ids: Set<string>): ZohoInvoice => ({
  ...common(d, ids),
  invoiceId: String(d.invoice_id),
  number: String(d.invoice_number),
  reference: str(d.reference_number),
  dueDate: str(d.due_date),
  total: d.total === undefined ? undefined : Number(d.total),
  balance: d.balance === undefined ? undefined : Number(d.balance),
  lastModified: String(d.last_modified_time ?? ""),
});

/** AedSmartx board: an invoice with an AED item; the ship-to phone is the preferred contact number. */
export function toAedInvoice(d: ZRecord, aedIds: Set<string>): AedInvoice {
  const ship = (d.shipping_address as ZRecord | undefined) ?? {};
  const line = (li: ZRecord) => ({ name: String(li.name), qty: Number(li.quantity) || 0, description: String(li.description ?? "") });
  const lines = (d.line_items as ZRecord[]) ?? [];
  return {
    ...toInvoice(d, aedIds),
    shipPhone: str(ship.phone),
    shipAttention: str(ship.attention),
    aedLines: lines.filter((li) => aedIds.has(String(li.item_id))).map(line),
    otherLines: lines.filter((li) => !aedIds.has(String(li.item_id))).map(line),
  };
}

/** Phase 7: the payments recorded against an invoice. */
export function toPayments(inv: ZohoInvoice, rows: ZRecord[]): ZohoPayment[] {
  return rows.map((p) => ({
    paymentId: String(p.payment_id),
    number: String(p.payment_number),
    date: String(p.date),
    createdAt: `${p.date}T00:00:00.000Z`,
    amount: Number(p.amount) || 0,
    mode: str(p.payment_mode),
    reference: str(p.reference_number),
    invoiceId: inv.invoiceId,
    invoiceNumber: inv.number,
    customerId: inv.customerId,
    customerName: inv.customerName,
    items: inv.items,
  }));
}

/* ---------------- Customers and team ---------------- */

/** Active Zoho Books users (the team) — used as follow-up owners. */
export async function fetchTeam(): Promise<string[]> {
  const users = await paged("/users", "users", { filter_by: "Status.Active" });
  return users.filter((u) => String(u.status) === "active").map((u) => tidyName(String(u.name)));
}

// Zoho ignores contact_type when filter_by is set and returns vendors too, so we also filter each row.
const LEAD_FILTER = { contact_type: "customer", filter_by: "Status.Active" };
const isCustomer = (c: ZRecord) => c.contact_type === "customer";

function toLead(c: ZRecord): ZohoLead {
  return {
    contactId: String(c.contact_id),
    name: tidyName(String(c.contact_name)),
    email: str(c.email),
    phone: str(c.phone),
    mobile: str(c.mobile),
    createdAt: isoTime(c.created_time),
    lastModified: isoTime(c.last_modified_time ?? c.created_time),
    type: cf(c, "cf_type"),
    sector: cf(c, "cf_sector"),
  };
}

/** Every active customer (~22 list calls for ~4k contacts; no per-contact detail calls). */
export async function fetchAllLeads(): Promise<ZohoLead[]> {
  return (await pagedParallel("/contacts", "contacts", LEAD_FILTER)).filter(isCustomer).map(toLead);
}

/** The 200 most recently created/edited active customers — cheap way to pick up new ones between full syncs. */
export async function fetchRecentLeads(): Promise<ZohoLead[]> {
  const json = await zget<Record<string, unknown>>("/contacts", { ...LEAD_FILTER, sort_column: "last_modified_time", sort_order: "D", per_page: 200 });
  return ((json.contacts as ZRecord[]) ?? []).filter(isCustomer).map(toLead);
}
