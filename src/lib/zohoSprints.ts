import "server-only";
import { db } from "./db";
import { clientsToTry, tokenRequest } from "./zohoOAuth";
import { booksClient } from "./quotations";
import { type SprintsBoard, type SprintView, boardColumns, findProject, pickTeam, sprintsOf } from "./sprintsRules";

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

type Conn = { _id: string; clientId: string; clientSecret: string; refreshToken: string; teamId?: string; token?: { value: string; expiresAt: number }; connectedAt: string; connectedBy: string };
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
  const [statuses, active] = await Promise.all([
    get(c, `${p}/itemstatus/`, { action: "data", index: "1", range: "100" }),
    get(c, `${p}/sprints/`, { action: "data", index: "1", range: "100", type: "[2]" }),
  ]);
  const running = sprintsOf(active);
  const sprints: SprintView[] = [];
  for (const s of running) {
    const items = await allPages(c, `${p}/sprints/${s.id}/item/`, { action: "data" });
    sprints.push({ ...s, columns: boardColumns(statuses, items, project.prefix) });
  }
  if (!sprints.length && project.backlogId) {
    const items = await allPages(c, `${p}/sprints/${project.backlogId}/item/`, { action: "data" });
    sprints.push({ id: project.backlogId, name: "Backlog", no: "", start: null, end: null, backlog: true, columns: boardColumns(statuses, items, project.prefix) });
  }
  const data: SprintsBoard = { project: { id: project.id, name: project.name, prefix: project.prefix, no: project.no }, sprints, fetchedAt: new Date().toISOString(), boardUrl: BOARD_URL };
  G.__thSprintsBoard = { at: Date.now(), data };
  return data;
}
