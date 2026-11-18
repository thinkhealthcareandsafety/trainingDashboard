import "server-only";
import { db } from "./db";
import { clientsToTry, tokenRequest } from "./zohoOAuth";
import { booksClient } from "./quotations";
import {
  type SprintsBoard, type SprintsMeta, type SprintView, boardColumns, customFieldsOf, decode, findProject, itemDetailOf, itemModuleOf,
  pickTeam, prioritiesOf, sprintsOf, tagsOf, typesOf, usersOf, zohoDate, peopleOf, type SprintPerson,
} from "./sprintsRules";
import { isAdmin } from "./roles";

/*
 * Sprints (owner, 18 Nov): project P5 "GT - General Team Tasks" in the "thinkhealth" Zoho Sprints workspace, a Kanban
 * board, drawn on the dashboard from Zoho Sprints' REST API (Zoho Sprints can't be framed) and written back to it:
 * "whatever we change here changes in Zoho Sprints" — moving a card, creating, editing, assigning and deleting tasks.
 * Admin (or Shikha) connects it once with a one-time code from the Zoho API console (the same Self Client as Zoho Books,
 * scope SPRINTS_SCOPES); the refresh token lives only in MongoDB kv `zoho_sprints`.
 *
 * Calls (Zoho Sprints API reference): GET /teams/ → the workspace; GET /team/{t}/projects/ → project number 5;
 * GET …/itemstatus/ → the columns; a Kanban board's items via the sprint that holds them (found once by item number,
 * kanbanItems); a Scrum project's running sprints. Writes: POST …/sprints/{s}/item/ (create), POST …/item/{i}/
 * (update: statusid moves a card, newusers/delusers assign), DELETE …/item/{i}/, POST …/item/{i}/tags/.
 */

const API = process.env.ZOHO_SPRINTS_API ?? "https://sprintsapi.zoho.in/zsapi";
// Reading the board, plus creating / editing / deleting tasks and the custom fields' names (owner, 18 Nov).
export const SPRINTS_SCOPES = "ZohoSprints.teams.READ,ZohoSprints.projects.READ,ZohoSprints.sprints.READ,ZohoSprints.items.READ,ZohoSprints.items.CREATE,ZohoSprints.items.UPDATE,ZohoSprints.items.DELETE,ZohoSprints.projectusers.READ,ZohoSprints.settings.READ";
const PROJECT_NO = process.env.ZOHO_SPRINTS_PROJECT_NO ?? "5";
const BOARD_URL = process.env.ZOHO_SPRINTS_URL ?? "https://sprints.zoho.in/workspace/thinkhealth#P5/board";
const KEY = "zoho_sprints";
const CACHE_MS = 20_000; // the page asks every 30 s; one Zoho read serves everyone looking within 20 s
const META_MS = 10 * 60_000; // types, priorities, users, tags and fields change rarely

type Conn = {
  _id: string; clientId: string; clientSecret: string; refreshToken: string; teamId?: string; kanbanSprintId?: string; scopes?: string;
  token?: { value: string; expiresAt: number }; connectedAt: string; connectedBy: string;
};
const kv = async () => (await db()).collection<Conn>("kv");

/** Connected, by whom, and whether the connection lacks the scopes added since (then Admin connects again). */
export async function sprintsInfo(): Promise<{ connectedAt: string; connectedBy: string; needsReconnect: boolean } | null> {
  const c = await (await kv()).findOne({ _id: KEY });
  return c ? { connectedAt: c.connectedAt, connectedBy: c.connectedBy, needsReconnect: c.scopes !== SPRINTS_SCOPES } : null;
}

async function access(c: Conn, force = false): Promise<string> {
  if (!force && c.token && Date.now() < c.token.expiresAt - 5 * 60_000) return c.token.value;
  const t = await tokenRequest({ grant_type: "refresh_token", client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken })
    .catch((e: Error) => { throw new Error(`Zoho Sprints sign-in failed — Admin may need to connect it again (${e.message})`); });
  c.token = { value: t.access_token!, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 };
  await (await kv()).updateOne({ _id: KEY }, { $set: { token: c.token } });
  return c.token.value;
}

/** One Zoho Sprints call. Writes go as form fields (Zoho Sprints' params). It says "status":"failed" when it refuses. */
async function call(c: Conn, method: "GET" | "POST" | "DELETE", path: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const url = new URL(`${API}${path}`);
  if (method === "GET") for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method, headers: { Authorization: `Zoho-oauthtoken ${await access(c, attempt > 0)}` },
      body: method === "POST" ? new URLSearchParams(params) : undefined, cache: "no-store",
    });
    if (res.status === 401 && attempt === 0) continue;
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { status?: string; code?: unknown; message?: string };
    if (!res.ok || json.status === "failed") {
      console.error(`[zoho sprints] ${method} ${path} → ${res.status} ${json.code ?? ""} ${json.message ?? ""}`);
      throw new Error(`Zoho Sprints: ${json.message ?? `error ${res.status}`}`);
    }
    return json;
  }
}
const get = (c: Conn, path: string, query: Record<string, string> = {}) => call(c, "GET", path, query);

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
  const had = await (await kv()).findOne({ _id: KEY });
  const c: Conn = { _id: KEY, clientId, clientSecret, refreshToken: t.refresh_token, token: { value: t.access_token!, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 }, connectedAt: new Date().toISOString(), connectedBy: by, scopes: SPRINTS_SCOPES, ...(had?.kanbanSprintId ? { kanbanSprintId: had.kanbanSprintId } : {}) };
  const teams = await get(c, "/teams/").catch((e: Error) => {
    throw new Error(`Zoho took the code, but Zoho Sprints refused it (${e.message}). Generate a new code with the scope ${SPRINTS_SCOPES}, signed in as a Zoho user in the thinkhealth workspace.`);
  });
  const teamId = pickTeam(teams);
  if (!teamId) throw new Error("This Zoho user isn't in any Zoho Sprints workspace.");
  c.teamId = teamId;
  await (await kv()).replaceOne({ _id: KEY }, c, { upsert: true });
  G.__thSprintsBoard = undefined;
  G.__thSprintsMeta = undefined;
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

const G = globalThis as { __thSprintsBoard?: { at: number; data: SprintsBoard }; __thSprintsMeta?: { at: number; data: SprintsMeta } };
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

type Ctx = { c: Conn; team: string; p: string; project: NonNullable<ReturnType<typeof findProject>> };
/** The connection, workspace and project P5 ("/team/{t}/projects/{p}"). */
async function ctx(): Promise<Ctx> {
  const c = await (await kv()).findOne({ _id: KEY });
  if (!c) throw new Error("Zoho Sprints isn't connected yet.");
  const team = c.teamId ?? pickTeam(await get(c, "/teams/"));
  if (!team) throw new Error("No Zoho Sprints workspace found for the connected user.");
  const project = findProject(await get(c, `/team/${team}/projects/`, { action: "data", index: "1", range: "100" }), PROJECT_NO);
  if (!project) throw new Error(`Project P${PROJECT_NO} isn't visible to the connected Zoho user.`);
  return { c, team, p: `/team/${team}/projects/${project.id}`, project };
}

/** Item types, priorities, project users, tags and custom fields (10 minutes). A part Zoho refuses is left empty. */
async function sprintsMeta({ c, team, p }: Ctx): Promise<SprintsMeta> {
  if (G.__thSprintsMeta && Date.now() - G.__thSprintsMeta.at < META_MS) return G.__thSprintsMeta.data;
  const none = {} as Record<string, unknown>;
  const [types, priorities, users, tags, modules] = await Promise.all([
    get(c, `${p}/itemtype/`, { action: "data", index: "1", range: "50" }).catch(() => none),
    get(c, `${p}/priority/`, { action: "data", index: "1", range: "50" }).catch(() => none),
    get(c, `${p}/users/`, { action: "data", index: "1", range: "200", type: "1" }).catch(() => none),
    get(c, `/team/${team}/tags/`, { action: "data", index: "1", range: "1000" }).catch(() => none),
    get(c, `/team/${team}/settings/customization/modules/`, { action: "data", index: "1", range: "50" }).catch(() => none),
  ]);
  const itemModule = itemModuleOf(modules);
  const fields = itemModule ? customFieldsOf(await get(c, `/team/${team}/settings/customization/modules/${itemModule}/fields/`, { action: "data" }).catch(() => none)) : [];
  const members = (await (await db()).collection<{ _id: string; name?: string }>("members").find({}).toArray()).map((m) => ({ id: String(m._id), name: String(m.name ?? "") }));
  const zohoUsers = usersOf(users);
  const data: SprintsMeta = { types: typesOf(types), priorities: prioritiesOf(priorities), users: zohoUsers, tags: tagsOf(tags), fields, people: peopleOf(zohoUsers, members) };
  G.__thSprintsMeta = { at: Date.now(), data };
  return data;
}

/** Project P5's board: a Kanban project's board, or a Scrum project's running sprints; columns = item statuses. */
export async function sprintsBoard(): Promise<SprintsBoard> {
  if (G.__thSprintsBoard && Date.now() - G.__thSprintsBoard.at < CACHE_MS) return G.__thSprintsBoard.data;
  const x = await ctx();
  const { c, p, project } = x;
  const [statuses, details, active, meta] = await Promise.all([
    get(c, `${p}/itemstatus/`, { action: "data", index: "1", range: "100" }),
    get(c, `${p}/`, { action: "details" }).catch(() => ({} as Record<string, unknown>)),
    get(c, `${p}/sprints/`, { action: "data", index: "1", range: "100", type: "[2]" }),
    sprintsMeta(x),
  ]);
  const det = decode(details.projectIds, details.projectJObj, details.project_prop)[0];
  const kind = String(det?.projType_enum ?? det?.projType ?? "");
  let backlogId = project.backlogId || String(det?.backlogId ?? "");
  if (!backlogId || backlogId === "-1") backlogId = String((await get(c, `${p}/`, { action: "getbacklog" }).catch(() => ({} as Record<string, unknown>))).backlogId ?? "");
  const sprints: SprintView[] = [];
  const count = (v: SprintView) => v.columns.reduce((n, col) => n + col.cards.length, 0);
  // Running sprints (a Scrum project's board). No Backlog tab (owner, 18 Nov).
  for (const s of sprintsOf(active)) {
    const items = await allPages(c, `${p}/sprints/${s.id}/item/`, { action: "data" });
    sprints.push({ ...s, columns: boardColumns(statuses, items, project.prefix) });
  }
  // A Kanban project (P5 "General Team Tasks" is one) keeps its board outside the sprints and the backlog.
  let kanban = "";
  if (/kanban/i.test(kind) || sprints.every((v) => count(v) === 0)) {
    const k = await kanbanItems(c, p, backlogId);
    kanban = ` · kanban ${k.how}`;
    if (k.pages.length) sprints.unshift({ id: k.sprintId || "kanban", name: "Kanban Board", no: "", start: null, end: null, kanban: true, columns: boardColumns(statuses, k.pages, project.prefix) });
  }
  const shown = sprints.filter((v, i) => v.kanban || count(v) > 0 || i === 0);
  await withPeople(shown, meta);
  const statusCount = decode(statuses.statusIds, statuses.statusJObj, statuses.status_prop).length;
  const diag = `project type ${kind || "?"} · ${sprintsOf(active).length} running sprints · ${statusCount} statuses${kanban}`;
  const data: SprintsBoard = { project: { id: project.id, name: project.name, prefix: project.prefix, no: project.no }, sprints: shown, fetchedAt: new Date().toISOString(), boardUrl: BOARD_URL, diag, meta };
  G.__thSprintsBoard = { at: Date.now(), data };
  return data;
}

/*
 * People on a task (owner, 18 Nov: "include all the users here too … let it not exist in Zoho Sprints, doesn't matter,
 * at least I will have visibility whose task it is"): Zoho Sprints' owners ("z:<id>") plus dashboard members who aren't
 * in Zoho Sprints ("m:<member id>"), kept in `sprintAssign` (_id = item id). Names are the clean ones from peopleOf.
 */
type Assign = { _id: string; members: string[] };
const assignCol = async () => (await db()).collection<Assign>("sprintAssign");

async function withPeople(views: SprintView[], meta: SprintsMeta) {
  const local = new Map((await (await assignCol()).find({}).toArray()).map((a) => [a._id, a.members ?? []]));
  const name = new Map((meta.people ?? []).map((p) => [p.key, p.name]));
  for (const v of views) for (const col of v.columns) for (const card of col.cards) {
    card.people = [...card.ownerIds.map((z) => `z:${z}`), ...(local.get(card.id) ?? []).map((m) => `m:${m}`)];
    card.owners = card.people.map((k) => name.get(k) ?? "").filter(Boolean);
  }
}

/** Sumit, Admin, Shikha and Nikita see every task; everyone else only theirs (owner, 18 Nov). */
export const seesAll = (me: { id: string; name: string }) => isAdmin(me) || /^(sumit|nikita)\b/i.test(me.name.trim());
/** The viewer as a person on the board: their Zoho user when matched, else "m:<member id>". */
export const personOf = (me: { id: string }, people: SprintPerson[] | undefined) => people?.find((p) => p.memberId === me.id)?.key ?? `m:${me.id}`;

/** The board as this viewer may see it, and who they are on it. */
export async function boardFor(me: { id: string; name: string }): Promise<SprintsBoard & { me: string; seesAll: boolean }> {
  const b = await sprintsBoard();
  const key = personOf(me, b.meta?.people);
  if (seesAll(me)) return { ...b, me: key, seesAll: true };
  return { ...b, me: key, seesAll: false, sprints: b.sprints.map((v) => ({ ...v, columns: v.columns.map((c) => ({ ...c, cards: c.cards.filter((x) => x.people?.includes(key)) })) })) };
}
/** May this viewer change that task? Everyone who sees all; others only tasks they are on. */
export async function mayTouch(me: { id: string; name: string }, itemId: unknown): Promise<boolean> {
  if (seesAll(me)) return true;
  const b = await sprintsBoard();
  const key = personOf(me, b.meta?.people);
  return b.sprints.some((v) => v.columns.some((c) => c.cards.some((x) => x.id === itemId && x.people?.includes(key))));
}

/** People keys split: Zoho users (written to Zoho Sprints) and dashboard members (kept here). */
const splitPeople = (keys: unknown) => {
  const list = Array.isArray(keys) ? keys.map(String) : [];
  return { zoho: list.filter((k) => /^z:\d{6,25}$/.test(k)).map((k) => k.slice(2)), members: list.filter((k) => /^m:[\w-]{1,80}$/.test(k)).map((k) => k.slice(2)) };
};
async function saveLocal(itemId: string, members: string[]) {
  const col = await assignCol();
  if (members.length) await col.replaceOne({ _id: itemId }, { members }, { upsert: true });
  else await col.deleteOne({ _id: itemId });
}

/* ---------------- Writes (owner, 18 Nov: "anything here goes there") ---------------- */

export type TaskInput = {
  name?: string; description?: string; statusId?: string; typeId?: string; priorityId?: string;
  /** People keys ("z:<Zoho user>", "m:<member>"); with `was` (the keys before) on an edit. */
  start?: string; end?: string; users?: string[]; tags?: string[]; udf?: Record<string, string>;
};
const ID = /^\d{6,25}$/;
const okId = (v: unknown) => (typeof v === "string" && ID.test(v) ? v : "");
const ids = (v: unknown) => (Array.isArray(v) ? v.map(String).filter((s) => ID.test(s)) : []);
const udfParams = (udf: Record<string, string> | undefined, allowed: Set<string>) =>
  Object.fromEntries(Object.entries(udf ?? {}).filter(([k]) => allowed.has(k)).map(([k, v]) => [k, String(v ?? "").slice(0, 250)]));

/** The fields a task carries, as Zoho Sprints' params (only those given). */
function taskParams(t: TaskInput, allowedUdf: Set<string>): Record<string, string> {
  const out: Record<string, string> = {};
  if (t.name !== undefined) out.name = String(t.name).trim().slice(0, 500);
  if (t.description !== undefined) out.description = String(t.description).slice(0, 30000);
  if (okId(t.statusId)) out.statusid = t.statusId!;
  if (okId(t.typeId)) out.projitemtypeid = t.typeId!;
  if (okId(t.priorityId)) out.projpriorityid = t.priorityId!;
  if (t.start !== undefined) out.startdate = zohoDate(String(t.start));
  if (t.end !== undefined) out.enddate = zohoDate(String(t.end));
  return { ...out, ...udfParams(t.udf, allowedUdf) };
}

const after = () => { G.__thSprintsBoard = undefined; };
const udfSet = async (x: Ctx) => new Set((await sprintsMeta(x)).fields.map((f) => f.udf));

/** Create Task: a new item on the board's sprint (the Kanban board's), with its tags. */
export async function createTask(sprintId: unknown, t: TaskInput): Promise<{ id: string; no: string }> {
  const s = okId(sprintId);
  if (!s) throw new Error("No board to add the task to.");
  if (!String(t.name ?? "").trim()) throw new Error("Give the task a name.");
  const x = await ctx();
  const params = taskParams(t, await udfSet(x));
  const who = splitPeople(t.users);
  if (who.zoho.length) params.users = JSON.stringify(who.zoho);
  const r = await call(x.c, "POST", `${x.p}/sprints/${s}/item/`, params);
  const id = String(r.addedItemId ?? "");
  if (id && who.members.length) await saveLocal(id, who.members);
  const tags = ids(t.tags);
  if (id && tags.length) await call(x.c, "POST", `${x.p}/sprints/${s}/item/${id}/tags/`, { action: "associateupdate", reassociate: "true", newtags: JSON.stringify(tags) }).catch((e) => console.error(`[zoho sprints] tags on new item: ${e instanceof Error ? e.message : e}`));
  after();
  return { id, no: String(r.itemNo ?? "") };
}

/** A task changed here: its fields, owners added / removed (`users` = the full new list, `was` = the old one), tags. */
export async function updateTask(sprintId: unknown, itemId: unknown, t: TaskInput & { was?: string[] }): Promise<void> {
  const s = okId(sprintId), i = okId(itemId);
  if (!s || !i) throw new Error("Unknown task");
  const x = await ctx();
  const params = taskParams(t, await udfSet(x));
  if (t.users !== undefined) {
    const now = splitPeople(t.users), was = splitPeople(t.was);
    const add = now.zoho.filter((u) => !was.zoho.includes(u)), del = was.zoho.filter((u) => !now.zoho.includes(u));
    if (add.length) params.newusers = JSON.stringify(add);
    if (del.length) params.delusers = JSON.stringify(del);
    await saveLocal(i, now.members);
  }
  if (Object.keys(params).length) await call(x.c, "POST", `${x.p}/sprints/${s}/item/${i}/`, params);
  if (t.tags !== undefined) await call(x.c, "POST", `${x.p}/sprints/${s}/item/${i}/tags/`, { action: "associateupdate", reassociate: "true", newtags: JSON.stringify(ids(t.tags)) });
  after();
}

/** A card dragged to another column: its status in Zoho Sprints. */
export async function moveTask(sprintId: unknown, itemId: unknown, statusId: unknown): Promise<void> {
  if (!okId(statusId)) throw new Error("Unknown column");
  await updateTask(sprintId, itemId, { statusId: statusId as string });
}

export async function deleteTask(sprintId: unknown, itemId: unknown): Promise<void> {
  const s = okId(sprintId), i = okId(itemId);
  if (!s || !i) throw new Error("Unknown task");
  const x = await ctx();
  await call(x.c, "DELETE", `${x.p}/sprints/${s}/item/${i}/`);
  await (await assignCol()).deleteOne({ _id: i });
  after();
}

/** A task's description, custom-field values and tags, for its popup. */
export async function taskDetail(sprintId: unknown, itemId: unknown): Promise<{ description: string; udf: Record<string, string>; tags: string[] }> {
  const s = okId(sprintId), i = okId(itemId);
  if (!s || !i) throw new Error("Unknown task");
  const x = await ctx();
  const [d, tg] = await Promise.all([
    get(x.c, `${x.p}/sprints/${s}/item/${i}/`, { action: "details" }),
    get(x.c, `${x.p}/sprints/${s}/item/${i}/tags/`, { action: "itemassociatedtagIds" }).catch(() => ({} as Record<string, unknown>)),
  ]);
  return { ...itemDetailOf(d), tags: ids(tg.associateTagIds) };
}
