/*
 * Total Supply quotation (owner, 5 Nov): a second quotation for the same items, from the owner's other company. Same lines as
 * the main quote, each with its own random 1-15% on the price; sent from Total Supply's Gmail with our own PDF, not through Zoho.
 * This file has no database or mail in it, so the email step can use it too.
 */
import { type QuoteEmailInput, type TemplateOverrides, type TextTemplate, type TopicId, buildQuoteEmail } from "./quoteEmails";

export const TS = {
  name: "Total Supply",
  gstin: "27AATFT1547J1ZL",
  address: ["Building No. 1, Unit 109, Sonal Link Industrial Estate,", "Opposite Sai Palace Hotel, Link Road, Malad West", "Mumbai Maharashtra 400064", "India"],
  state: "MH", // Zoho's code for Maharashtra: a buyer there pays CGST + SGST, elsewhere IGST
  sender: "saletotalsupply@gmail.com",
  person: "Parteek Nathani",
  phone: "7417114450",
  terms: "100% Advance",
  shipping: "Shipping Charges: To PAY",
  notes: "Looking forward for your business.",
};

export const MIN_MARKUP = 1;
export const MAX_MARKUP = 15;

/** One whole percentage per line, 1 to 15. */
export const rollMarkups = (n: number, rnd: () => number = Math.random): number[] =>
  Array.from({ length: n }, () => MIN_MARKUP + Math.floor(rnd() * (MAX_MARKUP - MIN_MARKUP + 1)));

/** The percentages sent back by the email step: one per line, whole, in range. Null when they aren't. */
export function parseMarkups(raw: string | null | undefined, n: number): number[] | null {
  const m = String(raw ?? "").split(",").filter(Boolean).map(Number);
  return m.length === n && m.every((x) => Number.isInteger(x) && x >= MIN_MARKUP && x <= MAX_MARKUP) ? m : null;
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** The new price: to the whole rupee, except small prices, where a rupee would be more than the percentage. */
export function markedRate(rate: number, percent: number): number {
  if (!(rate > 0)) return rate;
  const raw = rate * (1 + percent / 100);
  return rate >= 100 ? Math.round(raw) : round2(raw);
}

/** Quotation-2026-11-05-001: the IST day, then a running number that never resets (owner, 5 Nov). */
export const tsQuoteNumber = (ymd: string, n: number) => `Quotation-${ymd}-${String(n).padStart(3, "0")}`;

// Zoho's state codes → name and GST code, as the PDF prints them ("Maharashtra (27)"). Zoho spells a few differently from our own form.
const STATES: Record<string, [string, string]> = {
  AN: ["Andaman and Nicobar Islands", "35"], AP: ["Andhra Pradesh", "37"], AR: ["Arunachal Pradesh", "12"], AS: ["Assam", "18"], BR: ["Bihar", "10"],
  CG: ["Chhattisgarh", "22"], CT: ["Chhattisgarh", "22"], CH: ["Chandigarh", "04"], DN: ["Dadra and Nagar Haveli and Daman and Diu", "26"], DD: ["Dadra and Nagar Haveli and Daman and Diu", "26"],
  DL: ["Delhi", "07"], GA: ["Goa", "30"], GJ: ["Gujarat", "24"], HP: ["Himachal Pradesh", "02"], HR: ["Haryana", "06"], JH: ["Jharkhand", "20"], JK: ["Jammu and Kashmir", "01"],
  KA: ["Karnataka", "29"], KL: ["Kerala", "32"], LA: ["Ladakh", "38"], LD: ["Lakshadweep", "31"], MH: ["Maharashtra", "27"], ML: ["Meghalaya", "17"], MN: ["Manipur", "14"], MP: ["Madhya Pradesh", "23"],
  MZ: ["Mizoram", "15"], NL: ["Nagaland", "13"], OR: ["Odisha", "21"], PB: ["Punjab", "03"], PY: ["Puducherry", "34"], RJ: ["Rajasthan", "08"], SK: ["Sikkim", "11"], TG: ["Telangana", "36"], TS: ["Telangana", "36"],
  TN: ["Tamil Nadu", "33"], TR: ["Tripura", "16"], UK: ["Uttarakhand", "05"], UT: ["Uttarakhand", "05"], UP: ["Uttar Pradesh", "09"], WB: ["West Bengal", "19"],
};
export const placeLabel = (code: string | undefined | null) => { const s = STATES[code ?? ""]; return s ? `${s[0]} (${s[1]})` : (code ?? ""); };

// Only what we read from Zoho's GET /estimates/{id}.
type ZAddress = { attention?: string; address?: string; street2?: string; city?: string; state?: string; zip?: string; country?: string; phone?: string };
type ZLine = { name?: string; description?: string; hsn_or_sac?: string; quantity?: number | string; unit?: string; rate?: number | string; tax_percentage?: number | string; item_total?: number | string };
export type ZEstimate = {
  estimate_number?: string; customer_id?: string; customer_name?: string; gst_no?: string; gst_treatment?: string; place_of_supply?: string; expiry_date?: string;
  sub_total?: number | string; sub_total_exclusive_of_discount?: number | string; discount_percent?: number | string; discount_total?: number | string; is_discount_before_tax?: boolean;
  shipping_charge?: number | string; shipping_charge_tax_percentage?: number | string; adjustment?: number | string; adjustment_description?: string;
  billing_address?: ZAddress; shipping_address?: ZAddress; line_items?: ZLine[];
};

export type TsLine = { name: string; description: string; hsn: string; qty: number; unit: string; was: number; rate: number; percent: number; gst: number; tax: number; amount: number };
export type TsQuote = {
  number: string; date: string; expiry: string | null; mainNumber: string; place: string; taxMode: "intra" | "inter" | "none";
  customer: { id: string; name: string; gstin: string; billing: string[]; shipping: string[] };
  lines: TsLine[]; subTotal: number; discountPercent: number; discount: number; shipping: number; adjustment: number; adjustmentLabel: string;
  taxes: { label: string; amount: number }[]; rounding: number; total: number;
};

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const addressLines = (a: ZAddress = {}) => {
  const cityLine = [a.city, a.state, a.zip].map((x) => (x ?? "").trim()).filter(Boolean).join(", ");
  return [a.attention, a.address, a.street2, cityLine, a.country, a.phone].map((x) => (x ?? "").trim()).filter(Boolean);
};
const rateLabel = (kind: string, pct: number) => `${kind}${pct} (${pct}%)`;

/** The Total Supply quotation for a Zoho quote: new prices, then everything else follows Zoho's way of adding up (as on the owner's invoice). */
export function buildTsQuote(e: ZEstimate, percents: number[], number: string, date: string): TsQuote {
  const items = e.line_items ?? [];
  const taxMode: TsQuote["taxMode"] = e.gst_treatment === "overseas" ? "none" : !e.place_of_supply || e.place_of_supply === TS.state ? "intra" : "inter";
  // A discount per line (older quotes): its effect is already in item_total, so it goes into the price the buyer sees.
  const base = items.map((l, i) => {
    const qty = num(l.quantity), listed = num(l.rate), total = num(l.item_total);
    const was = qty > 0 && total > 0 && total < qty * listed ? round2(total / qty) : listed;
    const percent = percents[i] ?? MIN_MARKUP;
    const rate = markedRate(was, percent);
    return { name: String(l.name ?? "").trim(), description: String(l.description ?? "").trim(), hsn: String(l.hsn_or_sac ?? ""), qty, unit: String(l.unit ?? ""), was, rate, percent, gst: taxMode === "none" ? 0 : num(l.tax_percentage), amount: round2(qty * rate) };
  });
  const subTotal = round2(base.reduce((n, l) => n + l.amount, 0));
  // The main quote's discount, as a share: a flat amount there becomes the same percentage here.
  const before = num(e.sub_total_exclusive_of_discount) || num(e.sub_total);
  const share = num(e.discount_percent) > 0 ? num(e.discount_percent) / 100 : before > 0 ? num(e.discount_total) / before : 0;
  const beforeTax = e.is_discount_before_tax !== false;

  const taxes = new Map<string, number>();
  const addTax = (taxable: number, pct: number) => {
    if (!pct || taxMode === "none") return 0;
    if (taxMode === "inter") {
      const t = round2((taxable * pct) / 100);
      taxes.set(rateLabel("IGST", pct), (taxes.get(rateLabel("IGST", pct)) ?? 0) + t);
      return t;
    }
    const half = round2((taxable * pct) / 200);
    for (const k of ["CGST", "SGST"]) taxes.set(rateLabel(k, pct / 2), (taxes.get(rateLabel(k, pct / 2)) ?? 0) + half);
    return half * 2;
  };
  const lines: TsLine[] = base.map((l) => ({ ...l, tax: round2(addTax(beforeTax ? l.amount * (1 - share) : l.amount, l.gst)) }));

  const shipping = num(e.shipping_charge);
  const shipTax = addTax(shipping, num(e.shipping_charge_tax_percentage));
  const adjustment = num(e.adjustment);
  const lineTax = lines.reduce((n, l) => n + l.tax, 0);
  const discount = round2((beforeTax ? subTotal : subTotal + lineTax) * share);
  const exact = round2(subTotal - discount + lineTax + shipping + shipTax + adjustment);
  const total = Math.round(exact);
  return {
    number, date, expiry: (e.expiry_date ?? "").slice(0, 10) || null, mainNumber: String(e.estimate_number ?? ""), place: placeLabel(e.place_of_supply), taxMode,
    customer: { id: String(e.customer_id ?? ""), name: String(e.customer_name ?? "").trim(), gstin: String(e.gst_no ?? "").trim(), billing: addressLines(e.billing_address), shipping: addressLines(e.shipping_address) },
    lines, subTotal, discountPercent: round2(share * 100), discount, shipping, adjustment, adjustmentLabel: String(e.adjustment_description ?? "").trim() || "Adjustment",
    taxes: [...taxes].map(([label, amount]) => ({ label, amount: round2(amount) })), rounding: round2(total - exact), total,
  };
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const below100 = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ""}`);
const below1000 = (n: number) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : "", below100(n % 100)].filter(Boolean).join(" ");
/** "Indian Rupee Eighty-Six Thousand Five Hundred Thirty-One Only": lakh and crore, as Books prints it. */
export function amountInWords(amount: number): string {
  let n = Math.abs(Math.round(amount));
  if (!n) return "Indian Rupee Zero Only";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${crore < 1000 ? below1000(crore) : String(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (n) parts.push(below1000(n));
  return `Indian Rupee ${parts.join(" ")} Only`;
}

/** The sign-off, for now (owner, 5 Nov: the full signature comes later). */
export const TS_SIGN = `Warm regards,\n${TS.person}\n${TS.phone}\n${TS.name}`;

/** The same seven templates as the main quote, same ids, with their lines reworded. Editable on the Templates page ("ts:<id>"). */
export const TS_TEMPLATES: TextTemplate[] = [
  {
    id: "new", label: "New quotation",
    subject: `{what}: {ref}`,
    body: `{hi}\n\nThanks for your enquiry. I've attached our {ref}, with the details below.\n\n{table}\n\n{topics}\n\nIt comes to {total} with GST[, and these prices stay valid until {valid}]. Tell me if you'd like any quantities changed or anything added, and I'll send you an updated copy.\n\nI'll wait to hear from you.\n\n{sign}`,
  },
  {
    id: "call", label: "After our call / meeting",
    subject: `{what}, following our conversation: {ref}`,
    body: `{hi}\n\nGood talking to you today, and thanks for making the time. Here's {ref}, as we discussed.\n\n{table}\n\n{topics}\n\nIt comes to {total} with GST[, valid until {valid}]. If I've missed anything from our conversation, tell me and I'll correct it.\n\n{sign}`,
  },
  {
    id: "revised", label: "Revised quotation",
    subject: `Updated {ref}: {what}`,
    body: `{hi}\n\nI've made the changes we talked about. Here's the updated {ref}.\n\n{table}\n\n{topics}\n\nThe new total is {total} with GST[, valid until {valid}]. Please check it over, and we can move ahead once you're happy with it.\n\n{sign}`,
  },
  {
    id: "repeat", label: "Repeat order / replacement",
    subject: `{what}: {ref}`,
    body: `{hi}\n\nThanks for getting in touch again. I've attached {ref}.\n\n{table}\n\n{topics}\n\nIt comes to {total} with GST[, valid until {valid}]. As soon as you confirm, we'll arrange dispatch.\n\n{sign}`,
  },
  {
    id: "formal", label: "Formal (purchase / tender)",
    subject: `Supply of {what}: {ref}`,
    body: `Dear Sir / Madam,\n\nFurther to your enquiry, we enclose our {ref} for the items below.\n\n{table}\n\nThe total amount is {total} inclusive of GST.[ This quotation remains valid until {valid}.] Delivery, payment and other terms are set out in the quotation.\n\nWe await your purchase order, and are glad to answer any questions.\n\nYours faithfully,\n{signature}`,
  },
  {
    id: "short", label: "Short and simple",
    subject: `{what}: {ref}`,
    body: `{hi}\n\nAttached is {ref} for {what}. It comes to {total} with GST[, valid until {valid}].\n\n{table}\n\nAny questions, just ask.\n\n{sign}`,
  },
  {
    id: "reminder", label: "Gentle reminder (resend)",
    subject: `Checking in on {ref}: {what}`,
    body: `{hi}\n\nI wanted to check in about our {ref}. I've attached it again so it's easy to find.\n\n{table}\n\n{topics}\n\nIt comes to {total} with GST[, and these prices stay valid until {valid}]. If you need anything changed, such as quantities, models or delivery dates, tell me and I'll update it. I'm also happy to talk it through on a call.\n\n{sign}`,
  },
];

/** The email, from the same parts as the main quote's. */
export const buildTsEmail = (templateId: string, q: QuoteEmailInput, skip: TopicId[] = [], overrides: TemplateOverrides = {}) =>
  buildQuoteEmail(templateId, q, skip, { templates: TS_TEMPLATES, sign: TS_SIGN, key: "ts" }, overrides);
