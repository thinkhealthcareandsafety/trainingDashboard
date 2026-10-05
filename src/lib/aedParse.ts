import type { AedInvoice, AedLine } from "./types";

// Reads the AED line of an invoice: Zoho has no fields for these, they're typed into the item description in
// many ways ("SN : B26H-01596", "S. No: X26D019801", "S/n : … 1 No", "Battery Install By 30-11-2031",
// "CPR D Pads: 20/09/2031", "(2025 make)", …). Patterns below were built from the real invoices.

export interface AedDetails {
  name: string; // the AED item, as on the invoice
  model?: string; // Brand · Model · Model number, when the description lists them
  qty: number;
  year?: string;
  serials: string[];
  batteryExpiry: string[]; // YYYY-MM-DD, distinct (a batch can carry two)
  padsExpiry: string[];
}

export type AedExtraKey = "smartx" | "frk" | "cabinet" | "signage" | "childKey";
export interface AedExtra {
  key: AedExtraKey;
  label: string;
  found: string[]; // where it was found: "AED description" and/or the item name
}

const DATE = String.raw`(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})`;

/** "24-10-2028", "20/09/2031", "2031-12-31" → "YYYY-MM-DD" (day first unless the year leads). */
export function normDate(s: string): string | undefined {
  const p = s.split(/[-/.]/).map((x) => x.trim());
  const [y, m, d] = p[0].length === 4 ? [p[0], p[1], p[2]] : [p[2], p[1], p[0]];
  const mm = Number(m);
  const dd = Number(d);
  if (!(mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31)) return undefined;
  return `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

const distinct = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))];

function datesAfter(text: string, label: RegExp): string[] {
  const re = new RegExp(`${label.source}[^0-9\\n]{0,40}?${DATE}`, "gi");
  return distinct([...text.matchAll(re)].map((m) => normDate(m[m.length - 1])));
}

// Serial labels: SN / SN. / S. No / S No / Sno / S/N / S/n, optionally "AED SN"; not battery serials ("DBP 2800 SN").
const SN_LABEL = /(?:^|[\s(,;])(?:AED\s+)?(?:S\s*\/\s*N|S\s*\.\s*No|S\s+No|Sno|SN)\b\.?\s*[:.\-]?\s*/i;
const SERIAL = /\b[A-Z]{1,6}\d{0,4}[A-Z]?-[A-Z0-9]{3,}\b|\b[A-Z]{0,3}\d[A-Z0-9]{5,}\b/gi;

function serialsOf(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = SN_LABEL.exec(line);
    if (!m) continue;
    const before = line.slice(0, m.index);
    if (/dbp|batter/i.test(before)) continue; // battery pack serials, not the AED
    // Stop at the next field on the same line ("SN: B26H-00989 Pads Expiry: …").
    const rest = line.slice(m.index + m[0].length).split(/\b(?:pads?|batter\w*|lot|exp\w*|ref)\b|\(/i)[0];
    for (const s of rest.match(SERIAL) ?? []) if (/\d/.test(s) && !/^20\d{2}$/.test(s)) out.push(s.toUpperCase());
  }
  return distinct(out);
}

function yearOf(text: string): string | undefined {
  const patterns = [
    /year\s*of\s*manufactur\w*\s*[:\-–]?\s*(20\d{2})/i,
    /manufactur\w*\s*year\s*[:\-–]?\s*(20\d{2})/i,
    /\b(20\d{2})\s*make\b/i,
    /\bmfg\.?\s*(?:year|date)?\s*[:\-]?\s*(20\d{2})/i,
  ];
  for (const p of patterns) {
    const m = p.exec(text);
    if (m) return m[1];
  }
  return undefined;
}

function modelOf(text: string): string | undefined {
  const brand = /^\s*brand\s*:\s*(.+)$/im.exec(text)?.[1].trim();
  const model = /^\s*model\s*:\s*(.+)$/im.exec(text)?.[1].trim();
  const number = /^\s*model\s*number\s*:\s*(.+)$/im.exec(text)?.[1].trim();
  const parts = distinct([brand, model, number]);
  return parts.length ? parts.join(" · ") : undefined;
}

export function parseAedLine(line: AedLine): AedDetails {
  const d = line.description ?? "";
  return {
    name: line.name,
    model: modelOf(d),
    qty: line.qty,
    year: yearOf(d),
    serials: serialsOf(d),
    batteryExpiry: distinct([...datesAfter(d, /batter(?:y|ies)\b/), ...datesAfter(d, /\bDBP\b[^\n]*?exp\w*/)]),
    padsExpiry: datesAfter(d, /\bpads?\b/),
  };
}

const EXTRAS: { key: AedExtraKey; label: string; re: RegExp }[] = [
  { key: "smartx", label: "AED SmartX subscription / software", re: /smart\s*-?\s*x/i },
  { key: "frk", label: "Fast Response Kit", re: /fast\s*response/i },
  { key: "cabinet", label: "AED wall cabinet", re: /(?:wall|compact|aed)[^\n]{0,25}cabinet|cabinet[^\n]{0,25}(?:aed|alarm)/i },
  { key: "signage", label: "3D AED signage", re: /3\s*d[^\n]{0,15}sign|aed[^\n]{0,15}sign(?:age)?\b|sign(?:age)?[^\n]{0,10}aed/i },
  { key: "childKey", label: "Infant / child key", re: /(?:infant|child)[\s/&-]*(?:child\s*)?key/i },
];

/** Optional extras: ticked when the AED description mentions them or they're sold as separate items on the invoice. */
export function aedExtras(inv: Pick<AedInvoice, "aedLines" | "otherLines">): AedExtra[] {
  const aedText = inv.aedLines.map((l) => l.description).join("\n");
  return EXTRAS.map(({ key, label, re }) => ({
    key,
    label,
    found: distinct([
      // A combined item (e.g. "Philips FRX AED 861304 with Child Key") includes the extra in its name.
      ...inv.aedLines.filter((l) => re.test(l.name)).map((l) => `included in ${l.name}`),
      re.test(aedText) ? "AED description" : undefined,
      ...inv.otherLines.filter((l) => re.test(`${l.name}\n${l.description}`)).map((l) => l.name),
    ]),
  }));
}
