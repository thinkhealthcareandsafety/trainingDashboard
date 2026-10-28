import "server-only";
import { db } from "./db";
import { clientOf, tokenRequest } from "./zohoOAuth";

/*
 * Quotations (owner, 28 Oct: "all of our contacts are here, we need to click one time and a quotation is sent through
 * zoho books"). The only place the dashboard WRITES to Zoho Books, so it has its own connection — the sync's token
 * stays read-only. Admin connects it once with a one-time code from the Zoho API console (Self Client, scopes
 * QUOTE_SCOPES); the refresh token lives only in MongoDB kv `zoho_books:quotes`, never in a browser.
 *
 * Zoho Books API v3 (India): POST /estimates?send=true|false {customer_id, contact_persons, line_items, salesperson_name}
 * — `send=true` emails it with the org's standard quotation email + PDF to the contact persons on it.
 */

const API = process.env.ZOHO_API_BASE ?? "https://www.zohoapis.in/books/v3";
const ORG = process.env.ZOHO_ORG_ID ?? "60016330017";
export const QUOTE_SCOPES = "ZohoBooks.estimates.CREATE,ZohoBooks.estimates.UPDATE,ZohoBooks.contacts.READ";
const KEY = "zoho_books:quotes";

type Conn = { _id: string; clientId: string; clientSecret: string; refreshToken: string; token?: { value: string; expiresAt: number }; connectedAt: string; connectedBy: string };
export type QuotesInfo = { connectedAt: string; connectedBy: string };
const kv = async () => (await db()).collection<Conn>("kv");

export async function quotesInfo(): Promise<QuotesInfo | null> {
  const c = await (await kv()).findOne({ _id: KEY });
  return c ? { connectedAt: c.connectedAt, connectedBy: c.connectedBy } : null;
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
  const c: Conn = { _id: KEY, clientId, clientSecret, refreshToken: t.refresh_token, token: { value: t.access_token!, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 }, connectedAt: new Date().toISOString(), connectedBy: by };
  await books(c, "GET", "/contacts", { per_page: "1" }); // the right organisation, and the scope works
  await (await kv()).replaceOne({ _id: KEY }, c, { upsert: true });
  return { connectedAt: c.connectedAt, connectedBy: by };
}

export type QuoteLine = { itemId: string; qty: number; rate: number; description?: string };
export type MadeQuote = { estimateId: string; number: string; total: number; status: string };

/** Creates the quotation in Zoho Books; `send` = Zoho emails it (standard email + PDF) to the contact persons on it. */
export async function createQuote(q: { customerId: string; contactPersonIds: string[]; lines: QuoteLine[]; salesperson?: string; send: boolean }): Promise<MadeQuote> {
  const c = await (await kv()).findOne({ _id: KEY });
  if (!c) throw new Error("Zoho Books isn't connected for quotations yet — Admin connects it once");
  const body = {
    customer_id: q.customerId,
    contact_persons: q.contactPersonIds,
    ...(q.salesperson ? { salesperson_name: q.salesperson } : {}),
    line_items: q.lines.map((l) => ({ item_id: l.itemId, quantity: l.qty, rate: l.rate, ...(l.description ? { description: l.description } : {}) })),
  };
  const j = await books(c, "POST", "/estimates", { send: String(q.send) }, body);
  const e = (j.estimate ?? {}) as Record<string, unknown>;
  return { estimateId: String(e.estimate_id ?? ""), number: String(e.estimate_number ?? ""), total: Number(e.total ?? 0), status: String(e.status ?? "") };
}
