"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { btn } from "../ui";
import { runSpecs } from "./shared";

/*
 * "Sales targets" (owner, 30 Oct — phase 5): Admin sets each sales person's monthly revenue target, in lakh. The names
 * are the sales people on invoices in the last 12 months (Zoho's spelling), plus anyone who already has a target.
 * Saved with the revenue goal (kv reports_goal.people); Quotes & team → "Sales against target" reads them.
 */
export function TargetsButton({ today, onSaved }: { today: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-[16px] font-medium text-ink-2 transition hover:border-line-strong">◎ Sales targets</button>
      {open && createPortal(<TargetsPopup today={today} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); onSaved(); }} />, document.body)}
    </>
  );
}

function TargetsPopup({ today, onClose, onSaved }: { today: string; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<{ name: string; lakh: string }[] | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const from = new Date(Date.parse(today) - 365 * 86_400_000).toISOString().slice(0, 10);
    Promise.all([
      fetch("/api/analytics/goal").then((r) => r.json()).catch(() => ({})),
      runSpecs([{ dataset: "sales", measures: ["revenue"], by: ["salesperson"], from, to: today, chart: "table" }]).catch(() => ({ results: [] })),
    ]).then(([goal, q]) => {
      const people: Record<string, number> = goal?.people ?? {};
      const a = q.results[0] as { rows?: { keys: string[] }[] } | undefined;
      const names = [...new Set([...Object.keys(people), ...(a?.rows ?? []).map((r) => r.keys[0]).filter((n) => n && !/^\(|^Others$/.test(n))])];
      setRows(names.map((name) => ({ name, lakh: people[name] ? String(people[name] / 1e5) : "" })));
    });
  }, [today]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  const save = async () => {
    setError("");
    const people: Record<string, number> = {};
    for (const r of rows ?? []) {
      if (!r.lakh.trim()) continue;
      const v = Number(r.lakh);
      if (!Number.isFinite(v) || v < 0.1 || v > 100) return setError(`${r.name}: enter lakh between 0.1 and 100`);
      people[r.name] = Math.round(v * 1e5);
    }
    setSaving(true);
    const res = await fetch("/api/analytics/goal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ people }) }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : { error: "Couldn't reach the server" };
    setSaving(false);
    if (!res?.ok || j.error) return setError(j.error ?? "Couldn't save");
    onSaved();
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Sales targets" className="w-full max-w-[460px] rounded-2xl border border-line bg-surface p-5 shadow-pop">
        <h2 className="text-[19px] font-semibold text-ink">Sales targets</h2>
        <p className="mt-1 text-[15px] text-muted">Each person&apos;s revenue a month, before tax, in lakh. Leave empty for no target.</p>
        <div className="mt-4 grid max-h-[55vh] gap-2 overflow-y-auto pr-1">
          {!rows && <p className="text-[15.5px] text-muted">Loading…</p>}
          {rows?.length === 0 && <p className="text-[15.5px] text-muted">No sales people on invoices in the last 12 months.</p>}
          {rows?.map((r, i) => (
            <label key={r.name} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-[16px] text-ink" title={r.name}>{r.name}</span>
              <span className="relative">
                <input inputMode="decimal" aria-label={`${r.name}, lakh a month`} placeholder="—" value={r.lakh}
                  onChange={(e) => setRows((rs) => rs!.map((x, j) => (j === i ? { ...x, lakh: e.target.value } : x)))}
                  className="h-10 w-32 rounded-full border border-line bg-surface pl-4 pr-10 text-right text-[16px] text-ink focus:border-brand focus:outline-none" />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] text-muted">L</span>
              </span>
            </label>
          ))}
        </div>
        {error && <p className="mt-3 text-[15px] text-high" role="alert">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={btn.quiet} onClick={onClose}>Cancel</button>
          <button type="button" className={btn.primary} disabled={!rows || saving} onClick={save}>{saving ? "Saving…" : "Save targets"}</button>
        </div>
      </div>
    </div>
  );
}
