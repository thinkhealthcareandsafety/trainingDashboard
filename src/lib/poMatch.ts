/*
 * Which PO PDF belongs to which invoice (owner, 24 Nov: "strictly find pattern matching to find PO number"). The invoice's
 * own Purchase Order Number is looked for in the PDF's text and file name, whole, never part of a longer number; only the
 * spaces and marks between its parts may differ ("6566219-OP-4470300006" = "6566219 OP -- 4470300006"). A short number
 * (under 8 letters and digits, like 3793) counts only right after a PO label. Checked against the 265 PDFs in the folder.
 */

/** A PO number's parts in one spelling: "6566219 - OP - 4470300006" → "6566219-OP-4470300006". "" = too little to go by. */
export function poKey(raw: unknown): string {
  const key = (String(raw ?? "").toUpperCase().match(/[A-Z0-9]+/g) ?? []).join("-");
  const bare = key.replace(/-/g, "");
  if (bare.length < 4 || (bare.match(/\d/g) ?? []).length < (bare.length < 8 ? 3 : 2)) return ""; // "00", "Verbal", "whatsapp"
  if (/^20\d{2}-\d{2}-\d{1,5}$/.test(key) || /^PERFORMA-/.test(key)) return ""; // our own invoice or PI number
  return key;
}

const SEP = "[\\s\\-‐-―_/.]*";
const LABEL = "(?:purchase[\\s_]*order|work[\\s_]*order|service[\\s_]*order|(?<![A-Z0-9])p\\.?\\s?o\\.?)[\\s_]*(?:no\\.?|number|num\\.?|id|#)?[\\s_:#.\\-‐-―]*";
const patterns = new Map<string, RegExp>();
function pattern(key: string): RegExp {
  const kept = patterns.get(key);
  if (kept) return kept;
  const parts = key.split("-");
  // JLL's PDFs sometimes give "4470300047 OP 6568686" for "6568686-OP-4470300047".
  const orders = parts.length === 3 && parts[1] === "OP" ? [parts, [...parts].reverse()] : [parts];
  const value = `(?:${orders.map((o) => o.join(SEP)).join("|")})(?![A-Z0-9])`;
  // A key that carries its own "PO" ("PO-00542") needs no other label.
  const short = key.replace(/-/g, "").length < 8 && parts[0] !== "PO";
  const re = new RegExp(short ? LABEL + value : `(?<![A-Z0-9])${value}`, "i");
  if (patterns.size > 2000) patterns.clear();
  patterns.set(key, re);
  return re;
}

/** Is this PO number on that PDF (its text, or its file name)? */
export function poInPdf(key: string, name: string, text: string): boolean {
  if (!key) return false;
  const re = pattern(key);
  return re.test(name.replace(/\.pdf$/i, "")) || re.test(text.replace(/\s+/g, " "));
}

/** Does the text read like an order? Only then is it kept (the folder may hold other papers); the name is always checked. */
export const orderText = (text: string) => /purchase\s*order|work\s*order|service\s*order|\border\s*(?:no|num|#|details)|\bp\.?\s?o\.?\s*(?:no|num|#|date|:|-)/i.test(text);
