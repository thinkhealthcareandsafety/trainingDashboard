/*
 * BOQ → temporary quotation (owner, 20 Nov: "very often we get similar sheets with different qty and 70% different items
 * — a system that auto-populates the items and prices and creates a temporary quotation"). Pure: the server passes the
 * sheet's rows, our Zoho items, the price history and what was matched before (boqServer.ts).
 *
 *  - the item table: the row whose cells read like Item / Description, Qty, Unit, Make (any order, any sheet);
 *  - each line matched to our items: what was picked for the same words before (memory), else by shared words — the
 *    make and model numbers count extra;
 *  - its price: the last rate we quoted / invoiced for that item, else the item's Zoho rate.
 */

export type BoqColumns = { item: number; qty: number; unit?: number; make?: number; sno?: number; note?: number };
export type BoqLine = { row: number; sno: string; item: string; make: string; unit: string; qty: number | null; note: string; section: string };
export type BoqSheet = { name: string; lines: BoqLine[]; columns: BoqColumns | null; headerRow: number };
export type CatalogItem = { id: string; name: string; rate?: number; unit?: string; gst?: number; active?: boolean; service?: boolean };
export type PricePoint = { itemId: string; rate: number; date: string; party: string; kind: "estimates" | "invoices" };
export type Memory = { key: string; itemId?: string; rate?: number };
export type Candidate = { itemId: string; score: number };
export type Price = { rate: number; source: "memory" | "history" | "zoho" | "none"; note: string };

const cell = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const HEAD: Record<keyof BoqColumns, RegExp> = {
  item: /^(item|items|item name|item description|description|particulars|product|material|name of (the )?item|description of (the )?item)s?\b/i,
  qty: /^(qty|qnty|quantity|nos\.? required|req(uired)? qty)\b/i,
  unit: /^(unit|units|uom|u\/m)\b/i,
  make: /^(make|brand|manufacturer|make\s*\/\s*model|model)\b/i,
  sno: /^(s\.?\s*no|sr\.?\s*no|sl\.?\s*no|#|no\.?)\b/i,
  note: /^(remark|remarks|note|notes|specification|spec)\b/i,
};

/** The header row and its columns: the first of the top 15 rows with an item column and a quantity column. */
export function findColumns(rows: unknown[][]): { row: number; columns: BoqColumns } | null {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const found: Partial<BoqColumns> = {};
    rows[r].forEach((v, c) => {
      const t = cell(v);
      if (!t || t.length > 40) return;
      for (const k of Object.keys(HEAD) as (keyof BoqColumns)[]) if (found[k] === undefined && HEAD[k].test(t)) { found[k] = c; break; }
    });
    if (found.item !== undefined && found.qty !== undefined) return { row: r, columns: found as BoqColumns };
  }
  return null;
}

const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = /-?\d+(\.\d+)?/.exec(cell(v).replace(/,/g, ""));
  return m ? Number(m[0]) : null;
};

/** A sheet's lines under its header; a row with words but no quantity, unit or make starts a section ("Items to be added"). */
export function sheetLines(name: string, rows: unknown[][]): BoqSheet {
  const head = findColumns(rows);
  if (!head) return { name, lines: [], columns: null, headerRow: -1 };
  const { columns: c } = head;
  const lines: BoqLine[] = [];
  let section = "";
  for (let r = head.row + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const item = cell(row[c.item]);
    if (!item) continue;
    const qty = num(row[c.qty]);
    const unit = c.unit !== undefined ? cell(row[c.unit]) : "";
    const make = c.make !== undefined ? cell(row[c.make]) : "";
    if (qty === null && !unit && !make) { section = item.slice(0, 80); continue; }
    lines.push({ row: r + 1, sno: c.sno !== undefined ? cell(row[c.sno]) : "", item, make, unit, qty, note: c.note !== undefined ? cell(row[c.note]) : "", section });
  }
  return { name, lines, columns: c, headerRow: head.row + 1 };
}

/** Sheets to quote by default: those with a make or unit column (a kit's contents list has neither). */
export const quoteByDefault = (s: BoqSheet) => s.lines.length > 0 && Boolean(s.columns && (s.columns.make !== undefined || s.columns.unit !== undefined));

/* ---------------- Matching ---------------- */

const STOP = new Set(["and", "or", "with", "for", "the", "of", "to", "a", "an", "in", "on", "at", "by", "type", "nos", "no", "pcs", "pc", "set", "std", "standard", "local", "having", "shall", "be", "it", "has", "only", "along", "below", "each", "etc", "mtr", "mm", "size"]);
const SAME: Record<string, string> = { torches: "torch", wheelchair: "wheel chair", megaphone: "megaphone", bullhorn: "megaphone", cones: "cone", jackets: "jacket", gloves: "glove", masks: "mask", helmets: "helmet", kits: "kit", sticks: "stick", lights: "light", bags: "bag", mirrors: "mirror", tapes: "tape", stanchions: "stanchion", bollards: "bollard", wands: "wand", analyzer: "analyser", aluminum: "aluminium", defibrillator: "aed", stretchers: "stretcher", binoculars: "binocular", crutches: "crutch", containers: "container" };

/** The words that identify an item: lower case, singular, no filler words; "4.5Ltr" → "4.5" "ltr". */
export function words(s: string): string[] {
  return s.toLowerCase()
    .replace(/wheel\s*chair/g, "wheelchair").replace(/mega\s*phone|bull\s*horn/g, "megaphone").replace(/first\s*aid/g, "firstaid")
    .replace(/infra\s*-?\s*red/g, "infrared").replace(/\bhi\s*-\s*vis(ibility)?\b|\bhigh\s+vis(ibility)?\b/g, "highvisibility")
    .replace(/\bq\s*-?\s*manager/g, "queue manager").replace(/re\s*-\s*chargeable/g, "rechargeable").replace(/anti\s*-?\s*skid/g, "antiskid")
    .replace(/auto\s*-?\s*glow/g, "autoglow").replace(/sharps?\s+object/g, "sharps")
    .replace(/(\d)([a-z])/g, "$1 $2").replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/[^a-z0-9.]+/g, " ").split(" ")
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .map((w) => SAME[w] ?? (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .flatMap((w) => w.split(" "))
    .filter((w) => (w.length > 1 || /\d/.test(w)) && !STOP.has(w));
}
/** The key a line is remembered by: its item words and make, in order. */
export const memoryKey = (item: string, make = "") => [...new Set(words(`${item} ${make}`))].sort().join(" ").slice(0, 300);

/**
 * 0–1: how well one of our item names fits a BOQ line. Half "how much of the line's item the name covers" (the first
 * ten words — long specs name the thing first), half "how much of the name the line explains" (item and make words);
 * numbers (sizes, models) weigh more both ways, so another size or model counts against it; a matching make adds a bit.
 */
export function score(line: { item: string; make: string }, name: string): number {
  const have = [...new Set(words(name))];
  if (!have.length) return 0;
  const itemWords = [...new Set(words(line.item))].slice(0, 10);
  if (!itemWords.length) return 0;
  const makeWords = [...new Set(words(line.make))].filter((w) => !itemWords.includes(w));
  const w = (x: string) => (/\d/.test(x) ? 1.5 : 1);
  const sum = (xs: string[]) => xs.reduce((s, x) => s + w(x), 0);
  const nameSet = new Set(have), lineSet = new Set([...itemWords, ...makeWords]);
  const recall = sum(itemWords.filter((x) => nameSet.has(x))) / sum(itemWords);
  const precision = sum(have.filter((x) => lineSet.has(x))) / sum(have);
  if (!recall) return 0;
  const make = makeWords.length ? makeWords.filter((x) => nameSet.has(x)).length / makeWords.length : 0;
  return Math.min(1, 0.5 * recall + 0.5 * precision + 0.1 * make);
}

/** The best items for a line, best first: the remembered pick first (score 1), then the closest names. Active goods are preferred. */
export function candidates(line: { item: string; make: string }, items: CatalogItem[], memory: Map<string, Memory>, top = 5): Candidate[] {
  const out: Candidate[] = [];
  const mem = memory.get(memoryKey(line.item, line.make));
  if (mem?.itemId && items.some((i) => i.id === mem.itemId)) out.push({ itemId: mem.itemId, score: 1 });
  const scored = items
    .map((i) => ({ itemId: i.id, score: score(line, i.name) * (i.active === false ? 0.85 : 1) * (i.service ? 0.8 : 1) }))
    .filter((c) => c.score >= 0.25 && c.itemId !== mem?.itemId)
    .sort((a, b) => b.score - a.score);
  return [...out, ...scored].slice(0, top).map((c) => ({ ...c, score: Math.round(c.score * 100) / 100 }));
}

/** A matched line is taken as is from this score up; below it the line is offered, not filled. */
export const SURE = 0.55;
/** Below this a filled-in match is flagged for a look. */
export const CHECK = 0.7;

/** The last rate we quoted or invoiced for an item, newest first. */
export function latestPrices(points: PricePoint[]): Map<string, PricePoint> {
  const out = new Map<string, PricePoint>();
  for (const p of points) {
    if (!(p.rate > 0)) continue;
    const had = out.get(p.itemId);
    if (!had || p.date > had.date) out.set(p.itemId, p);
  }
  return out;
}

const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
/** A line's rate: what was typed for these words before (same item), else our last quote / invoice, else Zoho's rate. */
export function priceFor(itemId: string | undefined, key: string, memory: Map<string, Memory>, latest: Map<string, PricePoint>, items: Map<string, CatalogItem>): Price {
  const mem = memory.get(key);
  if (mem?.rate && mem.rate > 0 && (!itemId || mem.itemId === itemId || !mem.itemId)) return { rate: mem.rate, source: "memory", note: "Your rate for this line last time" };
  if (!itemId) return { rate: 0, source: "none", note: "" };
  const p = latest.get(itemId);
  if (p) return { rate: p.rate, source: "history", note: `Last ${p.kind === "estimates" ? "quoted" : "invoiced"} ${day(p.date)}${p.party ? ` · ${p.party}` : ""}` };
  const z = items.get(itemId)?.rate;
  if (z && z > 0) return { rate: z, source: "zoho", note: "Zoho item rate" };
  return { rate: 0, source: "none", note: "" };
}

/* ---------------- The temporary quotation ---------------- */

export type QuoteLine = { row: number; sheet: string; sno: string; item: string; make: string; unit: string; qty: number; note: string; section: string; itemId?: string; itemName?: string; rate: number; gst: number; source: Price["source"]; priceNote: string; score: number; candidates: Candidate[] };
const r2 = (v: number) => Math.round(v * 100) / 100;
export const lineAmount = (l: Pick<QuoteLine, "qty" | "rate">) => r2((l.qty || 0) * (l.rate || 0));
export function totals(lines: Pick<QuoteLine, "qty" | "rate" | "gst">[]): { subtotal: number; gst: number; total: number; priced: number } {
  let subtotal = 0, gst = 0, priced = 0;
  for (const l of lines) {
    const a = lineAmount(l);
    if (a > 0) priced++;
    subtotal += a;
    gst += a * (l.gst || 0) / 100;
  }
  return { subtotal: r2(subtotal), gst: r2(gst), total: r2(subtotal + gst), priced };
}

/** Every line of the chosen sheets, matched and priced. */
export function buildQuote(sheets: BoqSheet[], items: CatalogItem[], memory: Map<string, Memory>, points: PricePoint[]): QuoteLine[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const latest = latestPrices(points);
  return sheets.flatMap((s) => s.lines.map((l): QuoteLine => {
    const cands = candidates(l, items, memory);
    const best = cands[0] && cands[0].score >= SURE ? cands[0] : undefined;
    const key = memoryKey(l.item, l.make);
    const price = priceFor(best?.itemId, key, memory, latest, byId);
    const it = best ? byId.get(best.itemId) : undefined;
    return { row: l.row, sheet: s.name, sno: l.sno, item: l.item, make: l.make, unit: l.unit, qty: l.qty ?? 0, note: l.note, section: l.section, itemId: it?.id, itemName: it?.name, rate: price.rate, gst: it?.gst ?? 18, source: price.source, priceNote: price.note, score: best?.score ?? 0, candidates: cands };
  }));
}

/* ---------------- New items and the Zoho draft (owner, 23 Nov) ---------------- */
/*
 * "There should be two tabs, the quotations and the Items — new items only; if something matches our items, just match
 * them." A line is new while it has no item, or only a weak one ("check") nobody has confirmed. Picking or confirming an
 * item (score 1) settles it — in every saved sheet with the same words, and in the next sheet (boqMemory). The Zoho
 * draft is made only when no line is new (owner: create the items in Zoho first; this list is for doing that by hand).
 */
export const isNewLine = (l: Pick<QuoteLine, "itemId" | "score">) => !l.itemId || l.score < CHECK;

export type NewItem = {
  key: string; item: string; make: string; unit: string; lines: number; qty: number;
  quotes: { id: string; title: string }[];
  /** The weak match waiting to be confirmed. */
  suggest?: { itemId: string; itemName: string; score: number };
  candidates: Candidate[];
};
/** Every new line of every saved sheet, the same words once, most asked for first. */
export function newItemGroups(quotes: { id: string; title: string; lines: QuoteLine[] }[]): NewItem[] {
  const out = new Map<string, NewItem>();
  for (const q of quotes) for (const l of q.lines) {
    if (!isNewLine(l)) continue;
    const key = memoryKey(l.item, l.make);
    if (!key) continue;
    const g = out.get(key) ?? { key, item: l.item, make: l.make, unit: l.unit, lines: 0, qty: 0, quotes: [], candidates: l.candidates };
    g.lines++;
    g.qty += l.qty || 0;
    if (!g.quotes.some((x) => x.id === q.id)) g.quotes.push({ id: q.id, title: q.title });
    if (!g.suggest && l.itemId && l.itemName) g.suggest = { itemId: l.itemId, itemName: l.itemName, score: l.score };
    out.set(key, g);
  }
  return [...out.values()].sort((a, b) => b.quotes.length - a.quotes.length || b.lines - a.lines || a.item.localeCompare(b.item));
}

/** Why the Zoho draft can't be made yet ("" = it can). */
export function draftBlock(lines: Pick<QuoteLine, "itemId" | "score" | "qty">[]): string {
  if (!lines.length) return "No lines to quote.";
  const fresh = lines.filter(isNewLine).length;
  if (fresh) return `${fresh} ${fresh === 1 ? "line needs" : "lines need"} our item first (New items tab).`;
  const noQty = lines.filter((l) => !(l.qty > 0)).length;
  if (noQty) return `${noQty} ${noQty === 1 ? "line has" : "lines have"} no quantity.`;
  return "";
}
