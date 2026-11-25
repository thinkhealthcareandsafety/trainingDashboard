import { after } from "next/server";
import { signedInMember, unauthorized } from "@/lib/auth";
import { canSeeMargin } from "@/lib/roles";
import { M_PEOPLE, M_PERIODS, against, checks, deals, freight, groups, months, of, rises, span, total, within, years } from "@/lib/margin";
import { marginData, renewIfOld } from "@/lib/marginServer";
import { indiaNow } from "@/lib/overviewReportSend";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/*
 * The margin report (owner, 25 Nov): Sumit, Ashish, Shikha, Nikita and the Admin login. To anyone else this address does
 * not exist (404, like a wrong one).
 *  GET ?who=all|sumit|ashish|pranjal&period=day|week|month|year|all[&part=invoices|quotes|products|prices|checks]
 */
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!canSeeMargin(me)) return new Response(null, { status: 404 });
  const q = new URL(request.url).searchParams;
  const who = M_PEOPLE.find((p) => p.key === q.get("who"))?.key ?? "all";
  const kind = M_PERIODS.find((p) => p.key === q.get("period"))?.key ?? "month";
  try {
    const on = indiaNow(new Date()).ymd;
    const data = await marginData(on);
    const mine = of(data.lines, who), s = span(kind, on), now = within(mine, s.from, s.to);
    const firstName = (n: string) => n.trim().split(/\s+/)[0]?.toLowerCase();
    const isMine = (person: string) => who === "all" || firstName(person) === who;
    switch (q.get("part")) {
      case "invoices": return json({ deals: deals(now).slice(0, 1200) });
      case "quotes": return json({ quotes: data.quotes.filter((x) => isMine(x.person)) });
      case "products": return json({ items: groups(now, "item").slice(0, 60), brands: groups(now, "brand").slice(0, 20), customers: groups(now, "customer").slice(0, 60) });
      case "prices": return json({ rises: rises(data.buys, data.lines, on).slice(0, 60) });
      case "checks": return json({ checks: checks(now).slice(0, 200), freight: freight(now) });
    }
    try { after(renewIfOld); } catch { /* outside a request (tests) */ }
    const all = within(data.lines, s.from, s.to);
    return json({
      on, total: total(now), last: against(mine, kind, on), months: months(mine, on), years: years(mine),
      people: M_PEOPLE.filter((p) => p.key !== "all").map((p) => ({ key: p.key, label: p.label, ...total(of(all, p.key)) })),
      training: data.training.filter((t) => t.date >= s.from && t.date <= s.to && isMine(t.person)).reduce((n, t) => n + t.amount, 0),
      unread: data.unread, refreshedAt: data.refreshedAt,
    });
  } catch (e) {
    console.error(`[overview] ${e instanceof Error ? e.name : "error"}`); // no figures in the log
    return json({ error: e instanceof Error ? e.message : "Couldn't read the figures" }, 502);
  }
}
