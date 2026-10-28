"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { DashboardDef, DashFilter, Tile } from "@/lib/analytics/dashboards";
import { type LayoutEntry, type Size, SIZE_W, START, entryKey, sizeOfW } from "@/lib/analytics/layout";
import type { Spec } from "@/lib/analytics/query";
import { btn } from "../ui";
import { DashboardView } from "./Dashboard";

/*
 * My dashboard (owner, 27 Oct — ANALYTICS-PLAN §11 (f)): the first Reports tab, each person's own choice of tiles from
 * every tab + the saved reports, in their order and size. It is an ordinary dashboard built from that list, so period,
 * compare, filters, views, click-to-filter and "Change this chart" all work as on the other tabs. Saved on the server
 * per person (`/api/analytics/prefs`); people who haven't customised follow Admin's starting layout (layout.ts START
 * until Admin sets one).
 */

export type SavedReport = { id: string; spec: Spec; by: string };
type Source = { dash: string; label: string; tiles: Tile[] };
type Placed = { entry: LayoutEntry; tile: Tile; source: string };
type Prefs = { layout: LayoutEntry[] | null; starting: LayoutEntry[] | null; startingBy?: string };

// Fields every dataset here has (or most do) — each reaches the tiles whose data has it.
const FILTERS: DashFilter[] = [
  { field: "customerType", label: "Customer type" },
  { field: "sector", label: "Sector" },
  { field: "salesperson", label: "Sales person" },
];

const isKpi = (t: Tile) => t.spec.chart === "kpi";
// A saved report keeps its own period, as on the Saved reports tab.
const savedTile = (r: SavedReport): Tile => ({ id: r.id, spec: r.spec, w: r.spec.by?.length ? 6 : 3, fixedPeriod: true, note: `Saved report · ${r.by.split(" ")[0]}` });

/** Every tile one can pick, by tab: the dashboards this member sees, then the saved reports. */
function sourcesOf(dashboards: DashboardDef[], saved: SavedReport[]): Source[] {
  return [
    ...dashboards.map((d) => ({ dash: d.id, label: d.title, tiles: d.tiles })),
    ...(saved.length ? [{ dash: "saved", label: "Saved reports", tiles: saved.map(savedTile) }] : []),
  ];
}

/** The list → tiles. A tile that's gone (a deleted saved report, a tab this member can't see) is left out. */
function place(entries: LayoutEntry[], sources: Source[]): Placed[] {
  const out: Placed[] = [];
  for (const entry of entries) {
    const src = sources.find((s) => s.dash === entry.dash);
    const t = src?.tiles.find((x) => x.id === entry.tile);
    if (!src || !t) continue;
    out.push({ entry, source: src.label, tile: { ...t, id: entryKey(entry), section: undefined, w: !isKpi(t) && entry.size ? SIZE_W[entry.size] : t.w } });
  }
  return out;
}

export function MyDashboard({ today, admin, dashboards, saved }: { today: string; admin: boolean; dashboards: DashboardDef[]; saved: SavedReport[] | null }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [customising, setCustomising] = useState(false);
  useEffect(() => {
    fetch("/api/analytics/prefs").then((r) => r.json())
      .then((j) => setPrefs({ layout: j.layout ?? null, starting: j.starting ?? null, startingBy: j.startingBy }))
      .catch(() => setPrefs({ layout: null, starting: null }));
  }, []);

  const starting = prefs?.starting ?? START;
  const entries = prefs?.layout ?? starting;
  const sources = useMemo(() => sourcesOf(dashboards, saved ?? []), [dashboards, saved]);
  const placed = useMemo(() => place(entries, sources), [entries, sources]);
  const def = useMemo<DashboardDef>(() => ({
    id: "mine", title: "My dashboard", period: "fy", filters: FILTERS, tiles: placed.map((p) => p.tile),
    desc: "Your own choice of reports from every tab — Customise to add, order and size them.",
  }), [placed]);

  // Wait for the saved reports too when the list has some — else the page would draw twice.
  if (!prefs || (saved === null && entries.some((e) => e.dash === "saved"))) return <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />;

  const customise = (
    <button type="button" onClick={() => setCustomising(true)}
      className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-[16px] font-medium text-ink-2 transition hover:border-line-strong">
      <svg viewBox="0 0 20 20" className="size-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M4 6h7M15 6h1M4 14h1M9 14h7" /><circle cx="13" cy="6" r="2" /><circle cx="7" cy="14" r="2" /></svg>
      Customise
    </button>
  );
  return (
    <>
      {placed.length ? <DashboardView def={def} today={today} tools={customise} /> : (
        <div className="card grid place-items-center gap-2 p-10 text-center">
          <p className="text-[16px] text-ink-2">Nothing on your dashboard yet.</p>
          <p className="max-w-md text-[15px] text-muted">Pick the reports you look at most — from any tab, or the team&apos;s saved reports.</p>
          <div className="mt-2">{customise}</div>
        </div>
      )}
      {customising && createPortal(
        <Customise placed={placed} own={prefs.layout !== null} starting={starting} startingBy={prefs.startingBy} admin={admin} sources={sources}
          onClose={() => setCustomising(false)} onSaved={(patch) => setPrefs((p) => (p ? { ...p, ...patch } : p))} />,
        document.body,
      )}
    </>
  );
}

/** The Customise popup: tick tiles on the left (by tab), order / size / remove them on the right. */
function Customise({ placed, own, starting, startingBy, admin, sources, onClose, onSaved }: {
  placed: Placed[]; own: boolean; starting: LayoutEntry[]; startingBy?: string; admin: boolean; sources: Source[];
  onClose: () => void; onSaved: (patch: Partial<Prefs>) => void;
}) {
  const [draft, setDraft] = useState<LayoutEntry[]>(() => placed.map((p) => p.entry));
  // Still following the starting layout: saving keeps it that way (and later changes to it reach this person).
  const [follows, setFollows] = useState(!own);
  const [tab, setTab] = useState(sources[0]?.dash ?? "");
  const [state, setState] = useState<{ busy?: boolean; error?: string }>({});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows = place(draft, sources);
  const chosen = new Set(draft.map(entryKey));
  const edit = (next: LayoutEntry[]) => { setDraft(next); setFollows(false); };
  const toggle = (dash: string, tile: string) => {
    const key = entryKey({ dash, tile });
    edit(chosen.has(key) ? draft.filter((e) => entryKey(e) !== key) : [...draft, { dash, tile }]);
  };
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= draft.length) return;
    const next = [...draft];
    [next[i], next[j]] = [next[j], next[i]];
    edit(next);
  };
  const resize = (i: number, size: Size) => edit(draft.map((e, k) => (k === i ? { ...e, size } : e)));

  const post = async (body: object) => {
    const r = await fetch("/api/analytics/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : { error: "Couldn't reach the server" };
    if (!r?.ok || j.error) throw new Error(j.error ?? "Couldn't save");
    return j;
  };
  const save = async () => {
    setState({ busy: true });
    try {
      const j = await post({ layout: follows ? null : rows.map((p) => p.entry) });
      onSaved({ layout: j.layout });
      onClose();
    } catch (e) { setState({ error: (e as Error).message }); }
  };
  // Admin: this list becomes everyone's starting layout, and Admin follows it too.
  const makeStarting = async () => {
    if (!confirm("Make this the starting layout? Everyone who hasn't customised their own dashboard will see it.")) return;
    setState({ busy: true });
    try {
      const j = await post({ starting: rows.map((p) => p.entry) });
      await post({ layout: null });
      onSaved({ starting: j.starting, startingBy: "Admin", layout: null });
      onClose();
    } catch (e) { setState({ error: (e as Error).message }); }
  };

  const source = sources.find((s) => s.dash === tab);
  const sizeBtn = (on: boolean) => `h-7 w-8 rounded-full text-[14.5px] font-semibold transition ${on ? "bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.15)]" : "text-muted hover:text-ink"}`;
  const iconBtn = "grid size-8 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/30 p-3 sm:p-4" onMouseDown={onClose}>
      <div role="dialog" aria-label="Customise my dashboard" className="modal-in flex max-h-[94vh] w-full max-w-[1180px] flex-col rounded-2xl bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-[19px] font-bold tracking-tight text-ink">Customise my dashboard</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink">
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>
          </button>
        </div>
        <div className="no-scrollbar grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] overflow-y-auto lg:grid-cols-[minmax(0,1fr)_440px] lg:overflow-hidden">
          {/* The library: every tile, one tab at a time. */}
          <div className="no-scrollbar border-b border-line p-5 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <p className="text-[15px] font-semibold uppercase tracking-wide text-muted">Add reports</p>
            <div className="mt-2 flex flex-wrap gap-1" role="tablist" aria-label="Reports by tab">
              {sources.map((s) => {
                const n = draft.filter((e) => e.dash === s.dash).length;
                return (
                  <button key={s.dash} type="button" role="tab" aria-selected={tab === s.dash} onClick={() => setTab(s.dash)}
                    className={`rounded-full px-3.5 py-1.5 text-[15.5px] font-medium transition ${tab === s.dash ? "bg-brand-soft text-ink" : "text-muted hover:bg-surface-2 hover:text-ink"}`}>
                    {s.label}{n ? <span className="ml-1 text-brand">· {n}</span> : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-x-3 gap-y-0.5 sm:grid-cols-2">
              {source?.tiles.map((t) => {
                const on = chosen.has(entryKey({ dash: source.dash, tile: t.id }));
                return (
                  <label key={t.id} className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                    <input type="checkbox" className="size-4 shrink-0 accent-[var(--brand)]" checked={on} onChange={() => toggle(source.dash, t.id)} />
                    <span className="min-w-0 truncate text-[16px] text-ink" title={t.spec.title}>{t.spec.title}</span>
                    {isKpi(t) && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[13px] font-medium text-muted">Number</span>}
                  </label>
                );
              })}
            </div>
            <p className="mt-3 text-[14.5px] text-faint">The period, comparison and filters at the top reach every report; a saved report keeps its own period.</p>
          </div>

          {/* What's on the page, in order. */}
          <div className="no-scrollbar p-5 lg:overflow-y-auto">
            <p className="text-[15px] font-semibold uppercase tracking-wide text-muted">On your dashboard · {rows.length}</p>
            {!rows.length && <p className="mt-3 text-[15.5px] text-faint">Nothing yet — tick reports on the left.</p>}
            <ol className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-1">
              {rows.map((p, i) => {
                const size = p.entry.size ?? sizeOfW(p.tile.w);
                return (
                  <li key={entryKey(p.entry)} className="flex items-center gap-1.5 rounded-xl border border-line px-2.5 py-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px] text-ink" title={p.tile.spec.title}>{p.tile.spec.title}</p>
                      <p className="truncate text-[14px] text-muted">{p.source}</p>
                    </div>
                    {isKpi(p.tile)
                      ? <span className="hidden shrink-0 px-2 text-[14px] text-faint sm:inline" title="Numbers sit side by side in one band">Number</span>
                      : (
                        <div className="inline-flex shrink-0 rounded-full bg-surface-2 p-0.5" role="group" aria-label="Size">
                          {(["s", "m", "l"] as Size[]).map((s) => (
                            <button key={s} type="button" aria-pressed={size === s} title={{ s: "Small — a quarter of the width", m: "Medium — half", l: "Large — the whole width" }[s]}
                              className={sizeBtn(size === s)} onClick={() => resize(i, s)}>{s.toUpperCase()}</button>
                          ))}
                        </div>
                      )}
                    <button type="button" className={iconBtn} aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                      <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 12l4-4 4 4" /></svg>
                    </button>
                    <button type="button" className={iconBtn} aria-label="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                      <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 8l4 4 4-4" /></svg>
                    </button>
                    <button type="button" className={`${iconBtn} hover:text-high`} aria-label={`Remove ${p.tile.spec.title}`} onClick={() => edit(draft.filter((e) => entryKey(e) !== entryKey(p.entry)))}>×</button>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          <button type="button" className={btn.quiet} disabled={state.busy} onClick={() => { setDraft(place(starting, sources).map((p) => p.entry)); setFollows(true); }}
            title={startingBy ? `Set by ${startingBy}` : undefined}>Reset to starting layout</button>
          {admin && <button type="button" className={btn.quiet} disabled={state.busy || !rows.length} onClick={makeStarting}>Make this the starting layout</button>}
          {state.error && <span className="text-[15px] text-high">{state.error}</span>}
          <div className="ml-auto flex gap-2">
            <button type="button" className={btn.ghost} onClick={onClose}>Cancel</button>
            <button type="button" className={btn.primary} disabled={state.busy} onClick={save}>{state.busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
