"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { DashboardDef } from "@/lib/analytics/dashboards";
import { type CustomDash, MAX_KPIS, type Page, PLACES, type SavedRef, newId, placesOf, placesUsed, tileOf, toDef } from "@/lib/analytics/custom";
import { type LayoutEntry, START } from "@/lib/analytics/layout";
import { btn } from "../ui";
import { DashboardView } from "./Dashboard";

/*
 * My dashboard (owner, 27 Oct — ANALYTICS-PLAN §11 (f)): the first Reports tab, each person's own reports. Since 29 Oct
 * it is a dashboard like the others (custom.ts): pages of 4 places, edited with the same editor ("✎ Edit dashboard"),
 * stored on the server as the person's own (id "mine"). Nobody edited theirs yet → Admin's starting dashboard
 * ("my-start"), else their list from before pages (reportPrefs.layout / the old starting list / START), in pages of 4.
 * "Tabs" = which Reports tabs show (owner, 29 Oct: "Select Dashboards to display"), and Admin brings deleted tabs back.
 */

export type SavedReport = SavedRef;
/** `hidden`: the Reports tabs this person unticked under "Select Dashboards to display" (owner, 29 Oct). */
export type Prefs = { layout: LayoutEntry[] | null; starting: LayoutEntry[] | null; startingBy?: string; hidden: string[] };
export type TabChoice = { id: string; label: string };

/** The list from before pages (27–29 Oct) → pages of 4 places: numbers 4 to a place, "large" charts wide. */
function fromEntries(entries: LayoutEntry[], builtIns: DashboardDef[], saved: SavedRef[]): CustomDash {
  const pages: Page[] = [];
  let cur: Page = { id: newId("p"), name: "Page 1", slots: [] };
  const push = (slot: Page["slots"][number]) => {
    if (placesUsed(cur) + placesOf(slot) > PLACES) { pages.push(cur); cur = { id: newId("p"), name: `Page ${pages.length + 1}`, slots: [] }; }
    cur.slots.push(slot);
  };
  for (const e of entries) {
    const ref = { dash: e.dash, tile: e.tile };
    const t = tileOf(ref, builtIns, saved);
    if (!t) continue;
    if (t.spec.chart === "kpi") {
      const last = cur.slots.at(-1);
      if (last?.kpis && last.refs.length < MAX_KPIS) last.refs.push(ref);
      else push({ id: newId("s"), kpis: true, refs: [ref] });
    } else push({ id: newId("s"), refs: [ref], ...(e.size === "l" || (!e.size && t.w === 12) ? { wide: true } : {}) });
  }
  pages.push(cur);
  return { id: "mine", title: "My dashboard", shared: false, pages };
}

export function MyDashboard({ today, admin, builtIns, saved, prefs, mine, start, tabs, deleted, onPrefs, onEdit, onUnhide }: {
  today: string; admin: boolean; builtIns: DashboardDef[]; saved: SavedRef[] | null;
  /** Loaded by Reports (it needs `hidden` for the tab bar). */
  prefs: Prefs | null;
  /** This person's own dashboard, and Admin's starting one. */
  mine?: CustomDash; start?: CustomDash;
  tabs: TabChoice[]; deleted: TabChoice[];
  onPrefs: (patch: Partial<Prefs>) => void;
  onEdit: (draft: CustomDash, fresh: boolean) => void;
  onUnhide: (id: string) => void;
}) {
  const [tabsOpen, setTabsOpen] = useState(false);
  const base = useMemo<CustomDash | null>(() => mine ?? start ?? (prefs ? fromEntries(prefs.layout ?? prefs.starting ?? START, builtIns, saved ?? []) : null), [mine, start, prefs, builtIns, saved]);
  const def = useMemo<DashboardDef | null>(() => base && {
    ...toDef({ ...base, id: "mine" }, builtIns, saved ?? []), id: "mine", title: "My dashboard",
    desc: "Your own reports from every tab — ✎ Edit dashboard to add, arrange and page them.",
  }, [base, builtIns, saved]);

  // Wait for the saved reports too when it has some — else the page would draw twice.
  const needsSaved = base?.pages.some((p) => p.slots.some((s) => s.refs.some((r) => r.dash === "saved")));
  if (!def || !base || (saved === null && needsSaved)) return <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />;

  const tools = (
    <>
      <button type="button" onClick={() => onEdit({ ...structuredClone(base), id: "mine", title: "My dashboard", shared: false }, !mine)}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-[16px] font-medium text-ink-2 transition hover:border-line-strong">✎ Edit dashboard</button>
      <button type="button" onClick={() => setTabsOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-[16px] font-medium text-ink-2 transition hover:border-line-strong">
        <svg viewBox="0 0 20 20" className="size-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M4 6h7M15 6h1M4 14h1M9 14h7" /><circle cx="13" cy="6" r="2" /><circle cx="7" cy="14" r="2" /></svg>
        Tabs
      </button>
    </>
  );
  return (
    <>
      {def.tiles.length ? <DashboardView def={def} today={today} tools={tools} /> : (
        <div className="card grid place-items-center gap-2 p-10 text-center">
          <p className="text-[16px] text-ink-2">Nothing on your dashboard yet.</p>
          <p className="max-w-md text-[15px] text-muted">Pick the reports you look at most — from any tab, or the team&apos;s saved reports.</p>
          <div className="mt-2 flex gap-2">{tools}</div>
        </div>
      )}
      {tabsOpen && prefs && createPortal(
        <TabsPicker tabs={tabs} hidden={prefs.hidden} deleted={admin ? deleted : []} onUnhide={onUnhide} onClose={() => setTabsOpen(false)} onSaved={onPrefs} />,
        document.body,
      )}
    </>
  );
}

/** "Select Dashboards to display" (owner, 29 Oct) — which tabs show for me; Admin also brings deleted tabs back. */
function TabsPicker({ tabs, hidden, deleted, onUnhide, onClose, onSaved }: {
  tabs: TabChoice[]; hidden: string[]; deleted: TabChoice[]; onUnhide: (id: string) => void; onClose: () => void; onSaved: (patch: Partial<Prefs>) => void;
}) {
  const [off, setOff] = useState<string[]>(hidden);
  const [state, setState] = useState<{ busy?: boolean; error?: string }>({});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const save = async () => {
    setState({ busy: true });
    const r = await fetch("/api/analytics/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hidden: off }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : { error: "Couldn't reach the server" };
    if (!r?.ok || j.error) return setState({ error: j.error ?? "Couldn't save" });
    onSaved({ hidden: off });
    onClose();
  };
  return (
    <div className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/30 p-3 sm:p-4" onMouseDown={onClose}>
      <div role="dialog" aria-label="Select dashboards to display" className="modal-in w-full max-w-[760px] rounded-2xl bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="border-b border-line px-5 py-3.5">
          <h2 className="text-[19px] font-bold tracking-tight text-ink">Select Dashboards to display</h2>
          <p className="text-[15px] text-muted">Only for you — unticked tabs leave your tab bar; their reports can still go on your dashboard.</p>
        </div>
        <div className="flex flex-wrap gap-x-1 gap-y-0.5 px-5 py-4">
          {[{ id: "mine", label: "My dashboard" }, ...tabs].map((t) => (
            <label key={t.id} className={`flex items-center gap-2 rounded-lg px-2 py-1 ${t.id === "mine" ? "opacity-60" : "cursor-pointer hover:bg-surface-2"}`} title={t.id === "mine" ? "Always shown" : undefined}>
              <input type="checkbox" className="size-4 shrink-0 accent-[var(--brand)]" checked={!off.includes(t.id)} disabled={t.id === "mine"}
                onChange={() => setOff(off.includes(t.id) ? off.filter((x) => x !== t.id) : [...off, t.id])} />
              <span className="text-[16px] text-ink">{t.label}</span>
            </label>
          ))}
        </div>
        {deleted.length > 0 && (
          <div className="border-t border-line px-5 py-3">
            <p className="text-[15px] font-semibold uppercase tracking-wide text-muted">Deleted tabs (Admin)</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {deleted.map((t) => <button key={t.id} type="button" className={btn.ghost} onClick={() => onUnhide(t.id)}>Bring back {t.label}</button>)}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 border-t border-line px-5 py-3">
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
