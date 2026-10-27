"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DASHBOARDS, type Tile } from "@/lib/analytics/dashboards";
import { datasetOf } from "@/lib/analytics/model";
import type { Spec } from "@/lib/analytics/query";
import { btn } from "../ui";
import { Builder } from "./Builder";
import { DashboardView, TileCard } from "./Dashboard";
import { GoalMeter } from "./GoalMeter";
import { type Answer, type Meta, runSpecs, stamp, withPeriod } from "./shared";

/*
 * Reports (sidebar → Reports): the official dashboards (Sales, Trainings, Quotes), the team's saved reports, and the
 * builder. Data: Zoho Analytics' copy of Zoho Books (refreshed on its own every few hours; Admin can refresh now) and the
 * Training board live. ANALYTICS-PLAN.md has the whole plan.
 */

type Saved = { id: string; spec: Spec; by: string; updatedAt: string; mine: boolean };
type TabKey = string; // a dashboard id or "saved"

export function Reports() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>(() => { try { return localStorage.getItem("th.reports.tab") || "sales"; } catch { return "sales"; } });
  const [saved, setSaved] = useState<{ canBuild: boolean; reports: Saved[] } | null>(null);
  const [builder, setBuilder] = useState<{ spec?: Spec; id?: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadMeta = useCallback(() => fetch("/api/analytics").then((r) => r.json()).then((j: Meta) => setMeta(j)).catch(() => setError("Couldn't reach the server")), []);
  const loadSaved = useCallback(() => fetch("/api/analytics/reports").then((r) => r.json()).then(setSaved).catch(() => {}), []);
  useEffect(() => { loadMeta(); loadSaved(); }, [loadMeta, loadSaved]);
  useEffect(() => { try { localStorage.setItem("th.reports.tab", tab); } catch {} }, [tab]);

  const dashboards = useMemo(() => DASHBOARDS.filter((d) => meta && d.tiles.every((t) => meta.datasets.includes(t.spec.dataset))), [meta]);
  const current = dashboards.find((d) => d.id === tab);

  const refresh = async () => {
    setRefreshing(true);
    const r = await fetch("/api/analytics", { method: "PUT" }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setRefreshing(false);
    if (j.error) setError(j.error);
    await loadMeta();
  };

  if (error && !meta) return <p className="text-[14px] text-high">{error}</p>;
  if (!meta) return <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />;
  if (!meta.datasets.length) return <p className="text-[14px] text-muted">Reports cover the Training board's data — your boards don't include it.</p>;

  const st = meta.state;
  const goal = meta.datasets.includes("sales");
  return (
    // The monthly goal sits on the left of every tab (owner, 27 Oct); on narrower screens it's a strip on top.
    <div className={goal ? "grid gap-4 xl:grid-cols-[14rem_minmax(0,1fr)] xl:gap-5" : ""}>
      {goal && <aside className="xl:sticky xl:top-4 xl:self-start"><GoalMeter today={meta.today} admin={meta.admin} /></aside>}
    <div className="min-w-0">
      {/* One row: the tabs and + New report (the dashboard's description is the tab's tooltip; data freshness is at the
          bottom of the page — owner, 27 Oct: "too congested"). */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="inline-flex flex-wrap rounded-full bg-surface-2 p-0.5" role="tablist" aria-label="Dashboards">
          {[...dashboards.map((d) => ({ id: d.id, label: d.title, desc: d.desc })), { id: "saved", label: `Saved reports${saved?.reports.length ? ` (${saved.reports.length})` : ""}`, desc: "Reports the team has made and saved" }].map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} title={t.desc}
              className={`rounded-full px-4 py-1.5 text-[14px] font-medium transition ${tab === t.id ? "bg-surface text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]" : "text-muted hover:text-ink"}`}>{t.label}</button>
          ))}
        </div>
        <button className={`${btn.primary} ml-auto`} onClick={() => setBuilder({})}>+ New report</button>
      </div>
      <div className="mt-4">
        {current ? <DashboardView def={current} today={meta.today} />
          : <SavedReports list={saved?.reports ?? []} today={meta.today} canBuild={Boolean(saved?.canBuild)} onEdit={(r) => setBuilder({ spec: r.spec, id: r.id })} onChanged={loadSaved} onNew={() => setBuilder({})} />}
      </div>
      <p className="mt-8 text-[13px] text-faint" title={st.error ? `Last refresh: ${st.error}` : undefined}>
        {current ? `${current.desc} · ` : ""}Zoho data copied {stamp(st.refreshedAt)}{st.running || refreshing ? " · refreshing…" : ""}{st.error ? " · last refresh had a problem" : ""}
        {meta.admin && !st.running && !refreshing && <> · <button type="button" className="font-semibold text-brand hover:underline" onClick={refresh}>Refresh now</button></>}
      </p>
    </div>
      {/* Drawn on the page itself (portal): inside the page it centred on the whole (long) page, not the screen. */}
      {builder && createPortal(<Builder initial={builder.spec} savedId={builder.id} datasets={meta.datasets} today={meta.today} canSave={Boolean(saved?.canBuild)} onClose={() => setBuilder(null)} onSaved={() => { loadSaved(); setTab("saved"); }} />, document.body)}
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
        <p className="text-[14px] text-ink-2">No saved reports yet.</p>
        <p className="max-w-md text-[13px] text-muted">{canBuild ? "Make one with + New report — pick the data, what to measure and how to split it, then save it for the team." : "Admin, Ashish, Shikha and Sumit save reports here for everyone."}</p>
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
