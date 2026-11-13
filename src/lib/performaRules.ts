import { type Proposal, fmtProposalDate } from "./portalRules";
import { renderTemplate } from "./templateText";

/*
 * Accept date → Performa (owner, 12 Nov): Accept on a proposed date converts the quotation into a Draft sales order in
 * Zoho Books (the org's Performa Invoice, numbered Performa-…), the same as Zoho's "Convert to Sales Order". The draft is
 * then edited on our dashboard and saved straight to the Zoho draft; Performa email templates send it.
 * Pure: the fields as Zoho has them (read 12 Nov from Settings → Sales Order fields), the defaults, the checks.
 */

/** The org's sales order custom fields (field id, as Zoho lists them, 12 Nov 2026). Dropdown options are spelt exactly as Zoho has them,
 * stray spaces included, so what we send always matches; shown and compared trimmed. */
export const PI_FIELDS = {
  poDate: { id: "982417000008510351", label: "Purchase Order Date", type: "date", required: true },
  trainer: { id: "982417000020925027", label: "Trainer Name", type: "dropdown", options: [" None", "Sumit Shah ", "Ashish Dalal", " Baiju Stephen", "Shikha Dixit", "Priyanka ", "Other "] },
  poNumber: { id: "982417000003206201", label: "Purchase Order Number #", type: "text" },
  trainingDate: { id: "982417000020925037", label: "Training Date", type: "date" },
  leadSource: { id: "982417000020925014", label: "Lead Source", type: "dropdown", options: ["Indiamart", "BuyAEDINDIA ", "Direct ", "Events ", "Social Media", "Reference ", "Amazon"] },
  businessType: { id: "982417000020925044", label: "Business Type", type: "dropdown", options: ["Autofill", "Products ", "Services", "Both"] },
  productType: { id: "982417000020925143", label: "Product Type", type: "dropdown", options: ["AED", "Battery ", "pads ", "Training ", "AED( Battery + Pads)", " AED Cabinet", " AED Accessories", " Trauma Kit", " First Aid Training", " CPR Training", " AED Maintenance", " 5SU ", "SAFETY Supplies", " Ambulance Service", " Training Products", " Fire Blanket", " Evacuation", "Other "] },
} as const;
export type PiFieldKey = keyof typeof PI_FIELDS;
export type PiFields = Record<PiFieldKey, string>;

/** Zoho's dropdown values carry stray spaces ("Sumit Shah ", " None"); compared trimmed. */
export const sameOption = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export type PiLine = { lineItemId?: string; itemId: string; name: string; description: string; qty: number; rate: number; taxId?: string; training: boolean };
export type PiDraft = {
  salesorderId: string;
  number: string;
  status: string;
  reference: string;
  date: string;
  shipmentDate: string;
  paymentTerms: string;
  salesperson: string;
  customer: string;
  fields: PiFields;
  lines: PiLine[];
  notes: string;
  total: number;
};

/** The training line in the Notes: "Training: Fri, 4 Dec 2026, 10:00 am + Sat, 5 Dec 2026 · The Grand, Ballroom 2 · 36 people". */
export const trainingNote = (p: Pick<Proposal, "dates" | "location" | "headcount" | "tentative">) =>
  `Training: ${p.dates.map(fmtProposalDate).join(" + ")}${p.tentative ? " (tentative)" : ""} · ${p.location} · ${p.headcount} people`;

/**
 * The draft's starting values on Accept: today's dates, PO "Verbal" (the team's usual), Product Type Training, Business
 * Type Services ("training is a service") and Lead Source Direct (owner, 13 Nov), the proposal's first day as Training
 * Date, and the training lines at the coordinator's headcount (owner: "it should take whatever value they put; if they
 * didn't, keep ours").
 */
export function acceptDefaults(p: Proposal | null, today: string): { fields: PiFields; trainingQty: number | null; note: string } {
  return {
    fields: { poDate: today, trainer: "None", poNumber: "Verbal", trainingDate: p?.dates[0]?.date ?? "", leadSource: "Direct", businessType: "Services", productType: "Training" },
    trainingQty: p?.headcount && p.headcount > 0 ? p.headcount : null,
    note: p ? trainingNote(p) : "",
  };
}

/** Zoho's sales order status as the team sees it in Zoho: "open" is shown there as Confirmed. */
export const piStatusLabel = (s: string) => (s === "draft" ? "Draft" : s === "open" ? "Confirmed" : s ? s[0].toUpperCase() + s.slice(1).replace(/_/g, " ") : "");

/** The email fields from the Performa box, checked: who it goes to, the subject, the message. */
export function readPiEmailFields(b: { to?: unknown; cc?: unknown; subject?: unknown; text?: unknown }): { to: string[]; cc: string[]; subject: string; text: string } | { error: string } {
  const mails = (v: unknown) => String(v ?? "").split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const to = mails(b.to), cc = mails(b.cc).filter((m) => !to.includes(m));
  const subject = String(b.subject ?? "").trim().slice(0, 300), text = String(b.text ?? "").slice(0, 20000);
  const bad = [...to, ...cc].find((m) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m));
  if (!to.length) return { error: "Add who it goes to" };
  if (bad) return { error: `${bad} doesn't look like an email` };
  if (!subject || !text.trim()) return { error: "Type the subject and the message" };
  return { to, cc, subject, text };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Our side's edit of the draft, checked. */
export function readPiEdit(raw: unknown): { fields: PiFields; lines: { lineItemId: string; description: string; qty: number; rate: number }[]; notes: string; shipmentDate: string; date: string } | { error: string } {
  const r = (raw ?? {}) as { fields?: Record<string, unknown>; lines?: unknown; notes?: unknown; shipmentDate?: unknown; date?: unknown };
  const f = r.fields ?? {};
  const fields = {} as PiFields;
  for (const [key, def] of Object.entries(PI_FIELDS) as [PiFieldKey, (typeof PI_FIELDS)[PiFieldKey]][]) {
    const v = String(f[key] ?? "").trim().slice(0, 100);
    if (def.type === "date" && v && !DATE.test(v)) return { error: `${def.label}: pick a date` };
    if ("required" in def && def.required && !v) return { error: `${def.label} is required in Zoho` };
    if (def.type === "dropdown" && v && !def.options.some((o) => sameOption(o, v))) return { error: `${def.label}: pick one from the list` };
    fields[key] = v;
  }
  const lines: { lineItemId: string; description: string; qty: number; rate: number }[] = [];
  for (const l of Array.isArray(r.lines) ? (r.lines as Record<string, unknown>[]) : []) {
    const qty = Number(l.qty), rate = Number(l.rate);
    if (!/^\d+$/.test(String(l.lineItemId ?? ""))) return { error: "A line isn't on this Performa any more. Reopen it." };
    if (!(qty > 0) || qty > 100000) return { error: "Each quantity should be more than 0" };
    if (!(rate >= 0) || rate > 1e9) return { error: "A rate doesn't look right" };
    lines.push({ lineItemId: String(l.lineItemId), description: String(l.description ?? "").slice(0, 2000), qty, rate });
  }
  if (!lines.length) return { error: "The Performa needs its lines" };
  const shipmentDate = String(r.shipmentDate ?? "").trim(), date = String(r.date ?? "").trim();
  if (shipmentDate && !DATE.test(shipmentDate)) return { error: "Expected shipment date: pick a date" };
  if (!DATE.test(date)) return { error: "Sales order date: pick a date" };
  return { fields, lines, notes: String(r.notes ?? "").slice(0, 2000), shipmentDate, date };
}

/** Zoho's custom_fields for these values (a dropdown as Zoho spells it, stray spaces and all; empty ones left out). */
export function zohoCustomFields(fields: Partial<PiFields>): { customfield_id: string; value: string }[] {
  const out: { customfield_id: string; value: string }[] = [];
  for (const [key, v] of Object.entries(fields) as [PiFieldKey, string][]) {
    const def = PI_FIELDS[key];
    if (!def || !v) continue;
    out.push({ customfield_id: def.id, value: def.type === "dropdown" ? def.options.find((o) => sameOption(o, v)) ?? v : v });
  }
  return out;
}

/** Our fields from a Zoho sales order's custom_fields (matched by field id). */
export function fieldsFromZoho(custom: { customfield_id?: unknown; value?: unknown }[] | undefined): PiFields {
  const byId = new Map((custom ?? []).map((c) => [String(c.customfield_id ?? ""), String(c.value ?? "").trim()]));
  const out = {} as PiFields;
  for (const [key, def] of Object.entries(PI_FIELDS) as [PiFieldKey, (typeof PI_FIELDS)[PiFieldKey]][]) {
    const v = byId.get(def.id) ?? "";
    out[key] = def.type === "dropdown" ? (def.options.find((o) => sameOption(o, v)) ?? v) : v;
  }
  return out;
}

/* ---------------- The Performa email (Templates → Performa emails; training only for now) ---------------- */

export const PI_VARS = ["hi", "number", "quote", "training", "dates", "location", "people", "total", "sign"] as const;
export type PiTemplate = { id: "training"; label: string; subject: string; body: string; note: string };
export const PI_TEMPLATES: PiTemplate[] = [{
  id: "training", label: "Performa for a training", subject: "Performa Invoice {number} · {training}",
  body: "{hi}\n\nThank you for confirming your training with us. Please find attached our Performa Invoice {number} (for quotation {quote}).\n\n[Training: {training}\n][On: {dates}\n][At: {location}\n][People: {people}\n]\nKindly arrange the payment as per the terms on the Performa, and share the payment details with us so we can lock in the date.\n\n{sign}",
  note: "Sent from the Trainings page with the Performa's PDF, to the training coordinator. The training's date, place and headcount fill in from what they proposed.",
}];

export type PiEmailVars = { name: string; number: string; quote: string; training: string; dates: string; location: string; people: string; total: string; sign: string };

/** The Performa email's subject and HTML, from the template's wording. */
export function piEmail(t: { subject: string; body: string }, v: PiEmailVars): { subject: string; text: string } {
  const vars: Record<string, string> = { ...v, hi: v.name ? `Dear ${v.name.split(" ")[0]},` : "Hello," };
  return { subject: renderTemplate(t.subject, vars), text: renderTemplate(t.body, vars) };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Plain text → the email's HTML (paragraphs, line breaks). */
export const textToHtml = (s: string) => `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.55">${s.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 1em">${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}</div>`;
