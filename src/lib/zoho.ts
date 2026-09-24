import "server-only";
import type { PipelineDoc, Priority, Training, ZohoLead, ZohoQuote, ZohoStatus } from "./types";
import { fiscalYearStart, ymd } from "./dates";
import { tidyName } from "./format";
import { db, mongoConfigured } from "./db";

export { tidyName };

// Zoho Books client (India data centre). Runs only on the server: secrets never reach the browser.
// Configure in .env.local — see .env.example. Without credentials the API route serves mock data.

const ACCOUNTS = process.env.ZOHO_ACCOUNTS_URL ?? "https://accounts.zoho.in";
const API = process.env.ZOHO_API_BASE ?? "https://www.zohoapis.in/books/v3";
const ORG = process.env.ZOHO_ORG_ID ?? "60016330017";

const ITEM_IDENTIFIER_FIELD = "cf_item_identifier";
const TRAINING_SERVICES = "Training Services";

export function zohoConfigured(): boolean {
  return Boolean(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN);
}

// Shared across reloads/requests (dev hot-reload re-imports modules; the process keeps globalThis).
type ZohoState = {
  token: { value: string; expiresAt: number } | null;
  refreshing: Promise<string> | null;
  cooldownUntil: number;
  itemsList?: { at: number; items: { id: string; name: string; identifier?: string }[] } | null;
  detailCache: Map<string, { lmt: string; doc: Record<string, unknown> }>;
};
const G: ZohoState = ((globalThis as unknown as { __thZoho?: ZohoState }).__thZoho ??= {
  token: null,
  refreshing: null,
  cooldownUntil: 0,
  itemsList: null,
  detailCache: new Map(),
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

/**
 * Zoho access token (valid 1 hour). Reused across reloads and server restarts (saved in MongoDB),
 * refreshed at most once at a time, and never hammered: after a refusal we wait before asking again.
 */
export async function accessToken(): Promise<string> {
  const fresh = (t: ZohoState["token"]) => t && Date.now() < t.expiresAt - 5 * 60_000;
  if (fresh(G.token)) return G.token!.value;
  if (!G.token) {
    const saved = await loadSavedToken();
    if (fresh(saved)) {
      G.token = saved;
      return saved!.value;
    }
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
    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${await accessToken()}` },
      cache: "no-store",
    });
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

const ITEMS_TTL_MS = 60 * 60_000;

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

/** Every Zoho item (id, name, Item Identifier), cached for an hour. */
async function allItems() {
  if (G.itemsList && Date.now() - G.itemsList.at < ITEMS_TTL_MS) return G.itemsList.items;
  const rows = await paged("/items", "items", { filter_by: "Status.All" });
  const items = rows.map((i) => ({ id: String(i.item_id), name: String(i.name), identifier: cf(i, ITEM_IDENTIFIER_FIELD) }));
  G.itemsList = { at: Date.now(), items };
  return items;
}

/** Step 1 of the sync: ids of items whose Item Identifier = "Training Services". */
export async function trainingItemIds(): Promise<Set<string>> {
  return new Set((await allItems()).filter((i) => i.identifier === TRAINING_SERVICES).map((i) => i.id));
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

type Kind = "invoices" | "salesorders" | "estimates";
const DETAIL_KEY: Record<Kind, string> = { invoices: "invoice", salesorders: "salesorder", estimates: "estimate" };
const ID_KEY: Record<Kind, string> = { invoices: "invoice_id", salesorders: "salesorder_id", estimates: "estimate_id" };

// Document details keyed by id + last_modified_time, so each sync only downloads what changed.
const detailCache = G.detailCache as Map<string, { lmt: string; doc: ZRecord }>;

/** Documents of one kind that contain at least one Training Services item (list narrowed by item_id). */
async function docsWithTrainingItems(kind: Kind, itemIds: Set<string>, from: Date, keep: (status: string) => boolean): Promise<ZRecord[]> {
  const listed = new Map<string, ZRecord>();
  const lists = await pool([...itemIds], 4, (itemId) => paged(`/${kind}`, kind, { item_id: itemId, date_start: ymd(from) }));
  for (const d of lists.flat()) if (keep(String(d.status))) listed.set(String(d[ID_KEY[kind]]), d);
  return pool([...listed.values()], 5, async (d) => {
    const id = String(d[ID_KEY[kind]]);
    const lmt = String(d.last_modified_time ?? "");
    const key = `${kind}:${id}`;
    const hit = detailCache.get(key);
    if (hit && lmt && hit.lmt === lmt) return hit.doc;
    const doc = (await zget<Record<string, ZRecord>>(`/${kind}/${id}`))[DETAIL_KEY[kind]];
    detailCache.set(key, { lmt, doc });
    return doc;
  });
}

function priorityOf(doc: ZRecord): Priority | undefined {
  const pr = cf(doc, "cf_priority")?.toLowerCase();
  return pr ? PRIORITY_MAP[pr] : undefined;
}

function toTrainings(inv: ZRecord, itemIds: Set<string>): Training[] {
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

function toPipeline(kind: "salesorders" | "estimates", doc: ZRecord, itemIds: Set<string>): PipelineDoc | null {
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
const OPEN_QUOTE = new Set(["draft", "sent", "accepted"]);
const OPEN_ORDER = new Set(["open", "partially_invoiced"]);

/** Steps 2-4: invoices (delivered trainings) plus the pipeline (quotes + booked sales orders). */
export async function fetchFromZoho(from = fiscalYearStart(new Date())): Promise<{ trainings: Training[]; pipeline: PipelineDoc[] }> {
  const itemIds = await trainingItemIds();
  if (itemIds.size === 0) return { trainings: [], pipeline: [] };
  // One kind at a time (each makes up to 4 parallel list calls) to stay inside Zoho's concurrency limit.
  const invoices = await docsWithTrainingItems("invoices", itemIds, from, (s) => s !== "void");
  const orders = await docsWithTrainingItems("salesorders", itemIds, from, (s) => OPEN_ORDER.has(s));
  const quotes = await docsWithTrainingItems("estimates", itemIds, from, (s) => OPEN_QUOTE.has(s));
  return {
    trainings: invoices.flatMap((inv) => toTrainings(inv, itemIds)),
    pipeline: [
      ...orders.map((d) => toPipeline("salesorders", d, itemIds)),
      ...quotes.map((d) => toPipeline("estimates", d, itemIds)),
    ].filter((x): x is PipelineDoc => x !== null),
  };
}

export const ZOHO_ORG_ID = ORG;

/** Active Zoho Books users (the team) — used as follow-up owners. */
export async function fetchTeam(): Promise<string[]> {
  const users = await paged("/users", "users", { filter_by: "Status.Active" });
  return users.filter((u) => String(u.status) === "active").map((u) => tidyName(String(u.name)));
}

// Zoho ignores contact_type when filter_by is set and returns vendors too, so we also filter each row.
const LEAD_FILTER = { contact_type: "customer", filter_by: "Status.Active" };
const isCustomer = (c: ZRecord) => c.contact_type === "customer";

/** Active Zoho Books customers — used to pick the client on follow-ups and calendar entries. */
export async function fetchCustomers(): Promise<string[]> {
  const contacts = await pagedParallel("/contacts", "contacts", LEAD_FILTER);
  return contacts.filter(isCustomer).map((c) => tidyName(String(c.contact_name)));
}

/* ---------------- Follow-ups pipeline: leads (customers) and training quotations ---------------- */

const str = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : String(v));

/** Zoho's "2026-09-24T12:14:04+0530" -> UTC ISO, so it sorts alongside our own timestamps. */
function isoTime(v: unknown, fallback = ""): string {
  const s = str(v);
  if (!s) return fallback;
  const d = new Date(s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

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

/** Quotations are picked up when they contain one of these items (all have Item Identifier "Training Services"). */
export const QUOTE_TRAINING_ITEMS = [
  "Fire Safety Evacuation Training and Drill",
  "THCAS BLS Training 2025 (I)",
  "THCAS CPR Training 2026 (I)",
  "THCAS First Aid Training (I)",
];

/** Every quotation (any status) containing one of QUOTE_TRAINING_ITEMS; details are re-downloaded only when changed. */
export async function fetchTrainingQuotes(): Promise<ZohoQuote[]> {
  const wanted = (await allItems()).filter((i) => QUOTE_TRAINING_ITEMS.includes(i.name));
  const wantedIds = new Set(wanted.map((i) => i.id));
  const listed = new Map<string, ZRecord>();
  const lists = await pool(wanted, 4, (i) => paged("/estimates", "estimates", { item_id: i.id }));
  for (const e of lists.flat()) listed.set(String(e.estimate_id), e);
  const docs = await pool([...listed.values()], 5, async (e) => {
    const id = String(e.estimate_id);
    const lmt = String(e.last_modified_time ?? "");
    const key = `estimates:${id}`;
    const hit = detailCache.get(key);
    if (hit && lmt && hit.lmt === lmt) return hit.doc;
    const doc = (await zget<Record<string, ZRecord>>(`/estimates/${id}`)).estimate;
    detailCache.set(key, { lmt, doc });
    return doc;
  });
  return docs.map((d): ZohoQuote => {
    const selected = new Set(((d.contact_persons as unknown[]) ?? []).map(String));
    const people = ((d.contact_persons_details as ZRecord[]) ?? []).filter((p) => selected.size === 0 ? p.is_primary_contact : selected.has(String(p.contact_person_id)));
    return {
      estimateId: String(d.estimate_id),
      number: String(d.estimate_number),
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
        .filter((li) => wantedIds.has(String(li.item_id)))
        .map((li) => ({ name: String(li.name), qty: Number(li.quantity) || 0 })),
    };
  });
}
