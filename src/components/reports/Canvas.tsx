"use client";

import ReactGridLayout, { type Layout, useContainerWidth, verticalCompactor } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { type Box, COLS, MIN, ROWS } from "@/lib/analytics/custom";
import type { Tile } from "@/lib/analytics/dashboards";

/*
 * The page as one box (owner, 29 Oct: "a big box container … i can place my report anywhere … increase size of that
 * report by holding on its edge"). A COLS × ROWS grid (custom.ts); in edit mode anything drags anywhere — the others move
 * out of its way as it goes, and things rise into empty space above them, so nothing overlaps (Grafana-style; free
 * placement let pushed items land on each other, 29 Oct) — and every edge and corner resizes. Uses
 * react-grid-layout (`verticalCompactor`). Below ~900 px the reports stack, top-left first.
 */

export const ROW_H = 84;
export const GAP = 16;
/** A box's height in pixels for h rows. */
export const heightOf = (h: number) => h * ROW_H + (h - 1) * GAP;

export function Canvas({ tiles, boxes, edit, onArrange, onDropNew, dropSize, render }: {
  tiles: Tile[];
  boxes: Record<string, Box>;
  edit: boolean;
  /** After a drag or resize: every item's box. */
  onArrange?: (boxes: (Box & { i: string })[]) => void;
  /** A report dragged in from the list, let go at x, y. */
  onDropNew?: (at: { x: number; y: number }) => void;
  /** The size of what's being dragged in (a number is smaller). */
  dropSize?: { w: number; h: number };
  render: (t: Tile, box: Box) => React.ReactNode;
}) {
  const { width, containerRef, mounted } = useContainerWidth();
  const layout: Layout = tiles.map((t) => {
    const m = t.spec.chart === "kpi" ? MIN.kpi : MIN.chart;
    return { i: t.id, ...boxes[t.id], minW: m.w, minH: m.h };
  });
  const narrow = mounted && width < 900;
  return (
    <div ref={containerRef} className="mt-4">
      {mounted && (narrow ? (
        <div className="grid grid-cols-1 gap-4">
          {[...tiles].sort((a, b) => boxes[a.id].y - boxes[b.id].y || boxes[a.id].x - boxes[b.id].x).map((t) => (
            <div key={t.id} style={{ height: t.spec.chart === "kpi" ? undefined : heightOf(Math.max(4, boxes[t.id].h)) }}>{render(t, boxes[t.id])}</div>
          ))}
        </div>
      ) : (
        // In edit mode the whole page box shows (dashed), so there's room to drop things anywhere in it.
        <div className={edit ? "rounded-2xl border-2 border-dashed border-line bg-surface-2/30" : ""} style={edit ? { minHeight: heightOf(ROWS) + 4 } : undefined}>
          <ReactGridLayout
            layout={layout}
            width={edit ? width - 4 : width}
            gridConfig={{ cols: COLS, rowHeight: ROW_H, margin: [GAP, GAP], containerPadding: [0, 0], maxRows: ROWS }}
            dragConfig={{ enabled: edit, bounded: true, cancel: ".no-drag, button, select, input, a" }}
            resizeConfig={{ enabled: edit, handles: ["s", "w", "e", "n", "se", "sw", "ne", "nw"] }}
            dropConfig={{ enabled: edit && Boolean(onDropNew), defaultItem: dropSize ?? { w: 6, h: 4 }, onDragOver: () => dropSize ?? { w: 6, h: 4 } }}
            compactor={verticalCompactor}
            style={edit ? { minHeight: heightOf(ROWS) } : undefined}
            onLayoutChange={(l) => {
              if (!edit || !onArrange) return;
              const moved = l.filter((b) => boxes[b.i] && (b.x !== boxes[b.i].x || b.y !== boxes[b.i].y || b.w !== boxes[b.i].w || b.h !== boxes[b.i].h));
              if (moved.length) onArrange(l.filter((b) => boxes[b.i]).map((b) => ({ i: b.i, x: b.x, y: b.y, w: b.w, h: b.h })));
            }}
            onDrop={(_l, item) => { if (item) onDropNew?.({ x: item.x, y: item.y }); }}
          >
            {tiles.map((t) => <div key={t.id} className="min-w-0">{render(t, boxes[t.id])}</div>)}
          </ReactGridLayout>
        </div>
      ))}
    </div>
  );
}
