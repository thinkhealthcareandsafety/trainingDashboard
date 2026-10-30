import { DASHBOARDS, type DashboardDef, type Tile, tabOf } from "./dashboards";
import type { Spec } from "./query";

/*
 * ⋯ → Edit report… on a built-in tile (owner's Tableau plan, 31 Oct: "on every dashboard tile, KPIs included … saving
 * updates it for the team … Restore brings back the original"). The team's version of a tile is one Mongo document in
 * `reportTileEdits` (_id "<tab>.<tile>"), and it shows everywhere that tile does — its tab, the team's edited tabs,
 * My dashboards, the library. Restore = delete the document. Pure: tests/tileEdits.test.ts.
 */

export type TileEdit = { key: string; spec: Spec; by: string; at: string };

export const tileKey = (dash: string, tile: string) => `${tabOf(dash)}.${tile}`;

/** The built-in tile a key or ref names (tabs merged on 29 Oct answer for their old ids). */
export function builtInTile(dash: string, tile: string): Tile | undefined {
  return DASHBOARDS.find((d) => d.id === tabOf(dash))?.tiles.find((t) => t.id === tile);
}

/** A stored edit, read forgivingly: anything without a usable spec is left out (the tile shows as built). */
export function readEdit(x: unknown): TileEdit | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const key = typeof o._id === "string" ? o._id : typeof o.key === "string" ? o.key : "";
  const s = o.spec as Spec | undefined;
  if (!key || !s || typeof s !== "object" || typeof s.dataset !== "string" || !Array.isArray(s.measures) || !s.measures.length || !s.measures.every((m) => typeof m === "string")) return null;
  return { key, spec: s, by: typeof o.by === "string" ? o.by : "", at: typeof o.at === "string" ? o.at : "" };
}

/**
 * The built-in tabs with the team's edits on their tiles. An edit only counts on its own data (a tile keeps its
 * dataset — the dashboard's filters, Compare and Show by are worked out for it).
 */
export function applyTileEdits(defs: DashboardDef[], edits: TileEdit[]): DashboardDef[] {
  if (!edits.length) return defs;
  const by = new Map(edits.map((e) => [e.key, e]));
  return defs.map((d) => {
    if (!d.tiles.some((t) => by.has(`${d.id}.${t.id}`))) return d;
    return { ...d, tiles: d.tiles.map((t) => {
      const e = by.get(`${d.id}.${t.id}`);
      return e && e.spec.dataset === t.spec.dataset ? { ...t, spec: e.spec, edited: { by: e.by, at: e.at } } : t;
    }) };
  });
}

/** What the builder sends → what's kept: no dates of the moment, no viewer's parameter values, a short title. */
export function cleanEditSpec(spec: Spec): Spec {
  const { from: _f, to: _t, asOf: _a, params: _p, goal: _g, ...rest } = spec;
  return { ...rest, title: (rest.title ?? "").trim().slice(0, 120) || undefined };
}
