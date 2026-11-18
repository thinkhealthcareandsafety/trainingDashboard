import "server-only";
import { db } from "./db";
import { clientsToTry, tokenRequest } from "./zohoOAuth";
import { booksClient } from "./quotations";
import { type SprintsBoard, type SprintView, boardColumns, decode, findProject, pickTeam, sprintsOf } from "./sprintsRules";

/*
 * Zoho Sprints on the dashboard (owner, 18 Nov): the board of project P5 in the "thinkhealth" workspace
 * (https://sprints.zoho.in/workspace/thinkhealth#P5/board), read from Zoho Sprints' REST API because Zoho Sprints can't
 * be framed. Admin (or Shikha) connects it once with a one-time code from the Zoho API console (the same Self Client
 * as Zoho Books, scope SPRINTS_SCOPES); the refresh token lives only in MongoDB kv `zoho_sprints`.
 *
 * Calls (Zoho Sprints API reference): GET /teams/ → the workspace id; GET /team/{t}/projects/ → project number 5;
 * GET …/itemstatus/ → the board's columns; GET …/sprints/?type=[2] → the active sprints; GET …/sprints/{id}/item/ →
 * their items. With no active sprint, the backlog's items are shown.
 */

const API = process.env.ZOHO_SPRINTS_API ?? "https://sprintsapi.zoho.in/zsapi";
export const SPRINTS_SCOPES = "ZohoSprints.teams.READ,ZohoSprints.projects.READ,ZohoSprints.sprints.READ,ZohoSprints.items.READ,ZohoSprints.items.UPDATE,ZohoSprints.projectusers.READ";
const PROJECT_NO = process.env.ZOHO_SPRINTS_PROJECT_NO ?? "5";
const BOARD_URL = process.env.ZOHO_SPRINTS_URL ?? "https://sprints.zoho.in/workspace/thinkhealth#P5/board";
const KEY = "zoho_sprints";
const CACHE_MS = 20_000; // the page asks every 30 s; one Zoho read serves everyone looking within 20 s

type Conn = { _id: string; clientId: string; clientSecret: string; refreshToken: string; teamId?: string; kanbanSprintId?: string; token?: { value: string; expiresAt: number }; connectedAt: string; connectedBy: string };
const kv = async () => (await db()).collection<Conn>("kv");

export async function sprintsInfo(): Promise<{ connectedAt: string; connectedBy: string } | null> {
  const c = await (await kv()).findOne({ _id: KEY });
  return c ? { connectedAt: c.connectedAt, connectedBy: c.connectedBy } : null;
}

async function access(c: Conn, force = false): Promise<string> {
  if (!force && c.token && Date.now() < c.token.expiresAt - 5 * 60_000) return c.token.value;
  const t = await tokenRequest({ grant_type: "refresh_token", client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken })
    .catch((e: Error) => { throw new Error(`Zoho Sprints sign-in failed — Admin may need to connect it again (${e.message})`); });
  c.token = { value: t.access_token!, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 };
  await (await kv()).updateOne({ _id: KEY }, { $set: { token: c.token } });
  return c.token.value;
}

/** One Zoho Sprints GET. Zoho Sprints says "status":"failed" (with a code and message) when it refuses. */
async function get(c: Conn, path: string, query: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${await access(c, attempt > 0)}` }, cache: "no-store" });
    if (res.status === 401 && attempt === 0) continue;
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { status?: string; code?: unknown; message?: string };
    if (!res.ok || json.status === "failed") {
      console.error(`[zoho sprints] GET ${path} → ${res.status} ${json.code ?? ""} ${json.message ?? ""}`);
      throw new Error(`Zoho Sprints: ${json.message ?? `error ${res.status}`}`);
    }
    return json;
  }
}

/** Admin: the one-time code (same Self Client as Zoho Books unless typed) → a refresh token, checked, saved with the workspace id. */
export async function connectSprints(input: { code: string; clientId?: string; clientSecret?: string }, by: string): Promise<{ connectedAt: string; connectedBy: string }> {
  const saved = (await (await kv()).findOne({ _id: KEY })) ?? (await booksClient());
  let t: Awaited<ReturnType<typeof tokenRequest>> | undefined;
  let refused: unknown;
  let clientId = "", clientSecret = "";
  for (const k of clientsToTry(input, saved)) {
    try {
      t = await tokenRequest({ grant_type: "authorization_code", code: input.code.trim(), client_id: k.clientId, client_secret: k.clientSecret });
      ({ clientId, clientSecret } = k);
      break;
    } catch (e) { refused = e; }
  }
  if (!t) throw refused;
  if (!t.refresh_token) throw new Error("Zoho gave no refresh token — generate a new code and try again");
  const c: Conn = { _id: KEY, clientId, clientSecret, refreshToken: t.refresh_token, token: { value: t.access_token!, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 }, connectedAt: new Date().toISOString(), connectedBy: by };
  const teams = await get(c, "/teams/").catch((e: Error) => {
    throw new Error(`Zoho took the code, but Zoho Sprints refused it (${e.message}). Generate a new code with the scope ${SPRINTS_SCOPES}, signed in as a Zoho user in the thinkhealth workspace.`);
  });
  const teamId = pickTeam(teams);
  if (!teamId) throw new Error("This Zoho user isn't in any Zoho Sprints workspace.");
  c.teamId = teamId;
  await (await kv()).replaceOne({ _id: KEY }, c, { upsert: true });
  (globalThis as { __thSprintsBoard?: unknown }).__thSprintsBoard = undefined;
  return { connectedAt: c.connectedAt, connectedBy: by };
}

/** Every page of a list (Zoho Sprints pages with index/range and says `next`). */
async function allPages(c: Conn, path: string, query: Record<string, string>): Promise<Record<string, unknown>[]> {
  const pages: Record<string, unknown>[] = [];
  for (let index = 1; pages.length < 20; index += 100) {
    const r = await get(c, path, { ...query, index: String(index), range: "100" });
    pages.push(r);
    if (r.next !== true) break;
  }
  return pages;
}

const G = globalThis as { __thSprintsBoard?: { at: number; data: SprintsBoard } };

const idsIn = (page: Record<string, unknown>) => (Array.isArray(page.itemIds) ? page.itemIds.length : 0);

/**
 * A Kanban board's items. Zoho Sprints' API has no Kanban call, but every item says which sprint holds it, so: the
 * board's sprint found before (kv, `kanbanSprintId`) is read like any sprint; the first time, items are looked up by
 * number ("Get multiple item details", GT-I1, GT-I2 … 50 a call, until two calls in a row find none), the sprint that
 * holds most of them (not the backlog) is remembered, and read. If that read finds nothing, the items found by number
 * are the board.
 */
async function kanbanItems(c: Conn, p: string, backlogId: string): Promise<{ pages: Record<string, unknown>[]; sprintId: string; how: string }> {
  const read = async (id: string) => allPages(c, `${p}/sprints/${id}/item/`, { action: "data" }).catch(() => [] as Record<string, unknown>[]);
  if (c.kanbanSprintId) {
    const pages = await read(c.kanbanSprintId);
    if (pages.some(idsIn)) return { pages, sprintId: c.kanbanSprintId, how: "board" };
  }
  const found: Record<string, unknown>[] = [];
  let refused = "";
  for (let from = 1, empty = 0; from <= 3000 && empty < 2; from += 50) {
    try {
      const r = await get(c, `${p}/item/`, { action: "multipledetails", itemnoarr: JSON.stringify(Array.from({ length: 50 }, (_, k) => from + k)) });
      if (idsIn(r)) { found.push(r); empty = 0; } else empty++;
    } catch (e) {
      refused = e instanceof Error ? e.message : String(e);
      break;
    }
  }
  if (refused && !found.length) return { pages: [], sprintId: "", how: `lookup refused (${refused})` };
  const tally = new Map<string, number>();
  for (const page of found) for (const it of decode(page.itemIds, page.itemJObj, page.item_prop)) {
    const s = String(it.sprintId ?? "");
    if (s && s !== "-1" && s !== backlogId) tally.set(s, (tally.get(s) ?? 0) + 1);
  }
  const sprintId = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  if (sprintId) {
    await (await kv()).updateOne({ _id: KEY }, { $set: { kanbanSprintId: sprintId } });
    const pages = await read(sprintId);
    if (pages.some(idsIn)) return { pages, sprintId, how: "found" };
  }
  return { pages: found, sprintId, how: `by number (${found.reduce((n, pg) => n + idsIn(pg), 0)} items)` };
}

/** Project P5's board: the active sprints (or the backlog when none is running), columns = item statuses. */
export async function sprintsBoard(): Promise<SprintsBoard> {
  if (G.__thSprintsBoard && Date.now() - G.__thSprintsBoard.at < CACHE_MS) return G.__thSprintsBoard.data;
  const c = await (await kv()).findOne({ _id: KEY });
  if (!c) throw new Error("Zoho Sprints isn't connected yet.");
  const team = c.teamId ?? pickTeam(await get(c, "/teams/"));
  if (!team) throw new Error("No Zoho Sprints workspace found for the connected user.");
  const base = `/team/${team}/projects`;
  const project = findProject(await get(c, `${base}/`, { action: "data", index: "1", range: "100" }), PROJECT_NO);
  if (!project) throw new Error(`Project P${PROJECT_NO} isn't visible to the connected Zoho user.`);
  const p = `${base}/${project.id}`;
  // The project's own record says SCRUM or KANBAN and holds its backlog (owner, 18 Nov: the first try found no
  // running sprint and no backlog items, so every place the items can be is read).
  const [statuses, details, active, upcoming] = await Promise.all([
    get(c, `${p}/itemstatus/`, { action: "data", index: "1", range: "100" }),
    get(c, `${p}/`, { action: "details" }).catch(() => ({} as Record<string, unknown>)),
    get(c, `${p}/sprints/`, { action: "data", index: "1", range: "100", type: "[2]" }),
    get(c, `${p}/sprints/`, { action: "data", index: "1", range: "100", type: "[1]" }),
  ]);
  const det = decode(details.projectIds, details.projectJObj, details.project_prop)[0];
  const kind = String(det?.projType_enum ?? det?.projType ?? "");
  let backlogId = project.backlogId || String(det?.backlogId ?? "");
  if (!backlogId || backlogId === "-1") backlogId = String((await get(c, `${p}/`, { action: "getbacklog" }).catch(() => ({} as Record<string, unknown>))).backlogId ?? "");
  const sprints: SprintView[] = [];
  const add = async (s: { id: string; name: string; no: string; start: string | null; end: string | null }, extra: Partial<SprintView> = {}) => {
    const items = await allPages(c, `${p}/sprints/${s.id}/item/`, { action: "data" });
    sprints.push({ ...s, ...extra, columns: boardColumns(statuses, items, project.prefix) });
  };
  // Running sprints first (Zoho's board), then the upcoming ones and the backlog as their own tabs.
  for (const s of sprintsOf(active)) await add(s);
  for (const s of sprintsOf(upcoming)) await add(s, { upcoming: true });
  if (backlogId && backlogId !== "-1") await add({ id: backlogId, name: "Backlog", no: "", start: null, end: null }, { backlog: true });
  const count = (v: SprintView) => v.columns.reduce((n, col) => n + col.cards.length, 0);
  // A Kanban project (owner, 18 Nov: P5 "General Team Tasks" is one) keeps its board outside the sprints and backlog.
  let kanban = "";
  if (/kanban/i.test(kind) || sprints.every((v) => count(v) === 0)) {
    const k = await kanbanItems(c, p, backlogId);
    kanban = ` · kanban ${k.how}`;
    if (k.pages.length) sprints.unshift({ id: k.sprintId || "kanban", name: "Kanban Board", no: "", start: null, end: null, kanban: true, columns: boardColumns(statuses, k.pages, project.prefix) });
  }
  const shown = sprints.filter((v, k) => v.kanban || count(v) > 0 || (k === 0 && !v.backlog && !v.upcoming));
  const backlog = sprints.find((v) => v.backlog);
  const statusCount = decode(statuses.statusIds, statuses.statusJObj, statuses.status_prop).length;
  const diag = `project type ${kind || "?"} · ${sprintsOf(active).length} running, ${sprintsOf(upcoming).length} upcoming sprints · backlog ${backlog ? `${count(backlog)} items` : "not found"} · ${statusCount} statuses${kanban}`;
  const data: SprintsBoard = { project: { id: project.id, name: project.name, prefix: project.prefix, no: project.no }, sprints: shown, fetchedAt: new Date().toISOString(), boardUrl: BOARD_URL, diag };
  G.__thSprintsBoard = { at: Date.now(), data };
  return data;
}
