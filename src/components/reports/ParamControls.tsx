"use client";

import { useEffect, useState } from "react";
import { type Param, type ParamType, cleanValue, registerParams } from "@/lib/analytics/params";
import { btn, inputCls } from "../ui";

/*
 * Parameters on screen (params.ts): the box that sets one's value (builder and dashboard toolbar), and the editor that
 * makes or changes one. Values chosen here belong to the viewer; the parameter's own value is what everyone starts on.
 */

/** The team's parameters, loaded once per page (and registered so filters and fields can follow them). */
let loaded: Promise<Param[]> | null = null;
export function loadParams(force = false): Promise<Param[]> {
  if (!loaded || force) loaded = fetch("/api/analytics/params").then((r) => r.json()).then((j: { params?: Param[] }) => { registerParams(j.params ?? []); return j.params ?? []; }).catch(() => { loaded = null; return []; });
  return loaded;
}
export function useParams(): [Param[], (list: Param[]) => void] {
  const [list, setList] = useState<Param[]>([]);
  useEffect(() => { let live = true; loadParams().then((l) => { if (live) setList(l); }); return () => { live = false; }; }, []);
  return [list, (l) => { registerParams(l); loaded = Promise.resolve(l); setList(l); }];
}

const KIND: Record<ParamType, string> = { number: "Number", text: "Word", date: "Date", list: "List" };

/** One parameter's value box: a number, a word, a date or one of its choices. Empty = its own value. */
export function ParamInput({ p, value, onChange, compact = false }: { p: Param; value: string | number | undefined; onChange: (v: string | number | undefined) => void; compact?: boolean }) {
  const shown = value ?? p.value;
  const cls = `${compact ? "h-8 w-32" : "h-9 w-full"} rounded-lg border border-line bg-surface px-2.5 text-[15.5px] text-ink focus:border-brand focus:outline-none`;
  const set = (raw: string) => { const v = cleanValue(p, raw); onChange(v === null || v === p.value ? undefined : v); };
  if (p.type === "list") return (
    <select aria-label={p.name} className={cls} value={String(shown)} onChange={(e) => set(e.target.value)}>
      {(p.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  return <input aria-label={p.name} className={cls} type={p.type === "date" ? "date" : "text"} inputMode={p.type === "number" ? "decimal" : undefined}
    defaultValue={String(shown)} key={`${p.id}:${String(shown)}`} onBlur={(e) => set(e.target.value)} onKeyDown={(e) => e.key === "Enter" && set((e.target as HTMLInputElement).value)} />;
}

/** Making or changing a parameter (the people who save reports; changing it: its maker or Admin — the route checks). */
export function ParamEditor({ param, onClose, onSaved, onDeleted }: { param: Param | null; onClose: () => void; onSaved: (p: Param) => void; onDeleted: (id: string) => void }) {
  const [name, setName] = useState(param?.name ?? "");
  const [type, setType] = useState<ParamType>(param?.type ?? "number");
  const [value, setValue] = useState(param ? String(param.value) : "");
  const [options, setOptions] = useState((param?.options ?? []).join("\n"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [onClose]);
  const choices = options.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
  const save = async () => {
    setBusy(true); setError("");
    const r = await fetch("/api/analytics/params", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ param: { id: param?.id, name, type, value, ...(type === "list" ? { options: choices } : {}) } }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : { error: "Couldn't reach the server" };
    setBusy(false);
    if (!r?.ok || !j.param) return setError(j.error ?? "Couldn't save");
    onSaved(j.param);
  };
  const remove = async () => {
    if (!param || !confirm(`Delete “${param.name}”? Reports following it lose that filter.`)) return;
    const r = await fetch(`/api/analytics/params?id=${encodeURIComponent(param.id)}`, { method: "DELETE" }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : { error: "Couldn't reach the server" };
    if (!r?.ok) return setError(j.error ?? "Couldn't delete");
    onDeleted(param.id);
  };
  const sel = "h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[16px] text-ink focus:border-brand focus:outline-none";
  const row = (label: string, child: React.ReactNode, hint?: string) => (
    <div><div className="text-[14px] font-semibold uppercase tracking-wide text-muted">{label}</div><div className="mt-1.5">{child}</div>{hint && <p className="mt-1 text-[14.5px] text-muted">{hint}</p>}</div>
  );
  return (
    <div className="fade-in fixed inset-0 z-[80] grid place-items-center bg-black/40 p-3" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Report parameter" className="modal-in w-full max-w-[460px] rounded-2xl bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="border-b border-line px-5 py-3.5">
          <h3 className="text-[18px] font-bold text-ink">{param ? "Change parameter" : "New parameter"}</h3>
          <p className="text-[15px] text-muted">A value each person sets on their report — filters and fields can follow it.</p>
        </div>
        <div className="space-y-4 px-5 py-4">
          {row("Name", <input className={inputCls} value={name} maxLength={40} placeholder="e.g. Target, Start date, Sales person" onChange={(e) => setName(e.target.value)} autoFocus />)}
          {row("Kind", <select className={sel} value={type} onChange={(e) => { setType(e.target.value as ParamType); setValue(""); }}>{(Object.keys(KIND) as ParamType[]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</select>)}
          {type === "list" && row("Choices", <textarea className={`${inputCls} h-24 py-2`} value={options} onChange={(e) => setOptions(e.target.value)} placeholder={"One per line, e.g.\nSumit A Shah\nAshish Dalal"} />, "The value is picked from these.")}
          {row("Starts on", type === "list"
            ? <select className={sel} value={value} onChange={(e) => setValue(e.target.value)}><option value="">Pick one…</option>{choices.map((o) => <option key={o} value={o}>{o}</option>)}</select>
            : <input className={inputCls} type={type === "date" ? "date" : "text"} inputMode={type === "number" ? "decimal" : undefined} value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === "number" ? "e.g. 5000000" : ""} />,
            "What everyone starts on — each person can change it on their report.")}
          {error && <p className="text-[15px] text-high" role="alert">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          {param && <button type="button" className={`${btn.quiet} mr-auto text-high`} onClick={remove}>Delete</button>}
          <button type="button" className={btn.ghost} onClick={onClose}>Cancel</button>
          <button type="button" className={btn.primary} disabled={busy || !name.trim() || !String(value).trim()} onClick={save}>{busy ? "Saving…" : param ? "Save changes" : "Make parameter"}</button>
        </div>
      </div>
    </div>
  );
}
