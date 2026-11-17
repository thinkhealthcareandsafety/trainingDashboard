"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ConvCustomer, ConvInvoice } from "@/lib/invoiceConverterRules";
import { EWAY_OVER } from "@/lib/invoiceConverterRules";
import { Skeleton } from "./ui";

/*
 * The Invoice Converter (owner, 17 Nov): each customer and all their invoices; for each invoice the Purchase Order (its
 * number, a neon green tick; "Verbal" or none, a neon red cross), the PO PDF, and for invoices over ₹50,000 the e-way bill
 * (number and PDF). Click a cross to add what's missing; it goes straight to the invoice in Zoho Books and ticks.
 */

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const day = (s: string) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

/** The neon marks (owner: "TICK OR CROSS NEON"). */
function Mark({ ok }: { ok: boolean }) {
  const c = ok ? "#12d65a" : "#ff3b5c";
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className="shrink-0" style={{ color: c, filter: `drop-shadow(0 0 3px ${c}aa) drop-shadow(0 0 7px ${c}55)` }} aria-label={ok ? "Yes" : "No"} role="img">
      {ok ? <path d="M4.5 12.8 9.6 17.6 19.5 6.8" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        : <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />}
    </svg>
  );
}

export function InvoiceConverter() {
  const [data, setData] = useState<{ customers: ConvCustomer[]; pending: number } | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const load = () => fetch("/api/invoice-converter", { cache: "no-store" }).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (j.customers) { setData(j); setError(""); } else setError(j.error ?? "Couldn't load the invoices");
  }).catch(() => setError("Couldn't reach the server"));
  useEffect(() => { load(); }, []);
  // E-way bills and attachments are read from Zoho a few at a time: keep asking while some are left.
  useEffect(() => {
    if (!data?.pending) return;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [data]);

  const patch = (id: string, p: Partial<ConvInvoice>) => setData((d) => d && {
    ...d, customers: d.customers.map((c) => ({ ...c, invoices: c.invoices.map((i) => (i.id === id ? { ...i, ...p } : i)) })),
  });

  const shown = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    return data.customers
      .map((c) => ({ ...c, invoices: c.invoices.filter((i) => !s || c.name.toLowerCase().includes(s) || i.number.toLowerCase().includes(s) || i.po.toLowerCase().includes(s)) }))
      .filter((c) => c.invoices.length && (!onlyMissing || c.missing > 0));
  }, [data, q, onlyMissing]);
  const searching = q.trim().length > 0;
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input className="h-10 w-full max-w-sm rounded-xl border border-line bg-surface px-3.5 text-[14px] text-ink placeholder:text-faint" placeholder="Search a customer, invoice or PO number" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <div className="flex rounded-xl bg-surface-2 p-1">
          {[[false, "All customers"], [true, "Something missing"]].map(([v, l]) => (
            <button key={String(v)} type="button" onClick={() => setOnlyMissing(v as boolean)} className={`h-8 rounded-lg px-3 text-[13px] font-medium ${onlyMissing === v ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>{l as string}</button>
          ))}
        </div>
        {data && data.pending > 0 && <span className="text-[13px] text-muted">Reading e-way bills and attachments from Zoho · {data.pending} left</span>}
      </div>
      {error && <p className="rounded-xl bg-high-bg px-4 py-3 text-[13px] text-high">{error}</p>}
      {!data ? <Skeleton className="h-[420px]" /> : shown.length === 0 ? <p className="card p-6 text-[14px] text-muted">{searching ? "Nothing matches." : "No invoices."}</p> : (
        <div className="space-y-3">
          {shown.map((c) => {
            const isOpen = searching || open.has(c.id);
            return (
              <section key={c.id} className="card overflow-hidden">
                <button type="button" onClick={() => toggle(c.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-surface-2/50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold text-ink">{c.name}</span>
                    <span className="num block text-[13px] text-muted">{c.invoices.length} invoice{c.invoices.length === 1 ? "" : "s"} · last {day(c.latest)}</span>
                  </span>
                  {c.missing > 0 ? <span className="num shrink-0 rounded-full bg-high-bg px-2.5 py-1 text-[12.5px] font-semibold text-high">{c.missing} to complete</span>
                    : <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-ink-2"><Mark ok />All complete</span>}
                  <svg viewBox="0 0 16 16" width="16" height="16" className={`shrink-0 text-muted transition ${isOpen ? "rotate-180" : ""}`} aria-hidden><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                {isOpen && (
                  <div className="border-t border-line">
                    <div className="hidden grid-cols-[minmax(0,1.1fr)_110px_minmax(0,1.4fr)_120px_minmax(0,1.2fr)_120px] gap-3 bg-surface-2/60 px-5 py-2 text-[12px] font-medium text-muted lg:grid">
                      <span>Invoice</span><span className="text-right">Value</span><span>Purchase order</span><span>PO PDF</span><span>E-way bill <span className="text-faint">(over {inr(EWAY_OVER)})</span></span><span>E-way PDF</span>
                    </div>
                    <ul className="divide-y divide-line">
                      {c.invoices.map((i) => <Row key={i.id} i={i} onPatch={(p) => patch(i.id, p)} />)}
                    </ul>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ i, onPatch }: { i: ConvInvoice; onPatch: (p: Partial<ConvInvoice>) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState<"" | "po" | "poPdf" | "ewayPdf">("");
  const [error, setError] = useState("");
  const poFile = useRef<HTMLInputElement>(null);
  const ewayFile = useRef<HTMLInputElement>(null);

  const savePo = async () => {
    setBusy("po"); setError("");
    const r = await fetch("/api/invoice-converter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "po", id: i.id, value }) }).then((x) => x.json()).catch(() => ({ error: "Couldn't reach the server" }));
    setBusy("");
    if (r.error) return setError(r.error);
    onPatch({ po: r.po, poOk: r.ok });
    setEditing(false);
  };
  const attach = async (which: "po" | "eway", file?: File | null) => {
    if (!file) return;
    setBusy(which === "po" ? "poPdf" : "ewayPdf"); setError("");
    const f = new FormData();
    f.append("id", i.id); f.append("which", which); f.append("file", file);
    const r = await fetch("/api/invoice-converter", { method: "POST", body: f }).then((x) => x.json()).catch(() => ({ error: "Couldn't reach the server" }));
    setBusy("");
    if (r.error) return setError(r.error);
    onPatch(which === "po" ? { poPdf: true } : { ewayPdf: true });
  };
  const label = "text-[12px] font-medium text-muted lg:hidden";
  const add = "rounded-lg px-2 py-1 text-[13px] font-semibold text-brand hover:bg-brand-soft disabled:opacity-50";

  return (
    <li className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-5 py-3 lg:grid-cols-[minmax(0,1.1fr)_110px_minmax(0,1.4fr)_120px_minmax(0,1.2fr)_120px] lg:items-center">
      <div className="col-span-2 min-w-0 lg:col-span-1">
        <p className="num truncate text-[14px] font-semibold text-ink">{i.number}</p>
        <p className="num text-[12.5px] text-muted">{day(i.date)}{i.status === "draft" ? " · draft" : ""}</p>
      </div>
      <p className="num col-span-2 text-[14px] font-semibold text-ink lg:col-span-1 lg:text-right">{inr(i.total)}</p>

      {/* Purchase order */}
      <div className="col-span-2 min-w-0 lg:col-span-1">
        <p className={label}>Purchase order</p>
        {editing ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <input className="h-8 w-40 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") savePo(); if (e.key === "Escape") setEditing(false); }} placeholder="PO number" autoFocus aria-label="Purchase order number" />
            <button type="button" className="h-8 rounded-lg bg-brand px-3 text-[13px] font-semibold text-brand-ink disabled:opacity-50" onClick={savePo} disabled={busy === "po"}>{busy === "po" ? "Saving…" : "Save"}</button>
            <button type="button" className="h-8 rounded-lg px-2 text-[13px] text-muted hover:text-ink" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => { setValue(i.poOk ? i.po : ""); setEditing(true); }} className="flex min-w-0 items-center gap-2 rounded-lg py-0.5 text-left hover:bg-surface-2" title="Change the PO number">
            <Mark ok={i.poOk} />
            <span className={`num truncate text-[13.5px] ${i.poOk ? "font-semibold text-ink" : "text-ink-2"}`}>{i.po}</span>
            {!i.poOk && <span className="shrink-0 text-[12.5px] font-semibold text-brand">Add</span>}
          </button>
        )}
      </div>

      {/* PO PDF */}
      <div>
        <p className={label}>PO PDF</p>
        {i.poPdf ? <span className="flex items-center gap-1.5 text-[13px] text-ink-2"><Mark ok />Attached</span> : i.pending ? <span className="text-[13px] text-faint">Reading…</span> : (
          <span className="flex items-center gap-1.5"><Mark ok={false} /><button type="button" className={add} disabled={busy === "poPdf"} onClick={() => poFile.current?.click()}>{busy === "poPdf" ? "Attaching…" : "Attach"}</button></span>
        )}
        <input ref={poFile} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { attach("po", e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      {/* E-way bill */}
      <div className="min-w-0">
        <p className={label}>E-way bill</p>
        {!i.needsEway ? <span className="text-[13px] text-faint">Not needed</span> : i.pending ? <span className="text-[13px] text-faint">Reading…</span> : (
          <span className="flex min-w-0 items-center gap-2"><Mark ok={Boolean(i.eway)} /><span className={`num truncate text-[13.5px] ${i.eway ? "font-semibold text-ink" : "text-ink-2"}`}>{i.eway ?? "No e-way bill"}</span></span>
        )}
      </div>

      {/* E-way PDF */}
      <div>
        <p className={label}>E-way PDF</p>
        {!i.needsEway ? <span className="text-[13px] text-faint">—</span> : i.ewayPdf ? <span className="flex items-center gap-1.5 text-[13px] text-ink-2"><Mark ok />Attached</span> : i.pending ? <span className="text-[13px] text-faint">Reading…</span> : (
          <span className="flex items-center gap-1.5"><Mark ok={false} /><button type="button" className={add} disabled={busy === "ewayPdf"} onClick={() => ewayFile.current?.click()}>{busy === "ewayPdf" ? "Attaching…" : "Attach"}</button></span>
        )}
        <input ref={ewayFile} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { attach("eway", e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {error && <p className="col-span-full rounded-lg bg-high-bg px-3 py-2 text-[13px] text-high">{error}</p>}
    </li>
  );
}
