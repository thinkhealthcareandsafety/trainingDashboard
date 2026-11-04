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

export type QuoteEmailLine = { name: string; qty: number; group: string | null };
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
const SIGNATURE_DETAILS = `THINK HEALTH CARE AND SAFETY
302 Rainbow plaza, Pimple Saudagar, Near Shivar Garden, Pune 411027
Contact: 9823101908 / 9356080806 / 8007000884
Email: sales@thinkhealth.in / sshah@thinkhealth.in

Contact Numbers:
9823101908/ 8007700006/ 9356080806

Website- www.thinkhealth.in
Company Profile- www.thinkhealth.in/Profile
View All Products- www.thinkhealth.in/Products
CPR AED FIRST AID Training- https://www.thinkhealth.in/trainings`;
export function signature(person: string | null | undefined): string {
  const name = (person ?? "").trim();
  return [...(name ? [name] : []), ...(/^sumit\b/i.test(name) ? ["Proprietor"] : []), SIGNATURE_DETAILS].join("\n");
}
/** The quote's signature: the person sending it, else its Sales person. */
export const quoteSignature = (q: Pick<QuoteEmailInput, "signer" | "salesperson">) => signature(q.signer || q.salesperson);

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

type Ctx = { names: string; many: boolean; has: Set<TopicId> };
/** One paragraph per kind of item — the order here is the order in the email. */
export const TOPICS: { id: TopicId; label: string; headline: (brands: string[]) => string; text: (c: Ctx) => string }[] = [
  {
    id: "aed", label: "AEDs", headline: (b) => (b.length ? `${b.join(" / ")} AED` : "AED"),
    text: (c) => `The quotation is for the ${c.names}. ${c.many ? "These are" : "It's an AED"} made for people with no medical background — once the pads are on, it talks you through every step and only lets you give a shock if the heart actually needs one. With a cardiac arrest, the first few minutes decide everything, so having one close by really does save lives.`
      + (c.has.has("training") ? "" : `\n\nIf it helps, we can also train your team on CPR and using the AED, and suggest where to place it so it can be reached within a couple of minutes from anywhere on site.`),
  },
  {
    id: "aedRental", label: "AED on rent", headline: () => "AED on rent",
    text: (c) => `I've included the ${c.names}, which works well for events and short-term needs. Once you confirm the dates, we'll share the delivery and pick-up details.`,
  },
  {
    id: "aedPads", label: "AED pads", headline: () => "AED pads",
    text: (c) => `I've added ${c.names}. Pads are single-use and have an expiry date, so it's worth checking the date on the ones in your AED today — expired pads may not work when they're needed most.`,
  },
  {
    id: "aedBattery", label: "AED batteries", headline: () => "AED batteries",
    text: (c) => `The quotation also has ${c.names}. A low battery is the most common reason an AED shows a warning on its daily self-check, so it's good to have a fresh one ready before it runs out.`,
  },
  {
    id: "aedCabinet", label: "AED cabinets & accessories", headline: () => "AED accessories",
    text: (c) => `To keep the AED protected and easy to spot, I've included ${c.names}. A clearly marked place means anyone can find it quickly, even someone new to the building.`,
  },
  {
    id: "aedSoftware", label: "AED tracking (AEDSmartX)", headline: () => "AED tracking",
    text: (c) => `I've also included ${c.names}, so you can keep an eye on every AED's pads, battery and self-checks in one place, with a reminder well before anything expires.`,
  },
  {
    id: "training", label: "Training", headline: () => "training",
    text: (c) => `The quotation covers ${c.names}. Our sessions are hands-on — everyone practises on manikins instead of just watching slides — so people leave feeling they can actually act in a real emergency. Once you confirm, we'll fix a date that suits your team.`,
  },
  {
    id: "trainingKit", label: "Training equipment", headline: () => "training equipment",
    text: (c) => `For practice, I've added ${c.names}. Regular hands-on practice is what keeps CPR skills fresh, and ${c.many ? "these make" : "this makes"} it easy to run refreshers in-house.`,
  },
  {
    id: "fire", label: "Fire safety", headline: () => "fire safety equipment",
    text: (c) => `On the fire safety side, the quotation covers ${c.names}. These are what make the first few minutes of a fire manageable, before it has a chance to spread.`,
  },
  {
    id: "fireBlanket", label: "Fire blankets (vehicle / battery)", headline: () => "fire blankets",
    text: (c) => `The ${c.names} ${c.many ? "are" : "is"} made for vehicle and battery fires, which are very hard to put out with a regular extinguisher. A blanket smothers the fire and stops it spreading to the cars parked next to it — especially useful wherever EVs are parked or charged.`,
  },
  {
    id: "trauma", label: "First aid & trauma", headline: () => "first aid supplies",
    text: (c) => `For first aid, I've included ${c.names}. They're chosen for the injuries that actually happen at work — cuts, burns, sprains and heavy bleeding — so your first aiders have the right things at hand.`,
  },
  {
    id: "evacuation", label: "Evacuation & stretchers", headline: () => "evacuation equipment",
    text: (c) => `For moving an injured person safely, the quotation has ${c.names}. Getting someone down the stairs or out of a building without making the injury worse needs the right equipment, and ${c.many ? "these are" : "this is"} built for exactly that.`,
  },
  {
    id: "ppe", label: "PPE", headline: () => "PPE",
    text: (c) => `For personal protection, I've added ${c.names}, so your team is covered for everyday work as well as emergencies.`,
  },
  {
    id: "security", label: "Security", headline: () => "security equipment",
    text: (c) => `On security, the quotation covers ${c.names}. Happy to suggest quantities or placement if you tell me a little more about your site.`,
  },
  {
    id: "road", label: "Road safety", headline: () => "road safety equipment",
    text: (c) => `For road and traffic safety, I've included ${c.names} — useful for marking hazards and keeping vehicles and people apart on site.`,
  },
  {
    id: "pool", label: "Pool safety", headline: () => "pool safety equipment",
    text: (c) => `For the pool area, the quotation has ${c.names}. Lifesaving equipment kept right at the poolside makes a real difference in the first moments of a water emergency.`,
  },
  {
    id: "general", label: "Other items", headline: () => "safety equipment",
    text: (c) => (c.has.size > 1 ? `The quotation also includes ${c.names}.` : `The quotation covers ${c.names}.`),
  },
];

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

type Parts = { hi: string; ref: string; what: string; total: string; valid: string; sign: string; topics: string; list: string };
/** The templates (the tone); each gets the filled-in parts and the topic paragraphs. */
export const TEMPLATES: { id: string; label: string; subject: (p: Parts) => string; body: (p: Parts) => string }[] = [
  {
    id: "new", label: "New quotation",
    subject: (p) => `${p.ref} – ${p.what}`,
    body: (p) => `${p.hi}\n\nThank you for reaching out to us. Please find attached our ${p.ref}.\n\n${p.topics}\n\nThe total comes to ${p.total} including GST${p.valid ? `, and the prices hold until ${p.valid}` : ""}. If you'd like to change quantities or add anything, just reply to this email and I'll send a revised quote right away.\n\nLooking forward to hearing from you.\n\n${p.sign}`,
  },
  {
    id: "call", label: "After our call / meeting",
    subject: (p) => `${p.ref} – ${p.what}, as discussed`,
    body: (p) => `${p.hi}\n\nThank you for your time today — it was good speaking with you. As discussed, I've attached ${p.ref}.\n\n${p.topics}\n\nThe total comes to ${p.total} including GST${p.valid ? `, valid until ${p.valid}` : ""}. If anything we spoke about isn't reflected here, let me know and I'll update it straight away.\n\n${p.sign}`,
  },
  {
    id: "revised", label: "Revised quotation",
    subject: (p) => `Revised ${p.ref} – ${p.what}`,
    body: (p) => `${p.hi}\n\nAs discussed, here's the revised ${p.ref} with the changes we talked about.\n\n${p.topics}\n\nThe revised total is ${p.total} including GST${p.valid ? `, valid until ${p.valid}` : ""}. Do have a look, and if everything's in order we can go ahead whenever you're ready.\n\n${p.sign}`,
  },
  {
    id: "repeat", label: "Repeat order / replacement",
    subject: (p) => `${p.ref} – ${p.what}`,
    body: (p) => `${p.hi}\n\nThank you for coming back to us — it's always good to hear from you. Please find attached ${p.ref}.\n\n${p.topics}\n\nThe total is ${p.total} including GST${p.valid ? `, valid until ${p.valid}` : ""}. Once you confirm, we'll dispatch at the earliest.\n\n${p.sign}`,
  },
  {
    id: "formal", label: "Formal (purchase / tender)",
    subject: (p) => `${p.ref} for the supply of ${p.what}`,
    body: (p) => `Dear Sir / Madam,\n\nWith reference to your enquiry, please find attached our ${p.ref} for the following:\n\n${p.list}\n\nThe total amount is ${p.total} inclusive of GST.${p.valid ? ` The quotation is valid until ${p.valid}.` : ""} Delivery, payment and other terms are as stated in the quotation.\n\nWe look forward to your purchase order. Please feel free to contact us for any clarification.\n\nYours sincerely,\n${p.sign.split("\n").slice(1).join("\n")}`,
  },
  {
    id: "short", label: "Short and simple",
    subject: (p) => `${p.ref} – ${p.what}`,
    body: (p) => `${p.hi}\n\nPlease find attached ${p.ref} for ${p.what}. The total is ${p.total} including GST${p.valid ? `, valid until ${p.valid}` : ""}.\n\nLet me know if you have any questions.\n\n${p.sign}`,
  },
  {
    id: "reminder", label: "Gentle reminder (resend)",
    subject: (p) => `Following up: ${p.ref} – ${p.what}`,
    body: (p) => `${p.hi}\n\nI'm following up on our ${p.ref}, attached again here for easy reference.\n\n${p.topics}\n\nThe total is ${p.total} including GST${p.valid ? `, and the prices hold until ${p.valid}` : ""}. If anything needs changing — quantities, models or delivery dates — just let me know and I'll update it. Happy to get on a quick call too.\n\n${p.sign}`,
  },
];

/** Repeat order when the quote is only pads / batteries; otherwise a new quotation. */
export function suggestTemplate(lines: QuoteEmailLine[]): string {
  const ids = topicsOf(lines).map((t) => t.id);
  return ids.length && ids.every((t) => t === "aedPads" || t === "aedBattery") ? "repeat" : "new";
}

/** The email: subject + plain text (paragraphs between blank lines). `skip` = topic paragraphs switched off. */
export function buildQuoteEmail(templateId: string, q: QuoteEmailInput, skip: TopicId[] = []): { subject: string; text: string } {
  const tpl = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
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
  const p: Parts = {
    hi: name ? `Hi ${name},` : "Hello,",
    // Zoho's numbers already say it ("Quotation-24-002753" — owner's test, 4 Nov: "Quotation Quotation-24-…").
    ref: `${/^quotation/i.test(q.number) ? q.number : `Quotation ${q.number}`} for ${q.company}`,
    what,
    total: inr(q.total),
    valid: day(q.expiry),
    sign: `Warm regards,\n${quoteSignature(q)}`,
    topics: on.map((t) => TOPICS.find((x) => x.id === t.id)!.text({ names: listNames(t.names), many: new Set(t.names).size > 1, has })).join("\n\n"),
    list: q.lines.map((l) => `• ${l.name} — ${l.qty} ${l.qty === 1 ? "no." : "nos."}`).join("\n"),
  };
  // A template whose topic part ended up empty (all switched off) shouldn't leave a gap.
  const text = tpl.body(p).replace(/\n{3,}/g, "\n\n");
  return { subject: tpl.subject(p), text };
}

/** Plain text → the email step's HTML (paragraphs, line breaks, escaped). */
export function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // The signature's web addresses are clickable.
  const links = (s: string) => s.replace(/https?:\/\/[^\s<]+|www\.[^\s<]+/g, (u) => `<a href="${u.startsWith("www.") ? `https://${u}` : u}">${u}</a>`);
  return text.split(/\n{2,}/).map((para) => `<p style="margin:0 0 1em">${links(esc(para)).replace(/\n/g, "<br>")}</p>`).join("");
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
export function ziaPrompt(request: string, q: QuoteEmailInput, head = "Write a quotation email to a customer from the details below. Reply with the email only: first line \"Subject: …\", then the email, starting with the greeting and ending with the line \"Warm regards,\" — no name or signature after it, that is added automatically."): string {
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
