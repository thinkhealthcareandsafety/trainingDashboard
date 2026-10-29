// The team's dashboards (src/lib/analytics/custom.ts): the canvas rules — where things may sit, full pages, moves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { COLS, type CustomDash, type Item, ROWS, SIZE, addItem, arrange, cleanDashboard, freeSpot, fromDef, fullness, moveToPage, paginate } from "@/lib/analytics/custom";
import { DASHBOARDS, type Tile } from "@/lib/analytics/dashboards";

const chart = (id: string, x: number, y: number, w = 6, h = 4): Item => ({ id, ref: { dash: "sales", tile: id }, x, y, w, h });
const dash = (items: Item[], more: Item[] = []): CustomDash => ({ id: "d-t", title: "T", shared: true, pages: [{ id: "p1", name: "One", items }, { id: "p2", name: "Two", items: more }] });
const tile = (kpi: boolean): Tile => ({ id: "t", w: kpi ? 3 : 6, spec: { dataset: "sales", measures: ["revenue"], chart: kpi ? "kpi" : "bar" } });
const ok = (r: CustomDash | { error: string }) => { assert.ok(!("error" in r), "error" in r ? r.error : ""); return r as CustomDash; };
const fullPage = () => Array.from({ length: 8 }, (_, i) => chart(`c${i}`, (i % 2) * 6, Math.floor(i / 2) * 4));

test("freeSpot: first gap reading left to right, top to bottom; none on a full page", () => {
  assert.deepEqual(freeSpot([chart("a", 0, 0)], 6, 4), { x: 6, y: 0 });
  assert.deepEqual(freeSpot([chart("a", 0, 0), chart("b", 6, 0)], 3, 2), { x: 0, y: 4 });
  assert.equal(freeSpot(fullPage(), 1, 1), null);
});

test("8 medium charts fill a page exactly; 4 numbers take a medium chart's space", () => {
  assert.equal(fullness({ id: "p", name: "p", items: fullPage() }), 100);
  assert.equal(4 * SIZE.kpi.w * SIZE.kpi.h, SIZE.chart.w * SIZE.chart.h);
  assert.equal(8 * SIZE.chart.w * SIZE.chart.h, COLS * ROWS);
});

test("the server's check: anything off the page, overlapping or half a cell is refused", () => {
  assert.ok(!("error" in cleanDashboard(dash(fullPage()))));
  assert.match((cleanDashboard(dash([chart("a", 0, 14)])) as { error: string }).error, /sticks out/);
  assert.match((cleanDashboard(dash([chart("a", 0, 0), chart("b", 3, 2)])) as { error: string }).error, /overlap/);
  assert.ok("error" in cleanDashboard(dash([chart("a", 0.5, 0)])));
  assert.ok("error" in cleanDashboard({ ...dash([]), title: "  " }));
  // any size is fine — a 4×2 number, an 8×6 chart
  assert.ok(!("error" in cleanDashboard(dash([{ ...chart("n", 0, 0, 4, 2), kpi: true }, chart("a", 4, 0, 8, 6)]))));
});

test("adding: at the first free place, its starting size; twice or onto a full page is refused", () => {
  const d = ok(addItem(dash([chart("a", 0, 0)]), 0, { dash: "sales", tile: "rev" }, tile(true)));
  const added = d.pages[0].items.at(-1)!;
  assert.deepEqual([added.x, added.y, added.w, added.h, added.kpi], [6, 0, 3, 2, true]);
  assert.match((addItem(d, 0, { dash: "sales", tile: "rev" }, tile(true)) as { error: string }).error, /already/);
  assert.match((addItem(dash(fullPage()), 0, { dash: "sales", tile: "x" }, tile(false)) as { error: string }).error, /No room/);
  // dropped at a spot: there, if it fits
  const dropped = ok(addItem(dash([]), 0, { dash: "sales", tile: "y" }, tile(false), { x: 6, y: 8 })).pages[0].items[0];
  assert.deepEqual([dropped.x, dropped.y], [6, 8]);
});

test("moving to another page keeps the size; a full page refuses it", () => {
  const d = ok(moveToPage(dash([chart("a", 0, 0, 12, 4)]), "a", 1));
  assert.equal(d.pages[0].items.length, 0);
  assert.deepEqual(d.pages[1].items.map((i) => [i.x, i.y, i.w, i.h]), [[0, 0, 12, 4]]);
  assert.ok("error" in moveToPage(dash([chart("z", 0, 0)], fullPage()), "z", 1));
});

test("a drag or resize that pushes something off the page is refused", () => {
  const d = dash([chart("a", 0, 0)]);
  assert.ok(!("error" in arrange(d, 0, [{ i: "a", x: 6, y: 12, w: 6, h: 4 }])));
  assert.ok("error" in arrange(d, 0, [{ i: "a", x: 6, y: 13, w: 6, h: 4 }]));
});

test("a long list carries on to a second page, nothing lost", () => {
  const tiles = Array.from({ length: 10 }, (_, i) => ({ ref: { dash: "sales", tile: `t${i}` }, tile: tile(false) }));
  const pages = paginate([{ name: "All", tiles }]);
  assert.deepEqual(pages.map((p) => [p.name, p.items.length]), [["All", 8], ["All (2)", 2]]);
});

test("every built-in tab, made editable, is a valid dashboard (fits, no overlaps)", () => {
  for (const def of DASHBOARDS) {
    const sections = [...new Set(def.tiles.map((t) => t.section ?? "Key numbers"))];
    const c = fromDef(def, sections.map((s) => ({ name: s, tiles: def.tiles.filter((t) => (t.section ?? "Key numbers") === s) })));
    const r = cleanDashboard(c);
    assert.ok(!("error" in r), `${def.id}: ${"error" in r ? r.error : ""}`);
    assert.equal(c.pages.reduce((n, p) => n + p.items.length, 0), def.tiles.length, `${def.id}: a report went missing`);
  }
});

test("dashboards saved in an older shape (slots, places) come back as a valid canvas", async () => {
  const { upgrade } = await import("@/lib/analytics/custom");
  const slots = { id: "d-old", title: "Old", shared: true, pages: [{ id: "p1", name: "One", slots: [
    { id: "s1", kpis: true, refs: [{ dash: "sales", tile: "rev" }, { dash: "sales", tile: "inv" }] },
    { id: "s2", wide: true, refs: [{ dash: "sales", tile: "bymonth" }] },
  ] }] } as unknown as CustomDash;
  const up = upgrade(slots);
  assert.ok(!("error" in cleanDashboard(up)));
  assert.deepEqual(up.pages[0].items.map((i) => [i.ref.tile, i.w, i.h]), [["rev", 3, 2], ["inv", 3, 2], ["bymonth", 12, 4]]);
});
