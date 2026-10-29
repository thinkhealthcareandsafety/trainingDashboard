"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { type DashboardDef, type Tile, titleOf } from "@/lib/analytics/dashboards";
import { type CustomDash, MAX_KPIS, type Page, PLACES, type Ref, type SavedRef, newId, placesOf, placesUsed, refKey, tileOf } from "@/lib/analytics/custom";
import { btn } from "../ui";

/*
 * Dashboard editing (owner, 29 Oct: "create pages … decide which report goes in which page … 4 reports on one page,
 * 1 report = 4 kpis space … movable … delete the dashboard and the reports"). Works on a copy (`draft`) and saves the
 * whole dashboard at once; Cancel leaves it as it was. A page has 4 places (custom.ts): a chart 1 (wide 2), up to 4
 * numbers 1. Drag a place onto another to swap order, or onto a page's name to move it there; on a phone the ↑ ↓ and
 * "Move to" menu do the same.
 */

type Props = {
  draft: CustomDash;
  builtIns: DashboardDef[];
  saved: SavedRef[];
  /** A built-in tab not edited yet / a new dashboard (nothing to delete or restore). */
  fresh: boolean;
  admin: boolean;
  /** My dashboard: always mine, no name to change; "Reset" goes back to the starting one; Admin can make it everyone's start. */
  mine?: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
};

const isKpi = (t?: Tile) => t?.spec.chart === "kpi";

export function Editor({ draft: start, builtIns, saved, fresh, admin, mine, onClose, onSaved }: Props) {
  const [d, setD] = useState<CustomDash>(() => structuredClone(start));
  const [at, setAt] = useState(0);
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [state, setState] = useState<{ busy?: boolean; error?: string; note?: string }>({});
  const page = d.pages[Math.min(at, d.pages.length - 1)];
  const tile = (r: Ref) => tileOf(r, builtIns, saved);
  const name = (r: Ref) => { const t = tile(r); return t ? titleOf(t.spec) : "(report no longer there)"; };
  const from = (r: Ref) => (r.dash === "saved" ? "Saved report" : builtIns.find((x) => x.id === r.dash)?.title ?? r.dash);

  const setPages = (fn: (pages: Page[]) => Page[]) => setD((x) => ({ ...x, pages: fn(structuredClone(x.pages)) }));
  const full = (p: Page, more: number) => placesUsed(p) + more > PLACES;
  const say = (note: string) => setState({ note });

  // Pages
  const addPage = () => { setPages((ps) => [...ps, { id: newId("p"), name: `Page ${ps.length + 1}`, slots: [] }]); setAt(d.pages.length); };
  const renamePage = (i: number, v: string) => setPages((ps) => { ps[i].name = v.slice(0, 30); return ps; });
  const dropPage = (i: number) => {
    if (d.pages.length === 1) return say("A dashboard keeps at least one page.");
    if (d.pages[i].slots.length && !confirm(`Delete the page “${d.pages[i].name}” and take its ${d.pages[i].slots.length} report(s) off this dashboard?`)) return;
    setPages((ps) => ps.filter((_, j) => j !== i));
    setAt((a) => Math.max(0, a >= i ? a - 1 : a));
  };
  const movePage = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= d.pages.length) return;
    setPages((ps) => { [ps[i], ps[j]] = [ps[j], ps[i]]; return ps; });
    setAt(j);
  };

  // Places
  const where = (slotId: string) => { for (const [pi, p] of d.pages.entries()) { const si = p.slots.findIndex((s) => s.id === slotId); if (si >= 0) return { pi, si }; } return null; };
  const moveSlot = (slotId: string, toPage: number, before?: string) => {
    const w = where(slotId);
    if (!w) return;
    const s = d.pages[w.pi].slots[w.si];
    if (w.pi !== toPage && full(d.pages[toPage], placesOf(s))) return say(`“${d.pages[toPage].name}” is full — ${PLACES} places a page.`);
    setPages((ps) => {
      const [x] = ps[w.pi].slots.splice(w.si, 1);
      const list = ps[toPage].slots;
      const bi = before ? list.findIndex((y) => y.id === before) : -1;
      list.splice(bi >= 0 ? bi : list.length, 0, x);
      return ps;
    });
    setState({});
  };
  const nudge = (slotId: string, by: -1 | 1) => {
    const w = where(slotId);
    if (!w) return;
    const j = w.si + by;
    if (j < 0 || j >= d.pages[w.pi].slots.length) return;
    setPages((ps) => { const l = ps[w.pi].slots; [l[w.si], l[j]] = [l[j], l[w.si]]; return ps; });
  };
  const removeSlot = (slotId: string) => setPages((ps) => ps.map((p) => ({ ...p, slots: p.slots.filter((s) => s.id !== slotId) })));
  const removeNumber = (slotId: string, r: Ref) => setPages((ps) => ps.map((p) => ({ ...p, slots: p.slots.map((s) => (s.id === slotId ? { ...s, refs: s.refs.filter((x) => refKey(x) !== refKey(r)) } : s)).filter((s) => s.refs.length) })));
  const toggleWide = (slotId: string) => {
    const w = where(slotId)!;
    const s = d.pages[w.pi].slots[w.si];
    if (!s.wide && full(d.pages[w.pi], 1)) return say("No room to make it wide — this page is full.");
    setPages((ps) => { const x = ps[w.pi].slots[w.si]; if (x.wide) delete x.wide; else x.wide = true; return ps; });
  };
  // Adding: a number joins a place of numbers with room on this page, else takes a new place.
  const add = (r: Ref) => {
    const t = tile(r);
    if (!t) return;
    if (d.pages.some((p) => p.slots.some((s) => s.refs.some((x) => refKey(x) === refKey(r))))) return say(`“${titleOf(t.spec)}” is already on this dashboard.`);
    const room = isKpi(t) ? page.slots.find((s) => s.kpis && s.refs.length < MAX_KPIS) : undefined;
    if (!room && full(page, 1)) return say(`“${page.name}” is full — add a page, or remove something first.`);
    setPages((ps) => {
      const p = ps.find((x) => x.id === page.id)!;
      const r2 = room && p.slots.find((s) => s.id === room.id);
      if (r2) r2.refs.push(r);
      else p.slots.push(isKpi(t) ? { id: newId("s"), kpis: true, refs: [r] } : { id: newId("s"), refs: [r] });
      return ps;
    });
    say(`Added “${titleOf(t.spec)}”.`);
  };

  const call = async (init: RequestInit, q = "") => {
    const r = await fetch(`/api/analytics/dashboards${q}`, { headers: { "Content-Type": "application/json" }, ...init }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : { error: "Couldn't reach the server" };
    if (!r?.ok || j.error) throw new Error(j.error ?? "Couldn't save");
    return j;
  };
  const run = async (fn: () => Promise<void>) => { setState({ busy: true }); try { await fn(); } catch (e) { setState({ error: (e as Error).message }); } };
  const save = () => run(async () => { await call({ method: "POST", body: JSON.stringify({ dashboard: d }) }); onSaved(d.id); });
  const remove = () => {
    const msg = mine ? "Reset My dashboard to the starting one?" : d.base ? `Restore “${d.title}” to how it was built? The team's changes to it go.` : `Delete the dashboard “${d.title}” for everyone? Its reports stay in the library.`;
    if (confirm(msg)) run(async () => { await call({ method: "DELETE" }, `?id=${encodeURIComponent(d.id)}`); onSaved(d.base ?? "mine"); });
  };
  const makeStart = () => {
    if (confirm("Make this everyone's starting dashboard? People who haven't edited their own My dashboard will see it.")) run(async () => { await call({ method: "POST", body: JSON.stringify({ dashboard: { ...d, id: "my-start", shared: true } }) }); onSaved("mine"); });
  };
  const hide = () => {
    if (confirm(`Delete the “${d.title}” tab for everyone? Admin can bring it back from My dashboard → Customise.`)) run(async () => { await call({ method: "POST", body: JSON.stringify({ hide: d.base ?? d.id }) }); onSaved("mine"); });
  };

  const used = placesUsed(page);
  return createPortal(
    <div className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/30 p-3 sm:p-4" onMouseDown={onClose}>
      <div role="dialog" aria-label="Edit dashboard" className="modal-in flex max-h-[94vh] w-full max-w-[1280px] flex-col rounded-2xl bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <input aria-label="Dashboard name" value={d.title} readOnly={mine} onChange={(e) => setD({ ...d, title: e.target.value.slice(0, 40) })}
            className="h-10 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-[19px] font-bold tracking-tight text-ink hover:border-line focus:border-brand focus:outline-none" />
          {!d.base && !mine && (
            <label className="flex items-center gap-2 text-[15.5px] text-ink-2">
              <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={!d.shared} onChange={(e) => setD({ ...d, shared: !e.target.checked })} />
              Only me
            </label>
          )}
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink">
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>
          </button>
        </div>

        {/* Pages: click to open, drop a report on one to move it there. */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-5 py-2.5">
          {d.pages.map((p, i) => (
            <div key={p.id} onDragOver={(e) => { if (drag) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); if (drag && i !== at) moveSlot(drag, i); setDrag(null); }}
              className={`flex items-center rounded-full border ${i === at ? "border-brand bg-brand-soft" : "border-line"} ${drag && i !== at ? "border-dashed border-brand" : ""}`}>
              {i === at
                ? <input aria-label="Page name" value={p.name} onChange={(e) => renamePage(i, e.target.value)} className="h-8 w-36 rounded-full bg-transparent px-3 text-[15.5px] font-medium text-ink focus:outline-none" />
                : <button type="button" onClick={() => setAt(i)} className="h-8 px-3 text-[15.5px] font-medium text-ink-2">{p.name} <span className="text-faint">· {placesUsed(p)}/{PLACES}</span></button>}
              {i === at && (
                <>
                  <button type="button" className="grid size-7 place-items-center rounded-full text-muted hover:text-ink disabled:opacity-30" disabled={i === 0} aria-label="Move page left" onClick={() => movePage(i, -1)}>‹</button>
                  <button type="button" className="grid size-7 place-items-center rounded-full text-muted hover:text-ink disabled:opacity-30" disabled={i === d.pages.length - 1} aria-label="Move page right" onClick={() => movePage(i, 1)}>›</button>
                  <button type="button" className="grid size-7 place-items-center rounded-full text-muted hover:text-high" aria-label={`Delete page ${p.name}`} onClick={() => dropPage(i)}>×</button>
                </>
              )}
            </div>
          ))}
          <button type="button" className={btn.quiet} onClick={addPage} disabled={d.pages.length >= 20}>+ Page</button>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <p className="text-[15.5px] text-muted">
              <b className="font-semibold text-ink">{page.name}</b> · {used} of {PLACES} places used — a chart takes 1 (wide: 2), up to {MAX_KPIS} numbers take 1
            </p>
            <button type="button" className={`${btn.primary} ml-auto`} onClick={() => setAdding((x) => !x)}>{adding ? "Done adding" : "+ Add report"}</button>
          </div>
          {adding && <Library builtIns={builtIns} saved={saved} onPick={add} on={new Set(d.pages.flatMap((p) => p.slots.flatMap((s) => s.refs.map(refKey))))} />}

          {/* The page as it will look: numbers in a band each, charts two to a row (wide: the whole row). */}
          <div className="grid grid-cols-2 gap-3">
            {page.slots.map((s, si) => (
              <div key={s.id} draggable onDragStart={() => setDrag(s.id)} onDragEnd={() => setDrag(null)}
                onDragOver={(e) => { if (drag && drag !== s.id) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); if (drag && drag !== s.id) moveSlot(drag, at, s.id); setDrag(null); }}
                className={`${s.kpis || s.wide ? "col-span-2" : "col-span-2 sm:col-span-1"} cursor-grab rounded-xl border bg-surface-2/50 p-3 active:cursor-grabbing ${drag === s.id ? "border-brand opacity-50" : "border-line"} ${s.kpis ? "" : "min-h-[110px]"}`}>
                <div className="flex items-start gap-2">
                  <span aria-hidden className="mt-0.5 select-none text-faint">⠿</span>
                  <div className="min-w-0 flex-1">
                    {s.kpis ? (
                      <div className="flex flex-wrap gap-1.5">
                        {s.refs.map((r) => (
                          <span key={refKey(r)} className="inline-flex max-w-full items-center gap-1 rounded-full bg-surface px-3 py-1 text-[15px] text-ink">
                            <span className="truncate" title={`${name(r)} — ${from(r)}`}>{name(r)}</span>
                            <button type="button" aria-label={`Remove ${name(r)}`} className="text-muted hover:text-high" onClick={() => removeNumber(s.id, r)}>×</button>
                          </span>
                        ))}
                        <span className="self-center text-[14px] text-faint">{s.refs.length} of {MAX_KPIS} numbers</span>
                      </div>
                    ) : (
                      <>
                        <p className="truncate text-[16.5px] font-semibold text-ink">{name(s.refs[0])}</p>
                        <p className="truncate text-[14.5px] text-muted">{from(s.refs[0])}{s.wide ? " · wide" : ""}</p>
                      </>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {!s.kpis && <button type="button" className={btn.quiet} onClick={() => toggleWide(s.id)}>{s.wide ? "Half" : "Wide"}</button>}
                    <button type="button" className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30" aria-label="Move earlier" disabled={si === 0} onClick={() => nudge(s.id, -1)}>↑</button>
                    <button type="button" className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30" aria-label="Move later" disabled={si === page.slots.length - 1} onClick={() => nudge(s.id, 1)}>↓</button>
                    {d.pages.length > 1 && (
                      <select aria-label="Move to page" className="h-8 max-w-[7.5rem] rounded-full border border-line bg-surface px-2 text-[14.5px] text-muted" value="" onChange={(e) => { if (e.target.value !== "") moveSlot(s.id, Number(e.target.value)); }}>
                        <option value="">Move to…</option>
                        {d.pages.map((p, pi) => (pi === at ? null : <option key={p.id} value={pi}>{p.name}</option>))}
                      </select>
                    )}
                    <button type="button" className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-high" aria-label="Take off this dashboard" onClick={() => removeSlot(s.id)}>×</button>
                  </div>
                </div>
              </div>
            ))}
            {!page.slots.length && <p className="col-span-2 rounded-xl border border-dashed border-line p-8 text-center text-[15.5px] text-muted">An empty page — + Add report, or drag one here from another page’s name.</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          {!fresh && (d.base ? admin : true) && <button type="button" className={btn.danger} disabled={state.busy} onClick={remove}>{mine ? "Reset to the starting one" : d.base ? "Restore original" : "Delete dashboard"}</button>}
          {mine && admin && <button type="button" className={btn.quiet} disabled={state.busy} onClick={makeStart}>Make this everyone&apos;s starting dashboard</button>}
          {admin && d.base && <button type="button" className={btn.danger} disabled={state.busy} onClick={hide}>Delete this tab</button>}
          {state.error ? <span className="text-[15px] text-high">{state.error}</span> : state.note ? <span className="text-[15px] text-muted">{state.note}</span> : null}
          <div className="ml-auto flex gap-2">
            <button type="button" className={btn.ghost} onClick={onClose}>Cancel</button>
            <button type="button" className={btn.primary} disabled={state.busy || !d.title.trim()} onClick={save}>{state.busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Every report there is, by tab, with a search — click one to add it to the open page. */
function Library({ builtIns, saved, onPick, on }: { builtIns: DashboardDef[]; saved: SavedRef[]; onPick: (r: Ref) => void; on: Set<string> }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => [
    ...builtIns.map((d) => ({ label: d.title, items: d.tiles.map((t) => ({ ref: { dash: d.id, tile: t.id }, title: titleOf(t.spec), kpi: isKpi(t) })) })),
    ...(saved.length ? [{ label: "Saved reports", items: saved.map((r) => ({ ref: { dash: "saved", tile: r.id }, title: r.spec.title ?? "Saved report", kpi: r.spec.chart === "kpi" })) }] : []),
  ], [builtIns, saved]);
  const needle = q.trim().toLowerCase();
  return (
    <div className="mb-4 rounded-xl border border-line p-3">
      <input autoFocus placeholder="Search every report…" value={q} onChange={(e) => setQ(e.target.value)}
        className="h-10 w-full rounded-full border border-line bg-surface px-4 text-[16px] text-ink focus:border-brand focus:outline-none" />
      <div className="no-scrollbar mt-2 max-h-[260px] space-y-2 overflow-y-auto">
        {groups.map((g) => {
          const items = g.items.filter((x) => !needle || x.title.toLowerCase().includes(needle) || g.label.toLowerCase().includes(needle));
          if (!items.length) return null;
          return (
            <div key={g.label}>
              <p className="px-1 text-[14px] font-semibold uppercase tracking-wide text-muted">{g.label}</p>
              <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((x) => (
                  <button key={refKey(x.ref)} type="button" disabled={on.has(refKey(x.ref))} onClick={() => onPick(x.ref)}
                    className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2 disabled:opacity-40">
                    <span className="text-brand">{on.has(refKey(x.ref)) ? "✓" : "+"}</span>
                    <span className="min-w-0 flex-1 truncate text-[15.5px] text-ink" title={x.title}>{x.title}</span>
                    {x.kpi && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[13px] text-muted">Number</span>}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

