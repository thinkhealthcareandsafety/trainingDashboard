"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DASHBOARDS, type DashboardDef, type Tile, tabOf } from "@/lib/analytics/dashboards";
import { type CustomDash, addItem, addPage, fromDef, fullness, newId, savedTile, toDef } from "@/lib/analytics/custom";
import type { Target } from "./Builder";
import { EditBar } from "./Editor";
import { datasetOf } from "@/lib/analytics/model";
import type { Spec } from "@/lib/analytics/query";
import { btn } from "../ui";
import { Builder } from "./Builder";
import { DashboardView, TileCard, pagesOf } from "./Dashboard";
import { GoalMeter } from "./GoalMeter";
import { registerExtras } from "@/lib/analytics/extras";
import { MyDashboard, type Prefs } from "./MyDashboard";
import { type Answer, type Meta, forgetAnswers, runSpecs, stamp, withPeriod } from "./shared";

/*
 * Reports (sidebar → Reports): the official dashboards (Sales, Trainings, Quotes), the team's saved reports, and the
 * builder. Data: Zoho Analytics' copy of Zoho Books (refreshed on its own every few hours; Admin can refresh now) and the
 * Training board live. ANALYTICS-PLAN.md has the whole plan.
 */

type Saved = { id: string; spec: Spec; by: string; updatedAt: string; mine: boolean };
type TabKey = string; // "mine", a dashboard id or "saved"

export function Reports() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState("");
  // Opens on My dashboard the first time (owner, 27 Oct), then on the tab last used.
  const [tab, setTab] = useState<TabKey>(() => { try { return tabOf((localStorage.getItem("th.reports.mine") && localStorage.getItem("th.reports.tab")) || "mine"); } catch { return "mine"; } });
  const [saved, setSaved] = useState<{ canBuild: boolean; reports: Saved[] } | null>(null);
  const [builder, setBuilder] = useState<{ spec?: Spec; id?: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Editing a dashboard (owner, 29 Oct): a copy of it, and whether it's new / a built-in tab not edited yet.
  const [editing, setEditing] = useState<{ draft: CustomDash; fresh: boolean; mine?: boolean } | null>(null);

  // The other Zoho columns go on the datasets before anything reads them (REPORT-BUILDER-PLAN step 1).
  const loadMeta = useCallback(() => fetch("/api/analytics").then((r) => r.json()).then((j: Meta) => { registerExtras(j.columns ?? {}); setMeta(j); }).catch(() => setError("Couldn't reach the server")), []);
  const loadSaved = useCallback(() => fetch("/api/analytics/reports").then((r) => r.json()).then(setSaved).catch(() => {}), []);
  // My dashboard's list + the tabs this person hid ("Select Dashboards to display", owner 29 Oct) — per person, server.
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  // The team's dashboards and edited tabs (owner, 29 Oct), and the built-in tabs Admin deleted.
  const [team, setTeam] = useState<{ dashboards: CustomDash[]; hidden: string[]; canEdit: boolean; admin: boolean }>({ dashboards: [], hidden: [], canEdit: false, admin: false });
  const loadTeam = useCallback(() => fetch("/api/analytics/dashboards").then((r) => r.json()).then((j) => { if (Array.isArray(j.dashboards)) setTeam(j); }).catch(() => {}), []);
  useEffect(() => {
    loadMeta(); loadSaved(); loadTeam();
    fetch("/api/analytics/prefs").then((r) => r.json())
      .then((j) => setPrefs({ layout: j.layout ?? null, starting: j.starting ?? null, startingBy: j.startingBy, hidden: j.hidden ?? [] }))
      .catch(() => setPrefs({ layout: null, starting: null, hidden: [] }));
  }, [loadMeta, loadSaved, loadTeam]);
  useEffect(() => { try { localStorage.setItem("th.reports.tab", tab); localStorage.setItem("th.reports.mine", "1"); } catch {} }, [tab]);

  // Each report shows to whoever may read its data (Money: the margin pages are Admin's); an Admin tab whole or not at all.
  const builtIns = useMemo(() => (meta ? DASHBOARDS.map((d) => ({ ...d, tiles: d.tiles.filter((t) => meta.datasets.includes(t.spec.dataset)) })).filter((d) => d.tiles.length && (!d.admin || meta.admin)) : []), [meta]);
  // The tabs: each built-in one (or the team's version of it), then the dashboards the team made.
  const dashboards = useMemo<DashboardDef[]>(() => {
    const savedList = saved?.reports ?? [];
    const own = (id: string) => team.dashboards.find((c) => c.base === id);
    return [
      ...builtIns.filter((d) => !team.hidden.map(tabOf).includes(d.id)).map((d) => { const c = own(d.id); return c ? toDef(c, builtIns, savedList) : d; }),
      // (My dashboard and the starting one aren't tabs.)
      ...team.dashboards.filter((c) => !c.base && c.id !== "mine" && !c.id.startsWith("my-")).map((c) => toDef(c, builtIns, savedList)),
    ];
  }, [builtIns, team, saved]);
  // A tab hidden before the merge hides the tab it went into (owner's rule for phase 3).
  const hidden = (prefs?.hidden ?? []).map(tabOf);
  const shown = hidden.includes(tab) ? "mine" : tab; // a hidden tab that was open falls back to My dashboard
  const current = dashboards.find((d) => d.id === shown);
  // A dashboard as it would be edited (the team's version, or a built-in tab in places of 4).
  const editable = useCallback((def: DashboardDef): CustomDash => (def.custom ? structuredClone(def.custom) : fromDef(def, pagesOf(def, false))), []);
  const targets = useMemo(() => (team.canEdit ? dashboards.map((d) => ({ id: d.id, title: d.title, pages: editable(d).pages.map((p) => ({ name: p.name, free: 100 - fullness(p) })) })) : []), [team.canEdit, dashboards, editable]);
  // A new report on the dashboard picked in the builder: a number joins a place of numbers with room, a chart takes a
  // place; a full page (or "+ New page") gets a new page after the last one.
  const place = async (id: string | undefined, to: Target, spec: Spec) => {
    loadSaved();
    if (!id || !to) { setTab("saved"); return; }
    const def = dashboards.find((d) => d.id === to.dash);
    let draft: CustomDash = def ? editable(def) : { id: newId("d-"), title: to.newTitle?.trim() || "New dashboard", shared: true, pages: [] };
    const ref = { dash: "saved", tile: id };
    const t = savedTile({ id, spec, by: "" });
    // On the page picked, at its first free place; no room (or "+ New page") → a new page at the end.
    let tried = to.page >= 0 && draft.pages[to.page] ? addItem(draft, to.page, ref, t) : { error: "new page" };
    if ("error" in tried) { draft = addPage(draft); tried = addItem(draft, draft.pages.length - 1, ref, t); }
    if ("error" in tried) { alert(`Saved in Saved reports, but not put on the dashboard: ${tried.error}`); setTab("saved"); return; }
    const r = await fetch("/api/analytics/dashboards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dashboard: tried }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : { error: "Couldn't reach the server" };
    if (j.error) { alert(`Saved in Saved reports, but not put on the dashboard: ${j.error}`); setTab("saved"); return; }
    await loadTeam();
    setTab(tried.id);
  };
  const editDef = useMemo(() => (editing ? toDef(editing.draft, builtIns, saved?.reports ?? []) : null), [editing, builtIns, saved]);
  const allTabs = [...dashboards.map((d) => ({ id: d.id, label: d.title, desc: d.desc })), { id: "saved", label: `Saved reports${saved?.reports.length ? ` (${saved.reports.length})` : ""}`, desc: "Reports the team has made and saved" }];

  const refresh = async () => {
    setRefreshing(true);
    const r = await fetch("/api/analytics", { method: "PUT" }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setRefreshing(false);
    forgetAnswers(); // the kept answers are from the old copy
    if (j.error) setError(j.error);
    await loadMeta();
  };

  if (error && !meta) return <p className="text-[16px] text-high">{error}</p>;
  if (!meta) return <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />;
  if (!meta.datasets.length) return <p className="text-[16px] text-muted">Reports cover the Training board's data — your boards don't include it.</p>;

  const st = meta.state;
  const goal = meta.datasets.includes("sales");
  return (
    // The monthly goal sits on the left of every tab (owner, 27 Oct); on narrower screens it's a strip on top.
    <div className={goal ? "grid gap-4 xl:grid-cols-[15rem_minmax(0,1fr)] xl:gap-5" : ""}>
      {goal && <aside className="xl:sticky xl:top-4 xl:self-start"><GoalMeter today={meta.today} admin={meta.admin} /></aside>}
    <div className="min-w-0">
      {/* One row: the tabs and + New report (the dashboard's description is the tab's tooltip; data freshness is at the
          bottom of the page — owner, 27 Oct: "too congested"). */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="inline-flex flex-wrap rounded-full bg-surface-2 p-0.5" role="tablist" aria-label="Dashboards">
          {[{ id: "mine", label: "My dashboard", desc: "Your own choice of reports from every tab" }, ...allTabs.filter((t) => !hidden.includes(t.id))].map((t) => (
            <button key={t.id} role="tab" aria-selected={shown === t.id} onClick={() => setTab(t.id)} title={t.desc}
              className={`rounded-full px-3 py-1.5 text-[15px] font-medium transition ${shown === t.id ? "bg-surface text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]" : "text-muted hover:text-ink"}`}>{t.label}</button>
          ))}
        </div>
        {team.canEdit && <button className={`${btn.ghost} ml-auto`} onClick={() => setEditing({ fresh: true, draft: { id: newId("d-"), title: "New dashboard", shared: true, pages: [{ id: newId("p"), name: "Page 1", items: [] }] } })}>+ New dashboard</button>}
        <button className={`${btn.primary} ${team.canEdit ? "" : "ml-auto"}`} onClick={() => setBuilder({})} title="New report">+ New report</button>
      </div>
      <div className="mt-4">
        {editing ? (
          // Editing in place (owner, 29 Oct): the dashboard itself, with the bar on top.
          <DashboardView def={editDef!} today={meta.today} edit={{
            draft: editing.draft, builtIns, saved: saved?.reports ?? [],
            onChange: (draft) => setEditing({ ...editing, draft }),
            bar: <EditBar draft={editing.draft} fresh={editing.fresh} mine={editing.mine} admin={team.admin} onChange={(draft) => setEditing({ ...editing, draft })}
              onCancel={() => setEditing(null)} onDone={(id) => { setEditing(null); loadTeam(); setTab(id); }} />,
          }} />
        ) : shown === "mine" ? <MyDashboard today={meta.today} admin={team.admin} builtIns={builtIns} saved={saved ? saved.reports : null} prefs={prefs}
            mine={team.dashboards.find((c) => c.id === "mine")} start={team.dashboards.find((c) => c.id === "my-start")}
            tabs={allTabs.map((t) => ({ id: t.id, label: t.label.replace(/ \(\d+\)$/, "") }))}
            deleted={builtIns.filter((d) => team.hidden.map(tabOf).includes(d.id)).map((d) => ({ id: d.id, label: d.title }))}
            onPrefs={(patch) => setPrefs((p) => (p ? { ...p, ...patch } : p))}
            onEdit={(draft, fresh) => setEditing({ draft, fresh, mine: true })}
            onUnhide={(id) => { fetch("/api/analytics/dashboards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hide: id, hidden: false }) }).then(loadTeam).catch(() => {}); }} />
          : current ? <DashboardView def={current} today={meta.today} tools={team.canEdit ? (
            <button type="button" className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-[16px] font-medium text-ink-2 transition hover:border-line-strong"
              onClick={() => setEditing({ fresh: !current.custom, draft: current.custom ?? fromDef(current, pagesOf(current, false)) })}>✎ Edit dashboard</button>
          ) : undefined} />
          : <SavedReports list={saved?.reports ?? []} today={meta.today} canBuild={Boolean(saved?.canBuild)} onEdit={(r) => setBuilder({ spec: r.spec, id: r.id })} onChanged={loadSaved} onNew={() => setBuilder({})} />}
      </div>
      <p className="mt-8 text-[15px] text-faint" title={st.error ? `Last refresh: ${st.error}` : undefined}>
        {current ? `${current.desc} · ` : ""}Zoho data copied {stamp(st.refreshedAt)}{st.running || refreshing ? " · refreshing…" : ""}{st.error ? " · last refresh had a problem" : ""}
        {meta.admin && !st.running && !refreshing && <> · <button type="button" className="font-semibold text-brand hover:underline" onClick={refresh}>Refresh now</button></>}
      </p>
    </div>
      {/* Drawn on the page itself (portal): inside the page it centred on the whole (long) page, not the screen. */}
      {builder && createPortal(<Builder initial={builder.spec} savedId={builder.id} datasets={meta.datasets} today={meta.today} canSave={Boolean(saved?.canBuild)} onClose={() => setBuilder(null)} onSaved={place} targets={targets} defaultTarget={current?.id} />, document.body)}
    </div>
  );
}

function SavedReports({ list, today, canBuild, onEdit, onChanged, onNew }: { list: Saved[]; today: string; canBuild: boolean; onEdit: (r: Saved) => void; onChanged: () => void; onNew: () => void }) {
  const [answers, setAnswers] = useState<Answer[]>([]);
  const specs = useMemo(() => list.map((r) => withPeriod(r.spec, today)), [list, today]);
  useEffect(() => { runSpecs(specs).then((j) => setAnswers(j.results)); }, [specs]);
  if (!list.length) {
    return (
      <div className="card grid place-items-center gap-2 p-10 text-center">
        <p className="text-[16px] text-ink-2">No saved reports yet.</p>
        <p className="max-w-md text-[15px] text-muted">{canBuild ? "Make one with + New report — pick the data, what to measure and how to split it, then save it for the team." : "Admin, Ashish, Shikha, Sumit and Nikita save reports here for everyone."}</p>
        {canBuild && <button className={`${btn.primary} mt-2`} onClick={onNew}>+ New report</button>}
      </div>
    );
  }
  const remove = async (id: string) => {
    if (!confirm("Delete this report for everyone?")) return;
    await fetch(`/api/analytics/reports?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    onChanged();
  };
  return (
    <div className="grid grid-cols-12 gap-4">
      {list.map((r, i) => {
        const tile: Tile = { id: r.id, spec: r.spec, w: !r.spec.by?.length ? 3 : 6 };
        return (
          <TileCard key={r.id} tile={tile} spec={specs[i]} answer={answers[i]} accent={i}
            meta={`${r.by.split(" ")[0]} · ${datasetOf(r.spec.dataset)?.label} · ${stamp(r.updatedAt)}`}
            menu={r.mine ? [{ label: "Edit", onClick: () => onEdit(r) }, { label: "Delete", onClick: () => remove(r.id), danger: true }] : []} />
        );
      })}
    </div>
  );
}
