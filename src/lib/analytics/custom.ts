import { type DashboardDef, type DashFilter, type Tile, tabOf } from "./dashboards";
import type { Spec } from "./query";

/*
 * Dashboards the team makes and edits (owner, 29 Oct: "select what dashboard it goes in, or create a new dashboard …
 * create pages … decide which report goes in which page … movable … delete the dashboard and the reports"). Kept in
 * Mongo `reportDashboards`; pure — the route checks what it stores with `cleanDashboard`, the page builds its tabs from
 * the same shapes and edits them with the functions at the bottom.
 *
 * The canvas (owner, 29 Oct, third go: "a big box container … i can place my report anywhere in that container,
 * reports or kpis anything anywhere … increase size of that report by holding on its edge … a kpi could be 4x2 too"):
 * each page is a grid COLS wide and ROWS high; every report — a chart or a single number — sits at x, y with a width and
 * height of its own, anywhere in it, gaps allowed. A medium chart starts 6×4 and a number 3×2 (4 numbers = a medium
 * chart), so a page holds 8 medium charts' worth. Nothing may stick out of the page or overlap.
 * A report is referred to like on My dashboard: `{dash, tile}` — a built-in tab's tile, or `{dash: "saved", tile: id}`.
 * An edited built-in tab is stored under its own id (`base`), so "Restore original" = delete that document.
 */

export type Ref = { dash: string; tile: string };
export type Box = { x: number; y: number; w: number; h: number };
/** One report on a page, where it sits. `kpi`: a single number (sizes differ). */
export type Item = Box & { id: string; ref: Ref; kpi?: boolean };
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

export const COLS = 12;
export const ROWS = 16;
export const MAX_PAGES = 20;
export const MAX_ITEMS = 64;
/** Starting sizes: a number, a medium chart, a wide chart; and the smallest each may be made. */
export const SIZE = { kpi: { w: 3, h: 2 }, chart: { w: 6, h: 4 }, wide: { w: 12, h: 4 } };
export const MIN = { kpi: { w: 2, h: 2 }, chart: { w: 3, h: 3 } };
export const refKey = (r: Ref) => `${r.dash}.${r.tile}`;

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (b: Box) => b.x >= 0 && b.y >= 0 && b.w >= 1 && b.h >= 1 && b.x + b.w <= COLS && b.y + b.h <= ROWS;
/** How full a page is, 0–100 (its area). */
export const fullness = (p: Page) => Math.round((p.items.reduce((n, it) => n + it.w * it.h, 0) / (COLS * ROWS)) * 100);
/** The first free place for a w×h box, reading left to right, top to bottom — or null if the page has none. */
export function freeSpot(items: Box[], w: number, h: number): { x: number; y: number } | null {
  for (let y = 0; y + h <= ROWS; y++) for (let x = 0; x + w <= COLS; x++) if (!items.some((b) => overlaps(b, { x, y, w, h }))) return { x, y };
  return null;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DASH = /^[a-z0-9-]{1,40}$/;
const text = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");
const int = (x: unknown) => (typeof x === "number" && Number.isInteger(x) ? x : NaN);

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
    if (!Array.isArray(p.items) || p.items.length > MAX_ITEMS) return { error: `“${name}”: bad reports` };
    const items: Item[] = [];
    for (const it of p.items as Partial<Item>[]) {
      const ref = { dash: String(it?.ref?.dash ?? ""), tile: String(it?.ref?.tile ?? "") };
      const box = { x: int(it?.x), y: int(it?.y), w: int(it?.w), h: int(it?.h) };
      if (typeof it?.id !== "string" || !ID.test(it.id) || !DASH.test(ref.dash) || !ID.test(ref.tile)) return { error: `“${name}”: bad report` };
      if (!inside(box)) return { error: `“${name}”: a report sticks out of the page — make room or add a page` };
      if (items.some((o) => overlaps(o, box))) return { error: `“${name}”: two reports overlap` };
      items.push({ id: it.id, ref, ...box, ...(it.kpi ? { kpi: true } : {}) });
    }
    pages.push({ id: p.id, name, items });
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
  // Tabs merged on 29 Oct answer for their old ids (dashboards.ts ALIASES).
  return builtIns.find((d) => d.id === tabOf(ref.dash))?.tiles.find((t) => t.id === ref.tile);
}

const COMMON: DashFilter[] = [{ field: "customerType", label: "Customer type" }, { field: "sector", label: "Sector" }, { field: "salesperson", label: "Sales person" }];

/** A stored dashboard → the page's dashboard: one tile per item (its id = the item's), each page with where they sit. */
export function toDef(c: CustomDash, builtIns: DashboardDef[], saved: SavedRef[]): DashboardDef {
  const base = c.base ? builtIns.find((d) => d.id === c.base) : undefined;
  const tiles: Tile[] = [];
  const pages = c.pages.map((p) => {
    const ids: string[] = [];
    const boxes: Record<string, Box> = {};
    for (const it of p.items) {
      const t = tileOf(it.ref, builtIns, saved);
      if (!t) continue;
      tiles.push({ ...t, id: it.id, section: undefined, tall: false, ref: it.ref });
      ids.push(it.id);
      boxes[it.id] = { x: it.x, y: it.y, w: it.w, h: it.h };
    }
    return { name: p.name, tiles: ids, boxes };
  });
  // Filters: those of every tab its reports come from (and the usual three), once each.
  const from = new Set(c.pages.flatMap((p) => p.items.map((it) => it.ref.dash)));
  const filters: DashFilter[] = [];
  for (const f of [...(base?.filters ?? []), ...builtIns.filter((d) => from.has(d.id)).flatMap((d) => d.filters), ...COMMON]) if (!filters.some((x) => x.field === f.field)) filters.push(f);
  return {
    id: c.id, title: c.title, desc: base?.desc ?? (c.ownerName ? `Made by ${c.ownerName.split(" ")[0]}${c.shared ? "" : " · only you see it"}` : ""),
    tiles, pages, filters, period: base?.period ?? "fy", grains: base?.grains, start: c.scope ?? base?.start, custom: c,
  };
}

let seq = 0;
export const newId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
const sizeFor = (t: Tile, wide = false) => (isKpiTile(t) ? SIZE.kpi : wide ? SIZE.wide : SIZE.chart);

/** Reports in order → pages, each report at the first free place at its starting size; a full page carries on. */
export function paginate(list: { name: string; tiles: { ref: Ref; tile: Tile; wide?: boolean }[] }[]): Page[] {
  const pages: Page[] = [];
  for (const p of list) {
    let cur: Page = { id: newId("p"), name: p.name, items: [] };
    let n = 1;
    for (const x of p.tiles) {
      const s = sizeFor(x.tile, x.wide);
      let at = freeSpot(cur.items, s.w, s.h);
      if (!at) { pages.push(cur); cur = { id: newId("p"), name: `${p.name} (${++n})`, items: [] }; at = { x: 0, y: 0 }; }
      cur.items.push({ id: newId("i"), ref: x.ref, ...at, ...s, ...(isKpiTile(x.tile) ? { kpi: true } : {}) });
    }
    pages.push(cur);
  }
  return pages.filter((p, i) => p.items.length || i === 0);
}

type OldEntry = { id?: unknown; ref?: Ref; refs?: Ref[]; kpi?: boolean; kpis?: boolean; wide?: boolean; x?: unknown; y?: unknown; w?: unknown; h?: unknown };
/**
 * A stored dashboard of any age → the canvas shape. Dashboards saved before the canvas (29 Oct, live `2c459c4`) have
 * `slots` of refs, and the rooms version had `items` with no place; those reports go to the first free place at their
 * starting size, in order, a full page carrying on in a new one. Items that already have a good place keep it.
 * Read by the route, so the page never meets an old shape (it broke Reports for everyone, 29 Oct).
 */
export function upgrade(d: CustomDash): CustomDash {
  const pages: Page[] = [];
  for (const p0 of (Array.isArray(d.pages) ? d.pages : []) as (Partial<Page> & { slots?: OldEntry[] })[]) {
    const name = typeof p0?.name === "string" && p0.name ? p0.name : `Page ${pages.length + 1}`;
    let cur: Page = { id: typeof p0?.id === "string" ? p0.id : newId("p"), name, items: [] };
    const later: { id?: string; ref: Ref; kpi: boolean; wide: boolean }[] = [];
    for (const e of [...(Array.isArray(p0?.items) ? p0.items : []), ...(Array.isArray(p0?.slots) ? p0.slots : [])] as OldEntry[]) {
      const kpi = Boolean(e?.kpi || e?.kpis);
      const id = typeof e?.id === "string" && ID.test(e.id) ? e.id : undefined;
      const box = { x: int(e?.x), y: int(e?.y), w: int(e?.w), h: int(e?.h) };
      if (e?.ref && id && inside(box) && !cur.items.some((o) => overlaps(o, box))) { cur.items.push({ id, ref: e.ref, ...box, ...(kpi ? { kpi: true } : {}) }); continue; }
      for (const ref of e?.ref ? [e.ref] : Array.isArray(e?.refs) ? e.refs : []) later.push({ id: e?.ref ? id : undefined, ref, kpi, wide: Boolean(e?.wide) });
    }
    let n = 1;
    for (const x of later) {
      const s = x.kpi ? SIZE.kpi : x.wide ? SIZE.wide : SIZE.chart;
      let at = freeSpot(cur.items, s.w, s.h);
      if (!at) { pages.push(cur); cur = { id: newId("p"), name: `${name} (${++n})`, items: [] }; at = { x: 0, y: 0 }; }
      cur.items.push({ id: x.id ?? newId("i"), ref: x.ref, ...at, ...s, ...(x.kpi ? { kpi: true } : {}) });
    }
    pages.push(cur);
  }
  return { ...d, pages: pages.length ? pages : [{ id: newId("p"), name: "Page 1", items: [] }] };
}

/** A built-in tab → a stored dashboard to edit: its pages as they are (a page that overflows carries on in a second). */
export function fromDef(def: DashboardDef, pageList: { name: string; tiles: Tile[] }[]): CustomDash {
  const pages = paginate(pageList.map((p) => ({ name: p.name, tiles: p.tiles.map((t) => ({ ref: { dash: def.id, tile: t.id }, tile: t, wide: t.w === 12 })) })));
  return { id: def.id, base: def.id, title: def.title, pages, shared: true, ...(def.start ? { scope: def.start } : {}) };
}

/* ---------------- Editing (pure: each returns the new dashboard, or why not) ---------------- */

type Edit = CustomDash | { error: string };
const copy = (d: CustomDash): CustomDash => structuredClone(d);
const full = (name: string) => ({ error: `No room on “${name}” — make room, or add a page.` });

/** The page's new arrangement after a drag or a resize (the grid gives every item's box). */
export function arrange(d0: CustomDash, pi: number, boxes: (Box & { i: string })[]): Edit {
  const d = copy(d0);
  const page = d.pages[pi];
  for (const b of boxes) {
    const it = page.items.find((x) => x.id === b.i);
    if (!it) continue;
    if (!inside(b)) return full(page.name);
    Object.assign(it, { x: b.x, y: b.y, w: b.w, h: b.h });
  }
  return d;
}
/** A report onto a page, at the first free place at its starting size. */
export function addItem(d0: CustomDash, pi: number, ref: Ref, t: Tile, at?: { x: number; y: number }): Edit {
  if (d0.pages.some((p) => p.items.some((x) => refKey(x.ref) === refKey(ref)))) return { error: "That report is already on this dashboard." };
  const d = copy(d0);
  const page = d.pages[pi];
  const s = sizeFor(t);
  const spot = at && inside({ ...at, ...s }) && !page.items.some((b) => overlaps(b, { ...at, ...s })) ? at : freeSpot(page.items, s.w, s.h);
  if (!spot) return full(page.name);
  page.items.push({ id: newId("i"), ref, ...spot, ...s, ...(isKpiTile(t) ? { kpi: true } : {}) });
  return d;
}
/** To another page, at its first free place (same size). */
export function moveToPage(d0: CustomDash, id: string, to: number): Edit {
  const d = copy(d0);
  const from = d.pages.find((p) => p.items.some((x) => x.id === id));
  const target = d.pages[to];
  if (!from || !target || from === target) return d0;
  const it = from.items.find((x) => x.id === id)!;
  const spot = freeSpot(target.items, it.w, it.h);
  if (!spot) return full(target.name);
  from.items = from.items.filter((x) => x.id !== id);
  target.items.push({ ...it, ...spot });
  return d;
}
export function removeItem(d0: CustomDash, id: string): CustomDash {
  const d = copy(d0);
  for (const p of d.pages) p.items = p.items.filter((x) => x.id !== id);
  return d;
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
