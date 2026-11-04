import "server-only";

/*
 * Zoho sign-in for the connections Admin makes with a one-time code from the Zoho API console (Self Client): Zoho Mail
 * mailboxes and the master certificate sheet. Each keeps its own refresh token in MongoDB kv; nothing reaches the browser.
 */

export const ACCOUNTS = process.env.ZOHO_ACCOUNTS_URL ?? "https://accounts.zoho.in";

export async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(`${ACCOUNTS}/oauth/v2/token`, { method: "POST", body: new URLSearchParams(params), cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) throw new Error(json.error === "invalid_code" ? "That code has expired or was already used — generate a new one" : `Zoho refused the code (${json.error ?? res.status})`);
  return json;
}

/** The Self Client's ID and secret: typed in the Connect popup, else the Zoho Books app's (same Zoho login only). */
type Client = { clientId: string; clientSecret: string };
/**
 * Which Self Clients a reconnect tries (owner, 4 Nov: "That code has expired or was already used", for a fine code). A code only
 * works with the Self Client that made it. Both boxes typed: those. Otherwise the connection's own, then the app's. One box alone
 * is ignored: browsers auto-fill the secret box.
 */
export function clientsToTry(typed: { clientId?: string; clientSecret?: string }, saved?: Partial<Client> | null): Client[] {
  const id = typed.clientId?.trim(), secret = typed.clientSecret?.trim();
  if (id && secret) return [{ clientId: id, clientSecret: secret }];
  const list: Client[] = [];
  if (saved?.clientId && saved.clientSecret) list.push({ clientId: saved.clientId, clientSecret: saved.clientSecret });
  const appId = process.env.ZOHO_MAIL_CLIENT_ID || process.env.ZOHO_CLIENT_ID, appSecret = process.env.ZOHO_MAIL_CLIENT_SECRET || process.env.ZOHO_CLIENT_SECRET;
  if (appId && appSecret && appId !== saved?.clientId) list.push({ clientId: appId, clientSecret: appSecret });
  if (!list.length) throw new Error("Client ID and secret are needed");
  return list;
}

export function clientOf(input: { clientId?: string; clientSecret?: string }) {
  const clientId = input.clientId?.trim() || process.env.ZOHO_MAIL_CLIENT_ID || process.env.ZOHO_CLIENT_ID || "";
  const clientSecret = input.clientSecret?.trim() || process.env.ZOHO_MAIL_CLIENT_SECRET || process.env.ZOHO_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) throw new Error("Client ID and secret are needed");
  return { clientId, clientSecret };
}
