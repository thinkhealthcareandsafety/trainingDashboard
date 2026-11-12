import "server-only";
import { booksApi } from "./quotations";
import { db } from "./db";
import { type PiDraft, type PiFields, type PiLine, acceptDefaults, fieldsFromZoho, readPiEdit, zohoCustomFields } from "./performaRules";
import type { Proposal } from "./portalRules";

/*
 * Accept date → Performa (owner, 12 Nov), the Zoho side. A Performa is a Zoho Books sales order (numbered Performa-…,
 * reference = the quote number). Accept makes it a Draft from the quotation, as Zoho's own "Convert to Sales Order"
 * does (POST /salesorders with estimate_id and the quote's lines); our dashboard then edits that draft (PUT) and emails
 * it (POST /salesorders/{id}/email, Zoho attaches the PDF). Calls go through the quotations connection (full access).
 */

type Z = Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const num = (v: unknown) => Number(v) || 0;

/** The draft as our editor shows it. `trainingIds`: the training items (their lines start at the coordinator's headcount). */
function toDraft(so: Z, trainingIds: Set<string>): PiDraft {
  return {
    salesorderId: str(so.salesorder_id),
    number: str(so.salesorder_number),
    status: str(so.status),
    reference: str(so.reference_number),
    date: str(so.date),
    shipmentDate: str(so.shipment_date),
    paymentTerms: str(so.payment_terms_label),
    salesperson: str(so.salesperson_name),
    customer: str(so.customer_name),
    fields: fieldsFromZoho(so.custom_fields as Z[] | undefined),
    lines: ((so.line_items as Z[]) ?? []).map((li): PiLine => ({
      lineItemId: str(li.line_item_id), itemId: str(li.item_id), name: str(li.name), description: str(li.description),
      qty: num(li.quantity), rate: num(li.rate), taxId: str(li.tax_id) || undefined, training: trainingIds.has(str(li.item_id)),
    })),
    notes: str(so.notes),
    total: num(so.total),
  };
}

/**
 * Accept: the quotation becomes a Draft Performa in Zoho. Same customer, contacts, lines, prices, taxes, discount and
 * terms as the quote; reference = the quote number; the training lines at the coordinator's headcount; Training Date,
 * PO date / number and Product Type filled; the training's date, place and headcount in the Notes.
 */
export async function convertToPerforma(estimateId: string, proposal: Proposal | null, trainingIds: Set<string>, today: string, salesperson?: string): Promise<PiDraft> {
  const e = (await booksApi("GET", `/estimates/${estimateId}`)).estimate as Z | undefined;
  if (!e) throw new Error("Zoho Books didn't give the quotation");
  const d = acceptDefaults(proposal, today);
  const lines = ((e.line_items as Z[]) ?? []).map((li) => ({
    item_id: str(li.item_id),
    ...(str(li.name) ? { name: str(li.name) } : {}),
    ...(str(li.description) ? { description: str(li.description) } : {}),
    quantity: d.trainingQty && trainingIds.has(str(li.item_id)) ? d.trainingQty : num(li.quantity),
    rate: num(li.rate),
    ...(str(li.tax_id) ? { tax_id: str(li.tax_id) } : {}),
    ...(str(li.discount) && str(li.discount) !== "0" ? { discount: str(li.discount) } : {}),
    ...(str(li.hsn_or_sac) ? { hsn_or_sac: str(li.hsn_or_sac) } : {}),
    ...(str(li.unit) ? { unit: str(li.unit) } : {}),
  })).filter((l) => l.item_id);
  const people = ((e.contact_persons as unknown[]) ?? []).map(str).filter(Boolean);
  const body: Z = {
    customer_id: str(e.customer_id),
    estimate_id: estimateId,
    reference_number: str(e.estimate_number),
    date: today,
    line_items: lines,
    custom_fields: zohoCustomFields(d.fields),
    ...(people.length ? { contact_persons: people } : {}),
    ...(salesperson || str(e.salesperson_name) ? { salesperson_name: salesperson || str(e.salesperson_name) } : {}),
    ...(str(e.location_id) ? { location_id: str(e.location_id) } : {}),
    ...(str(e.place_of_supply) ? { place_of_supply: str(e.place_of_supply) } : {}),
    ...(str(e.gst_treatment) ? { gst_treatment: str(e.gst_treatment) } : {}),
    ...(str(e.gst_no) ? { gst_no: str(e.gst_no) } : {}),
    ...(str(e.discount) && num(e.discount) ? { discount: str(e.discount), discount_type: str(e.discount_type) || "entity_level", is_discount_before_tax: e.is_discount_before_tax !== false } : {}),
    ...(num(e.shipping_charge) ? { shipping_charge: num(e.shipping_charge) } : {}),
    ...(num(e.adjustment) ? { adjustment: num(e.adjustment), adjustment_description: str(e.adjustment_description) || "Adjustment" } : {}),
    ...(str(e.terms) ? { terms: str(e.terms) } : {}),
    notes: [d.note, str(e.notes)].filter(Boolean).join("\n\n"),
  };
  const so = (await booksApi("POST", "/salesorders", {}, body)).salesorder as Z | undefined;
  if (!so?.salesorder_id) throw new Error("Zoho Books took the Performa but didn't say which it is. Check Sales Orders in Zoho.");
  return toDraft(so, trainingIds);
}

/**
 * The Performa's salesperson (owner, 12 Nov): whoever confirms it, as Zoho spells their name ("names are the same");
 * Admin is Sumit. Matched by first name against the salespeople on our copy of Zoho's documents; undefined when there's
 * no match (the quote's own salesperson stays).
 */
export async function salespersonFor(me: { id: string; name: string }): Promise<string | undefined> {
  const first = (me.id === "admin" ? "sumit" : me.name.trim().split(/\s+/)[0] ?? "").toLowerCase();
  if (!first) return undefined;
  const docs = await (await db()).collection<{ _id: string; doc?: { salesperson_name?: string } }>("zohoDocs").find({}, { projection: { "doc.salesperson_name": 1 } }).toArray();
  const names = [...new Set(docs.map((d) => String(d.doc?.salesperson_name ?? "").trim()).filter(Boolean))];
  return names.find((n) => n.split(/\s+/)[0].toLowerCase() === first);
}

export async function readPerforma(salesorderId: string, trainingIds: Set<string>): Promise<PiDraft> {
  const so = (await booksApi("GET", `/salesorders/${salesorderId}`)).salesorder as Z | undefined;
  if (!so) throw new Error("Zoho Books didn't give the Performa");
  return toDraft(so, trainingIds);
}

/** Our edit saved straight to the Zoho draft. Only a Draft is changed here; a sent one is changed in Zoho. */
export async function savePerforma(salesorderId: string, raw: unknown, trainingIds: Set<string>): Promise<PiDraft | { error: string }> {
  const edit = readPiEdit(raw);
  if ("error" in edit) return edit;
  const now = await readPerforma(salesorderId, trainingIds);
  if (now.status !== "draft") return { error: `This Performa is ${now.status} in Zoho now. Change it there.` };
  const byLine = new Map(edit.lines.map((l) => [l.lineItemId, l]));
  const line_items = now.lines.map((l) => {
    const e = byLine.get(l.lineItemId ?? "");
    return { line_item_id: l.lineItemId, item_id: l.itemId, name: l.name, description: e?.description ?? l.description, quantity: e?.qty ?? l.qty, rate: e?.rate ?? l.rate, ...(l.taxId ? { tax_id: l.taxId } : {}) };
  });
  const so = (await booksApi("PUT", `/salesorders/${salesorderId}`, {}, {
    date: edit.date, shipment_date: edit.shipmentDate, notes: edit.notes, line_items, custom_fields: zohoCustomFields(edit.fields as PiFields),
  })).salesorder as Z | undefined;
  return so ? toDraft(so, trainingIds) : readPerforma(salesorderId, trainingIds);
}

/** The Performa emailed from Zoho (its PDF attached), from the organisation's address. Production only — the route checks. */
export async function emailPerforma(salesorderId: string, m: { to: string[]; cc: string[]; subject: string; body: string }): Promise<void> {
  await booksApi("POST", `/salesorders/${salesorderId}/email`, {}, { send_from_org_email_id: true, to_mail_ids: m.to, cc_mail_ids: m.cc, subject: m.subject, body: m.body });
}
