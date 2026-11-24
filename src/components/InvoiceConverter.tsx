"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ConvCustomer, ConvInvoice } from "@/lib/invoiceConverterRules";
import { EWAY_OVER, blocksOf } from "@/lib/invoiceConverterRules";
import { Skeleton, toneOf } from "./ui";

/*
 * The Invoice Converter (owner, 17 Nov): each customer and all their invoices; for each invoice the Purchase Order (its
 * number, a neon green tick; "Verbal" or none, a neon red cross), the PO PDF, and for invoices over ₹50,000 the e-way bill
 * (number and PDF). Click a cross to add what's missing; it goes straight to the invoice in Zoho Books and ticks.
 */

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const day = (s: string) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

type SignInfo = { connected: boolean; canConnect: boolean; signer: { email: string; name: string } | null };

/** Blue N/A (owner, 17 Nov): no e-way bill is needed on an invoice of ₹50,000 or less. */
const NA = () => <span className="rounded-full bg-info-bg px-2.5 py-1 text-[12px] font-semibold text-info">N/A</span>;

/** A small spinning ring shown while something is being written to Zoho Books. */
function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="shrink-0 animate-spin motion-reduce:animate-[spin_1.6s_linear_infinite]" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
/** A button's label while busy: the spinner and what it's doing. */
const Busy = ({ text }: { text: string }) => <span className="inline-flex items-center gap-1.5"><Spinner />{text}</span>;

/** There or missing: a soft round mark (owner, 24 Nov: instead of the neon ticks and crosses). */
function Mark({ ok, small = false }: { ok: boolean; small?: boolean }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full ${small ? "size-[18px]" : "size-6"} ${ok ? "bg-low-bg text-low" : "bg-high-bg text-high"}`} role="img" aria-label={ok ? "Yes" : "No"}>
      <svg viewBox="0 0 16 16" width={small ? 10 : 12} height={small ? 10 : 12} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {ok ? <path d="M3 8.6 6.4 12 13 4.6" /> : <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" />}
      </svg>
    </span>
  );
}

export function InvoiceConverter() {
  const [data, setData] = useState<{ customers: ConvCustomer[]; pending: number; scansDue?: number; sign?: SignInfo } | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [onlyFound, setOnlyFound] = useState(false);
  // "Find POs" (owner, 24 Nov): read the WorkDrive PO folder, a batch at a time, until nothing is left.
  const [scan, setScan] = useState<{ busy: boolean; text: string; bad?: boolean }>({ busy: false, text: "" });
  const scanning = useRef(false);
  const findPos = async () => {
    if (scanning.current) return;
    setScan({ busy: true, text: "Reading the PO folder…" });
    scanning.current = true;
    let last: { files?: number; left?: number; pictures?: number; added?: number; seen?: number; unread?: number; error?: string } = {};
    for (let n = 0; n < 200; n++) {
      last = await fetch("/api/invoice-converter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "scanPo" }) }).then((x) => x.json()).catch(() => ({ error: "Couldn't reach the server" }));
      if (last.error || !last.left || !last.added) break;
      setScan({ busy: true, text: last.left === last.pictures ? `Reading scanned POs page by page… ${last.left} left` : `Reading the PO folder… ${last.left} of ${last.files} PDFs left` });
      if (n % 3 === 2) await load();
    }
    await load();
    scanning.current = false;
    setScan(last.error ? { busy: false, text: last.error, bad: true } : { busy: false, text: `${last.files ?? 0} PDFs in the PO folder checked, ${last.seen ?? 0} of them read from the scanned page${(last.left ?? 0) + (last.unread ?? 0) ? ` · ${(last.left ?? 0) + (last.unread ?? 0)} couldn't be read` : ""}` });
  };
  const load = () => fetch("/api/invoice-converter", { cache: "no-store" }).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (j.customers) { setData(j); setError(""); } else setError(j.error ?? "Couldn't load the invoices");
  }).catch(() => setError("Couldn't reach the server"));
  useEffect(() => { load(); }, []);
  // New scans found by a sync: their pages are read now, once, without a click.
  const carriedOn = useRef(false);
  useEffect(() => {
    if (!data?.scansDue || carriedOn.current || scanning.current) return;
    carriedOn.current = true;
    void findPos();
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  // E-way bills and attachments are read from Zoho a few at a time: keep asking while some are left.
  useEffect(() => {
    if (!data?.pending) return;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [data]);

  // A PO saved on one invoice lands on every invoice of its PI, so a change can touch several rows at once.
  const patch = (ids: string[], p: Partial<ConvInvoice>) => setData((d) => d && {
    ...d, customers: d.customers.map((c) => ({ ...c, invoices: c.invoices.map((i) => (ids.includes(i.id) ? { ...i, ...p } : i)) })),
  });

  const shown = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    const anyFound = data.customers.some((c) => c.invoices.some((i) => i.poFound?.length && !i.poPdf));
    return data.customers
      .map((c) => ({ ...c, invoices: c.invoices.filter((i) => (!onlyFound || !anyFound || (i.poFound?.length && !i.poPdf)) && (!s || c.name.toLowerCase().includes(s) || i.number.toLowerCase().includes(s) || i.po.toLowerCase().includes(s))) }))
      .filter((c) => c.invoices.length);
  }, [data, q, onlyFound]);
  const foundCount = data?.customers.reduce((n, c) => n + c.invoices.filter((i) => i.poFound?.length && !i.poPdf).length, 0) ?? 0;
  const filtering = onlyFound && foundCount > 0;
  const searching = q.trim().length > 0 || filtering;
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <input className="h-11 w-full max-w-sm rounded-full border border-line bg-surface px-5 text-[14px] text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15" placeholder="Search a customer, invoice or PO number" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <button type="button" onClick={findPos} disabled={scan.busy} className="press h-11 shrink-0 rounded-full bg-brand px-5 text-[13.5px] font-semibold text-brand-ink shadow-[0_6px_16px_-8px_color-mix(in_srgb,var(--brand)_70%,transparent)] hover:brightness-110 disabled:opacity-60" title="Look in the WorkDrive PO folder for PDFs carrying these invoices' PO numbers">{scan.busy ? <Busy text="Finding POs…" /> : "Find POs"}</button>
        {foundCount > 0 && <button type="button" aria-pressed={filtering} onClick={() => setOnlyFound(!filtering)} className={`press num h-11 shrink-0 rounded-full px-5 text-[13.5px] font-semibold ${filtering ? "bg-brand-soft text-brand ring-1 ring-brand/40" : "bg-surface text-ink shadow-card hover:bg-surface-2"}`}>{foundCount} PO{foundCount === 1 ? "" : "s"} found{filtering ? " ✕" : ""}</button>}
        {scan.text && <span className={`num text-[13px] ${scan.bad ? "text-high" : "text-muted"}`} role="status">{scan.text}</span>}
        {data && data.pending > 0 && <span className="inline-flex items-center gap-1.5 text-[13px] text-muted"><Spinner />Reading e-way bills and attachments from Zoho · {data.pending} left</span>}
      </div>
      {error && <p className="rounded-xl bg-high-bg px-4 py-3 text-[13px] text-high">{error}</p>}
      {/* Zoho Sign's one-time setup (name and email per signer) is hidden for everyone (owner, 18 Nov): signing waits on
          Zoho Sign API credits. Put <SignSetup sign={data.sign} onDone={load} /> back here when signing is turned on. */}
      {!data ? <Skeleton className="h-[420px]" /> : shown.length === 0 ? <p className="card p-6 text-[14px] text-muted">{searching ? "Nothing matches." : "No invoices."}</p> : (
        <div className="space-y-4">
          {shown.map((c) => {
            const isOpen = searching || open.has(c.id);
            return (
              <section key={c.id} className="card overflow-hidden">
                <button type="button" onClick={() => toggle(c.id)} aria-expanded={isOpen} className="flex w-full items-center gap-4 px-5 py-5 text-left hover:bg-surface-2/50 sm:px-6">
                  <span style={toneOf(c.name)} className="soft-tone hidden size-11 shrink-0 place-items-center rounded-[14px] text-[14px] font-semibold sm:grid" aria-hidden>{c.name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold text-ink">{c.name}</span>
                    <span className="num block text-[13px] text-muted">{c.invoices.length} invoice{c.invoices.length === 1 ? "" : "s"} · last {day(c.latest)}</span>
                  </span>
                  {c.missing > 0 ? <span className="num inline-flex shrink-0 items-center gap-2 rounded-full bg-medium-bg px-3 py-1.5 text-[12.5px] font-semibold text-ink-2"><span className="size-1.5 rounded-full bg-medium" aria-hidden />{c.missing} to complete</span>
                    : <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-low-bg px-3 py-1.5 text-[12.5px] font-semibold text-low"><span className="size-1.5 rounded-full bg-low" aria-hidden />All complete</span>}
                  <svg viewBox="0 0 16 16" width="16" height="16" className={`shrink-0 text-muted transition ${isOpen ? "rotate-180" : ""}`} aria-hidden><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                {isOpen && (
                  <div className="border-t border-line">
                    <div className={`hidden ${COLS} gap-x-10 bg-surface-2/50 py-3 pl-11 pr-6 text-[12.5px] font-medium text-muted lg:grid`}>
                      <span>Invoice</span><span>Value</span><span>Purchase order</span><span title={`Needed over ${inr(EWAY_OVER)}`}>E-way bill</span><span>Merged PDF</span>
                    </div>
                    <ul className="divide-y divide-line/70">
                      {blocksOf(c.invoices).map((b) => b.pi ? (
                        <Linked key={b.pi} pi={b.pi} invoices={b.invoices} sign={data.sign} onPatch={patch} />
                      ) : <Row key={b.invoices[0].id} i={b.invoices[0]} sign={data.sign} onPatch={patch} />)}
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

// Columns with a clear gap between them (owner, 18 Nov: the headings shouldn't stick to each other). The left padding
// (pl-11) leaves room for the line that links invoices of the same PI.
// Five columns of the same width (owner, 18 Nov).
const COLS = "grid-cols-[repeat(5,minmax(0,1fr))]";
// Written out in full so Tailwind finds it (a class built from a variable isn't generated).
const COLS_LG = "lg:grid-cols-[repeat(5,minmax(0,1fr))]";

type Patch = (ids: string[], p: Partial<ConvInvoice>) => void;

/** The PDF upload and PO save, shared by a row and a linked block. */
async function sendPo(id: string, value: string, file?: File | null): Promise<{ error?: string; ids?: string[]; poIds?: string[]; po?: string; poOk?: boolean; ok?: boolean; found?: string | null }> {
  if (file) {
    const f = new FormData();
    f.append("id", id); f.append("which", "po"); f.append("file", file);
    if (value.trim()) f.append("value", value.trim());
    return fetch("/api/invoice-converter", { method: "POST", body: f }).then((x) => x.json()).catch(() => ({ error: "Couldn't reach the server" }));
  }
  const r = await fetch("/api/invoice-converter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "po", id, value }) }).then((x) => x.json()).catch(() => ({ error: "Couldn't reach the server" }));
  return r.error ? r : { ids: r.ids ?? [id], poIds: r.ids ?? [id], po: r.po, poOk: r.ok };
}

/*
 * Invoices of the same PI, linked (owner, 18 Nov): a line runs from the block's top down through each invoice and ends
 * in an arrow at the last one. One button on top adds a single PO number and PO PDF to all of them.
 */
function Linked({ pi, invoices, sign, onPatch }: { pi: string; invoices: ConvInvoice[]; sign?: SignInfo; onPatch: Patch }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const pick = useRef<HTMLInputElement>(null);
  const n = invoices.length;
  const allDone = invoices.every((i) => i.poOk && i.po === invoices[0].po && i.poPdf);
  const save = async () => {
    setBusy(true); setError(""); setNote("");
    const r = await sendPo(invoices[0].id, value, file);
    setBusy(false);
    if (r.error) return setError(r.error);
    if (file && r.ids?.length) onPatch(r.ids, { poPdf: true });
    if (r.poIds?.length && r.po !== undefined) onPatch(r.poIds, { po: r.po, poOk: Boolean(r.poOk) });
    if (file && !value.trim() && !r.found) setNote("PDF attached to all. No PO number found in it (a scanned copy has no text): type it in.");
    setEditing(false); setFile(null);
  };
  const field = "h-9 rounded-lg border border-line bg-surface px-3 text-[13.5px] text-ink";
  return (
    <li>
      <div className={`relative grid grid-cols-1 items-center gap-x-10 gap-y-2 bg-brand-soft/60 py-2.5 pl-11 pr-5 ${COLS_LG}`}>
        {/* The line starts at this strip; each row carries it on, the last ends it in an arrow. */}
        <span aria-hidden className="absolute bottom-0 left-[19px] top-[26px] w-0.5 bg-brand" />
        <span aria-hidden className="absolute left-[14px] top-[20px] h-3 w-3 rounded-full bg-brand" />
        <p className="min-w-0 text-[13px] text-ink-2 lg:col-span-2">
          <span className="num font-semibold text-ink">{pi}</span> · {n} invoices, one PO
        </p>
        <div className="min-w-0">
          {allDone && !editing ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
              <Mark ok small /><span>On all {n}</span>
              <button type="button" className="rounded px-1.5 py-0.5 font-semibold text-brand hover:bg-brand-soft" onClick={() => { setValue(""); setEditing(true); }}>Change</button>
            </span>
          ) : (
            <button type="button" disabled={editing} className="press h-9 rounded-full bg-brand px-4 text-[13px] font-semibold text-brand-ink disabled:opacity-50" onClick={() => { setValue(""); setEditing(true); }}>Add PO for all {n}</button>
          )}
        </div>
        <p className="hidden text-[12.5px] text-muted lg:block">Each invoice has its own</p>
        {editing && (
          <div className="flex flex-wrap items-center gap-2 lg:col-span-3 lg:col-start-3">
            <input className={`${field} w-48`} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }} placeholder="PO number" autoFocus aria-label={`PO number for all invoices of ${pi}`} />
            <button type="button" className="h-9 max-w-64 truncate rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-surface-2" onClick={() => pick.current?.click()}>{file ? file.name : "Choose PO PDF"}</button>
            <input ref={pick} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            <button type="button" className="h-9 rounded-lg bg-brand px-4 text-[13px] font-semibold text-brand-ink disabled:opacity-50" disabled={busy || (!value.trim() && !file)} onClick={save}>{busy ? <Busy text={`Saving to Zoho Books · ${n} invoices…`} /> : `Save for all ${n}`}</button>
            <button type="button" className="h-9 rounded-lg px-2 text-[13px] text-muted hover:text-ink" onClick={() => { setEditing(false); setFile(null); }}>Cancel</button>
            <span className="text-[12.5px] text-muted">Leave the number empty to read it from the PDF.</span>
          </div>
        )}
        {error && <p className="rounded-lg bg-high-bg px-3 py-2 text-[13px] text-high lg:col-span-3 lg:col-start-3">{error}</p>}
        {note && <p className="text-[12.5px] text-muted lg:col-span-3 lg:col-start-3">{note}</p>}
      </div>
      <ul className="divide-y divide-line">
        {invoices.map((i, k) => <Row key={i.id} i={i} sign={sign} onPatch={onPatch} link={k === n - 1 ? "last" : "mid"} pi={pi} />)}
      </ul>
    </li>
  );
}

/** The PDF line under a number: attached (tick) with Replace (owner, 23 Nov), or Attach. */
function Pdf({ has, pending, busy, onPick, onReplace, replaceTitle }: { has: boolean; pending: boolean; busy: boolean; onPick: () => void; onReplace: () => void; replaceTitle: string }) {
  if (pending) return <p className="mt-0.5 text-[12.5px] text-faint">PDF: reading…</p>;
  return has ? (
    <p className="mt-1.5 flex items-center gap-2 text-[12.5px] text-ink-2"><Mark ok small />PDF attached <button type="button" className="rounded px-1 font-semibold text-brand hover:bg-brand-soft disabled:opacity-50" disabled={busy} onClick={onReplace} title={replaceTitle}>{busy ? <Busy text="Replacing in Zoho…" /> : "Replace"}</button></p>
  ) : (
    <p className="mt-1.5 flex items-center gap-2 text-[12.5px] text-ink-2"><Mark ok={false} small />No PDF <button type="button" className="rounded px-1 font-semibold text-brand hover:bg-brand-soft disabled:opacity-50" disabled={busy} onClick={onPick}>{busy ? <Busy text="Attaching in Zoho…" /> : "Attach"}</button></p>
  );
}

/** One invoice. In a linked block (`link`) it carries the PI's line on; a PO saved here goes to every invoice of the PI. */
function Row({ i, sign, onPatch: patchIds, link, pi }: { i: ConvInvoice; sign?: SignInfo; onPatch: Patch; link?: "mid" | "last"; pi?: string }) {
  const onPatch = (p: Partial<ConvInvoice>) => patchIds([i.id], p);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState<"" | "po" | "poPdf" | "eway" | "ewayPdf" | "sign">("");
  const [merging, setMerging] = useState(false);
  const downloadMerged = async () => {
    setMerging(true); setError("");
    try {
      const r = await fetch(`/api/invoice-converter?merged=${i.id}`, { cache: "no-store" });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setError(j.error ?? "Couldn't make the merged PDF"); return; }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url; a.download = `Invoice ${i.number} merged.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { setError("Couldn't reach the server"); } finally { setMerging(false); }
  };
  const [ewayEdit, setEwayEdit] = useState(false);
  const [ewayValue, setEwayValue] = useState("");
  const saveEway = async () => {
    setBusy("eway"); setError("");
    const r = await fetch("/api/invoice-converter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "eway", id: i.id, value: ewayValue }) }).then((x) => x.json()).catch(() => ({ error: "Couldn't reach the server" }));
    setBusy("");
    if (r.error) return setError(r.error);
    onPatch({ eway: r.eway ?? null });
    setEwayEdit(false);
  };
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const poFile = useRef<HTMLInputElement>(null);
  const ewayFile = useRef<HTMLInputElement>(null);

  const savePo = async () => {
    setBusy("po"); setError("");
    const r = await sendPo(i.id, value);
    setBusy("");
    if (r.error) return setError(r.error);
    patchIds(r.poIds ?? [i.id], { po: r.po ?? value, poOk: Boolean(r.poOk) });
    setEditing(false);
  };
  // Replace (owner, 23 Nov): the same file pickers; this says whether the pick replaces the PDF already there.
  const replacing = useRef(false);
  const attach = async (which: "po" | "eway", file?: File | null) => {
    const replace = replacing.current;
    replacing.current = false;
    if (!file) return;
    setBusy(which === "po" ? "poPdf" : "ewayPdf"); setError("");
    const f = new FormData();
    f.append("id", i.id); f.append("which", which); f.append("file", file);
    if (replace) f.append("replace", "1");
    const r = await fetch("/api/invoice-converter", { method: "POST", body: f }).then((x) => x.json()).catch(() => ({ error: "Couldn't reach the server" }));
    setBusy("");
    if (r.error) return setError(r.error);
    // The number read from the PDF, filled in (owner, 17 Nov); a PO PDF lands on every invoice of the PI (18 Nov).
    if (which === "po") {
      patchIds(r.ids ?? [i.id], { poPdf: true });
      if (r.po && r.poIds?.length) patchIds(r.poIds, { po: r.po, poOk: r.poOk });
    } else onPatch({ ewayPdf: true, ...(r.eway ? { eway: r.eway } : {}) });
    if (!r.found) setError(which === "po" ? (replace ? "Replaced." : "Attached.") + " No PO number found in the PDF (a scanned copy has no text): type it in." : (replace ? "Replaced." : "Attached.") + " No e-way bill number found in the PDF.");
  };
  // Merge and draft (owner, 20 Nov): a Zoho Sign draft with the boxes placed, opened in a new tab (opened straight away —
  // a tab opened after the wait would be blocked). The owner signs and sends it in Zoho Sign; nothing is sent from here.
  const startDraft = async () => {
    setBusy("sign"); setError("");
    const w = window.open("about:blank", "_blank");
    const r = await fetch("/api/invoice-converter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "draft", id: i.id }) }).then((x) => x.json()).catch(() => ({ error: "Couldn't reach the server" }));
    setBusy("");
    if (r.error || !r.url) { w?.close(); return setError(r.error ?? "Zoho Sign didn't open"); }
    if (w) w.location.href = r.url; else window.location.href = r.url;
    if (r.skipped?.length) setError(`Left out (not a PDF or picture): ${r.skipped.join(", ")}`);
  };
  const label = "text-[12px] font-medium text-muted lg:hidden";

  return (
    <li className={`relative grid grid-cols-2 gap-x-10 gap-y-3 py-5 pl-11 pr-6 ${COLS_LG} lg:items-center`}>
      {/* The PI's line: through this invoice's dot, or, on the last one, ending in an arrow at it. */}
      {link === "mid" && <><span aria-hidden className="absolute bottom-0 left-[19px] top-0 w-0.5 bg-brand" /><span aria-hidden className="absolute left-[14px] top-[26px] h-3 w-3 rounded-full border-2 border-brand bg-surface lg:top-[32px]" /></>}
      {link === "last" && <><span aria-hidden className="absolute left-[19px] top-0 h-[24px] w-0.5 bg-brand lg:h-[30px]" /><svg aria-hidden viewBox="0 0 12 10" width="12" height="10" className="absolute left-[14px] top-[23px] text-brand lg:top-[29px]"><path d="M0 0h12L6 10z" fill="currentColor" /></svg></>}
      <div className="col-span-2 min-w-0 lg:col-span-1">
        <p className="num truncate text-[14px] font-semibold text-ink">{i.number}</p>
        <p className="num text-[12.5px] text-muted">{day(i.date)}{i.status === "draft" ? " · draft" : ""}</p>
      </div>
      <p className="num col-span-2 text-[14px] font-semibold text-ink lg:col-span-1">{inr(i.total)}</p>

      {/* Purchase order */}
      <div className="col-span-2 min-w-0 lg:col-span-1">
        <p className={label}>Purchase order</p>
        {editing ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <input className="h-8 w-40 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") savePo(); if (e.key === "Escape") setEditing(false); }} placeholder="PO number" autoFocus aria-label="Purchase order number" />
            <button type="button" className="h-8 rounded-lg bg-brand px-3 text-[13px] font-semibold text-brand-ink disabled:opacity-50" onClick={savePo} disabled={busy === "po"}>{busy === "po" ? <Busy text="Saving…" /> : "Save"}</button>
            <button type="button" className="h-8 rounded-lg px-2 text-[13px] text-muted hover:text-ink" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => { setValue(i.poOk ? i.po : ""); setEditing(true); }} className="flex min-w-0 items-center gap-2 rounded-lg py-0.5 text-left hover:bg-surface-2" title={pi ? `Change the PO number on every invoice of ${pi}` : "Change the PO number"}>
            <Mark ok={i.poOk} />
            <span className={`num truncate text-[13.5px] ${i.poOk ? "font-semibold text-ink" : "text-ink-2"}`}>{i.po}</span>
            {!i.poOk && <span className="shrink-0 text-[12.5px] font-semibold text-brand">Add</span>}
          </button>
        )}
        <Pdf has={i.poPdf} pending={i.pending} busy={busy === "poPdf"} onPick={() => { replacing.current = false; poFile.current?.click(); }} onReplace={() => { replacing.current = true; poFile.current?.click(); }}
          replaceTitle={pi ? `Delete the PO PDF in Zoho and attach a new one, on every invoice of ${pi}` : "Delete the PO PDF in Zoho and attach a new one"} />
        {!i.poPdf && !i.pending && Boolean(i.poFound?.length) && (
          <button type="button" onClick={() => setPreview(true)} className="press mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-[12.5px] font-semibold text-brand hover:underline" title={i.poFound!.map((f) => f.name).join(", ")}>
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden className="shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 1.8H4v12.4h8V4.8zM9 1.8v3h3" /></svg>
            PO found{i.poFound!.length > 1 ? ` (${i.poFound!.length})` : ""} · Preview
          </button>
        )}
        {preview && i.poFound && <PoPreview i={i} pi={pi} onClose={() => setPreview(false)} onUsed={(r) => {
          setPreview(false);
          patchIds(r.ids ?? [i.id], { poPdf: true });
          if (r.po && r.poIds?.length) patchIds(r.poIds, { po: r.po, poOk: r.poOk });
        }} />}
        <input ref={poFile} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { attach("po", e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      {/* E-way bill: number and PDF in one cell; N/A up to ₹50,000. */}
      <div className="col-span-2 min-w-0 lg:col-span-1">
        <p className={label}>E-way bill</p>
        {!i.needsEway ? <NA /> : i.pending ? <span className="text-[13px] text-faint">Reading…</span> : (
          <>
            {ewayEdit ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <input className="h-8 w-40 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink" inputMode="numeric" value={ewayValue} onChange={(e) => setEwayValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveEway(); if (e.key === "Escape") setEwayEdit(false); }} placeholder="12-digit number" autoFocus aria-label="E-way bill number" />
                <button type="button" className="h-8 rounded-lg bg-brand px-3 text-[13px] font-semibold text-brand-ink disabled:opacity-50" onClick={saveEway} disabled={busy === "eway"}>{busy === "eway" ? <Busy text="Saving…" /> : "Save"}</button>
                <button type="button" className="h-8 rounded-lg px-2 text-[13px] text-muted hover:text-ink" onClick={() => setEwayEdit(false)}>Cancel</button>
              </div>
            ) : i.ewayZoho ? (
              <span className="flex min-w-0 items-center gap-2 py-0.5" title="From Zoho"><Mark ok /><span className="num truncate text-[13.5px] font-semibold text-ink">{i.eway}</span></span>
            ) : (
              <button type="button" onClick={() => { setEwayValue(i.eway ?? ""); setEwayEdit(true); }} className="flex min-w-0 items-center gap-2 rounded-lg py-0.5 text-left hover:bg-surface-2" title={i.eway ? "Change the e-way bill number" : "Add the e-way bill number"}>
                <Mark ok={Boolean(i.eway)} />
                <span className={`num truncate text-[13.5px] ${i.eway ? "font-semibold text-ink" : "text-ink-2"}`}>{i.eway ?? "No e-way bill"}</span>
                {!i.eway && <span className="shrink-0 text-[12.5px] font-semibold text-brand">Add</span>}
              </button>
            )}
            <Pdf has={i.ewayPdf} pending={false} busy={busy === "ewayPdf"} onPick={() => { replacing.current = false; ewayFile.current?.click(); }} onReplace={() => { replacing.current = true; ewayFile.current?.click(); }} replaceTitle="Delete the e-way bill PDF in Zoho and attach a new one" />
          </>
        )}
        <input ref={ewayFile} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { attach("eway", e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {/* Merge and draft (owner, 20 Nov): invoice + PO + e-way bill PDFs as a Zoho Sign draft, signature / date / name
          boxes placed; signed and sent in Zoho Sign by hand (sending from here would need Zoho Sign API credits). */}
      <div className="col-span-2 lg:col-span-1">
        <p className={label}>Merged PDF</p>
        <button type="button" className="press h-9 rounded-full bg-surface-2 px-4 text-[13px] font-semibold text-ink hover:bg-line disabled:opacity-50" disabled={busy === "sign" || !sign?.connected} onClick={startDraft}
          title={!sign?.connected ? "Zoho Sign isn't connected yet" : "Merge the invoice, PO and e-way bill PDFs into a Zoho Sign draft with the signature, date and name boxes placed — you sign and send it in Zoho Sign"}>
          {busy === "sign" ? <Busy text="Merging…" /> : "Merge & draft"}
        </button>
        {/* The merged PDF on its own (owner, 17 Nov: Zoho Sign's plan refuses API sends). */}
        {/* Fetched here (not a plain link) so the spinner shows while Zoho's files are gathered and merged. */}
        <button type="button" className="mt-1 block text-left text-[12.5px] font-semibold text-brand hover:underline disabled:no-underline" disabled={merging} onClick={downloadMerged}>{merging ? <Busy text="Merging the PDFs…" /> : "Merged PDF"}</button>
      </div>
      {error && <p className="col-span-full rounded-lg bg-high-bg px-3 py-2 text-[13px] text-high">{error}</p>}
    </li>
  );
}

/** The PO PDF(s) found in WorkDrive for an invoice: look, then pick (owner, 24 Nov: never attached by itself). */
function PoPreview({ i, pi, onClose, onUsed }: { i: ConvInvoice; pi?: string; onClose: () => void; onUsed: (r: { ids?: string[]; poIds?: string[]; po?: string; poOk?: boolean }) => void }) {
  const files = i.poFound ?? [];
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const f = files[Math.min(at, files.length - 1)];
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [busy, onClose]);
  if (!f) return null;
  const src = `/api/invoice-converter?po=${encodeURIComponent(f.id)}&id=${i.id}`;
  const use = async () => {
    setBusy(true); setError("");
    const r = await fetch("/api/invoice-converter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "usePo", id: i.id, file: f.id }) }).then((x) => x.json()).catch(() => ({ error: "Couldn't reach the server" }));
    setBusy(false);
    if (r.error) return setError(r.error);
    onUsed(r);
  };
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3 sm:p-6" onClick={() => { if (!busy) onClose(); }}>
      <div className="modal-in flex h-full max-h-[920px] w-full max-w-[900px] flex-col overflow-hidden rounded-2xl bg-surface shadow-pop" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`PO found for invoice ${i.number}`}>
        <header className="flex items-start gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <h2 className="num text-[16px] font-semibold text-ink">PO {i.po} <span className="font-medium text-muted">· invoice {i.number} · {inr(i.total)}</span></h2>
            <p className="truncate text-[13px] text-muted">{f.name}</p>
          </div>
          <a href={src} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg px-2 py-1 text-[13px] font-semibold text-brand hover:bg-brand-soft">Open in a new tab</a>
          <button type="button" onClick={onClose} disabled={busy} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close">✕</button>
        </header>
        {files.length > 1 && (
          <div className="flex flex-wrap gap-1.5 border-b border-line px-5 py-2.5" role="group" aria-label="PDFs found">
            {files.map((x, k) => <button key={x.id} type="button" aria-pressed={k === at} onClick={() => { setAt(k); setError(""); }} disabled={busy} className={`max-w-[260px] truncate rounded-full px-3 py-1 text-[12.5px] font-medium ${k === at ? "bg-brand text-brand-ink" : "bg-surface-2 text-ink hover:bg-line"}`}>{x.name}</button>)}
          </div>
        )}
        <iframe key={f.id} src={src} title={f.name} className="min-h-0 w-full flex-1 bg-white" />
        {error && <p className="bg-high-bg px-5 py-2.5 text-[13px] text-high" role="alert">{error}</p>}
        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          <span className="min-w-0 flex-1 text-[12.5px] text-muted">{pi ? `Goes on the invoices of ${pi} with this PO number or none.` : "Goes on this invoice in Zoho Books."}</span>
          <button type="button" onClick={onClose} disabled={busy} className="h-9 rounded-lg px-3 text-[13px] text-muted hover:text-ink">Cancel</button>
          <button type="button" autoFocus onClick={use} disabled={busy} className="h-9 rounded-lg bg-brand px-4 text-[13px] font-semibold text-brand-ink disabled:opacity-60">{busy ? <Busy text="Attaching in Zoho…" /> : "Use this PO"}</button>
        </footer>
      </div>
    </div>, document.body);
}

/** Zoho Sign's one-time setup: Admin connects it; each signer gives their email and full name once. */
function SignSetup({ sign, onDone }: { sign: SignInfo; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const post = async (body: object) => {
    setBusy(true); setError("");
    const r = await fetch("/api/invoice-converter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ error: "Couldn't reach the server" }));
    setBusy(false);
    if (r.error) return setError(r.error);
    onDone();
  };
  const field = "h-9 rounded-lg border border-line bg-surface px-3 text-[13.5px] text-ink";
  if (sign.connected && sign.signer) return null;
  return (
    <section className="card px-5 py-4">
      {!sign.connected ? (
        sign.canConnect ? (
          <>
            <h3 className="text-[15px] font-semibold text-ink">Connect Zoho Sign (once)</h3>
            <p className="mt-1 max-w-[80ch] text-[13px] leading-relaxed text-muted">In the Zoho API console (api-console.zoho.in) open the same Self Client as Zoho Books, Generate Code with the scope <span className="num font-semibold text-ink-2">ZohoSign.documents.ALL,ZohoSign.account.READ</span>, signed in as the Zoho user who uses Zoho Sign, and paste the code here.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input className={`${field} w-80`} placeholder="1000.xxxx…" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Zoho code" />
              <button type="button" className="h-9 rounded-lg bg-brand px-4 text-[13.5px] font-semibold text-brand-ink disabled:opacity-50" disabled={busy || !code.trim()} onClick={() => post({ action: "connectSign", code })}>{busy ? "Connecting…" : "Connect"}</button>
            </div>
          </>
        ) : <p className="text-[13.5px] text-muted">Merge &amp; sign needs Zoho Sign connected once; Admin or Shikha does it here.</p>
      ) : (
        <>
          <h3 className="text-[15px] font-semibold text-ink">Your details for Zoho Sign (once)</h3>
          <p className="mt-1 text-[13px] text-muted">Your full name goes on the signed invoice; Zoho Sign needs your email.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input className={`${field} w-56`} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Full name" />
            <input className={`${field} w-64`} type="email" placeholder="you@thinkhealth.in" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
            <button type="button" className="h-9 rounded-lg bg-brand px-4 text-[13.5px] font-semibold text-brand-ink disabled:opacity-50" disabled={busy || !email.trim() || !name.trim()} onClick={() => post({ action: "signer", email, name })}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </>
      )}
      {error && <p className="mt-2 rounded-lg bg-high-bg px-3 py-2 text-[13px] text-high">{error}</p>}
    </section>
  );
}
