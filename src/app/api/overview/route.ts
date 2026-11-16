import { signedInMember, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncWindowStart, ymd } from "@/lib/dates";
import { type SalesDayRow, daySums } from "@/lib/overviewMath";

export const dynamic = "force-dynamic";

/*
 * The new Overview's numbers (owner, 16 Nov): quotations sent and invoiced, in value, one sum per day for the company
 * and for Sumit, Ashish and Pranjal (by the Zoho salesperson), since the start of last financial year. From the Sales
 * copy (salesDocs), which holds every quotation and invoice, training included. Sent = every quotation that isn't a
 * draft; invoiced = every invoice that isn't a draft or void. A quotation counts on its date, an invoice on its date.
 */
export async function GET(request: Request) {
  if (!(await signedInMember(request))) return unauthorized();
  try {
    const since = ymd(syncWindowStart(new Date()));
    const rows = (await (await db()).collection<SalesDayRow>("salesDocs").find({ kind: { $in: ["estimates", "invoices"] } }, { projection: { kind: 1, date: 1, "row.date": 1, "row.status": 1, "row.total": 1, "row.salesperson_name": 1 } }).toArray());
    return Response.json({ days: daySums(rows, since), since }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't read the figures" }, { status: 502 });
  }
}
