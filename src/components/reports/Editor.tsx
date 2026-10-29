"use client";

import { useMemo, useState } from "react";
import { type DashboardDef, titleOf } from "@/lib/analytics/dashboards";
import { type CustomDash, type Ref, type SavedRef, refKey } from "@/lib/analytics/custom";
import { btn } from "../ui";

/*
 * Editing a dashboard (owner, 29 Oct): the dashboard itself goes into edit mode (Dashboard.tsx — drag any chart or
 * number, pages, rooms); this file has the bar on top of it (name, only me, delete / restore, Cancel, Save) and the
 * library of every report to add. Save stores the whole dashboard at once; Cancel leaves it as it was.
 */

export function EditBar({ draft: d, onChange, fresh, admin, mine, onCancel, onDone }: {
  draft: CustomDash; onChange: (d: CustomDash) => void;
  /** A built-in tab not edited yet / a new dashboard / My dashboard not edited yet (nothing to delete or reset). */
  fresh: boolean; admin: boolean;
  /** My dashboard: always mine, no name to change; "Reset" goes back to the starting one; Admin can make it everyone's. */
  mine?: boolean;
  onCancel: () => void; onDone: (open: string) => void;
}) {
  const [state, setState] = useState<{ busy?: boolean; error?: string }>({});
  const call = async (init: RequestInit, q = "") => {
    const r = await fetch(`/api/analytics/dashboards${q}`, { headers: { "Content-Type": "application/json" }, ...init }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : { error: "Couldn't reach the server" };
    if (!r?.ok || j.error) throw new Error(j.error ?? "Couldn't save");
    return j;
  };
  const run = async (fn: () => Promise<void>) => { setState({ busy: true }); try { await fn(); } catch (e) { setState({ error: (e as Error).message }); } };
  const save = () => run(async () => { await call({ method: "POST", body: JSON.stringify({ dashboard: d }) }); onDone(d.id); });
  const remove = () => {
    const msg = mine ? "Reset My dashboard to the starting one?" : d.base ? `Restore “${d.title}” to how it was built? The team's changes to it go.` : `Delete the dashboard “${d.title}” for everyone? Its reports stay in the library.`;
    if (confirm(msg)) run(async () => { await call({ method: "DELETE" }, `?id=${encodeURIComponent(d.id)}`); onDone(d.base ?? "mine"); });
  };
  const makeStart = () => {
    if (confirm("Make this everyone's starting dashboard? People who haven't edited their own My dashboard will see it.")) run(async () => { await call({ method: "POST", body: JSON.stringify({ dashboard: { ...d, id: "my-start", shared: true } }) }); onDone("mine"); });
  };
  const hide = () => {
    if (confirm(`Delete the “${d.title}” tab for everyone? Admin can bring it back from My dashboard → Tabs.`)) run(async () => { await call({ method: "POST", body: JSON.stringify({ hide: d.base ?? d.id }) }); onDone("mine"); });
  };
  return (
    <>
      <span className="text-[15px] font-semibold uppercase tracking-wide text-brand">Editing</span>
      <input aria-label="Dashboard name" value={d.title} readOnly={mine} onChange={(e) => onChange({ ...d, title: e.target.value.slice(0, 40) })}
        className="h-10 w-64 min-w-0 rounded-lg border border-line bg-surface px-3 text-[17px] font-bold tracking-tight text-ink focus:border-brand focus:outline-none read-only:border-transparent" />
      {!d.base && !mine && (
        <label className="flex items-center gap-2 text-[15.5px] text-ink-2">
          <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={!d.shared} onChange={(e) => onChange({ ...d, shared: !e.target.checked })} />
          Only me
        </label>
      )}
      {!fresh && (d.base ? admin : true) && <button type="button" className={btn.danger} disabled={state.busy} onClick={remove}>{mine ? "Reset to the starting one" : d.base ? "Restore original" : "Delete dashboard"}</button>}
      {admin && d.base && <button type="button" className={btn.danger} disabled={state.busy} onClick={hide}>Delete this tab</button>}
      {mine && admin && <button type="button" className={btn.quiet} disabled={state.busy} onClick={makeStart}>Make this everyone&apos;s starting dashboard</button>}
      {state.error && <span className="text-[15px] text-high">{state.error}</span>}
      <span className="ml-auto" />
      <button type="button" className={btn.ghost} onClick={onCancel}>Cancel</button>
      <button type="button" className={btn.primary} disabled={state.busy || !d.title.trim()} onClick={save}>{state.busy ? "Saving…" : "Save"}</button>
    </>
  );
}

/** Every report there is, by tab, with a search — click one to add it to the open page, or drag it onto the page. */
export function Library({ builtIns, saved, onPick, onDrag, on }: { builtIns: DashboardDef[]; saved: SavedRef[]; onPick: (r: Ref) => void; onDrag?: (r: Ref) => void; on: Set<string> }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => [
    ...builtIns.map((d) => ({ label: d.title, items: d.tiles.map((t) => ({ ref: { dash: d.id, tile: t.id }, title: titleOf(t.spec), kpi: t.spec.chart === "kpi" })) })),
    ...(saved.length ? [{ label: "Saved reports", items: saved.map((r) => ({ ref: { dash: "saved", tile: r.id }, title: r.spec.title ?? "Saved report", kpi: r.spec.chart === "kpi" })) }] : []),
  ], [builtIns, saved]);
  const needle = q.trim().toLowerCase();
  return (
    <div className="rounded-xl border border-line p-3">
      <input autoFocus placeholder="Search every report…" value={q} onChange={(e) => setQ(e.target.value)}
        className="h-10 w-full rounded-full border border-line bg-surface px-4 text-[16px] text-ink focus:border-brand focus:outline-none" />
      <div className="no-scrollbar mt-2 max-h-[240px] space-y-2 overflow-y-auto">
        {groups.map((g) => {
          const items = g.items.filter((x) => !needle || x.title.toLowerCase().includes(needle) || g.label.toLowerCase().includes(needle));
          if (!items.length) return null;
          return (
            <div key={g.label}>
              <p className="px-1 text-[14px] font-semibold uppercase tracking-wide text-muted">{g.label}</p>
              <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((x) => {
                  const there = on.has(refKey(x.ref));
                  return (
                    <button key={refKey(x.ref)} type="button" disabled={there} onClick={() => onPick(x.ref)} draggable={!there} onDragStart={() => onDrag?.(x.ref)}
                      className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2 disabled:opacity-40">
                      <span className="text-brand">{there ? "✓" : "+"}</span>
                      <span className="min-w-0 flex-1 truncate text-[15.5px] text-ink" title={x.title}>{x.title}</span>
                      {x.kpi && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[13px] text-muted">Number</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
