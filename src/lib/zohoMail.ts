import "server-only";
import { db } from "./db";
import { clientOf, tokenRequest } from "./zohoOAuth";

/*
 * Zoho Mail (India data centre): sends emails from a team address — hello@thinkhealth.in for the AedSmartx onboarding
 * emails, learn@thinkhealth.in (an alias on Shikha's mailbox) for the Fulfillment gratitude emails. Separate from the
 * Zoho Books client: each address is connected once by Admin with a one-time code from the Zoho API console, signed in
 * as the mailbox that owns it. Its refresh token lives only in MongoDB kv `zoho_mail:<address>` and never reaches the
 * browser. For learn@ the dashboard also reads the replies to the threads it started (nothing else in that mailbox).
 */

const MAIL_API = process.env.ZOHO_MAIL_API ?? "https://mail.zoho.in";
/** What the one-time code must be generated with (Zoho API console → Self Client → Generate Code). */
export const MAIL_SCOPES = "ZohoMail.messages.ALL,ZohoMail.accounts.READ,ZohoMail.folders.ALL";

type Mailbox = {
  _id: string;
  address: string;
  accountId: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  token?: { value: string; expiresAt: number };
  folders?: { inbox: string; sent: string; named?: Record<string, string> }; // read once, for checking replies and filing sent emails
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
  const { clientId, clientSecret } = clientOf(input);
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

/* ---------------- Reading replies and filing sent emails (learn@ — the gratitude emails) ---------------- */

export type MailItem = { messageId: string; threadId?: string; folderId: string; fromAddress: string; subject: string; receivedTime: number; summary?: string };
type RawItem = { messageId?: string | number; threadId?: string | number; folderId?: string | number; fromAddress?: string; sender?: string; subject?: string; receivedTime?: string | number; summary?: string };

/** A call on the mailbox's account, refreshing the token once if Zoho says it's no longer valid. */
async function mailboxCall<T>(m: Mailbox, path: string, init?: RequestInit): Promise<T> {
  let r = await mailApi<{ data?: T; status?: { description?: string } }>(await accessFor(m), `/accounts/${m.accountId}${path}`, init);
  if (r.status === 401) r = await mailApi(await accessFor(m, true), `/accounts/${m.accountId}${path}`, init);
  if (r.status >= 300) throw new Error(`Zoho Mail: ${r.json.status?.description ?? r.status}${r.status === 403 || r.status === 401 ? " — Admin may need to connect it again with the scopes shown in the Connect popup" : ""}`);
  return r.json.data as T;
}
const mailboxGet = <T>(m: Mailbox, path: string) => mailboxCall<T>(m, path);

async function mailbox(address: string): Promise<Mailbox> {
  const m = await (await kv()).findOne({ _id: keyOf(address) });
  if (!m) throw new Error(`Zoho Mail isn't connected for ${address} yet — Admin connects it once`);
  return m;
}

/** The mailbox's Inbox and Sent folder ids (read once, then kept with the connection). */
async function folderIds(m: Mailbox): Promise<{ inbox: string; sent: string }> {
  if (m.folders?.inbox && m.folders.sent) return m.folders;
  const list = await mailboxGet<{ folderId: string | number; folderType?: string; folderName?: string }[]>(m, "/folders");
  const find = (type: string) => list.find((f) => (f.folderType ?? f.folderName ?? "").toLowerCase() === type);
  const inbox = find("inbox");
  const sent = find("sent");
  if (!inbox || !sent) throw new Error("Zoho Mail: couldn't find the Inbox and Sent folders");
  const folders = { inbox: String(inbox.folderId), sent: String(sent.folderId) };
  await (await kv()).updateOne({ _id: m._id }, { $set: { "folders.inbox": folders.inbox, "folders.sent": folders.sent } });
  return folders;
}

type Folder = { folderId: string | number; folderName?: string; folderType?: string };

/** A folder's id by its name (top level) — created when it isn't there yet. Kept with the connection. */
async function folderNamed(m: Mailbox, name: string): Promise<string> {
  const known = m.folders?.named?.[name];
  if (known) return known;
  const list = await mailboxGet<Folder[]>(m, "/folders");
  const found = list.find((f) => (f.folderName ?? "").trim().toLowerCase() === name.toLowerCase());
  const id = String(found?.folderId ?? (await mailboxCall<Folder>(m, "/folders", { method: "POST", body: JSON.stringify({ folderName: name }) })).folderId);
  await (await kv()).updateOne({ _id: m._id }, { $set: { [`folders.named.${name}`]: id } });
  return id;
}

/** Moves emails this mailbox sent into the named folder (e.g. the gratitude emails → "Gratitude Emails Sent"). */
export async function fileSentMail(address: string, messageIds: string[], folderName: string): Promise<void> {
  if (!messageIds.length) return;
  const m = await mailbox(address);
  const destfolderId = await folderNamed(m, folderName);
  await mailboxCall(m, "/updatemessage", { method: "PUT", body: JSON.stringify({ mode: "moveMessage", messageId: messageIds, destfolderId }) });
}

/** The newest emails in the mailbox's Inbox, Sent, or a named folder (one call, up to 200). */
export async function latestMail(address: string, folder: "inbox" | "sent" | { name: string }, limit = 200): Promise<MailItem[]> {
  const m = await mailbox(address);
  const folderId = typeof folder === "string" ? (await folderIds(m))[folder] : await folderNamed(m, folder.name);
  const rows = (await mailboxGet<RawItem[]>(m, `/messages/view?folderId=${folderId}&limit=${limit}&sortorder=false`)) ?? [];
  return rows.filter((r) => r.messageId != null).map((r) => ({
    messageId: String(r.messageId), threadId: r.threadId != null ? String(r.threadId) : undefined, folderId: String(r.folderId ?? folderId),
    fromAddress: (r.fromAddress ?? r.sender ?? "").toLowerCase(), subject: r.subject ?? "", receivedTime: Number(r.receivedTime ?? 0), summary: r.summary,
  }));
}

/** One email's body (HTML), to show a reply on the card. */
export async function mailContent(address: string, folderId: string, messageId: string): Promise<string> {
  const m = await mailbox(address);
  const data = await mailboxGet<{ content?: string }>(m, `/folders/${folderId}/messages/${messageId}/content`);
  return data?.content ?? "";
}
