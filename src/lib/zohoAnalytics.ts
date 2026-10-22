import "server-only";
import { db } from "./db";
import { clientOf, tokenRequest } from "./zohoOAuth";

/*
 * Zoho Analytics (owner, 22 Oct): the owner's workspace — its tables, query tables, reports and dashboards — read-only,
 * so the Reports page (ANALYTICS-PLAN.md) can use the same data and formulas. Connected once by Admin with a one-time
 * code from the Zoho API console (Self Client of the account that owns the workspace); its refresh token lives only in
 * MongoDB kv `zoho_analytics:workspace`, never in a browser.
 *
 * API v2 (https://www.zoho.com/analytics/api/v2/api-specification.html), India data centre: analyticsapi.zoho.in.
 *   GET /restapi/v2/orgs                                      → data.orgs [{ orgId, orgName, role, … }]
 *   GET /restapi/v2/workspaces/<ws>/views?CONFIG={…}          → data.views [{ viewId, viewName, viewType, … }]  (header ZANALYTICS-ORGID)
 *   GET /restapi/v2/workspaces/<ws>/views/<view>/data?CONFIG={"responseFormat":"json"}   (tables only; not query tables)
 */

const API = process.env.ZOHO_ANALYTICS_API ?? "https://analyticsapi.zoho.in";
export const ANALYTICS_SCOPES = "ZohoAnalytics.metadata.read,ZohoAnalytics.data.read";
const KEY = "zoho_analytics:workspace";

type Conn = {
  _id: string;
  workspaceId: string;
  orgId: string;
  orgName?: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  token?: { value: string; expiresAt: number };
  connectedAt: string;
  connectedBy: string;
};
/** What a browser may see: no client secret, no tokens. */
export type AnalyticsInfo = { workspaceId: string; orgName?: string; connectedAt: string; connectedBy: string };
export type AnalyticsView = { id: string; name: string; type: string; description?: string; parentId?: string; modifiedAt?: string };

const kv = async () => (await db()).collection<Conn>("kv");

export async function analyticsInfo(): Promise<AnalyticsInfo | null> {
  const c = await (await kv()).findOne({ _id: KEY });
  return c ? { workspaceId: c.workspaceId, orgName: c.orgName, connectedAt: c.connectedAt, connectedBy: c.connectedBy } : null;
}

/** The workspace id from a link (…/workspace/<id>/…) or the id itself. */
export function workspaceIdOf(link: string): string {
  const m = link.trim().match(/\/workspace\/(\d+)/) ?? link.trim().match(/^(\d{10,})$/);
  if (!m) throw new Error("That doesn't look like a Zoho Analytics workspace link (…/workspace/<number>/…)");
  return m[1];
}

async function accessFor(c: Conn, force = false): Promise<string> {
  if (!force && c.token && Date.now() < c.token.expiresAt - 5 * 60_000) return c.token.value;
  const t = await tokenRequest({ grant_type: "refresh_token", client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken })
    .catch((e: Error) => { throw new Error(`Zoho Analytics sign-in failed — Admin may need to connect it again (${e.message})`); });
  c.token = { value: t.access_token!, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 };
  await (await kv()).updateOne({ _id: c._id }, { $set: { token: c.token } });
  return c.token.value;
}

type ApiRes = { status?: string; summary?: string; data?: Record<string, unknown> & { errorCode?: number; errorMessage?: string } };

/** One GET; throws Zoho's own message on "failure". */
async function get(path: string, token: string, orgId?: string, config?: Record<string, unknown>): Promise<ApiRes> {
  const url = `${API}/restapi/v2${path}${config ? `?CONFIG=${encodeURIComponent(JSON.stringify(config))}` : ""}`;
  const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}`, ...(orgId ? { "ZANALYTICS-ORGID": orgId } : {}) }, cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as ApiRes;
  if (res.status === 401) throw Object.assign(new Error("unauthorized"), { status: 401 });
  if (!res.ok || json.status === "failure") {
    console.error(`[zoho analytics] GET ${path} → ${res.status} ${json.summary ?? ""} ${json.data?.errorMessage ?? ""}`);
    throw new Error(`Zoho Analytics: ${json.data?.errorMessage ?? json.summary ?? `error ${res.status}`}`);
  }
  return json;
}

/** Every view in the workspace (tables, query tables, charts, pivots, summaries, dashboards), page by page. */
async function listViews(token: string, orgId: string, workspaceId: string): Promise<AnalyticsView[]> {
  const out: AnalyticsView[] = [];
  for (let start = 1; start < 5000; start += 200) {
    const j = await get(`/workspaces/${workspaceId}/views`, token, orgId, { startIndex: start, noOfResult: 200 });
    const rows = ((j.data?.views as Record<string, unknown>[] | undefined) ?? []);
    for (const v of rows) {
      out.push({
        id: String(v.viewId), name: String(v.viewName ?? ""), type: String(v.viewType ?? ""),
        description: v.viewDesc ? String(v.viewDesc) : undefined, parentId: v.parentViewId ? String(v.parentViewId) : undefined,
        modifiedAt: v.lastModifiedTime ? new Date(Number(v.lastModifiedTime)).toISOString() : undefined,
      });
    }
    if (rows.length < 200) break;
  }
  return out;
}

/** The workspace's views, with a fresh token (and one retry after a 401). */
export async function workspaceViews(): Promise<AnalyticsView[]> {
  const c = await (await kv()).findOne({ _id: KEY });
  if (!c) throw new Error("Zoho Analytics isn't connected yet — Admin connects it once");
  try {
    return await listViews(await accessFor(c), c.orgId, c.workspaceId);
  } catch (e) {
    if ((e as { status?: number }).status !== 401) throw e;
    return listViews(await accessFor(c, true), c.orgId, c.workspaceId);
  }
}

/** One view's details (columns; a query table's SQL when Zoho gives it) — GET /views/<id>, read-only. */
export async function viewDetails(viewId: string): Promise<Record<string, unknown>> {
  if (!/^\d+$/.test(viewId)) throw new Error("Not a view id");
  const c = await (await kv()).findOne({ _id: KEY });
  if (!c) throw new Error("Zoho Analytics isn't connected yet — Admin connects it once");
  const read = async (token: string) => (await get(`/views/${viewId}`, token, c.orgId, { withInvolvedMetaInfo: true })).data ?? {};
  try {
    return await read(await accessFor(c));
  } catch (e) {
    if ((e as { status?: number }).status !== 401) throw e;
    return read(await accessFor(c, true));
  }
}

/**
 * Admin connects the workspace: swaps the one-time code for a refresh token, finds which of the account's Zoho Analytics
 * organisations holds the workspace, and lists its views once to check it reads right.
 */
export async function connectAnalytics(input: { link: string; code: string; clientId?: string; clientSecret?: string; by: string }) {
  const workspaceId = workspaceIdOf(input.link);
  const { clientId, clientSecret } = clientOf(input);
  const t = await tokenRequest({ grant_type: "authorization_code", client_id: clientId, client_secret: clientSecret, code: input.code.trim() });
  if (!t.refresh_token) throw new Error("Zoho didn't return a refresh token — generate a new code and try again");
  const token = t.access_token!;
  const orgs = ((await get("/orgs", token)).data?.orgs as { orgId: string | number; orgName?: string }[] | undefined) ?? [];
  if (!orgs.length) throw new Error("This Zoho account has no Zoho Analytics organisation — sign in to the API console as the workspace's owner");
  let found: { orgId: string; orgName?: string; views: AnalyticsView[] } | null = null;
  for (const o of orgs) {
    const views = await listViews(token, String(o.orgId), workspaceId).catch(() => null);
    if (views) { found = { orgId: String(o.orgId), orgName: o.orgName, views }; break; }
  }
  if (!found) throw new Error("Couldn't open that workspace with this account — check the link, and that the code was made by an account that can open it");
  const doc: Conn = {
    _id: KEY, workspaceId, orgId: found.orgId, orgName: found.orgName, clientId, clientSecret, refreshToken: t.refresh_token,
    token: { value: token, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 },
    connectedAt: new Date().toISOString(), connectedBy: input.by,
  };
  await (await kv()).replaceOne({ _id: KEY }, doc, { upsert: true });
  return { info: (await analyticsInfo())!, views: found.views };
}
