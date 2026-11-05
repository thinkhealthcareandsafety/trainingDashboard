import { db } from "./db";
import { clientsToTry, tokenRequest } from "./zohoOAuth";

/*
 * Add PDF from Zoho WorkDrive (owner, 5 Nov): "select the pdf directly without having to download". A new tab can't hand a file back,
 * so the dashboard lists the team's shared folder itself and copies the picked PDF onto the item. Its own read-only connection: kv
 * `zoho_workdrive`, separate from Books'. Docs: list-files-folders-inside-a-folder, download-file. The docs print only the .com
 * address; zohoapis.in worked for listing and downloading on 5 Nov. Connect lists the folder before saving.
 */

export const WORKDRIVE_SCOPES = "WorkDrive.files.READ";
export const WORKDRIVE_ROOT = "znge79c8e870f2b9f477e9501433581458b2a";
export const WORKDRIVE_LINK = "https://workdrive.zoho.in/53ff4315ed8ce16a945a0a0dc401e6a12c2c3/teams/53ff4315ed8ce16a945a0a0dc401e6a12c2c3/ws/znge7acf2ee5bec304274b0cecca367bed7e6/folders/znge79c8e870f2b9f477e9501433581458b2a";
const API = "https://www.zohoapis.in/workdrive/api/v1";
// Not the docs' download.zoho.in: that answered INVALID_OAUTHSCOPE to WorkDrive.files.READ on 5 Nov, while this one gave the file.
const DOWNLOAD = `${API}/download`;
const KEY = "zoho_workdrive";
const PAGE = 50; // WorkDrive's most per request
const MAX_PAGES = 10;
const MAX_DEPTH = 12;
const FRESH_MS = 60_000;
const MAX_BYTES = 50 * 1024 * 1024; // no rule of ours (owner, 5 Nov), just what one server call can carry; Zoho Books may refuse less, and says so

export type WdEntry = { id: string; name: string; folder: boolean; pdf: boolean; size: number | null };
type Conn = { _id: string; clientId: string; clientSecret: string; refreshToken: string; token?: { value: string; expiresAt: number }; connectedAt: string; connectedBy: string };
type Listing = { data?: { id?: unknown; attributes?: { name?: unknown; is_folder?: unknown; type?: unknown; extn?: unknown; storage_info?: { size_in_bytes?: unknown } } }[]; links?: { cursor?: { has_next?: unknown } } };
const kv = async () => (await db()).collection<Conn>("kv");

export const goodWdId = (id: unknown): id is string => typeof id === "string" && /^[a-z0-9]{10,80}$/i.test(id);
/** Folder ids from the shared folder down, as the browser sends them. Null when they aren't ids or go too deep. */
export function parseWdPath(raw: string | null | undefined): string[] | null {
  const path = String(raw ?? "").split(",").filter(Boolean);
  return path.length <= MAX_DEPTH && path.every(goodWdId) ? path : null;
}

/** One page of WorkDrive's answer → what the picker needs. Only `attributes` from the documented sample are read. */
export function parseListing(j: Listing): WdEntry[] {
  return (j.data ?? []).flatMap((d) => {
    const a = d.attributes ?? {}, name = String(a.name ?? "").trim(), id = String(d.id ?? "");
    if (!id || !name) return [];
    const folder = a.is_folder === true || a.type === "folder";
    const bytes = Number(a.storage_info?.size_in_bytes);
    return [{ id, name, folder, pdf: !folder && (String(a.extn ?? "").toLowerCase() === "pdf" || /\.pdf$/i.test(name)), size: folder || !Number.isFinite(bytes) ? null : bytes }];
  });
}
/** Folders first, then PDFs, A to Z. Other kinds of file aren't shown: they can't go on an item. */
export const pickerEntries = (all: WdEntry[]) => all.filter((e) => e.folder || e.pdf).sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" }));
/** Why this file can't be used; "" when it can. */
export const wdFileProblem = (e: WdEntry | undefined) => (!e || e.folder ? "That file isn't in the shared folder any more" : !e.pdf ? "That file isn't a PDF" : e.size != null && e.size >= MAX_BYTES ? "That PDF is over 50 MB, too big to copy" : "");

async function accessFor(c: Conn, force = false): Promise<string> {
  if (!force && c.token && Date.now() < c.token.expiresAt - 5 * 60_000) return c.token.value;
  const t = await tokenRequest({ grant_type: "refresh_token", client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken })
    .catch((e: Error) => { throw new Error(`Zoho WorkDrive sign-in failed: Admin may need to connect it again (${e.message})`); });
  c.token = { value: t.access_token!, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 };
  await (await kv()).updateOne({ _id: c._id }, { $set: { token: c.token } });
  return c.token.value;
}

const cache = new Map<string, { at: number; entries: WdEntry[] }>();

/** Everything in one folder (a page at a time, as WorkDrive allows). One retry after a 401. */
async function listFolder(c: Conn, id: string, fresh = false): Promise<WdEntry[]> {
  const kept = cache.get(id);
  if (!fresh && kept && Date.now() - kept.at < FRESH_MS) return kept.entries;
  const entries: WdEntry[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${API}/files/${id}/files`);
    url.searchParams.set("page[limit]", String(PAGE));
    url.searchParams.set("page[offset]", String(page * PAGE));
    let j: Listing & { errors?: { id?: string; title?: string }[] } = {};
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${await accessFor(c, attempt > 0)}`, Accept: "application/vnd.api+json" }, cache: "no-store" });
      if (res.status === 401 && attempt === 0) continue;
      if (res.status === 204) break; // no content: an empty folder, or past the end
      j = (await res.json().catch(() => ({}))) as typeof j;
      if (!res.ok || j.errors?.length) {
        const why = j.errors?.[0]?.title ?? `error ${res.status}`;
        console.error(`[workdrive] list → ${res.status} ${j.errors?.[0]?.id ?? ""} ${why}`);
        throw new Error(/scope/i.test(why) ? "Zoho WorkDrive needs a new code: Admin connects it again with the scope shown" : `Zoho WorkDrive: ${why}`);
      }
      break;
    }
    const got = parseListing(j);
    entries.push(...got);
    if (got.length < PAGE && !j.links?.cursor?.has_next) break;
    if (!got.length) break;
  }
  if (cache.size > 200) cache.clear();
  cache.set(id, { at: Date.now(), entries });
  return entries;
}

export async function workdriveInfo(): Promise<{ connectedAt: string; connectedBy: string } | null> {
  const c = await (await kv()).findOne({ _id: KEY });
  return c ? { connectedAt: c.connectedAt, connectedBy: c.connectedBy } : null;
}

const connection = async (): Promise<Conn> => {
  const c = await (await kv()).findOne({ _id: KEY });
  if (!c) throw new Error("Zoho WorkDrive isn't connected yet: Admin connects it once");
  return c;
};

/** The folder at the end of `path`: every step must be a folder inside the one before, so nothing outside the shared folder can be reached. */
async function walk(c: Conn, path: string[]): Promise<WdEntry[]> {
  let entries = await listFolder(c, WORKDRIVE_ROOT);
  for (const id of path) {
    if (!entries.some((e) => e.id === id && e.folder)) throw new Error("That folder isn't in the shared folder any more");
    entries = await listFolder(c, id);
  }
  return entries;
}

export const workdriveFolder = async (path: string[]) => pickerEntries(await walk(await connection(), path));

/** The picked PDF, read from WorkDrive straight onto the server, checked again here (size and kind come from WorkDrive, not the browser). */
export async function workdrivePdf(path: string[], fileId: string): Promise<File> {
  const c = await connection();
  const e = (await walk(c, path)).find((x) => x.id === fileId);
  const problem = wdFileProblem(e);
  if (problem) throw new Error(problem);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${DOWNLOAD}/${fileId}`, { headers: { Authorization: `Zoho-oauthtoken ${await accessFor(c, attempt > 0)}` }, cache: "no-store" });
    if (res.status === 401 && attempt === 0) continue;
    if (!res.ok) { console.error(`[workdrive] download → ${res.status}`); throw new Error(`Zoho WorkDrive didn't give the file (${res.status})`); }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length >= MAX_BYTES) throw new Error("That PDF is over 50 MB, too big to copy");
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("That file isn't a PDF");
    return new File([bytes], e!.name, { type: "application/pdf" });
  }
}

/** Admin: swap the one-time code, list the shared folder to prove it all works, and only then save. A failure leaves any working connection as it was. */
export async function connectWorkdrive(input: { code: string; clientId?: string; clientSecret?: string }, by: string): Promise<{ connectedAt: string; connectedBy: string }> {
  const col = await kv();
  // A code only works with the Self Client that made it: this connection's, then the quotations connection's, then the app's.
  const saved = (await col.findOne({ _id: KEY })) ?? (await col.findOne({ _id: "zoho_books:quotes" }));
  let t: Awaited<ReturnType<typeof tokenRequest>> | undefined, refused: unknown, clientId = "", clientSecret = "";
  for (const k of clientsToTry(input, saved)) {
    try {
      t = await tokenRequest({ grant_type: "authorization_code", code: input.code.trim(), client_id: k.clientId, client_secret: k.clientSecret });
      ({ clientId, clientSecret } = k);
      break;
    } catch (e) { refused = e; }
  }
  if (!t) throw refused;
  if (!t.refresh_token) throw new Error("Zoho gave no refresh token: generate a new code and try again");
  const c: Conn = { _id: KEY, clientId, clientSecret, refreshToken: t.refresh_token, token: { value: t.access_token!, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 }, connectedAt: new Date().toISOString(), connectedBy: by };
  await listFolder(c, WORKDRIVE_ROOT, true).catch((e: Error) => {
    throw new Error(`Zoho took the code, but the shared folder can't be read, so nothing changed. Generate the code signed in as someone who can open that folder. (${e.message})`);
  });
  await col.replaceOne({ _id: KEY }, c, { upsert: true });
  return { connectedAt: c.connectedAt, connectedBy: by };
}
