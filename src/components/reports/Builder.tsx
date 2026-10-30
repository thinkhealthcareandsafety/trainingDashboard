"use client";

import { useEffect, useMemo, useState } from "react";
import { DATASETS, type Grain, datasetOf, fieldOf, measureOf, periods } from "@/lib/analytics/model";
import type { ChartKind, Filter, Spec } from "@/lib/analytics/query";
import { describeSpec } from "@/lib/analytics/describe";
import { AGGS, extraNumbers } from "@/lib/analytics/extras";
import { STATUS_COLUMN, TABLE_AGGS, VOID_OR_DRAFT, isTableKey, tableNumbers } from "@/lib/analytics/tables";
import { btn, inputCls } from "../ui";
import { Chart, resolveKind } from "./Chart";
import { type Answer, MultiSelect, type TableList, isError, loadTables, runSpecs, useFieldValues, withPeriod } from "./shared";

/*
 * The report builder (owner, 30 Oct: "I should rather have columns and attributes … if I select 3 of these what am I
 * getting … everything is too jumbled" — REPORT-BUILDER-PLAN.md, step 1). Three panes, one job each, like Tableau:
 *   Data   — the attributes (text / dates) and numbers of the chosen data, each with what it means; click or drag one in.
 *   Build  — shelves: Rows (one bar / line point / table row per value), Colour (splits each into colours), Values (the
 *            numbers), Filters, When — then the live preview and a "You'll get …" sentence (describe.ts).
 *   Format — title, chart, how many, order.
 * The saved shape is the same Spec as before, so every saved report and dashboard tile opens here unchanged. Builders
 * (Admin, Ashish, Shikha, Sumit, Nikita) save for the whole team; everyone else can still explore and download.
 * A new report starts with "Pick a Zoho table" (owner's plan of 30 Oct, points 1–6; tables.ts): the table's words and
 * dates are the attributes, its numbers the values (Sum / Average / Min / Max / Count / Count distinct), the tables it
 * links to come along. The ready-made data (Sales, Quotes…) stays only for the saved reports built on it.
 */

const CHARTS: { value: ChartKind; label: string }[] = [
  { value: "auto", label: "Suggested" }, { value: "column", label: "Columns" }, { value: "bar", label: "Bars" }, { value: "line", label: "Line" },
  { value: "area", label: "Area" }, { value: "stacked", label: "Stacked" }, { value: "donut", label: "Donut" }, { value: "table", label: "Table" }, { value: "kpi", label: "Number" },
];
const GRAINS: { value: Grain; label: string }[] = [{ value: "month", label: "Month" }, { value: "quarter", label: "Quarter" }, { value: "fy", label: "Financial year" }, { value: "week", label: "Week" }, { value: "day", label: "Day" }];
const MAX_VALUES = 4;

export function autoTitle(s: Spec): string {
  const d = datasetOf(s.dataset);
  if (!d) return "Report";
  const m = s.measures.map((k) => measureOf(d, k)?.label).filter(Boolean).join(" & ");
  const by = (s.by ?? []).map((k) => (k === d.dateField || fieldOf(d, k)?.kind === "date" ? (GRAINS.find((g) => g.value === (s.grain ?? "month"))?.label ?? "month").toLowerCase()
    // A linked table's column reads by its own name: "by customer name", not "by customer name (customers)".
    : fieldOf(d, k)?.label.replace(fieldOf(d, k)?.table ? / \([^)]*\)$/ : /$^/, "").toLowerCase())).filter(Boolean);
  return `${m}${by.length ? ` by ${by.join(" and ")}` : ""}`;
}

/** Where a new report goes (owner, 29 Oct: "select what dashboard it goes in, or create a new dashboard"): a dashboard
 *  and one of its pages (index; -1 = a new page), a new dashboard, or only Saved reports. */
export type Target = { dash: string; page: number; newTitle?: string } | null;
export type TargetChoice = { id: string; title: string; pages: { name: string; free: number }[] };

type Pane = "data" | "build" | "format";

export function Builder({ initial, datasets, today, canSave, savedId, onClose, onSaved, targets = [], defaultTarget, admin = false }: {
  initial?: Spec; datasets: string[]; today: string; canSave: boolean; savedId?: string; onClose: () => void; onSaved: (id: string | undefined, target: Target, spec: Spec) => void;
  targets?: TargetChoice[]; defaultTarget?: string; admin?: boolean;
}) {
  // The ready-made data only for a saved report built on it; everything new starts from a Zoho table.
  const legacy = initial && !isTableKey(initial.dataset) ? DATASETS.filter((d) => d.key === initial.dataset && datasets.includes(d.key)) : [];
  const [tables, setTables] = useState<TableList | null>(null);
  useEffect(() => { loadTables().then(setTables); }, []);
  // A new report starts empty — nothing is picked for you (owner, 30 Oct: "why does it come here automatically").
  const [spec, setSpec] = useState<Spec>(() => initial ?? { dataset: "", measures: [], by: [], period: "fy", chart: "auto", limit: 10 });
  const [title, setTitle] = useState(initial?.title ?? "");
  const [answer, setAnswer] = useState<Answer | undefined>();
  const [saving, setSaving] = useState<{ busy?: boolean; error?: string }>({});
  const [pane, setPane] = useState<Pane>("build");
  const [search, setSearch] = useState("");
  // Why a drop or click didn't do what it looked like (owner, 30 Oct: "I can't even place this in the colours").
  const [note, setNote] = useState("");
  // Undefined until a table is picked (or while the table list loads for a saved Zoho-table report).
  const d0 = tables || !isTableKey(spec.dataset) ? datasetOf(spec.dataset) : undefined;
  const d = d0!;
  const zt = isTableKey(spec.dataset);
  const set = (patch: Partial<Spec>) => setSpec((s) => ({ ...s, ...patch }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("[aria-expanded=true]")) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Live preview (debounced).
  const query = useMemo(() => withPeriod({ ...spec, title: title || autoTitle(spec) }, today), [spec, title, today]);
  useEffect(() => {
    let live = true;
    if (!query.measures.length || !d0) { setAnswer(undefined); return; }
    const t = setTimeout(() => runSpecs([query]).then((j) => { if (live) setAnswer(j.results[0]); }), 250);
    return () => { live = false; clearTimeout(t); };
  }, [query, d0]);

  const changeDataset = (key: string) => {
    const nd = datasetOf(key);
    if (!nd) return;
    setNote("");
    setSearch("");
    setSpec((s) => ({ ...s, dataset: key, measures: [], dateField: undefined, by: (s.by ?? []).filter((b) => fieldOf(nd, b)), filters: (s.filters ?? []).filter((f) => fieldOf(nd, f.field)) }));
    // Invoices, Quotes, Sales Orders, Bills open with a visible "Status is not Void / Draft" — removable (plan, point 6).
    // Its values are the table's own spellings, read from the data.
    const status = STATUS_COLUMN[nd.label];
    if (!status || !fieldOf(nd, status)) return;
    runSpecs([{ dataset: key, measures: ["rows"], by: [status] }]).then((j) => {
      const r = j.results[0];
      const values = r && !isError(r) ? r.rows.map((row) => row.keys[0]).filter((v) => VOID_OR_DRAFT.test(v)) : [];
      if (values.length) setSpec((s) => (s.dataset !== key || (s.filters ?? []).some((f) => f.field === status) ? s : { ...s, filters: [...(s.filters ?? []), { field: status, values, exclude: true }] }));
    });
  };
  const by = spec.by ?? [];
  // Shelves. Rows = by[0]; Colour = by[1] (needs Rows); Values = measures (1–4).
  const setRows = (k: string | null) => set({ by: k ? [k, ...by.slice(1)].filter((x, i, a) => a.indexOf(x) === i) : by.slice(1, 2) });
  const setColour = (k: string | null) => {
    setNote("");
    if (!k) return set({ by: by.slice(0, 1) });
    if (!by[0]) return setNote("Colour splits the rows — put something on Rows first.");
    if (k === by[0]) {
      // The date on Rows by month / quarter, and again on Colour: colour by financial year (Tableau: YEAR(date) on Colour).
      if (!zt && k === d.dateField && fieldOf(d, "fy") && (spec.grain ?? "month") !== "fy") return set({ by: [by[0], "fy"] });
      return setNote(`${label(k)} is already on Rows — Colour needs a different attribute (e.g. Sector, Customer type).`);
    }
    set({ by: [by[0], k] });
  };
  const toggleValue = (k: string) => {
    const has = spec.measures.includes(k);
    set({ measures: has ? spec.measures.filter((m) => m !== k) : [...spec.measures, k].slice(-MAX_VALUES) });
  };
  // A click in the Data pane puts the field on the obvious shelf; clicking it again takes it off.
  const pickAttribute = (k: string) => {
    if (by.includes(k)) return by[0] === k ? setRows(null) : setColour(null);
    if (!by[0]) setRows(k); else setColour(k);
  };
  const drop = (shelf: "rows" | "colour" | "values" | "filters", payload: string) => {
    const i = payload.indexOf(":");
    const kind = payload.slice(0, i), key = payload.slice(i + 1);
    if (i < 0 || !key) return;
    // A word or date dropped on Values on a Zoho table counts its different values (Tableau's COUNTD).
    if (kind === "attr" && shelf === "values" && zt) { if (!spec.measures.includes(`distinct:${key}`)) toggleValue(`distinct:${key}`); return; }
    if (kind === "num") {
      if (shelf !== "values") return setNote("Numbers go on Values — Rows, Colour and Filters take attributes (words and dates).");
      if (!spec.measures.includes(key)) toggleValue(key);
      return;
    }
    setNote("");
    if (shelf === "rows") setRows(key);
    else if (shelf === "colour") setColour(key);
    else if (shelf === "filters" && key !== d.dateField && !(spec.filters ?? []).some((f) => f.field === key)) set({ filters: [...(spec.filters ?? []), { field: key, values: [] }] });
  };
  const isDateField = (k?: string) => Boolean(d0 && k && (k === d.dateField || fieldOf(d, k)?.kind === "date"));

  const [where, setWhere] = useState<Target>(() => (defaultTarget && targets.some((t) => t.id === defaultTarget) ? { dash: defaultTarget, page: 0 } : null));
  const target = where && where.dash !== "new" ? targets.find((t) => t.id === where.dash) : undefined;
  const save = async () => {
    setSaving({ busy: true });
    const body = { id: savedId, spec: { ...spec, from: undefined, to: undefined, title: title.trim() || autoTitle(spec) } };
    const r = await fetch("/api/analytics/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; id?: string }) : { error: "Couldn't reach the server" };
    if (j.ok) { onSaved(j.id, savedId ? null : where, body.spec); onClose(); } else setSaving({ error: j.error ?? "Couldn't save" });
  };

  // Width apart: "w-full" and "w-auto" in one class list fight (the last in the CSS wins, not the last written).
  const selectBase = "h-9 rounded-lg border border-line bg-surface px-2.5 text-[16px] text-ink focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15";
  const selectCls = `${selectBase} w-full`;
  const frame = (body: React.ReactNode) => (
    <div className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/30 p-2 sm:p-4" onMouseDown={onClose}>
      <div role="dialog" aria-label="Report builder" className="modal-in flex h-[96vh] w-full max-w-[1500px] flex-col rounded-2xl bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()}>{body}</div>
    </div>
  );
  // No table yet (a new report), or the list still on its way: the table picker.
  if (!d0) return frame(<TablePicker list={tables} legacy={legacy.map((x) => ({ key: x.key, label: x.label }))} admin={admin} onPick={changeDataset} onClose={onClose}
    onReload={(force: boolean) => { setTables(null); (force ? fetch("/api/analytics/tables", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: true }) }).catch(() => null) : Promise.resolve()).then(() => loadTables(true).then(setTables)); }} />);
  const kind = answer && !isError(answer) ? resolveKind(spec.chart, answer) : undefined;
  const sentence = describeSpec(spec, today, kind);
  const q = search.trim().toLowerCase();
  // "Total BCY" finds "Total (BCY)": brackets and dots don't count.
  const plain = (s: string) => s.toLowerCase().replace(/[().·,]/g, " ").replace(/\s+/g, " ").trim();
  const match = (l: string) => !q || plain(l).includes(plain(q));
  const attrs = d.fields.filter((f) => !f.table && match(f.label));
  const nums = d.measures.filter((m) => match(m.label) || match(m.zoho ?? ""));
  // A Zoho table: the tables it links to come along (plan, point 3), each under its own name.
  const linkedAttrs = zt ? Object.entries(Object.groupBy(d.fields.filter((f) => f.table && match(f.label)), (f) => f.table!)) : [];
  const tableNums = zt ? tableNumbers(d.key).filter((c) => match(c.label)) : [];
  const aggOf = (k: string) => k.match(/^(sum|avg|min|max|count|distinct):(.+)$/);
  const usedNumber = (key: string) => spec.measures.find((k) => aggOf(k)?.[2] === key);
  const dates = d.fields.filter((f) => f.kind === "date");
  const label = (k: string) => (isDateField(k) ? `${fieldOf(d, k)?.label ?? "Date"} · ${(GRAINS.find((g) => g.value === (spec.grain ?? "month"))?.label ?? "Month").toLowerCase()}` : fieldOf(d, k)?.label ?? k);
  const show = (p: Pane) => (pane === p ? "flex" : "hidden lg:flex");

  return (
    <div className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/30 p-2 sm:p-4" onMouseDown={onClose}>
      <div role="dialog" aria-label="Report builder" className="modal-in flex h-[96vh] w-full max-w-[1500px] flex-col rounded-2xl bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-[19px] font-bold tracking-tight text-ink">{savedId ? "Edit report" : "New report"}</h2>
          {/* Phones and narrow windows: one pane at a time. */}
          <div className="flex rounded-full bg-surface-2 p-0.5 lg:hidden" role="tablist" aria-label="Builder panes">
            {(["data", "build", "format"] as Pane[]).map((p) => (
              <button key={p} type="button" role="tab" aria-selected={pane === p} onClick={() => setPane(p)}
                className={`rounded-full px-3 py-1 text-[15px] font-medium capitalize ${pane === p ? "bg-surface text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]" : "text-muted"}`}>{p}</button>
            ))}
          </div>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink">
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>
          </button>
        </div>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[270px_minmax(0,1fr)_250px]">
          {/* Data */}
          <section aria-label="Data" className={`${show("data")} min-h-0 flex-col border-line lg:border-r`}>
            <div className="shrink-0 space-y-2 border-b border-line p-4">
              <select aria-label="Zoho table" className={selectCls} value={spec.dataset} onChange={(e) => changeDataset(e.target.value)}>
                {legacy.map((x) => <option key={x.key} value={x.key}>{x.label} (ready-made, this report)</option>)}
                {(tables?.tables ?? []).map((t) => <option key={t.id} value={`zt:${t.id}`}>{t.name}</option>)}
              </select>
              <p className="text-[14.5px] leading-snug text-muted">{d.desc}</p>
              <input className={`${selectCls} h-8`} placeholder="Find a field…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Find a field" />
            </div>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
              <PaneHead title={zt ? "Dimensions" : "Attributes"} hint="Words and dates — each value becomes a row, a bar or a colour" />
              {attrs.map((f) => (
                <DataItem key={f.key} icon={f.kind === "date" ? "date" : "text"} label={f.label} hint={f.hint} used={by.includes(f.key) || (spec.filters ?? []).some((x) => x.field === f.key)}
                  drag={`attr:${f.key}`} onClick={() => pickAttribute(f.key)} />
              ))}
              {linkedAttrs.map(([table, fs]) => (
                <div key={table} className="mt-2">
                  <p className="px-2 pb-0.5 text-[13.5px] font-semibold text-faint" title={`Zoho's link from this table to ${table}`}>From {table}</p>
                  {fs!.map((f) => (
                    <DataItem key={f.key} icon="text" label={f.label.replace(/ \([^)]*\)$/, "")} hint={f.hint} used={by.includes(f.key) || (spec.filters ?? []).some((x) => x.field === f.key)}
                      drag={`attr:${f.key}`} onClick={() => pickAttribute(f.key)} />
                  ))}
                </div>
              ))}
              <PaneHead title={zt ? "Measures" : "Numbers"} hint={zt ? "Numbers — added up as a Sum; change how on its pill" : "What's counted or added up — the values"} />
              {nums.map((m) => (
                <DataItem key={m.key} icon="num" label={m.label} sub={m.zoho && `Zoho: ${m.zoho}`} hint={m.def} used={spec.measures.includes(m.key)} drag={`num:${m.key}`} onClick={() => toggleValue(m.key)} />
              ))}
              {tableNums.map((c) => {
                const used = usedNumber(c.key);
                return <DataItem key={c.key} icon="num" label={c.label} hint={`Zoho column “${c.label}” — added up as a Sum; change it to Average, Min, Max, Count or Count distinct on its pill`} used={Boolean(used)}
                  drag={`num:sum:${c.key}`} onClick={() => toggleValue(used ?? `sum:${c.key}`)} />;
              })}
            </div>
          </section>

          {/* Build + preview */}
          <section aria-label="Build" className={`${show("build")} no-scrollbar min-h-0 min-w-0 flex-col overflow-y-auto lg:overflow-hidden`}>
            <div className="shrink-0 space-y-2 border-b border-line p-4">
              <Shelf label="Rows" hint="One row, bar or line point for each value" onDrop={(p) => drop("rows", p)}>
                {by[0] ? <Pill text={label(by[0])} onRemove={() => setRows(null)} /> : <Empty text="Click or drop an attribute — e.g. Sector, Month" />}
                {by[0] && <AttrPicker fields={d.fields.filter((f) => f.key !== by[0])} placeholder="Change…" onPick={setRows} />}
                {isDateField(by[0]) && (
                  <span className="flex flex-wrap gap-1">
                    {GRAINS.map((g) => (
                      <button key={g.value} type="button" aria-pressed={(spec.grain ?? "month") === g.value} onClick={() => set({ grain: g.value })}
                        className={`rounded-full px-2.5 py-0.5 text-[14.5px] font-medium ${(spec.grain ?? "month") === g.value ? "bg-ink text-surface" : "bg-surface-2 text-ink-2 hover:text-ink"}`}>{g.label}</button>
                    ))}
                  </span>
                )}
              </Shelf>
              <Shelf label="Colour" hint="Splits each row into colours — one per value of this attribute" onDrop={(p) => drop("colour", p)}>
                {by[1] ? <Pill text={label(by[1])} onRemove={() => setColour(null)} /> : <Empty text={by[0] ? "Optional — split each into colours" : "Needs Rows first"} />}
                {by[0] && !by[1] && <AttrPicker fields={d.fields.filter((f) => f.key !== by[0])} placeholder="+ Add…" onPick={setColour} />}
              </Shelf>
              <Shelf label="Values" hint={`The numbers — up to ${MAX_VALUES}`} onDrop={(p) => drop("values", p)}>
                {spec.measures.map((k) => {
                  const a = aggOf(k);
                  if (!a) return <Pill key={k} text={measureOf(d, k)?.label ?? k} num onRemove={() => toggleValue(k)} title={[measureOf(d, k)?.def, measureOf(d, k)?.zoho && `Zoho: ${measureOf(d, k)?.zoho}`].filter(Boolean).join("\n")} />;
                  // A Zoho number column: how it adds up is chosen on the pill (Tableau's right-click → Measure).
                  const col = zt ? tableNumbers(d.key).find((c) => c.key === a[2]) ?? fieldOf(d, a[2]) : extraNumbers(d).find((c) => c.key === a[2]);
                  // Words and dates only count; numbers also add up.
                  const choices = !zt ? AGGS : tableNumbers(d.key).some((c) => c.key === a[2]) ? TABLE_AGGS : TABLE_AGGS.filter(([v]) => v === "count" || v === "distinct");
                  return (
                    <span key={k} title={measureOf(d, k)?.def} className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand-soft py-0.5 pl-1 pr-1 text-[15px] font-medium text-ink">
                      <select aria-label={`How ${col?.label ?? "it"} adds up`} value={a[1]} onChange={(e) => set({ measures: spec.measures.map((x) => (x === k ? `${e.target.value}:${a[2]}` : x)) })}
                        className="h-7 rounded-full border border-line bg-surface px-2 text-[14.5px] text-ink focus:border-brand focus:outline-none">
                        {choices.map(([v, w]) => <option key={v} value={v}>{w}</option>)}
                      </select>
                      <span className="truncate">of {col?.label ?? a[2]}</span>
                      <button type="button" aria-label={`Remove ${col?.label ?? k}`} onClick={() => toggleValue(k)} className="grid size-6 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink">×</button>
                    </span>
                  );
                })}
                {spec.measures.length < MAX_VALUES && (
                  <select aria-label="Add a value" className="h-8 rounded-full border border-dashed border-line bg-surface px-2.5 text-[15px] text-muted focus:border-brand focus:outline-none" value=""
                    onChange={(e) => e.target.value && toggleValue(e.target.value)}>
                    <option value="">+ Add…</option>
                    {d.measures.filter((m) => !spec.measures.includes(m.key)).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                    {zt && tableNumbers(d.key).filter((c) => !usedNumber(c.key)).map((c) => <option key={c.key} value={`sum:${c.key}`}>Sum of {c.label}</option>)}
                  </select>
                )}
              </Shelf>
              {note && <p className="rounded-lg bg-surface-2 px-3 py-2 text-[15px] text-ink-2" role="status">{note}</p>}
              {mixedAverage(spec) && <p className="rounded-lg bg-surface-2 px-3 py-2 text-[15px] text-ink-2">A price per unit over different items mixes them (an AED and a pad average to neither) — put Item on Rows, or filter to one item, group or kind.</p>}
              <Shelf label="Filters" hint="Only rows that match" onDrop={(p) => drop("filters", p)}>
                <div className="min-w-0 flex-1"><Filters dataset={spec.dataset} filters={spec.filters ?? []} onChange={(filters) => set({ filters })} /></div>
              </Shelf>
              <Shelf label="When" hint="Saved reports keep this as a moving period — “This FY” is always the current one">
                {zt && !d.dateField ? <Empty text="This table has no dates — every row counts" /> : (
                  <>
                    <select aria-label="Period" className={`${selectBase} h-8`} value={spec.period ?? "fy"} onChange={(e) => set({ period: e.target.value })}>
                      {periods(today).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>
                    {/* Which date the period is on — the table's main date unless another is picked (plan, point 5). */}
                    {zt && dates.length > 1 && (
                      <label className="flex items-center gap-1.5 text-[15px] text-muted">by
                        <select aria-label="Date the period uses" className={`${selectBase} h-8`} value={spec.dateField || d.dateField} onChange={(e) => set({ dateField: e.target.value === d.dateField ? undefined : e.target.value })}>
                          {dates.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>
                      </label>
                    )}
                  </>
                )}
              </Shelf>
            </div>
            <div className="no-scrollbar flex flex-col p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              <p className="rounded-xl bg-brand-soft px-4 py-2.5 text-[15.5px] leading-relaxed text-ink" aria-live="polite">{sentence}</p>
              <div className="mt-3 flex items-baseline justify-between gap-3">
                <h3 className="min-w-0 truncate text-[18px] font-semibold text-ink">{title || autoTitle(spec)}</h3>
                {answer && !isError(answer) && <span className="shrink-0 text-[15px] text-muted">{answer.matched.toLocaleString("en-IN")} rows of data</span>}
              </div>
              <div className="mt-3 min-h-[300px] flex-1">
                {!spec.measures.length ? <p className="grid h-[300px] place-items-center rounded-lg border border-dashed border-line px-6 text-center text-[16px] text-muted">Nothing to show yet. Pick a number from the Data pane (e.g. {zt ? "Sum of Total (BCY), Number of rows" : "Revenue, Invoices, Quantity"}), then something for Rows.</p>
                  : !answer ? <div className="h-[420px] animate-pulse rounded-lg bg-surface-2" />
                  : isError(answer) ? <p className="text-[16px] text-high">{answer.error}</p>
                  : <Chart result={answer} kind={spec.chart} grain={spec.grain} height={kind === "kpi" ? 120 : 420} />}
              </div>
            </div>
          </section>

          {/* Format */}
          <section aria-label="Format" className={`${show("format")} no-scrollbar min-h-0 flex-col gap-4 overflow-y-auto border-line p-4 lg:border-l`}>
            <FormatRow label="Title">
              <input className={inputCls} placeholder={autoTitle(spec)} value={title} onChange={(e) => setTitle(e.target.value)} />
            </FormatRow>
            <FormatRow label="Chart" hint={kind && (spec.chart ?? "auto") === "auto" ? `Suggested here: ${CHARTS.find((c) => c.value === kind)?.label ?? kind}` : undefined}>
              <div className="flex flex-wrap gap-1">
                {CHARTS.map((c) => (
                  <button key={c.value} type="button" aria-pressed={(spec.chart ?? "auto") === c.value} onClick={() => set({ chart: c.value })}
                    className={`rounded-full px-2.5 py-1 text-[15px] font-medium ${(spec.chart ?? "auto") === c.value ? "bg-ink text-surface" : "bg-surface-2 text-ink-2 hover:text-ink"}`}>{c.label}</button>
                ))}
              </div>
            </FormatRow>
            {by[0] && !isDateField(by[0]) && (
              <FormatRow label="How many">
                <select className={selectCls} value={spec.limit ?? 0} onChange={(e) => set({ limit: Number(e.target.value) || undefined })}>
                  {[5, 8, 10, 15, 20].map((n) => <option key={n} value={n}>Top {n} (+ Others)</option>)}
                  <option value={0}>All</option>
                </select>
              </FormatRow>
            )}
            {by[0] && !isDateField(by[0]) && (
              <FormatRow label="Order">
                <select className={selectCls} value={spec.sort ?? "value"} onChange={(e) => set({ sort: e.target.value as Spec["sort"] })}>
                  <option value="value">Biggest first</option>
                  <option value="label">By name (A–Z, or its own order)</option>
                </select>
              </FormatRow>
            )}
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
          {saving.error && <span className="mr-auto text-[16px] font-medium text-high">{saving.error}</span>}
          {!canSave && <span className="mr-auto text-[15.5px] text-muted">Admin, Ashish, Shikha, Sumit and Nikita can save reports for the team.</span>}
          {canSave && !savedId && targets.length > 0 && (
            <div className="mr-auto flex flex-wrap items-center gap-2 text-[15.5px] text-ink-2">
              <span>Put it on</span>
              <select aria-label="Dashboard" className={selectBase} value={where ? where.dash : ""}
                onChange={(e) => setWhere(e.target.value === "" ? null : { dash: e.target.value, page: 0, ...(e.target.value === "new" ? { newTitle: "" } : {}) })}>
                <option value="">Saved reports only</option>
                {targets.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                <option value="new">+ New dashboard…</option>
              </select>
              {where?.dash === "new" && <input aria-label="New dashboard name" placeholder="Its name" className={`${selectBase} w-44`} value={where.newTitle ?? ""} onChange={(e) => setWhere({ ...where, newTitle: e.target.value.slice(0, 40) })} />}
              {target && (
                <select aria-label="Page" className={selectBase} value={where!.page} onChange={(e) => setWhere({ ...where!, page: Number(e.target.value) })}>
                  {target.pages.map((p, i) => <option key={i} value={i}>{p.name}{p.free > 0 ? ` · ${p.free}% free` : " · full"}</option>)}
                  <option value={-1}>+ New page</option>
                </select>
              )}
            </div>
          )}
          <button className={btn.ghost} onClick={onClose}>Close</button>
          {canSave && <button className={btn.primary} disabled={saving.busy || !spec.measures.length || !answer || isError(answer)} onClick={save}>{saving.busy ? "Saving…" : savedId ? "Save changes" : "Save report"}</button>}
        </div>
      </div>
    </div>
  );
}

/** The tables most reports start from — shown first. */
const COMMON = ["Invoices", "Invoice Items", "Quotes", "Quote Items", "Sales Orders", "Sales Order Items", "Customers", "Items", "Customer Payments"];

/**
 * "Pick a Zoho table" (owner's plan of 30 Oct, point 2): every table this member may use, read from Zoho Analytics
 * (empty ones hidden), the common ones first. While Zoho's list is read for the first time (~5 min) it says so.
 */
function TablePicker({ list, legacy, admin, onPick, onClose, onReload }: {
  list: TableList | null; legacy: { key: string; label: string }[]; admin: boolean; onPick: (key: string) => void; onClose: () => void; onReload: (force: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (list?.tables ?? []).filter((t) => words.every((w) => t.name.toLowerCase().includes(w)));
  const common = q ? [] : COMMON.map((n) => shown.find((t) => t.name === n)).filter((t): t is NonNullable<typeof t> => Boolean(t));
  const card = (t: (typeof shown)[number]) => (
    <button key={t.id} type="button" onClick={() => onPick(`zt:${t.id}`)} className="flex flex-col items-start rounded-xl border border-line px-3.5 py-2.5 text-left hover:border-brand hover:bg-brand-soft">
      <span className="text-[16px] font-medium text-ink">{t.name}</span>
      <span className="text-[14px] text-muted">{t.rows.toLocaleString("en-IN")} rows · {t.columns.length} columns</span>
    </button>
  );
  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 className="text-[19px] font-bold tracking-tight text-ink">New report · pick a Zoho table</h2>
        <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink">
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <input className={`${inputCls} !h-10 min-w-0 flex-1 basis-64 text-[16px]`} placeholder="Find a table — Invoices, Quotes, Items…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a table" autoFocus />
        <span className="text-[14.5px] text-muted">{list ? `${shown.length} tables from Zoho Analytics${list.readAt ? ` · read ${new Date(list.readAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""}` : "Reading Zoho's tables…"}</span>
        {admin && list && <button className={`${btn.ghost} !h-9`} onClick={() => onReload(true)} title="Read every table and column from Zoho Analytics again (Admin)">↻ Refresh from Zoho</button>}
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {list?.error && <p className="text-[16px] text-high">{list.error}</p>}
        {list?.readError ? (
          // A pass that failed says why instead of "still being read" for ever.
          <p className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-[15px] text-high">
            Reading Zoho&apos;s tables stopped: {list.readError}{list.tables.length ? " — showing the ones read before." : ""}{" "}
            <button className="font-semibold text-brand hover:underline" onClick={() => onReload(false)}>Try again</button>
          </p>
        ) : list?.partial && (
          <p className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-[15px] text-ink-2">
            Zoho&apos;s table list is {list.reading ? "being read right now" : "still being read"} (about 5 minutes the first time, in steps) — {list.tables.length ? `${list.tables.length} read so far.` : "none read yet."}{" "}
            <button className="font-semibold text-brand hover:underline" onClick={() => onReload(false)}>Check again</button>
          </p>
        )}
        {legacy.map((x) => (
          <button key={x.key} type="button" onClick={() => onPick(x.key)} className="mb-3 rounded-xl border border-line px-3.5 py-2.5 text-left text-[15.5px] text-ink hover:border-brand">Keep this report&apos;s ready-made data: <b>{x.label}</b></button>
        ))}
        {common.length > 0 && <>
          <h3 className="mb-2 text-[14px] font-bold uppercase tracking-wide text-muted">Most used</h3>
          <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{common.map(card)}</div>
          <h3 className="mb-2 text-[14px] font-bold uppercase tracking-wide text-muted">Every table</h3>
        </>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{shown.map(card)}</div>
        {list && !list.partial && !shown.length && !list.error && <p className="text-[16px] text-muted">{q ? "No table by that name." : "No tables yet — Zoho Analytics isn't connected, or nothing has been read."}</p>}
      </div>
    </>
  );
}

function PaneHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mt-3 px-1 first:mt-0">
      <div className="text-[14px] font-semibold uppercase tracking-wide text-muted">{title}</div>
      <p className="text-[14px] leading-snug text-faint">{hint}</p>
    </div>
  );
}

const ICON = { text: "Aa", date: "◷", num: "#" } as const;
/** A field in the Data pane: click to put it on its shelf (again to take it off), or drag it onto any shelf. */
function DataItem({ icon, label, sub, hint, used, drag, onClick }: { icon: keyof typeof ICON; label: string; sub?: string; hint?: string; used: boolean; drag: string; onClick: () => void }) {
  return (
    <button type="button" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", drag)} onClick={onClick} title={hint} aria-pressed={used}
      className={`mt-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[15.5px] transition ${used ? "bg-brand-soft font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>
      <span aria-hidden className={`grid h-5 w-6 shrink-0 place-items-center rounded text-[12px] font-bold ${icon === "num" ? "bg-brand-soft text-brand" : "bg-surface-2 text-muted"}`}>{ICON[icon]}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {sub && <span className="block truncate text-[13px] font-normal text-faint">{sub}</span>}
      </span>
      {used && <span aria-hidden className="text-brand">✓</span>}
    </button>
  );
}

function Shelf({ label, hint, onDrop, children }: { label: string; hint: string; onDrop?: (payload: string) => void; children: React.ReactNode }) {
  const [over, setOver] = useState(false);
  return (
    <div onDragOver={onDrop ? (e) => { e.preventDefault(); setOver(true); } : undefined} onDragLeave={() => setOver(false)}
      onDrop={onDrop ? (e) => { e.preventDefault(); setOver(false); onDrop(e.dataTransfer.getData("text/plain")); } : undefined}
      className={`flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border px-2.5 py-1.5 transition ${over ? "border-brand bg-brand-soft" : "border-line"}`}>
      <span className="w-[68px] shrink-0 text-[14px] font-semibold uppercase tracking-wide text-muted" title={hint}>{label}</span>
      {children}
    </div>
  );
}

function Pill({ text, num, title, onRemove }: { text: string; num?: boolean; title?: string; onRemove?: () => void }) {
  return (
    <span title={title} className={`inline-flex max-w-full items-center gap-1 rounded-full py-1 pl-3 ${onRemove ? "pr-1" : "pr-3"} text-[15px] font-medium ${num ? "bg-brand-soft text-ink" : "bg-surface-2 text-ink"}`}>
      <span className="truncate">{text}</span>
      {onRemove && <button type="button" aria-label={`Remove ${text}`} onClick={onRemove} className="grid size-6 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink">×</button>}
    </span>
  );
}

const Empty = ({ text }: { text: string }) => <span className="text-[15px] text-faint">{text}</span>;

function AttrPicker({ fields, placeholder, onPick }: { fields: { key: string; label: string }[]; placeholder: string; onPick: (k: string) => void }) {
  return (
    <select aria-label={placeholder} className="h-8 rounded-full border border-dashed border-line bg-surface px-2.5 text-[15px] text-muted focus:border-brand focus:outline-none" value=""
      onChange={(e) => e.target.value && onPick(e.target.value)}>
      <option value="">{placeholder}</option>
      {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
    </select>
  );
}

function FormatRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[14px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[14.5px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}

function Filters({ dataset, filters, onChange }: { dataset: string; filters: Filter[]; onChange: (f: Filter[]) => void }) {
  const d = datasetOf(dataset)!;
  const free = d.fields.filter((f) => f.key !== d.dateField && !filters.some((x) => x.field === f.key));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {filters.map((f, i) => (
        <div key={f.field} className="flex min-w-[200px] items-center gap-1">
          <FilterValues dataset={dataset} filter={f} onChange={(nf) => onChange(filters.map((x, j) => (j === i ? nf : x)))} />
          <button type="button" aria-label={`Remove the ${fieldOf(d, f.field)?.label} filter`} className="rounded-full px-2 text-muted hover:text-ink" onClick={() => onChange(filters.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      {free.length > 0 && (
        <select aria-label="Add a filter" className="h-8 rounded-full border border-dashed border-line bg-surface px-2.5 text-[15px] text-muted focus:border-brand focus:outline-none" value=""
          onChange={(e) => { if (e.target.value) onChange([...filters, { field: e.target.value, values: [] }]); }}>
          <option value="">+ Add a filter…</option>
          {free.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      )}
    </div>
  );
}

/** Owner, 29 Oct: the builder's filters do what the dashboards' do — is / is not / everything containing. */
function FilterValues({ dataset, filter, onChange }: { dataset: string; filter: Filter; onChange: (f: Filter) => void }) {
  const values = useFieldValues(dataset, filter.field);
  const label = fieldOf(datasetOf(dataset)!, filter.field)?.label ?? filter.field;
  return <MultiSelect label={label} values={values} selected={filter.values} onChange={(v) => onChange({ ...filter, values: v })} loading={!values.length}
    rule={{ exclude: filter.exclude, contains: filter.contains }} onRule={(r) => onChange({ ...filter, exclude: r.exclude || undefined, contains: r.contains?.trim() || undefined, values: r.contains?.trim() ? [] : filter.values })} />;
}

// Prices per unit (owner, 29 Oct: "average selling price" of AEDs, pads, batteries) only mean something for one item.
const PER_UNIT = new Set(["avgPrice", "avgSale", "avgCost", "diffPerUnit", "paidPerUnit"]);
const ITEMISH = ["item", "zohoItem", "kind", "itemGroup"];
function mixedAverage(spec: Spec) {
  if (!spec.measures.some((m) => PER_UNIT.has(m))) return false;
  if ((spec.by ?? []).some((b) => ITEMISH.includes(b))) return false;
  return !(spec.filters ?? []).some((f) => ITEMISH.includes(f.field) && !f.exclude && (f.values.length === 1 || f.field === "kind"));
}
