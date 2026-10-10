import { fulfilContext, recordServerEvent } from "@/lib/fulfilServer";
import { DESIGNS, certRows, isDesignId } from "@/lib/certificates";
import { certDate } from "@/lib/pipeline";
import { appendBatch, readRegister, sheetRows } from "@/lib/zohoSheet";

export const dynamic = "force-dynamic";

// Fulfillment · Generate Certificate. POST { card, design, names, preview: true } — the rows as they'll sit in the
// master sheet, numbered after its last row (nothing written); POST { card, design, names } — appends them at the end of
// the sheet (serials taken again from the sheet at that moment) and records the batch on the card. The PDF is then made
// in the browser from the recorded rows.

const MAX_NAMES = 500;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { card?: string; design?: string; names?: unknown; preview?: boolean };
  try {
    const c = await fulfilContext(request, body.card);
    if ("error" in c) return c.error;
    const f = c.card.fulfillment!;
    if (f.stage !== "gratitude") return Response.json({ error: "Certificates are made from Gratitude Email Sent" }, { status: 409 });
    if (f.certs && !f.certsReverted) return Response.json({ error: "These participants are already in the sheet — download the certificates instead" }, { status: 409 });
    const design = DESIGNS.find((d) => d.id === body.design);
    if (!isDesignId(body.design) || !design) return Response.json({ error: "Pick a certificate design" }, { status: 400 });
    const names = (Array.isArray(body.names) ? body.names : []).map((n) => String(n).replace(/\s+/g, " ").trim()).filter(Boolean);
    if (!names.length) return Response.json({ error: "Add the participants' names" }, { status: 400 });
    if (names.length > MAX_NAMES) return Response.json({ error: `At most ${MAX_NAMES} names at a time` }, { status: 400 });
    const date = certDate(c.card);
    if (!date) return Response.json({ error: "This training has no date" }, { status: 409 });
    const batch = { location: c.card.certAlias || c.card.name, course: design.course, date };

    if (body.preview) {
      const register = await readRegister();
      const rows = certRows(names, register.lastSerial + 1, batch);
      return Response.json({ rows, sheet: sheetRows(register, rows), headers: register.headers, columns: register.columns, missing: register.missing, last: register.last, count: register.count });
    }

    const { rows } = await appendBatch((first) => certRows(names, first, batch));
    try {
      const event = await recordServerEvent({ cardIds: [c.card.id], kind: "fulfil_certs", value: String(rows.length), certs: rows, design: design.id, at: new Date().toISOString(), by: c.me.name });
      return Response.json({ ok: true, event, rows });
    } catch (e) {
      // The rows are in the sheet but the card doesn't know — say exactly which, so nobody adds them twice.
      console.error("[certificates] rows added to the sheet but not recorded:", rows.map((r) => r.certNo).join(", "), e);
      return Response.json({ error: `Added to the sheet (serial ${rows[0].serial}–${rows.at(-1)!.serial}) but couldn't record it on the card — don't add them again; tell Admin.` }, { status: 502 });
    }
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't add them to the sheet" }, { status: 502 });
  }
}
