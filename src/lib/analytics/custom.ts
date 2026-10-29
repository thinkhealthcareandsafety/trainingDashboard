import type { DashboardDef, DashFilter, Tile } from "./dashboards";
import type { Spec } from "./query";

/*
 * Dashboards the team makes and edits (owner, 29 Oct: "select what dashboard it goes in, or create a new dashboard …
 * create pages … decide which report goes in which page … movable … delete the dashboard and the reports"). Kept in
 * Mongo `reportDashboards`; pure — the route checks what it stores with `cleanDashboard`, the page builds its tabs from
 * the same shapes and edits them with the functions at the bottom.
 *
 * Rooms (owner, 29 Oct, second go: "kpis are all individual, 4 kpi 2 top 2 bottom make 1 room for a medium sized
 * report … a page will have max 8 medium sized reports space"): a room is half the width and one chart high, 2 across.
 * A medium chart takes 1 room, a wide one 2; numbers are items of their own — numbers next to each other share rooms,
 * 4 to a room (2 on top, 2 below). A page holds 8 rooms.
 * A report is referred to like on My dashboard: `{dash, tile}` — a built-in tab's tile, or `{dash: "saved", tile: id}`.
 * An edited built-in tab is stored under its own id (`base`), so "Restore original" = delete that document.
 */

export type Ref = { dash: string; tile: string };
/** One report on a page. `kpi`: a single number (¼ room); `wide`: a chart the whole width (2 rooms). */
export type Item = { id: string; ref: Ref; kpi?: boolean; wide?: boolean };
export type Page = { id: string; name: string; items: Item[] };
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

export const ROOMS = 8;
export const KPIS_PER_ROOM = 4;
export const MAX_PAGES = 20;
export const refKey = (r: Ref) => `${r.dash}.${r.tile}`;

/** How the items fill rooms, in order: numbers next to each other share a room (4 at most); a chart has its own. */
export function roomsOf(items: Item[]): Item[][] {
  const rooms: Item[][] = [];
  for (const it of items) {
    const last = rooms.at(-1);
    if (it.kpi && last?.[0]?.kpi && last.length < KPIS_PER_ROOM) last.push(it);
    else rooms.push([it]);
  }
  return rooms;
}
export const roomsUsed = (p: Page) => roomsOf(p.items).reduce((n, r) => n + (r[0].wide ? 2 : 1), 0);

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
    if (!Array.isArray(p.items) || p.items.length > ROOMS * KPIS_PER_ROOM) return { error: `“${name}”: bad reports` };
    const items: Item[] = [];
    for (const it of p.items as Partial<Item>[]) {
      const ref = { dash: String(it?.ref?.dash ?? ""), tile: String(it?.ref?.tile ?? "") };
      if (typeof it?.id !== "string" || !ID.test(it.id) || !DASH.test(ref.dash) || !ID.test(ref.tile)) return { error: `“${name}”: bad report` };
      items.push({ id: it.id, ref, ...(it.kpi ? { kpi: true } : it.wide ? { wide: true } : {}) });
    }
    const page = { id: p.id, name, items };
    if (roomsUsed(page) > ROOMS) return { error: `“${name}” is full — ${ROOMS} rooms a page; add a page` };
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

/* ---------------- Between stored dashboards and what the page draws ---------------- */

export type SavedRef = { id: string; spec: Spec; by: string };
/** A saved report as a tile (keeps its own period, as on the Saved reports tab). */
export const savedTile = (r: SavedRef): Tile => ({ id: r.id, spec: r.spec, w: r.spec.by?.length ? 6 : 3, fixedPeriod: true, note: `Saved report · ${r.by.split(" ")[0]}` });
export const isKpiTile = (t: Tile) => t.spec.chart === "kpi";

/** The report a ref points to, or undefined (a deleted saved report, a tab this member can't see). */
export function tileOf(ref: Ref, builtIns: DashboardDef[], saved: SavedRef[]): Tile | undefined {
  if (ref.dash === "saved") { const r = saved.find((x) => x.id === ref.tile); return r ? savedTile(r) : undefined; }
  return builtIns.find((d) => d.id === ref.dash)?.tiles.find((t) => t.id === ref.tile);
}

const COMMON: DashFilter[] = [{ field: "customerType", label: "Customer type" }, { field: "sector", label: "Sector" }, { field: "salesperson", label: "Sales person" }];

/** A stored dashboard → the page's dashboard: one tile per item (its id = the item's), each page as arranged. */
export function toDef(c: CustomDash, builtIns: DashboardDef[], saved: SavedRef[]): DashboardDef {
  const base = c.base ? builtIns.find((d) => d.id === c.base) : undefined;
  const tiles: Tile[] = [];
  const pages = c.pages.map((p) => {
    const ids: string[] = [];
    for (const it of p.items) {
      const t = tileOf(it.ref, builtIns, saved);
      if (!t) continue;
      tiles.push({ ...t, id: it.id, section: undefined, w: isKpiTile(t) ? 3 : it.wide ? 12 : 6, tall: false });
      ids.push(it.id);
    }
    return { name: p.name, tiles: ids };
  });
  // Filters: those of every tab its reports come from (and the usual three), once each.
  const from = new Set(c.pages.flatMap((p) => p.items.map((it) => it.ref.dash)));
  const filters: DashFilter[] = [];
  for (const f of [...(base?.filters ?? []), ...builtIns.filter((d) => from.has(d.id)).flatMap((d) => d.filters), ...COMMON]) if (!filters.some((x) => x.field === f.field)) filters.push(f);
  return {
    id: c.id, title: c.title, desc: base?.desc ?? (c.ownerName ? `Made by ${c.ownerName.split(" ")[0]}${c.shared ? "" : " · only you see it"}` : ""),
    tiles, pages, filters, period: base?.period ?? "fy", grains: base?.grains, start: c.scope ?? base?.start, custom: c, rooms: true,
  };
}

let seq = 0;
export const newId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
export const itemOf = (ref: Ref, t: Tile, wide = false): Item => ({ id: newId("i"), ref, ...(isKpiTile(t) ? { kpi: true } : wide ? { wide: true } : {}) });

/** Reports in order → pages of 8 rooms; a page that would overflow carries on in "<name> (2)". */
export function paginate(list: { name: string; items: Item[] }[]): Page[] {
  const pages: Page[] = [];
  for (const p of list) {
    let cur: Page = { id: newId("p"), name: p.name, items: [] };
    let n = 1;
    for (const it of p.items) {
      if (roomsUsed({ ...cur, items: [...cur.items, it] }) > ROOMS) { pages.push(cur); cur = { id: newId("p"), name: `${p.name} (${++n})`, items: [] }; }
      cur.items.push(it);
    }
    pages.push(cur);
  }
  return pages.filter((p, i) => p.items.length || i === 0);
}

/** A built-in tab → a stored dashboard to edit: its pages as they are (a page over 8 rooms carries on in a second). */
export function fromDef(def: DashboardDef, pageList: { name: string; tiles: Tile[] }[]): CustomDash {
  const pages = paginate(pageList.map((p) => ({ name: p.name, items: p.tiles.map((t) => itemOf({ dash: def.id, tile: t.id }, t, t.w === 12)) })));
  return { id: def.id, base: def.id, title: def.title, pages, shared: true, ...(def.start ? { scope: def.start } : {}) };
}

/* ---------------- Editing (pure: each returns the new dashboard, or why not) ---------------- */

type Edit = CustomDash | { error: string };
const copy = (d: CustomDash): CustomDash => structuredClone(d);
const fits = (d: CustomDash, pi: number): Edit => (roomsUsed(d.pages[pi]) > ROOMS ? { error: `“${d.pages[pi].name}” is full — ${ROOMS} rooms a page. Add a page.` } : d);
const findItem = (d: CustomDash, id: string) => { for (const [pi, p] of d.pages.entries()) { const ii = p.items.findIndex((x) => x.id === id); if (ii >= 0) return { pi, ii }; } return null; };

/** Move an item before another (same or other page), or to the end of a page. */
export function moveItem(d0: CustomDash, id: string, toPage: number, before?: string): Edit {
  const d = copy(d0);
  const w = findItem(d, id);
  if (!w || !d.pages[toPage]) return d0;
  const [it] = d.pages[w.pi].items.splice(w.ii, 1);
  const list = d.pages[toPage].items;
  const bi = before ? list.findIndex((x) => x.id === before) : -1;
  list.splice(bi >= 0 ? bi : list.length, 0, it);
  const ok = fits(d, toPage);
  return "error" in ok ? ok : fits(d, w.pi);
}
export function removeItem(d0: CustomDash, id: string): CustomDash {
  const d = copy(d0);
  for (const p of d.pages) p.items = p.items.filter((x) => x.id !== id);
  return d;
}
export function toggleWide(d0: CustomDash, id: string): Edit {
  const d = copy(d0);
  const w = findItem(d, id);
  if (!w) return d0;
  const it = d.pages[w.pi].items[w.ii];
  if (it.kpi) return d0;
  if (it.wide) delete it.wide; else it.wide = true;
  return fits(d, w.pi);
}
export function addItem(d0: CustomDash, pi: number, it: Item): Edit {
  if (d0.pages.some((p) => p.items.some((x) => refKey(x.ref) === refKey(it.ref)))) return { error: "That report is already on this dashboard." };
  const d = copy(d0);
  d.pages[pi].items.push(it);
  return fits(d, pi);
}
export function addPage(d0: CustomDash): CustomDash {
  const d = copy(d0);
  d.pages.push({ id: newId("p"), name: `Page ${d.pages.length + 1}`, items: [] });
  return d;
}
export function renamePage(d0: CustomDash, pi: number, name: string): CustomDash {
  const d = copy(d0);
  d.pages[pi].name = name.slice(0, 30);
  return d;
}
export function deletePage(d0: CustomDash, pi: number): Edit {
  if (d0.pages.length === 1) return { error: "A dashboard keeps at least one page." };
  const d = copy(d0);
  d.pages.splice(pi, 1);
  return d;
}
export function movePage(d0: CustomDash, pi: number, by: -1 | 1): CustomDash {
  const j = pi + by;
  if (j < 0 || j >= d0.pages.length) return d0;
  const d = copy(d0);
  [d.pages[pi], d.pages[j]] = [d.pages[j], d.pages[pi]];
  return d;
}
