/*
 * Dashboards the team makes and edits (owner, 29 Oct: "select what dashboard it goes in, or create a new dashboard …
 * create pages … decide which report goes in which page … a total of 4 reports on one page, 1 report = 4 kpis space …
 * movable … delete the dashboard and the reports"). Kept in Mongo `reportDashboards`; pure — the route checks what it
 * stores with `cleanDashboard`, the page builds its tabs from the same shapes.
 *
 * A page has 4 places. A chart takes 1 (half the width) or 2 when wide; a group of up to 4 single numbers takes 1.
 * A report is referred to like on My dashboard: `{dash, tile}` — a built-in tab's tile, or `{dash: "saved", tile: id}`.
 * An edited built-in tab is stored under its own id (`base`), so "Restore original" = delete that document.
 */

export type Ref = { dash: string; tile: string };
/** One place on a page: one chart (`wide` = the whole width, 2 places) or up to 4 numbers. */
export type Slot = { id: string; refs: Ref[]; wide?: boolean; kpis?: boolean };
export type Page = { id: string; name: string; slots: Slot[] };
export type CustomDash = {
  id: string; title: string; pages: Page[];
  /** The built-in tab this is the team's version of (its id = that tab's). */
  base?: string;
  /** Filters that come with this dashboard only (like Defibtech's Brand = Defibtech). */
  scope?: Record<string, { values: string[]; exclude?: boolean }>;
  /** Everyone sees it (default), or only its maker. */
  shared: boolean;
  owner?: string; ownerName?: string; updatedAt?: string; updatedBy?: string;
};

export const PLACES = 4;
export const MAX_KPIS = 4;
export const MAX_PAGES = 20;
export const placesOf = (s: Slot) => (s.kpis ? 1 : s.wide ? 2 : 1);
export const placesUsed = (p: Page) => p.slots.reduce((n, s) => n + placesOf(s), 0);
export const refKey = (r: Ref) => `${r.dash}.${r.tile}`;

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DASH = /^[a-z0-9-]{1,40}$/;
const text = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");

/** A dashboard as sent by a browser → a clean one, or an error in plain words. */
export function cleanDashboard(x: unknown): CustomDash | { error: string } {
  const d = x as Partial<CustomDash> | null;
  if (!d || typeof d !== "object") return { error: "Nothing to save" };
  const title = text(d.title, 40);
  if (!title) return { error: "Give the dashboard a name" };
  if (typeof d.id !== "string" || !DASH.test(d.id)) return { error: "Bad dashboard id" };
  if (!Array.isArray(d.pages) || !d.pages.length) return { error: "A dashboard needs at least one page" };
  if (d.pages.length > MAX_PAGES) return { error: `At most ${MAX_PAGES} pages` };
  const pages: Page[] = [];
  const pageIds = new Set<string>();
  for (const p of d.pages as Partial<Page>[]) {
    if (typeof p?.id !== "string" || !ID.test(p.id) || pageIds.has(p.id)) return { error: "Bad page" };
    pageIds.add(p.id);
    const name = text(p.name, 30) || `Page ${pages.length + 1}`;
    if (!Array.isArray(p.slots)) return { error: `“${name}”: bad places` };
    const slots: Slot[] = [];
    for (const s of p.slots as Partial<Slot>[]) {
      if (typeof s?.id !== "string" || !ID.test(s.id) || !Array.isArray(s.refs) || !s.refs.length) return { error: `“${name}”: bad place` };
      const refs = (s.refs as Partial<Ref>[]).map((r) => ({ dash: String(r?.dash ?? ""), tile: String(r?.tile ?? "") }));
      if (refs.some((r) => !DASH.test(r.dash) || !ID.test(r.tile))) return { error: `“${name}”: bad report` };
      const kpis = Boolean(s.kpis);
      if (!kpis && refs.length !== 1) return { error: `“${name}”: a chart place holds one report` };
      if (kpis && refs.length > MAX_KPIS) return { error: `“${name}”: at most ${MAX_KPIS} numbers in one place` };
      slots.push({ id: s.id, refs, ...(kpis ? { kpis: true } : s.wide ? { wide: true } : {}) });
    }
    const page = { id: p.id, name, slots };
    if (placesUsed(page) > PLACES) return { error: `“${name}” is full — ${PLACES} places a page (a wide chart takes 2)` };
    pages.push(page);
  }
  const scope: CustomDash["scope"] = {};
  for (const [k, v] of Object.entries(d.scope ?? {})) {
    if (!/^[A-Za-z]{1,30}$/.test(k) || !Array.isArray(v?.values) || v.values.length > 200) return { error: "Bad dashboard filter" };
    scope[k] = { values: v.values.map((x) => String(x).slice(0, 120)), ...(v.exclude ? { exclude: true } : {}) };
  }
  const base = typeof d.base === "string" && DASH.test(d.base) ? d.base : undefined;
  return { id: d.id, title, pages, shared: d.shared !== false, ...(base ? { base } : {}), ...(Object.keys(scope).length ? { scope } : {}) };
}
