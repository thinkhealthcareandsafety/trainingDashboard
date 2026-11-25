"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PoLog, PoLogEntry, PoRun } from "@/lib/poLog";
import { PO_LOG_LABEL, poLogGroup } from "@/lib/poLog";

/*
 * The live log of Find POs (owner, 25 Nov: "when I click on scan a popup of log should open that I can minimize"): every PDF
 * in the PO folder as it is checked — how it was read, the PO number on it, and the invoice it belongs to. Every scan has a
 * new log (`run`); before the first one on this page it lists what was read last. A window at the bottom right that doesn't
 * cover the page; minimised it is a pill with the progress.
 */
export type ScanNow = { busy: boolean; text: string; bad?: boolean; file?: string; done?: number; of?: number };

const clock = (iso: string) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "");
const dayTime = (iso: string) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
const TONE: Record<ReturnType<typeof poLogGroup>, string> = { open: "bg-brand-soft text-brand", has: "bg-low-bg text-low", none: "bg-surface-2 text-ink-2", unread: "bg-high-bg text-high", waiting: "bg-medium-bg text-ink-2" };
const FILTERS = ["all", "open", "has", "none", "unread"] as const;

function Ring() {
  return <svg viewBox="0 0 24 24" width="15" height="15" className="shrink-0 animate-spin text-brand motion-reduce:animate-none" aria-hidden><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>;
}

export function PoScanLog({ now, run, small, onSmall, onClose }: { now: ScanNow; run: PoRun | null; small: boolean; onSmall: (v: boolean) => void; onClose: () => void }) {
  const [past, setPast] = useState<PoLog | null>(null);
  const [error, setError] = useState("");
  const [show, setShow] = useState<(typeof FILTERS)[number]>("all");
  const busy = now.busy;
  const started = run?.startedAt;
  useEffect(() => { setShow("all"); }, [started]);
  // No scan on this page yet: what was read last.
  useEffect(() => {
    if (run || small) return;
    let stop = false;
    fetch("/api/invoice-converter?poLog", { cache: "no-store" }).then(async (r) => {
      const j = (await r.json()) as PoLog & { error?: string };
      if (!stop) { if (!r.ok || j.error) setError(j.error ?? "Couldn't read the log"); else setPast(j); }
    }).catch(() => { if (!stop) setError("Couldn't reach the server"); });
    return () => { stop = true; };
  }, [run, small]);
  const log: PoLog | null = run ? { entries: run.lines, matched: run.matched, waiting: run.waiting } : past;
  useEffect(() => {
    if (small) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onSmall(true); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [small, onSmall]);

  const pct = now.of ? Math.round((100 * (now.done ?? 0)) / now.of) : null;
  const count = (g: string) => (log?.entries ?? []).filter((e) => g === "all" || poLogGroup(e) === g).length;
  const list: (PoLogEntry & { fresh?: boolean; n?: number })[] = (log?.entries ?? []).filter((e) => show === "all" || poLogGroup(e) === show);

  if (small) return createPortal(
    <div className="fixed bottom-24 right-4 z-40 flex items-center gap-1 rounded-full bg-surface p-1 shadow-pop lg:bottom-6 lg:right-6">
      <button type="button" onClick={() => onSmall(false)} className="press num flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold text-ink hover:bg-surface-2" aria-label="Open the scan log">
        {busy ? <Ring /> : <span className={`size-2 rounded-full ${now.bad ? "bg-high" : "bg-low"}`} aria-hidden />}
        {busy ? `Scanning${pct !== null ? ` ${pct}%` : "…"}` : "Scan log"}
      </button>
      {!busy && <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close the scan log">✕</button>}
    </div>, document.body);

  return createPortal(
    <section role="dialog" aria-label="Scan log" className="modal-in fixed inset-x-3 bottom-24 z-40 flex max-h-[min(620px,70vh)] flex-col overflow-hidden rounded-[24px] bg-surface shadow-pop sm:left-auto sm:w-[480px] lg:bottom-6 lg:right-6">
      <header className="flex items-center gap-2.5 px-5 pb-2 pt-4">
        {busy && <Ring />}
        <h2 className="min-w-0 flex-1 text-[16px] font-semibold text-ink">Scan log {run && <span className="num text-[12.5px] font-medium text-muted">· {clock(run.startedAt)}{run.endedAt ? ` to ${clock(run.endedAt)}` : ""}</span>}</h2>
        <button type="button" onClick={() => onSmall(true)} className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink" aria-label="Minimise" title="Minimise">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M3.5 11.5h9" /></svg>
        </button>
        <button type="button" onClick={busy ? () => onSmall(true) : onClose} className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close" title={busy ? "Minimise (the scan carries on)" : "Close"}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </header>
      <div className="px-5 pb-3" role="status">
        <p className={`num text-[13px] ${now.bad ? "text-high" : "text-ink-2"}`}>{now.text || "Not scanning now. This is what was read last."}</p>
        {busy && now.file && <p className="mt-0.5 truncate text-[12.5px] text-muted">Reading now: {now.file}</p>}
        {busy && pct !== null && <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} /></span>}
        {log && !busy && !now.bad && log.entries.length > 0 && (
          <p className="num mt-1.5 text-[13px] font-medium text-ink">
            {log.matched === 0 ? "No invoice's PO number is on these PDFs." : log.waiting === 0 ? `${log.matched} invoices have their PO here, and every one already has it attached.` : `${log.waiting} of ${log.matched} matching invoices still need their PO attached.`}
          </p>
        )}
      </div>
      <div className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto px-5 pb-3" role="group" aria-label="Show">
        {FILTERS.map((f) => <button key={f} type="button" aria-pressed={show === f} onClick={() => setShow(f)} className={`num shrink-0 rounded-full px-3 py-1 text-[12.5px] font-medium ${show === f ? "bg-brand text-brand-ink" : "bg-surface-2 text-ink-2 hover:text-ink"}`}>{f === "all" ? "All" : PO_LOG_LABEL[f]} {count(f)}</button>)}
      </div>
      <ul className="no-scrollbar min-h-0 flex-1 divide-y divide-line/70 overflow-y-auto border-t border-line/70">
        {error && <li className="px-5 py-3 text-[13px] text-high">{error}</li>}
        {!log && !error && <li className="px-5 py-6 text-center text-[13px] text-muted">Reading the log…</li>}
        {log && !list.length && <li className="px-5 py-6 text-center text-[13px] text-muted">{busy ? "The PDFs appear here as they are checked." : "Nothing here."}</li>}
        {list.map((e) => <Entry key={e.id} e={e} live={Boolean(run)} />)}
      </ul>
    </section>, document.body);
}

function Entry({ e, live }: { e: PoLogEntry & { fresh?: boolean; n?: number }; live: boolean }) {
  const g = poLogGroup(e);
  const today = e.at && new Date(e.at).toDateString() === new Date().toDateString();
  return (
    <li className={`px-5 py-3 ${live ? "fade-in" : ""}`}>
      <div className="flex items-start gap-2">
        {live && <span className="num w-7 shrink-0 pt-px text-[12px] text-faint">{e.n}</span>}
        <p className="min-w-0 flex-1 break-words text-[13.5px] font-medium text-ink">{e.name}{e.fresh && <span className="ml-2 rounded-full bg-info-bg px-2 py-0.5 text-[11.5px] font-semibold text-info">New</span>}</p>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${TONE[g]}`}>{PO_LOG_LABEL[g]}</span>
      </div>
      <p className={`num mt-0.5 text-[12.5px] text-muted ${live ? "pl-9" : ""}`}>
        {[e.look === "due" ? "Waiting to read the page" : e.look === "no" ? "Read as text" : e.look === "done" ? "Read from the scanned page" : "Couldn't open the page", e.po ? `PO ${e.po}` : e.look === "due" || g === "unread" ? "" : "no PO number recognised", live ? (e.fresh ? "" : `read ${dayTime(e.at)}`) : today ? clock(e.at) : dayTime(e.at)].filter(Boolean).join(" · ")}
      </p>
      {e.invoices.length > 0 && <p className={`num mt-0.5 text-[12.5px] text-ink-2 ${live ? "pl-9" : ""}`}>{e.invoices.map((i) => `${i.number}${i.has ? " (attached)" : " (not attached yet)"}`).join(", ")}</p>}
    </li>
  );
}
