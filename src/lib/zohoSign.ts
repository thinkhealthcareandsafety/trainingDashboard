import "server-only";
import { db } from "./db";
import { clientsToTry, tokenRequest } from "./zohoOAuth";
import { booksClient } from "./quotations";
import type { SignBox } from "./pdfMerge";

/*
 * Zoho Sign (owner, 17 Nov: "now we have Zoho Sign … we merge invoice PDF + PO PDF + e-way bill PDF, then we add a sign,
 * date, full name"). Admin (or Shikha) connects it once with a one-time code from the Zoho API console (the same Self
 * Client as Zoho Books, scope SIGN_SCOPES); the refresh token lives only in MongoDB kv `zoho_sign`.
 *
 * A signing: POST /requests (the PDF and one signer, embedded) → POST /requests/{id}/submit with the signature, name and
 * date boxes → POST /requests/{id}/actions/{action}/embedtoken → the signing page opens on the dashboard. When Zoho
 * says "completed", GET /requests/{id}/pdf is the signed PDF.
 */

const SIGN_API = process.env.ZOHO_SIGN_API ?? "https://sign.zoho.in/api/v1";
export const SIGN_SCOPES = "ZohoSign.documents.ALL,ZohoSign.account.READ";
const KEY = "zoho_sign";

type Conn = { _id: string; clientId: string; clientSecret: string; refreshToken: string; token?: { value: string; expiresAt: number }; connectedAt: string; connectedBy: string };
const kv = async () => (await db()).collection<Conn>("kv");

export async function signInfo(): Promise<{ connectedAt: string; connectedBy: string } | null> {
  const c = await (await kv()).findOne({ _id: KEY });
  return c ? { connectedAt: c.connectedAt, connectedBy: c.connectedBy } : null;
}

async function access(c: Conn, force = false): Promise<string> {
  if (!force && c.token && Date.now() < c.token.expiresAt - 5 * 60_000) return c.token.value;
  const t = await tokenRequest({ grant_type: "refresh_token", client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken })
    .catch((e: Error) => { throw new Error(`Zoho Sign sign-in failed — Admin may need to connect it again (${e.message})`); });
  c.token = { value: t.access_token!, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 };
  await (await kv()).updateOne({ _id: KEY }, { $set: { token: c.token } });
  return c.token.value;
}

async function conn(): Promise<Conn> {
  const c = await (await kv()).findOne({ _id: KEY });
  if (!c) throw new Error("Zoho Sign isn't connected yet — Admin connects it once on the Invoice Converter.");
  return c;
}

/** One Zoho Sign call: JSON back (or raw bytes with `raw`). `data` goes as the form field Zoho Sign expects. */
async function sign(c: Conn, method: "GET" | "POST" | "PUT", path: string, opts: { data?: unknown; file?: { bytes: Uint8Array; name: string }; query?: Record<string, string>; raw?: boolean } = {}): Promise<Record<string, unknown> & { bytes?: Uint8Array }> {
  const url = new URL(`${SIGN_API}${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  let body: FormData | undefined;
  if (opts.data !== undefined || opts.file) {
    body = new FormData();
    if (opts.file) body.append("file", new File([new Uint8Array(opts.file.bytes)], opts.file.name, { type: "application/pdf" }));
    if (opts.data !== undefined) body.append("data", JSON.stringify(opts.data));
  }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { method, headers: { Authorization: `Zoho-oauthtoken ${await access(c, attempt > 0)}` }, body, cache: "no-store" });
    if (res.status === 401 && attempt === 0) continue;
    if (opts.raw && res.ok) return { bytes: new Uint8Array(await res.arrayBuffer()) };
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { code?: number; message?: string };
    if (!res.ok || (json.code !== undefined && json.code !== 0)) {
      console.error(`[zoho sign] ${method} ${path} → ${res.status} ${json.code ?? ""} ${json.message ?? ""}`);
      throw new Error(`Zoho Sign: ${json.message ?? `error ${res.status}`}`);
    }
    return json;
  }
}

/** Admin: the one-time code (same Self Client as Zoho Books unless typed) → a refresh token, checked, saved. */
export async function connectSign(input: { code: string; clientId?: string; clientSecret?: string }, by: string): Promise<{ connectedAt: string; connectedBy: string }> {
  const saved = (await (await kv()).findOne({ _id: KEY })) ?? (await booksClient());
  const clients = clientsToTry(input, saved);
  let t: Awaited<ReturnType<typeof tokenRequest>> | undefined;
  let refused: unknown;
  let clientId = "", clientSecret = "";
  for (const k of clients) {
    try {
      t = await tokenRequest({ grant_type: "authorization_code", code: input.code.trim(), client_id: k.clientId, client_secret: k.clientSecret });
      ({ clientId, clientSecret } = k);
      break;
    } catch (e) { refused = e; }
  }
  if (!t) throw refused;
  if (!t.refresh_token) throw new Error("Zoho gave no refresh token — generate a new code and try again");
  const c: Conn = { _id: KEY, clientId, clientSecret, refreshToken: t.refresh_token, token: { value: t.access_token!, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 }, connectedAt: new Date().toISOString(), connectedBy: by };
  await sign(c, "GET", "/requests", { query: { data: JSON.stringify({ page_context: { row_count: 1, start_index: 1 } }) } }).catch((e: Error) => {
    throw new Error(`Zoho took the code, but Zoho Sign refused it (${e.message}). Generate a new code with the scope ${SIGN_SCOPES}, signed in as the Zoho user who uses Zoho Sign.`);
  });
  await (await kv()).replaceOne({ _id: KEY }, c, { upsert: true });
  return { connectedAt: c.connectedAt, connectedBy: by };
}

/** Where the boxes go, in points from the top-left of a page (0-based page). */
export type SignSpot = { page: number; x: number; y: number };

/** Sends the PDF for one embedded signature (signature, full name, date once) and returns the signing page's address. */
export async function startSigning(pdf: Uint8Array, opts: { name: string; fileName: string; signer: { name: string; email: string }; spot: SignSpot; host: string }): Promise<{ requestId: string; actionId: string; signUrl: string }> {
  const c = await conn();
  const action = { action_type: "SIGN", recipient_name: opts.signer.name, recipient_email: opts.signer.email, signing_order: 0, verify_recipient: false, is_embedded: true };
  const made = await sign(c, "POST", "/requests", { file: { bytes: pdf, name: opts.fileName }, data: { requests: { request_name: opts.name, is_sequential: true, expiration_days: 15, email_reminders: false, actions: [action] } } });
  const req = made.requests as { request_id: string; actions: { action_id: string }[]; document_ids: { document_id: string }[] };
  const requestId = req.request_id, actionId = req.actions[0].action_id, documentId = req.document_ids[0].document_id;
  const { page, x, y } = opts.spot;
  const box = (type: string, name: string, dy: number, h: number, extra: Record<string, unknown> = {}) =>
    ({ field_type_name: type, field_name: name, field_label: name, document_id: documentId, page_no: page, x_coord: Math.round(x), y_coord: Math.round(y + dy), abs_width: 170, abs_height: h, is_mandatory: true, ...extra });
  await sign(c, "POST", `/requests/${requestId}/submit`, {
    data: { requests: { actions: [{ ...action, action_id: actionId, fields: [box("Signature", "Signature", 0, 40), box("Name", "Full name", 46, 18), box("Date", "Date", 68, 18, { date_format: "dd MMM yyyy" })] }] } },
  });
  const tok = await sign(c, "POST", `/requests/${requestId}/actions/${actionId}/embedtoken`, { query: { host: opts.host } });
  return { requestId, actionId, signUrl: String(tok.sign_url ?? "") };
}

/** Zoho Sign's own web page for a request (a draft opens ready to edit and send). */
export const signWebUrl = (requestId: string) => `${new URL(SIGN_API).origin}/zs#/request/new/${requestId}`;

/** The Zoho Sign account's user, as the draft's signer when the person has no signer details of their own. */
async function accountUser(c: Conn): Promise<{ name: string; email: string }> {
  const u = ((await sign(c, "GET", "/accounts")).accounts as { users?: { first_name?: string; last_name?: string; user_email?: string }[] } | undefined)?.users?.[0];
  if (!u?.user_email) throw new Error("Zoho Sign didn't say who its user is.");
  const first = String(u.first_name ?? "").trim(), last = String(u.last_name ?? "").trim();
  return { name: !last || first.toLowerCase().endsWith(last.toLowerCase()) ? first || last : `${first} ${last}`, email: u.user_email };
}

/**
 * Merge and draft (owner, 20 Nov: "only Merge and Draft … just don't send, I can send it myself"): the PDF as a Zoho
 * Sign DRAFT with the signature, full name and date boxes placed — never submitted, so no API credits are used (only
 * sending through the API needs them; drafts were checked on the Zoho One plan, 20 Nov). The owner opens it in Zoho
 * Sign and signs / sends it there.
 */
export async function createDraft(pdf: Uint8Array, opts: { name: string; fileName: string; signer?: { name: string; email: string } | null; boxes: SignBox[] }): Promise<{ requestId: string; url: string }> {
  const c = await conn();
  const who = opts.signer ?? (await accountUser(c));
  const action = { action_type: "SIGN", recipient_name: who.name, recipient_email: who.email, signing_order: 0, verify_recipient: false };
  const made = await sign(c, "POST", "/requests", { file: { bytes: pdf, name: opts.fileName }, data: { requests: { request_name: opts.name, is_sequential: true, expiration_days: 15, email_reminders: false, actions: [action] } } });
  const req = made.requests as { request_id: string; actions: { action_id: string }[]; document_ids: { document_id: string }[] };
  const documentId = req.document_ids[0].document_id;
  // Date as the owner writes it: 18/11/2026.
  const fields = opts.boxes.map((b) => ({
    field_type_name: b.type, field_name: b.label, field_label: b.label, document_id: documentId, page_no: b.page,
    x_coord: b.x, y_coord: b.y, abs_width: b.w, abs_height: b.h, is_mandatory: true, ...(b.type === "Date" ? { date_format: "dd/MM/yyyy" } : {}),
  }));
  // The boxes on the draft (PUT, not submit): if Zoho refuses them the draft is still there to place them by hand.
  await sign(c, "PUT", `/requests/${req.request_id}`, {
    data: { requests: { actions: [{ ...action, action_id: req.actions[0].action_id, fields }] } },
  }).catch((e: Error) => console.error(`[zoho sign] boxes on draft ${req.request_id}: ${e.message}`));
  return { requestId: req.request_id, url: signWebUrl(req.request_id) };
}

/** A fresh signing page for a request still waiting (the first one may have been closed). */
export async function signUrlAgain(requestId: string, actionId: string, host: string): Promise<string> {
  const tok = await sign(await conn(), "POST", `/requests/${requestId}/actions/${actionId}/embedtoken`, { query: { host } });
  return String(tok.sign_url ?? "");
}

/** Zoho Sign's status for a request: "completed", "inprogress", "declined", "expired", … */
export async function signStatus(requestId: string): Promise<string> {
  const r = await sign(await conn(), "GET", `/requests/${requestId}`);
  return String((r.requests as { request_status?: string } | undefined)?.request_status ?? "");
}

/** The signed PDF. */
export async function signedPdf(requestId: string): Promise<Uint8Array> {
  return (await sign(await conn(), "GET", `/requests/${requestId}/pdf`, { raw: true })).bytes!;
}
