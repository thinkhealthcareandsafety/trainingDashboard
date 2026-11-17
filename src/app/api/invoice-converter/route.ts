import { signedInMember, unauthorized } from "@/lib/auth";
import { canConvertInvoices } from "@/lib/roles";
import { attachPdf, converterData, setPoNumber } from "@/lib/invoiceConverter";

export const dynamic = "force-dynamic";

/*
 * The Invoice Converter (owner, 17 Nov): GET — every customer with their invoices, PO and e-way bill state;
 * POST JSON { action: "po", id, value } — the invoice's Purchase Order Number;
 * POST multipart { action: "attach", id, which: "po" | "eway", file } — a PDF attached to the invoice in Zoho.
 * Full access and logistics only.
 */
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!canConvertInvoices(me)) return json({ error: "Not for your account" }, 403);
  try {
    return json(await converterData());
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Couldn't read the invoices" }, 502);
  }
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!canConvertInvoices(me)) return json({ error: "Not for your account" }, 403);
  try {
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const f = await request.formData();
      const id = String(f.get("id") ?? "");
      const which = f.get("which") === "eway" ? "eway" : "po";
      const file = f.get("file");
      if (!/^\d{6,25}$/.test(id) || !(file instanceof File)) return json({ error: "Pick a PDF for an invoice" }, 400);
      return json(await attachPdf(id, which, file));
    }
    const b = (await request.json().catch(() => null)) as { action?: string; id?: unknown; value?: unknown } | null;
    const id = String(b?.id ?? "");
    if (b?.action !== "po" || !/^\d{6,25}$/.test(id)) return json({ error: "Unknown action" }, 400);
    return json(await setPoNumber(id, b.value));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Couldn't save it" }, 502);
  }
}
