import "server-only";
import { db } from "./db";

/*
 * Zoho Mail (India data centre): sends emails from a team mailbox — today hello@thinkhealth.in for the AedSmartx
 * onboarding emails; other mailboxes (e.g. Shreya's) connect the same way. Separate from the Zoho Books client: each
 * mailbox is connected once by Admin with a one-time code from the Zoho API console, signed in as that mailbox. Its
 * refresh token lives only in MongoDB kv `zoho_mail:<address>` and never reaches the browser.
 */

const ACCOUNTS = process.env.ZOHO_ACCOUNTS_URL ?? "https://accounts.zoho.in";
const MAIL_API = process.env.ZOHO_MAIL_API ?? "https://mail.zoho.in";
/** What the one-time code must be generated with (Zoho API console → Self Client → Generate Code). */
export const MAIL_SCOPES = "ZohoMail.messages.ALL,ZohoMail.accounts.READ";

type Mailbox = {
  _id: string;
  address: string;
  accountId: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  token?: { value: string; expiresAt: number };
  connectedAt: string;
  connectedBy: string;
};
export type MailboxInfo = { address: string; connectedAt: string; connectedBy: string };

const keyOf = (address: string) => `zoho_mail:${address.trim().toLowerCase()}`;
const kv = async () => (await db()).collection<Mailbox>("kv");

export async function mailboxInfo(address: string): Promise<MailboxInfo | null> {
  const m = await (await kv()).findOne({ _id: keyOf(address) });
  return m ? { address: m.address, connectedAt: m.connectedAt, connectedBy: m.connectedBy } : null;
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(`${ACCOUNTS}/oauth/v2/token`, { method: "POST", body: new URLSearchParams(params), cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) throw new Error(json.error === "invalid_code" ? "That code has expired or was already used — generate a new one" : `Zoho refused the code (${json.error ?? res.status})`);
  return json;
}

async function mailApi<T>(token: string, path: string, init?: RequestInit): Promise<{ status: number; json: T }> {
  const res = await fetch(`${MAIL_API}/api${path}`, {
    ...init,
    headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as T };
}

/**
 * Admin connects a mailbox: swaps the one-time code for a refresh token, finds the Zoho Mail account that can send as
 * `address`, and saves both. The code must come from a Zoho login that owns (or can send as) that address. Client ID and
 * secret are the API console app's; left blank, the Zoho Books app's are used (same Zoho login only).
 */
export async function connectMailbox(input: { address: string; code: string; clientId?: string; clientSecret?: string; by: string }): Promise<MailboxInfo> {
  const address = input.address.trim().toLowerCase();
  const clientId = input.clientId?.trim() || process.env.ZOHO_MAIL_CLIENT_ID || process.env.ZOHO_CLIENT_ID || "";
  const clientSecret = input.clientSecret?.trim() || process.env.ZOHO_MAIL_CLIENT_SECRET || process.env.ZOHO_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) throw new Error("Client ID and secret are needed");
  const t = await tokenRequest({ grant_type: "authorization_code", client_id: clientId, client_secret: clientSecret, code: input.code.trim() });
  if (!t.refresh_token) throw new Error("Zoho didn't return a refresh token — generate a new code and try again");
  type Account = { accountId: string; primaryEmailAddress?: string; mailboxAddress?: string; emailAddress?: { mailId: string }[]; sendMailDetails?: { fromAddress: string }[] };
  const { json } = await mailApi<{ data?: Account[]; status?: { description?: string } }>(t.access_token!, "/accounts");
  const accounts = json.data ?? [];
  const sends = (a: Account) => [a.primaryEmailAddress, a.mailboxAddress, ...(a.emailAddress ?? []).map((x) => x.mailId), ...(a.sendMailDetails ?? []).map((x) => x.fromAddress)]
    .filter(Boolean).map((x) => x!.toLowerCase());
  const account = accounts.find((a) => sends(a).includes(address));
  if (!account) {
    const can = [...new Set(accounts.flatMap(sends))];
    throw new Error(can.length ? `This Zoho login can't send as ${address} (it can send as ${can.join(", ")}) — sign in as ${address} and generate the code again` : `No Zoho Mail account found for this login (${json.status?.description ?? "check the scopes"})`);
  }
  const doc: Mailbox = {
    _id: keyOf(address), address, accountId: String(account.accountId), clientId, clientSecret, refreshToken: t.refresh_token,
    token: { value: t.access_token!, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 },
    connectedAt: new Date().toISOString(), connectedBy: input.by,
  };
  await (await kv()).replaceOne({ _id: doc._id }, doc, { upsert: true });
  return { address, connectedAt: doc.connectedAt, connectedBy: doc.connectedBy };
}

/** A valid access token for the mailbox: the saved one while fresh, else a refresh (saved for every server instance). */
async function accessFor(m: Mailbox, force = false): Promise<string> {
  if (!force && m.token && Date.now() < m.token.expiresAt - 5 * 60_000) return m.token.value;
  const t = await tokenRequest({ grant_type: "refresh_token", client_id: m.clientId, client_secret: m.clientSecret, refresh_token: m.refreshToken })
    .catch((e: Error) => { throw new Error(`Zoho Mail sign-in failed — Admin may need to connect ${m.address} again (${e.message})`); });
  m.token = { value: t.access_token!, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 };
  await (await kv()).updateOne({ _id: m._id }, { $set: { token: m.token } });
  return m.token.value;
}

/**
 * Sends an HTML email from the mailbox. With `replyTo` (Zoho Mail's id of an email sent before) it goes as a reply in
 * that thread; if Zoho can't reply to it, it goes as a new email with the same subject. Returns the new email's id.
 */
export async function sendMail(from: string, mail: { to: string; subject: string; html: string; replyTo?: string }): Promise<{ messageId?: string; threaded: boolean }> {
  const m = await (await kv()).findOne({ _id: keyOf(from) });
  if (!m) throw new Error(`Zoho Mail isn't connected for ${from} yet — Admin connects it once`);
  type Res = { status?: { code?: number; description?: string }; data?: { messageId?: string | number; moreInfo?: string } };
  const send = async (reply: boolean) => {
    const body = JSON.stringify({ fromAddress: m.address, toAddress: mail.to, subject: mail.subject, content: mail.html, mailFormat: "html", ...(reply ? { action: "reply" } : {}) });
    const path = `/accounts/${m.accountId}/messages${reply ? `/${mail.replyTo}` : ""}`;
    let r = await mailApi<Res>(await accessFor(m), path, { method: "POST", body });
    if (r.status === 401) r = await mailApi<Res>(await accessFor(m, true), path, { method: "POST", body }); // token revoked early
    return r;
  };
  if (mail.replyTo) {
    const r = await send(true);
    if (r.status < 300) return { messageId: r.json.data?.messageId != null ? String(r.json.data.messageId) : undefined, threaded: true };
    console.warn(`[zoho mail] reply failed (${r.status} ${r.json.status?.description ?? ""}) — sending as a new email`);
  }
  const r = await send(false);
  if (r.status >= 300) throw new Error(`Zoho Mail didn't send it: ${r.json.data?.moreInfo ?? r.json.status?.description ?? r.status}`);
  return { messageId: r.json.data?.messageId != null ? String(r.json.data.messageId) : undefined, threaded: false };
}
