import { signedInMember, unauthorized } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { ANALYTICS_SCOPES, analyticsInfo, connectAnalytics, viewDetails, workspaceViews } from "@/lib/zohoAnalytics";

export const dynamic = "force-dynamic";

// The owner's Zoho Analytics workspace (read-only), Admin only for now. GET — is it connected, and (when it is) every
// table, query table, report and dashboard in it. POST { link, code, clientId, clientSecret } — Admin connects it with a
// one-time code from the Self Client of the account that owns the workspace.

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!isAdmin(me)) return Response.json({ error: "Admin only" }, { status: 403 });
  // ?view=<id>: one table's columns / one query table's details.
  const view = new URL(request.url).searchParams.get("view");
  if (view) {
    try {
      return Response.json({ view: await viewDetails(view) });
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : "Couldn't read that view" }, { status: 502 });
    }
  }
  try {
    const info = await analyticsInfo();
    if (!info) return Response.json({ info: null, scopes: ANALYTICS_SCOPES });
    return Response.json({ info, scopes: ANALYTICS_SCOPES, views: await workspaceViews() });
  } catch (e) {
    return Response.json({ info: await analyticsInfo().catch(() => null), scopes: ANALYTICS_SCOPES, error: e instanceof Error ? e.message : "Couldn't read the workspace" });
  }
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!isAdmin(me)) return Response.json({ error: "Only Admin connects Zoho Analytics" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { link?: string; code?: string; clientId?: string; clientSecret?: string };
  if (!body.link || !body.code) return Response.json({ error: "Workspace link and code are needed" }, { status: 400 });
  if (!body.clientId?.trim() || !body.clientSecret?.trim()) return Response.json({ error: "Client ID and Client Secret are needed (Self Client → Client Secret tab)" }, { status: 400 });
  try {
    const r = await connectAnalytics({ link: body.link, code: body.code, clientId: body.clientId, clientSecret: body.clientSecret, by: me.name });
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't connect" }, { status: 400 });
  }
}
