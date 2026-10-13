import { fulfilContext, recordServerEvent } from "@/lib/fulfilServer";
import { DESIGNS, type DayNames, certRows, isDesignId, namesOnSeveralDays, printedDate } from "@/lib/certificates";
import { certDays } from "@/lib/pipeline";
import { appendBatch, firstFree, readRegister, sheetRows } from "@/lib/zohoSheet";

export const dynamic = "force-dynamic";

// Fulfillment · Generate Certificate. POST { card, design, days: [{ date, names }], preview: true } — the rows as they'll
// sit in the master sheet, numbered after its last row (nothing written); POST { card, design, days } — appends them at
// the end of the sheet (serials taken again from the sheet at that moment) and records the batch on the card. The PDF is
// then made in the browser from the recorded rows. A multi-day training gives names for every one of its days (different
// people each day); each row carries its own day. `names` (one list) is still accepted for a one-day training.

const MAX_NAMES = 500;

const cleanNames = (v: unknown) => (Array.isArray(v) ? v : []).map((n) => String(n).replace(/\s+/g, " ").trim()).filter(Boolean);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { card?: string; design?: string; days?: unknown; names?: unknown; preview?: boolean };
  try {
    const c = await fulfilContext(request, body.card);
    if ("error" in c) return c.error;
    const f = c.card.fulfillment!;
    if (f.stage !== "gratitude") return Response.json({ error: "Certificates are made from Gratitude Email Sent" }, { status: 409 });
    if (f.certs && !f.certsReverted) return Response.json({ error: "These participants are already in the sheet — download the certificates instead" }, { status: 409 });
    const design = DESIGNS.find((d) => d.id === body.design);
    if (!isDesignId(body.design) || !design) return Response.json({ error: "Pick a certificate design" }, { status: 400 });
    const dates = certDays(c.card);
    if (!dates.length) return Response.json({ error: "This training has no date" }, { status: 409 });
    let days: DayNames[];
    if (Array.isArray(body.days)) {
      const given = new Map((body.days as { date?: unknown; names?: unknown }[]).map((d) => [String(d?.date ?? ""), cleanNames(d?.names)]));
      if (given.size !== dates.length || dates.some((d) => !given.has(d))) {
        return Response.json({ error: "The training's dates have changed — close this and open Generate Certificate again" }, { status: 409 });
      }
      days = dates.map((date) => ({ date, names: given.get(date)! }));
    } else if (dates.length === 1) {
      days = [{ date: dates[0], names: cleanNames(body.names) }];
    } else {
      return Response.json({ error: "This training has several days — reload the page (Ctrl + Shift + R) and add the names day by day" }, { status: 409 });
    }
    const empty = days.filter((d) => !d.names.length);
    if (empty.length) {
      return Response.json({ error: dates.length === 1 ? "Add the participants' names" : `Add the names trained on ${empty.map((d) => printedDate(d.date)).join(", ")}` }, { status: 400 });
    }
    const total = days.reduce((n, d) => n + d.names.length, 0);
    if (total > MAX_NAMES) return Response.json({ error: `At most ${MAX_NAMES} names at a time` }, { status: 400 });
    const twice = namesOnSeveralDays(days);
    if (twice.length) return Response.json({ error: `One person, one day — these names are on more than one day: ${twice.join("; ")}` }, { status: 400 });
    const batch = { location: c.card.certAlias || c.card.name, course: design.course };

    if (body.preview) {
      const register = await readRegister();
      const rows = certRows(days, firstFree(register), batch);
      return Response.json({ rows, sheet: sheetRows(register, rows), headers: register.headers, columns: register.columns, missing: register.missing, last: register.last, count: register.count });
    }

    const { rows } = await appendBatch((first) => certRows(days, first, batch));
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
