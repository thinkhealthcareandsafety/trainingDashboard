/*
 * "My dashboard" (owner, 27 Oct — ANALYTICS-PLAN §11 (f)): each person's own page of reports, picked from every official
 * tile (dashboards.ts) and the team's saved reports. Kept per person in `reportPrefs.layout`; Admin's starting layout —
 * for everyone who hasn't made their own — in kv `reports_layout` (none yet = START below). Pure: the route checks what
 * it stores with `cleanLayout`, the page reads the same.
 */

/** Small / Medium / Large = ¼ / ½ / the whole width (single numbers always sit small, in one band). */
export type Size = "s" | "m" | "l";
/** One tile on the page: `dash` = a dashboard id (or "saved"), `tile` = its tile id (or the saved report's id). */
export type LayoutEntry = { dash: string; tile: string; size?: Size };

export const SIZE_W: Record<Size, 3 | 6 | 12> = { s: 3, m: 6, l: 12 };
export const sizeOfW = (w: number): Size => (w >= 12 ? "l" : w >= 6 ? "m" : "s");
export const MAX_ENTRIES = 60;

/** Until Admin sets one (owner, 27 Oct: defaults accepted): the headline numbers, revenue by month, what's owed,
 * trainings, open quotes and the top customers. */
export const START: LayoutEntry[] = [
  { dash: "sales", tile: "rev" },
  { dash: "sales", tile: "inv" },
  { dash: "sales", tile: "cust" },
  { dash: "collections", tile: "outstanding" },
  { dash: "sales", tile: "bymonth", size: "l" },
  { dash: "collections", tile: "age", size: "m" },
  { dash: "team", tile: "openAge", size: "m" },
  { dash: "trainings", tile: "bymonth", size: "m" },
  { dash: "sales", tile: "customers", size: "m" },
];

export const entryKey = (e: LayoutEntry) => `${e.dash}.${e.tile}`;

/** A layout as sent by a browser → a clean list (no repeats, known shapes only), or null if it isn't one. */
export function cleanLayout(x: unknown): LayoutEntry[] | null {
  if (!Array.isArray(x) || x.length > MAX_ENTRIES) return null;
  const out: LayoutEntry[] = [];
  const seen = new Set<string>();
  for (const e of x as Partial<LayoutEntry>[]) {
    if (typeof e?.dash !== "string" || !/^[a-z0-9-]{1,40}$/.test(e.dash)) return null;
    if (typeof e.tile !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(e.tile)) return null;
    if (e.size !== undefined && !(e.size in SIZE_W)) return null;
    const entry: LayoutEntry = { dash: e.dash, tile: e.tile, ...(e.size ? { size: e.size } : {}) };
    if (seen.has(entryKey(entry))) continue;
    seen.add(entryKey(entry));
    out.push(entry);
  }
  return out;
}
