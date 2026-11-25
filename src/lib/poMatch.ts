/*
 * Which PO PDF belongs to which invoice (owner, 24 Nov: "strictly find pattern matching to find PO number"). The invoice's
 * own Purchase Order Number is looked for on the PDF itself (its text, or what is read from a scan's picture — never its
 * file name), whole, never part of a longer number; only the spaces and marks between its parts may differ
 * ("6566219-OP-4470300006" = "6566219 OP -- 4470300006"). A short number (under 8 letters and digits, like 3793) counts
 * only as a PO's: right after a PO label, the first number after "Purchase Order No", or, on an order, right before its
 * date. Checked against the 265 PDFs in the folder.
 */

/** A PO number's parts in one spelling: "6566219 - OP - 4470300006" → "6566219-OP-4470300006". "" = too little to go by. */
export function poKey(raw: unknown): string {
  const key = (String(raw ?? "").toUpperCase().match(/[A-Z0-9]+/g) ?? []).join("-");
  const bare = key.replace(/-/g, "");
  if (bare.length < 4 || (bare.match(/\d/g) ?? []).length < (bare.length < 8 ? 3 : 2)) return ""; // "00", "Verbal", "whatsapp"
  if (/^20\d{2}-\d{2}-\d{1,5}$/.test(key) || /^PERFORMA-/.test(key)) return ""; // our own invoice or PI number
  return key;
}

const SEP = "[:\\s\\-‐-―_/.]*";
const LABEL = "(?:purchase[\\s_]*order|work[\\s_]*order|service[\\s_]*order|(?<![A-Z0-9])p\\.?\\s?o\\.?)[\\s_]*(?:no\\.?|number|num\\.?|id|#)?[\\s_:#.\\-‐-―]*";
const LABEL_NO = "(?:purchase|work|service|urchase)\\s*order\\s*(?:no|num)";
const DATE = "\\s+(?:date\\s*[:\\-]*\\s*)?\\d{1,2}[-/.](?:\\d{1,2}|[a-z]{3})[-/.]\\d{2,4}";
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
  const re = new RegExp(short ? `${LABEL}${value}|${LABEL_NO}[^0-9]{0,60}(?<![A-Z0-9])${value}|(?<=\\s)${value}${DATE}` : `(?<![A-Z0-9])${value}`, "i");
  if (patterns.size > 2000) patterns.clear();
  patterns.set(key, re);
  return re;
}

/** Is this PO number on that PDF (the words on it)? */
export const poInPdf = (key: string, text: string): boolean => Boolean(key) && (key.replace(/-/g, "").length >= 8 || orderText(text)) && pattern(key).test(text.replace(/\s+/g, " "));

/** Does the text show its PO number clearly, right after a label? If not, the page's picture is read as well. */
export const clearPo = (text: string) => /(?:(?:purchase|work|service)\s*order|\border|(?<![A-Z0-9])p\.?\s?o\.?)\s*(?:no\.?|number|num\.?|#)\s*[\s:#.\-]{0,6}(?=[A-Z0-9/\-]*\d{3})[A-Z0-9]/i.test(text.replace(/\s+/g, " "));

/** Does the text read like an order? Only then is it kept and matched (the folder may hold other papers). */
export const orderText = (text: string) => /purchase\s*order|work\s*order|service\s*order|\border\s*(?:no|num|#|details)|\bp\.?\s?o\.?\s*(?:no|num|#|date|:|-)/i.test(text);
