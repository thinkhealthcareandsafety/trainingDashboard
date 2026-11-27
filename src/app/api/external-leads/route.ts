import { signedInMember, unauthorized } from "@/lib/auth";
import { withBump } from "@/lib/changes";
import { canQuote, canSee } from "@/lib/roles";
import { CUSTOMER_FIELDS, INDIA_STATES } from "@/lib/quotations";
import { GST_TREATMENTS } from "@/lib/gstin";
import { SALUTATIONS, checkLead } from "@/lib/externalLeads";
import { addLead, listLeads, retryLead, zohoMatch } from "@/lib/externalLeadsServer";

export const dynamic = "force-dynamic";

/*
 * External Leads (externalLeads.ts). Those with the Quotations page see them; those who make quotations add them.
 *  GET                           — the leads, newest first, and the form's lists (states, sectors, GST treatments)
 *  GET ?match=<company>          — the customer already in Zoho Books by that name, if any (shown as you type)
 *  POST { lead }                 — add one: kept here, and made a customer in Zoho Books (or linked to the one there)
 *  POST { retry: id }            — try Zoho again for a lead Zoho refused
 */
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!canSee(me, "quotations")) return json({ error: "External leads aren't on your account" }, 403);
  const match = new URL(request.url).searchParams.get("match");
  if (match !== null) return json({ match: match.trim().length >= 2 ? (await zohoMatch(match)) ?? null : null });
  return json({
    leads: await listLeads(), canAdd: canQuote(me), states: INDIA_STATES, sectors: CUSTOMER_FIELDS.sector.options, types: CUSTOMER_FIELDS.type.options,
    treatments: GST_TREATMENTS, salutations: SALUTATIONS,
  });
}

export const POST = withBump(["work"], async (request: Request) => {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!canQuote(me)) return json({ error: "Adding external leads isn't on your account" }, 403);
  const body = (await request.json().catch(() => ({}))) as { lead?: Record<string, unknown>; retry?: string };
  if (typeof body.retry === "string") {
    const rows = await listLeads();
    const row = rows.find((r) => r._id === body.retry);
    if (!row) return json({ error: "That lead is gone" }, 404);
    const state = INDIA_STATES.find(([c]) => c === row.state);
    const again = await retryLead(row._id, state?.[1] ?? "");
    return again?.error ? json({ error: again.error, lead: again }, 502) : json({ ok: true, lead: again });
  }
  const checked = checkLead(body.lead ?? {});
  if ("error" in checked) return json({ error: checked.error }, 400);
  const lead = await addLead(checked.lead, me.name);
  return json({ ok: true, lead }, 200);
});
