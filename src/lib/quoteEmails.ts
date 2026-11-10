import { renderTemplate } from "./templateText";

/*
 * Quotation email templates (owner, 3 Nov: "make templates which we can select at the time of quotations … each
 * template should be dynamically changing … an aed template will have philips or zoll or defibtech … write humanized
 * templates … we want more flexible ones too").
 *
 * Two parts, mixed freely:
 * - a TEMPLATE (the tone: new quote, after a call, revised, repeat order, formal, short, reminder) — opening, closing,
 *   subject;
 * - TOPIC paragraphs, one per kind of item on the quote (AEDs, pads, fire, first aid, training …), picked from the
 *   items' Zoho identifier (and a few name checks where the identifiers are loose), each naming the actual items.
 * Everything is plain text with the quote's own names, numbers and dates filled in; the email step can still edit it.
 */

export type QuoteEmailLine = { name: string; qty: number; group: string | null; rate?: number; gst?: number | null }; // gst: the rate in %, null = unknown
export type QuoteEmailInput = {
  company: string;
  contact: string | null; // the first person it goes to
  number: string; // QT-…
  total: number; // incl. GST, Zoho's
  expiry: string | null; // YYYY-MM-DD
  salesperson: string | null;
  signer?: string | null; // who signs: the signed-in person; Admin has no name of their own, so the quote's Sales person signs
  lines: QuoteEmailLine[];
};

export type TopicId =
  | "aed" | "aedRental" | "aedPads" | "aedBattery" | "aedCabinet" | "aedSoftware" | "training" | "trainingKit"
  | "fire" | "fireBlanket" | "trauma" | "evacuation" | "ppe" | "security" | "road" | "pool" | "general";

const COMPANY = "Think Health Care and Safety";
const TABLE_MARK = "[[item table]]"; // stands for the table in the plain text until it becomes HTML

/** The team's own addresses: never saved as a customer's contact, they go in Cc (owner, 9 Nov). */
export const isTeamEmail = (email: string) => /@thinkhealth\.in$/i.test(email.trim());

/** On every quote email, whoever sends it (owner, 4 Nov). */
export const ALWAYS_CC = ["sales@thinkhealth.in", "sshah@thinkhealth.in"];
/** The Cc list as sent: the fixed two, then the others; each address once, and none that's already in To. */
export function mergeCc(to: string[], cc: string[]): string[] {
  const seen = new Set(to.map((m) => m.toLowerCase()));
  return [...ALWAYS_CC, ...cc].map((m) => m.toLowerCase()).filter((m) => !seen.has(m) && Boolean(seen.add(m)));
}

/**
 * The sign-off on every template (owner, 4 Nov, word for word: "include all this in all the templates"; then "if ashish
 * does it, then him, if pranjal does it then her, if sumit does it then his too"). Only the name line changes, plus
 * "Proprietor" for Sumit. Both contact lists are right as they are (owner, 4 Nov: 8007000884 and 8007700006).
 */
export const SIGNATURE_DETAILS = `THINK HEALTH CARE AND SAFETY
302 Rainbow plaza, Pimple Saudagar, Near Shivar Garden, Pune 411027
Contact: 9823101908 / 9356080806 / 8007000884
Email: sales@thinkhealth.in / sshah@thinkhealth.in

Contact Numbers:
9823101908/ 8007700006/ 9356080806

Website- www.thinkhealth.in
Company Profile- www.thinkhealth.in/Profile
View All Products- www.thinkhealth.in/Products
CPR AED FIRST AID Training- https://www.thinkhealth.in/trainings`;
/**
 * Each person's own signature (owner, 10 Nov: "lets do each person's signature", "yesyes" to the defaults): editable on the
 * Templates page as "sign:<first name>" ({name} = their name as the quote has it, {details} = the shared company block,
 * itself editable as "sign:details"). The built-in text is what every signature was before.
 */
export const SIGNERS = [
  { key: "ashish", label: "Ashish" }, { key: "shikha", label: "Shikha" }, { key: "sumit", label: "Sumit" },
  { key: "nikita", label: "Nikita" }, { key: "pranjal", label: "Pranjal" },
] as const;
export const SIGNATURE_VARS = ["name", "details"] as const;
export const signerKey = (person: string | null | undefined) => (person ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
export const builtinSignature = (key: string) => (key === "sumit" ? "{name}\nProprietor\n{details}" : "{name}\n{details}");
export function signature(person: string | null | undefined, overrides: TemplateOverrides = {}): string {
  const name = (person ?? "").trim();
  const details = overrides["sign:details"]?.body ?? SIGNATURE_DETAILS;
  const key = signerKey(name);
  if (!name || !SIGNERS.some((s) => s.key === key)) return [...(name ? [name] : []), details].join("\n");
  return renderTemplate(overrides[`sign:${key}`]?.body ?? builtinSignature(key), { name, details }).replace(/^\n+|\n+$/g, "");
}
/** The quote's signature: the person sending it, else its Sales person. */
export const quoteSignature = (q: Pick<QuoteEmailInput, "signer" | "salesperson">, overrides: TemplateOverrides = {}) => signature(q.signer || q.salesperson, overrides);

/** Which topic an item belongs to: a few name checks first (the identifiers are loose — "AED Trainer" sits under All AEDs). */
export function topicOf(name: string, group: string | null): TopicId {
  const n = name.toLowerCase();
  const g = (group ?? "").trim().toLowerCase();
  if (/smartx|management solution|subscription|licen[cs]e/.test(n)) return "aedSoftware";
  if (/\brent(al)?\b|on rent/.test(n) && /aed|defib/.test(n)) return "aedRental";
  if (/trainer|manikin|manequin|cpr (board|cube)|prestan|brayden/.test(n)) return "trainingKit";
  if (g === "training services" || /\btrainings?\b/.test(n)) return "training";
  if (g === "all aeds") return "aed";
  if (g === "aed pads") return "aedPads";
  if (g === "aed batteries") return "aedBattery";
  if (g === "aed cabinet" || g === "aed accessories") return "aedCabinet";
  // AED things filed under General Safety or with no identifier.
  if (g === "" || g === "general safety") {
    if (/\bpads?\b/.test(n) && /aed|defib|electrode/.test(n)) return "aedPads";
    if (/batter/.test(n) && /aed|defib|frx|hs1/.test(n)) return "aedBattery";
    if (/cabinet|signage/.test(n) && /aed/.test(n)) return "aedCabinet";
  }
  const byGroup: Record<string, TopicId> = {
    "training equipment": "trainingKit", "elan vital": "trainingKit",
    "fire safety": "fire", "fire blankets": "fireBlanket",
    "trauma supplies": "trauma", "trauma bag / kit / backpack": "trauma", "medical safety": "trauma",
    evacuation: "evacuation", ppe: "ppe", "security equipment": "security", "road safety": "road", "pool safety": "pool",
  };
  return byGroup[g] ?? "general";
}

/** "A", "A and B", "A, B and C", "A, B, C and 2 more" — each name once. */
export function listNames(names: string[], max = 3): string {
  const u = [...new Set(names.map((s) => s.trim()).filter(Boolean))];
  if (u.length <= 1) return u[0] ?? "";
  if (u.length > max + 1) return `${u.slice(0, max).join(", ")} and ${u.length - max} more`;
  return `${u.slice(0, -1).join(", ")} and ${u[u.length - 1]}`;
}

const BRANDS: [RegExp, string][] = [
  [/philips|heartstart|\bfrx\b|\bhs1\b/i, "Philips"], [/zoll/i, "Zoll"], [/defibt?e?ch/i, "Defibtech"],
  [/cardiac science|powerheart/i, "Cardiac Science"], [/mediana|heart ?on/i, "Mediana"], [/mindray/i, "Mindray"],
  [/schiller/i, "Schiller"], [/nihon kohden/i, "Nihon Kohden"], [/lifepak|physio/i, "Lifepak"], [/heartsine|stryker/i, "HeartSine"],
];
/** The AED makes on the quote ("Philips and Zoll"), from the item names. */
export function brandsOf(names: string[]): string[] {
  return [...new Set(names.flatMap((n) => BRANDS.filter(([re]) => re.test(n)).map(([, b]) => b)))];
}

/**
 * One paragraph per kind of item — the order here is the order in the email. `text` is the built-in wording, editable on
 * the Templates page (templateText.ts): {items} = the item names, {one|many} = by how many items it names.
 */
export const TOPICS: { id: TopicId; label: string; headline: (brands: string[]) => string; text: string }[] = [
  {
    id: "aed", label: "AEDs", headline: (b) => (b.length ? `${b.join(" / ")} AED` : "AED"),
    text: `The quotation is for the {items}. {It's an AED|These are} made for people with no medical background. Once the pads are on, it talks you through every step and only lets you give a shock if the heart actually needs one. With a cardiac arrest, the first few minutes decide everything, so having one close by really does save lives.`,
  },
  {
    id: "aedRental", label: "AED on rent", headline: () => "AED on rent",
    text: `I've included the {items}, which works well for events and short term needs. Once you confirm the dates, we'll share the delivery and collection details.`,
  },
  {
    id: "aedPads", label: "AED pads", headline: () => "AED pads",
    text: `I've added {items}. Pads can only be used once and have an expiry date, so it's worth checking the date on the ones in your AED today. Expired pads may not work when they're needed most.`,
  },
  {
    id: "aedBattery", label: "AED batteries", headline: () => "AED batteries",
    text: `The quotation also has {items}. A low battery is the most common reason an AED shows a warning during its daily check, so it's good to have a fresh one ready before it runs out.`,
  },
  {
    id: "aedCabinet", label: "AED cabinets & accessories", headline: () => "AED accessories",
    text: `To keep the AED protected and easy to spot, I've included {items}. A clearly marked place means anyone can find it quickly, even someone new to the building.`,
  },
  {
    id: "aedSoftware", label: "AED tracking (AEDSmartX)", headline: () => "AED tracking",
    text: `I've also included {items}, so you can keep an eye on every AED's pads, battery and daily checks in one place, with a reminder well before anything expires.`,
  },
  {
    id: "training", label: "Training", headline: () => "training",
    text: `The quotation covers {items}. Our sessions are practical: everyone practises on manikins instead of just watching slides, so people leave feeling they can actually act in a real emergency. Once you confirm, we'll fix a date that suits your team.`,
  },
  {
    id: "trainingKit", label: "Training equipment", headline: () => "training equipment",
    text: `For practice, I've added {items}. Regular practice is what keeps CPR skills fresh, and {this makes|these make} it easy to run refreshers yourselves.`,
  },
  {
    id: "fire", label: "Fire safety", headline: () => "fire safety equipment",
    text: `On the fire safety side, the quotation covers {items}. These are what make the first few minutes of a fire manageable, before it has a chance to spread.`,
  },
  {
    id: "fireBlanket", label: "Fire blankets (vehicle / battery)", headline: () => "fire blankets",
    text: `The {items} {is|are} made for vehicle and battery fires, which are very hard to put out with a regular extinguisher. A blanket smothers the fire and stops it spreading to the cars parked next to it. That's especially useful wherever EVs are parked or charged.`,
  },
  {
    id: "trauma", label: "First aid & trauma", headline: () => "first aid supplies",
    text: `For first aid, I've included {items}. They're chosen for the injuries that actually happen at work, such as cuts, burns, sprains and heavy bleeding, so your first aiders have the right things at hand.`,
  },
  {
    id: "evacuation", label: "Evacuation & stretchers", headline: () => "evacuation equipment",
    text: `For moving an injured person safely, the quotation has {items}. Getting someone down the stairs or out of a building without making the injury worse needs the right equipment, and {this is|these are} built for exactly that.`,
  },
  {
    id: "ppe", label: "PPE", headline: () => "PPE",
    text: `For personal protection, I've added {items}, so your team is covered for everyday work as well as emergencies.`,
  },
  {
    id: "security", label: "Security", headline: () => "security equipment",
    text: `On security, the quotation covers {items}. Happy to suggest quantities or placement if you tell me a little more about your site.`,
  },
  {
    id: "road", label: "Road safety", headline: () => "road safety equipment",
    text: `For road and traffic safety, I've included {items}, useful for marking hazards and keeping vehicles and people apart on site.`,
  },
  {
    id: "pool", label: "Pool safety", headline: () => "pool safety equipment",
    text: `For the pool area, the quotation has {items}. Lifesaving equipment kept right at the poolside makes a real difference in the first moments of a water emergency.`,
  },
  {
    id: "general", label: "Other items (with other kinds of item)", headline: () => "safety equipment",
    text: `The quotation also includes {items}.`,
  },
];

/** Two more paragraphs, each editable on its own: they depend on what else is on the quote. */
export const TOPIC_EXTRAS = [
  { id: "aedTraining", label: "AEDs: training offer (when the quote has no training)", text: `If it helps, we can also train your team on CPR and using the AED, and suggest where to place it so it can be reached within a couple of minutes from anywhere on site.` },
  { id: "generalOnly", label: "Other items (when that's all the quote has)", text: `The quotation covers {items}.` },
] as const;
type TopicTextId = TopicId | (typeof TOPIC_EXTRAS)[number]["id"];

/** The topics on this quote, in email order, with their item names. */
export function topicsOf(lines: QuoteEmailLine[]): { id: TopicId; label: string; names: string[] }[] {
  const by = new Map<TopicId, string[]>();
  for (const l of lines) {
    const t = topicOf(l.name, l.group);
    by.set(t, [...(by.get(t) ?? []), l.name]);
  }
  return TOPICS.filter((t) => by.has(t.id)).map((t) => ({ id: t.id, label: t.label, names: by.get(t.id)! }));
}

const inr = (v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const day = (iso: string | null) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};
const firstName = (s: string | null) => (s ?? "").trim().replace(/^(mr|mrs|ms|miss|dr|shri|smt)\.?\s+/i, "").split(/\s+/)[0] ?? "";

/** The values a template's {placeholders} take (Templates page: the chips; saving refuses any other). */
export const TEMPLATE_VARS = ["hi", "ref", "what", "total", "valid", "table", "topics", "sign", "signature", "company", "number"] as const;
export const TOPIC_VARS = ["items"] as const;
export type Parts = Record<(typeof TEMPLATE_VARS)[number], string>;
/** A template: the tone. Subject and body are text with {placeholders} (templateText.ts); the built-in wording is here. */
export type TextTemplate = { id: string; label: string; subject: string; body: string };
export const TEMPLATES: TextTemplate[] = [
  {
    id: "new", label: "New quotation",
    subject: `{ref}: {what}`,
    body: `{hi}\n\nThank you for reaching out to us. Please find attached our {ref}.\n\n{table}\n\n{topics}\n\nThe total comes to {total} including GST[, and the prices hold until {valid}]. If you'd like to change quantities or add anything, just reply to this email and I'll send a revised quote right away.\n\nLooking forward to hearing from you.\n\n{sign}`,
  },
  {
    id: "call", label: "After our call / meeting",
    subject: `{ref}: {what}, as discussed`,
    body: `{hi}\n\nThank you for your time today. It was good speaking with you. As discussed, I've attached {ref}.\n\n{table}\n\n{topics}\n\nThe total comes to {total} including GST[, valid until {valid}]. If anything we spoke about isn't reflected here, let me know and I'll update it straight away.\n\n{sign}`,
  },
  {
    id: "revised", label: "Revised quotation",
    subject: `Revised {ref}: {what}`,
    body: `{hi}\n\nAs discussed, here's the revised {ref} with the changes we talked about.\n\n{table}\n\n{topics}\n\nThe revised total is {total} including GST[, valid until {valid}]. Do have a look, and if everything's in order we can go ahead whenever you're ready.\n\n{sign}`,
  },
  {
    id: "repeat", label: "Repeat order / replacement",
    subject: `{ref}: {what}`,
    body: `{hi}\n\nThank you for coming back to us. It's always good to hear from you. Please find attached {ref}.\n\n{table}\n\n{topics}\n\nThe total is {total} including GST[, valid until {valid}]. Once you confirm, we'll dispatch at the earliest.\n\n{sign}`,
  },
  {
    id: "formal", label: "Formal (purchase / tender)",
    subject: `{ref} for the supply of {what}`,
    body: `Dear Sir / Madam,\n\nWith reference to your enquiry, please find attached our {ref} for the following:\n\n{table}\n\nThe total amount is {total} inclusive of GST.[ The quotation is valid until {valid}.] Delivery, payment and other terms are as stated in the quotation.\n\nWe look forward to your purchase order. Please feel free to contact us for any clarification.\n\nYours sincerely,\n{signature}`,
  },
  {
    id: "short", label: "Short and simple",
    subject: `{ref}: {what}`,
    body: `{hi}\n\nPlease find attached {ref} for {what}. The total is {total} including GST[, valid until {valid}].\n\n{table}\n\nLet me know if you have any questions.\n\n{sign}`,
  },
  {
    id: "reminder", label: "Gentle reminder (resend)",
    subject: `Following up on {ref}: {what}`,
    body: `{hi}\n\nI'm following up on our {ref}, attached again here for easy reference.\n\n{table}\n\n{topics}\n\nThe total is {total} including GST[, and the prices hold until {valid}]. If anything needs changing, whether quantities, models or delivery dates, just let me know and I'll update it. Happy to get on a quick call too.\n\n{sign}`,
  },
];

/** Repeat order when the quote is only pads / batteries; otherwise a new quotation. */
export function suggestTemplate(lines: QuoteEmailLine[]): string {
  const ids = topicsOf(lines).map((t) => t.id);
  return ids.length && ids.every((t) => t === "aedPads" || t === "aedBattery") ? "repeat" : "new";
}

/**
 * The saved wording from the Templates page, by key: "quote:<id>" / "ts:<id>" (subject + body), "topic:<id>" (body).
 * Only the ones someone changed are here; the rest use the built-in text above.
 */
export type TemplateOverrides = Record<string, { subject?: string; body: string }>;

/** The email: subject, plain text without the table, HTML with it. `skip` = topic paragraphs switched off. */
export function buildQuoteEmail(templateId: string, q: QuoteEmailInput, skip: TopicId[] = [], brand?: { templates: TextTemplate[]; sign: string; key: string }, overrides: TemplateOverrides = {}): { subject: string; text: string; html: string } {
  const templates = brand?.templates ?? TEMPLATES;
  const tpl = templates.find((t) => t.id === templateId) ?? templates[0];
  const saved = overrides[`${brand?.key ?? "quote"}:${tpl.id}`];
  const topicText = (id: TopicTextId) => overrides[`topic:${id}`]?.body ?? (TOPICS.find((x) => x.id === id) ?? TOPIC_EXTRAS.find((x) => x.id === id))!.text;
  const topics = topicsOf(q.lines);
  const has = new Set(topics.map((t) => t.id));
  const on = topics.filter((t) => !skip.includes(t.id));
  const aedBrands = brandsOf(topics.find((t) => t.id === "aed")?.names ?? []);
  // The subject's "what": the first two kinds of item ("Zoll AED + training").
  // With an AED on it, its pads / cabinet / tracking don't need naming too ("Zoll AED + training", not "+ AED accessories").
  const AED_EXTRAS: TopicId[] = ["aedPads", "aedBattery", "aedCabinet", "aedSoftware"];
  const heads = [...new Set(topics.filter((t) => !(has.has("aed") && AED_EXTRAS.includes(t.id))).map((t) => TOPICS.find((x) => x.id === t.id)!.headline(aedBrands)))];
  const what = heads.length ? heads.slice(0, 2).join(" + ") : "your requirement";
  const name = firstName(q.contact);
  const paragraph = (t: { id: TopicId; names: string[] }) => {
    const id: TopicTextId = t.id === "general" && has.size <= 1 ? "generalOnly" : t.id;
    const text = renderTemplate(topicText(id), { items: listNames(t.names) }, new Set(t.names).size > 1);
    return t.id === "aed" && !has.has("training") ? `${text}\n\n${topicText("aedTraining")}` : text;
  };
  const sign = brand?.sign ?? `Warm regards,\n${quoteSignature(q, overrides)}`;
  const p: Parts = {
    hi: name ? `Hi ${name},` : "Hello,",
    // Zoho's numbers already say it ("Quotation-24-002753" — owner's test, 4 Nov: "Quotation Quotation-24-…").
    ref: `${/^quotation/i.test(q.number) ? q.number : `Quotation ${q.number}`} for ${q.company}`,
    what,
    total: inr(q.total),
    valid: day(q.expiry),
    sign,
    signature: sign.split("\n").slice(1).join("\n"), // without the "Warm regards," line (the formal template signs off itself)
    company: q.company,
    number: q.number,
    topics: on.map(paragraph).join("\n\n"),
    table: q.lines.length ? TABLE_MARK : "",
  };
  // A template whose topic part ended up empty (all switched off) shouldn't leave a gap.
  const text = renderTemplate(saved?.body ?? tpl.body, p).replace(/\n{3,}/g, "\n\n");
  return {
    subject: renderTemplate(saved?.subject ?? tpl.subject, p).replace(/\s+/g, " ").trim(),
    text: text.replace(`${TABLE_MARK}\n\n`, ""),
    html: textToHtml(text).replace(`<p style="margin:0 0 1em">${TABLE_MARK}</p>`, () => itemTable(q.lines, q.total)),
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Plain text → the email step's HTML (paragraphs, line breaks, escaped). */
export function textToHtml(text: string): string {
  // The signature's web addresses are clickable.
  const links = (s: string) => s.replace(/https?:\/\/[^\s<]+|www\.[^\s<]+/g, (u) => `<a href="${u.startsWith("www.") ? `https://${u}` : u}">${u}</a>`);
  return text.split(/\n{2,}/).map((para) => `<p style="margin:0 0 1em">${links(esc(para)).replace(/\n/g, "<br>")}</p>`).join("");
}

/** The quantity × price + GST of one line; a line with unknown GST adds none. */
const lineTotal = (l: QuoteEmailLine) => l.qty * (l.rate ?? 0) * (1 + (l.gst ?? 0) / 100);

/**
 * The item table (owner, 4 Nov): Item name, Unit price, Quantity, GST, Total price, then Zoho's grand total. When the lines
 * don't reach that total (a discount, shipping, an adjustment) one more row shows the difference, so the table adds up.
 * Inline styles only, or mail clients drop them. No colours except the rules: the text takes the email's and the message box's.
 */
export function itemTable(lines: QuoteEmailLine[], total: number): string {
  const rule = "border-bottom:1px solid #bbbbbb";
  const cell = (v: string, right = false) => `<td style="padding:6px 8px;${rule};text-align:${right ? "right;white-space:nowrap" : "left"}">${v}</td>`;
  const head = (v: string, right = false) => `<th style="padding:6px 8px;border-bottom:2px solid #888888;font-weight:bold;text-align:${right ? "right" : "left"}">${v}</th>`;
  const span = (label: string, v: string, bold = false) => {
    const weight = bold ? "font-weight:bold;" : "";
    return `<tr><td colspan="4" style="padding:6px 8px;${rule};${weight}text-align:right">${label}</td><td style="padding:6px 8px;${rule};${weight}text-align:right;white-space:nowrap">${v}</td></tr>`;
  };
  const rows = lines.map((l) => `<tr>${cell(esc(l.name))}${cell(inr(l.rate ?? 0), true)}${cell(String(l.qty), true)}${cell(l.gst == null ? "—" : `${l.gst}%`, true)}${cell(inr(lineTotal(l)), true)}</tr>`);
  const diff = total - lines.reduce((n, l) => n + lineTotal(l), 0);
  const extra = Math.abs(diff) > 1 ? span("Discount / shipping / adjustment", `${diff < 0 ? "−" : ""}${inr(Math.abs(diff))}`) : "";
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:680px;margin:0 0 1em"><thead><tr>${head("Item name")}${head("Unit price", true)}${head("Quantity", true)}${head("GST", true)}${head("Total price", true)}</tr></thead><tbody>${rows.join("")}${extra}${span("Total", inr(total), true)}</tbody></table>`;
}

/**
 * Zia's words as the email (owner, 4 Nov: Zia's emails get the same table, so Zia never has to get the numbers right): the text,
 * the table, then the sign-off and the sender's signature. Zia is told to end on "Warm regards,", which moves below the table.
 */
export function ziaEmailHtml(text: string, q: QuoteEmailInput, overrides: TemplateOverrides = {}): string {
  const t = text.trim();
  const end = t.match(/\n+((?:warm |best |kind )?regards,?|yours sincerely,?|thank you,?|thanks,?)$/i);
  const words = end ? t.slice(0, -end[0].length) : t;
  const table = q.lines.length ? itemTable(q.lines, q.total) : "";
  return `${textToHtml(words)}${table}${textToHtml(`${end?.[1] ?? "Warm regards,"}\n${quoteSignature(q, overrides)}`)}`;
}

/* Zia (owner, 3 Nov): Zoho Mail's Zia writes the email — the dashboard leaves this brief as a draft in Zoho Mail. */
export const ZIA_MAILBOX = "learn@thinkhealth.in"; // owner's pick, 3 Nov (an alias on Shikha's mailbox)
export const ziaSubject = (q: Pick<QuoteEmailInput, "number" | "company">) => `Zia · ${q.number} · ${q.company}`;

/** The draft's subject and HTML: what to write (the person's words) and everything Zia needs from the quote. */
export function ziaBrief(request: string, q: QuoteEmailInput): { subject: string; html: string } {
  return { subject: ziaSubject(q), html: textToHtml(ziaPrompt(request, q, "Zia: write a quotation email from the details below. Keep only the email (delete this note).")) };
}

/**
 * The same brief as one instruction — what Zoho Flow hands to Zia (owner, 3 Nov: "it has her do it anyway without
 * needing me to open zoho mail"). Asks for the email only, so what comes back can go straight in the message box.
 */
export function ziaPrompt(request: string, q: QuoteEmailInput, head = "Write a quotation email to a customer from the details below. Reply with the email only: first line \"Subject: …\", then the email, starting with the greeting and ending with the line \"Warm regards,\". No name or signature after it, that is added automatically. Don't write a table or a price list either: a table of the items with their prices is added automatically. Don't use dashes or hyphens between words or phrases: use full stops and commas."): string {
  const valid = day(q.expiry);
  return [
    head,
    `What to write: ${request.trim() || "a warm, friendly quotation email"}`,
    [
      `Customer: ${q.company}`,
      q.contact ? `Addressed to: ${q.contact}` : "",
      `Quotation: ${q.number} (the PDF is attached separately)`,
      "Items:",
      ...q.lines.map((l) => `• ${l.name} × ${l.qty}`),
      `Total: ${inr(q.total)} including GST`,
      valid ? `Valid until: ${valid}` : "",
      `From: ${q.salesperson?.trim() || "the team"}, ${COMPANY}`,
    ].filter(Boolean).join("\n"),
    "Tone: human and warm, short paragraphs, no placeholders in square brackets.",
  ].join("\n\n");
}

/** What Zia sent back → subject (from a "Subject:" first line, if any) and the email's text. */
export function splitZiaReply(raw: string): { subject: string | null; text: string } {
  const t = raw.replace(/\r\n/g, "\n").trim();
  const m = t.match(/^\**\s*subject\s*:\**\s*(.+)\n+/i);
  return m ? { subject: m[1].trim().replace(/\*+$/, "").trim(), text: t.slice(m[0].length).trim() } : { subject: null, text: t };
}
