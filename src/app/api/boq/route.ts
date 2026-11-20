import { signedInMember, unauthorized } from "@/lib/auth";
import { canConvertInvoices } from "@/lib/roles";
import { chooseSheets, deleteQuote, exportQuote, getQuote, listQuotes, newQuote, pickList, quoteView, saveQuote } from "@/lib/boqServer";

export const dynamic = "force-dynamic";

/*
 * BOQ → temporary quotation (owner, 20 Nov), on the Invoice Converter page; the same people.
 *  GET                      — the saved temporary quotations and the item list to pick from
 *  GET ?id=<id>             — one, with its lines
 *  GET ?export=<id>         — the customer's sheet back with our rates (.xlsx)
 *  POST multipart { file }  — a BOQ sheet → a new temporary quotation, matched and priced
 *  POST { action: "sheets", id, names } — quote these sheets of the file
 *  POST { action: "save", id, title, lines } — the edits (remembered for the next sheet)
 *  POST { action: "delete", id }
 */
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const ID = /^boq_[a-z0-9]{6,30}$/;

export async function GET(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!canConvertInvoices(me)) return json({ error: "Not for your account" }, 403);
  try {
    const sp = new URL(request.url).searchParams;
    const exp = sp.get("export");
    if (exp) {
      if (!ID.test(exp)) return json({ error: "Unknown quotation" }, 400);
      const f = await exportQuote(exp);
      return new Response(Buffer.from(f.bytes), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${f.name.replace(/"/g, "")}"`, "cache-control": "private, no-store" } });
    }
    const id = sp.get("id");
    if (id) {
      if (!ID.test(id)) return json({ error: "Unknown quotation" }, 400);
      const q = await getQuote(id);
      return q ? json(quoteView(q)) : json({ error: "That quotation is gone." }, 404);
    }
    const [quotes, items] = await Promise.all([listQuotes(), pickList()]);
    return json({ quotes, items });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Couldn't read the quotations" }, 502);
  }
}

export async function POST(request: Request) {
  const me = await signedInMember(request);
  if (!me) return unauthorized();
  if (!canConvertInvoices(me)) return json({ error: "Not for your account" }, 403);
  try {
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const file = (await request.formData()).get("file");
      if (!(file instanceof File)) return json({ error: "Pick a BOQ sheet" }, 400);
      return json(quoteView(await newQuote(file, me.name)));
    }
    const b = (await request.json().catch(() => null)) as { action?: string; id?: unknown; names?: unknown; title?: unknown; lines?: unknown } | null;
    const id = String(b?.id ?? "");
    if (!ID.test(id)) return json({ error: "Unknown quotation" }, 400);
    if (b?.action === "sheets") return json(quoteView(await chooseSheets(id, Array.isArray(b.names) ? b.names.map(String).slice(0, 50) : [])));
    if (b?.action === "save") return json(quoteView(await saveQuote(id, { title: b.title, lines: b.lines }, me.name)));
    if (b?.action === "delete") { await deleteQuote(id); return json({ ok: true }); }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Couldn't do that" }, 502);
  }
}
