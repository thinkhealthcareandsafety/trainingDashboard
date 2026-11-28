"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { PO_AUTO_SCAN } from "@/lib/poAuto";
import { createPortal } from "react-dom";
import type { ConvCustomer, ConvInvoice } from "@/lib/invoiceConverterRules";
import { EWAY_OVER, blocksOf } from "@/lib/invoiceConverterRules";
import type { PoLog, PoRun } from "@/lib/poLog";
import { PoScanLog, type ScanNow } from "./PoScanLog";
import { Skeleton, toneOf } from "./ui";

/*
 * The Invoice Converter (owner, 17 Nov): each customer and all their invoices; for each invoice the Purchase Order (its
 * number, a neon green tick; "Verbal" or none, a neon red cross), the PO PDF, and for invoices over ₹50,000 the e-way bill
 * (number and PDF). Click a cross to add what's missing; it goes straight to the invoice in Zoho Books and ticks.
 */

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const day = (s: string) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

type SignInfo = { connected: boolean; canConnect: boolean; signer: { email: string; name: string } | null };
/** The PC that holds the DSC token and signs for everyone (owner, 28 Nov). */
type DscState = { paired: boolean; online: boolean; seenAt: string | null; certificate: string | null; canPair: boolean };
const DscCtx = createContext<DscState | undefined>(undefined);

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
// The DSC signer on the PC with the token (dsc-signer, owner 27 Nov); the page talks to it only to connect that PC.
const DSC_SIGNER = "http://127.0.0.1:47123";
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
  const [data, setData] = useState<{ customers: ConvCustomer[]; pending: number; scansDue?: number; sign?: SignInfo; dsc?: DscState } | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [onlyFound, setOnlyFound] = useState(false);
  // "Find POs" (owner, 24 Nov): read the WorkDrive PO folder, a batch at a time, until nothing is left.
  const [scan, setScan] = useState<ScanNow>({ busy: false, text: "" });
  // The live log (owner, 25 Nov): opens with the button; a scan that starts by itself shows only the pill.
  const [log, setLog] = useState<"" | "open" | "small">("");
  const smallLog = useCallback((v: boolean) => setLog(v ? "small" : "open"), []);
  const scanning = useRef(false);
  const onPage = useRef(true);
  useEffect(() => { onPage.current = true; return () => { onPage.current = false; }; }, []);
  const [run, setRun] = useState<PoRun | null>(null);
  const findPos = async (byItself = false) => {
    setLog((l) => (byItself ? l || "small" : "open"));
    if (scanning.current) return;
    scanning.current = true;
    // A new log for every scan (owner, 25 Nov); its lines come while it runs.
    setRun({ startedAt: new Date().toISOString(), endedAt: null, lines: [], matched: 0, waiting: 0 });
    setScan({ busy: true, text: "Opening the PO folder…" });
    const seen = new Set<string>();
    // One line at a time, so they can be followed (not in a hidden tab, where the browser slows timers).
    const write = async (l: PoLog | null | undefined, fresh: boolean) => {
      if (!l) return;
      const more = l.entries.filter((e) => !seen.has(e.id));
      for (const e of more) seen.add(e.id);
      for (const e of more) {
        setRun((r) => r && { ...r, matched: l.matched, waiting: l.waiting, lines: [{ ...e, fresh, n: r.lines.length + 1 }, ...r.lines] });
        if (more.length > 1 && !document.hidden) await new Promise((ok) => setTimeout(ok, 45));
      }
    };
    type Scan = { files?: number; left?: number; due?: string[]; names?: Record<string, string>; ids?: string[]; added?: number; seen?: number; unread?: number; log?: PoLog | null; error?: string };
    const ask = (body: object): Promise<Scan> => fetch("/api/invoice-converter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ error: "Couldn't reach the server" }));
    let last: Scan = {}, fresh = 0;
    for (let n = 0; n < 200 && onPage.current; n++) {
      last = await ask({ action: "scanPo" });
      const due = new Set(last.due ?? []);
      // One waiting for its picture gets its line when that is read.
      if (last.log) await write({ ...last.log, entries: last.log.entries.filter((e) => !due.has(e.id) && e.look !== "due") }, true);
      fresh += last.added ?? 0;
      if (last.error || !last.left || !last.added) break;
      setScan({ busy: true, text: `Reading new PDFs… ${last.left} left`, done: seen.size, of: last.files });
    }
    const of = last.files ?? 0, due = last.error ? [] : last.due ?? [];
    let problem = "";
    // Those read before: each compared again with the PO numbers on the invoices now. (A scan that starts by itself skips this.)
    if (!last.error && !byItself) {
      const again = (last.ids ?? []).filter((id) => !seen.has(id) && !(last.names ?? {})[id]);
      for (let k = 0; k < again.length && onPage.current; k += 15) {
        setScan({ busy: true, text: `Checking every PDF in the folder… ${again.length - k} left`, done: seen.size, of });
        const r = await ask({ action: "checkPo", files: again.slice(k, k + 15) });
        if (r.error) { problem = r.error; break; }
        await write(r.log, false);
      }
    }
    // The scans: each first page is read here, in this browser (the page must stay open; it carries on next time).
    if (due.length && onPage.current) {
      const { readFirstPage, stopReading } = await import("@/lib/pageRead");
      let misses = 0;
      for (const [n, id] of due.entries()) {
        if (!onPage.current) break;
        setScan({ busy: true, text: `Reading scanned POs page by page… ${due.length - n} left. Keep this page open.`, done: n, of: due.length, file: last.names?.[id] });
        try {
          const r = await fetch(`/api/invoice-converter?scan=${encodeURIComponent(id)}`, { cache: "no-store" });
          if (r.status === 404) continue; // read meanwhile by someone else
          if (!r.ok) throw new Error("WorkDrive didn't give the file");
          const bytes = new Uint8Array(await r.arrayBuffer());
          // A page that can't be drawn or read is noted, so it isn't tried for ever; a saving problem is not.
          const text = await readFirstPage(bytes).catch((e) => { console.error("[find POs]", id, e); return null; });
          if (text === null && ++misses >= 5) { problem = "This browser couldn't read the scanned pages. Try again in Chrome on a computer."; break; }
          if (text !== null) misses = 0;
          const saved = await ask({ action: "pageText", file: id, text });
          if (saved.error) throw new Error(saved.error);
          await write(saved.log, true);
        } catch (e) { problem = e instanceof Error ? e.message : "Couldn't read a page"; if (++misses >= 5) break; }
        if (n % 10 === 9 && onPage.current) await load();
      }
      stopReading();
      if (!onPage.current) return;
      const end = await ask({ action: "scanPo" });
      if (!end.error) last = end;
    }
    if (!onPage.current) return;
    await load();
    scanning.current = false;
    setRun((r) => r && { ...r, endedAt: new Date().toISOString() });
    const still = (last.left ?? 0) + (last.due?.length ?? 0), bad = last.unread ?? 0;
    const trouble = last.error ?? problem;
    setScan(trouble ? { busy: false, text: trouble, bad: true } : { busy: false, text: `${of} PDFs in the PO folder, ${fresh} new${still ? ` · ${still} not read yet` : ""}${bad ? ` · ${bad} couldn't be read` : ""}` });
  };
  const load = () => fetch("/api/invoice-converter", { cache: "no-store" }).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (j.customers) { setData(j); setError(""); } else setError(j.error ?? "Couldn't load the invoices");
  }).catch(() => setError("Couldn't reach the server"));
  useEffect(() => { load(); }, []);
  // New scans found by a sync: their pages are read now, once, without a click.
  const carriedOn = useRef(false);
  useEffect(() => {
    if (!PO_AUTO_SCAN || !data?.scansDue || carriedOn.current || scanning.current) return; // paused (poAuto.ts)
    carriedOn.current = true;
    void findPos(true);
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
    <DscCtx.Provider value={data?.dsc}>
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <input className="h-11 w-full max-w-sm rounded-full border border-line bg-surface px-5 text-[14px] text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15" placeholder="Search a customer, invoice or PO number" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <button type="button" onClick={() => void findPos()} className="press h-11 shrink-0 rounded-full bg-brand px-5 text-[13.5px] font-semibold text-brand-ink shadow-[0_6px_16px_-8px_color-mix(in_srgb,var(--brand)_70%,transparent)] hover:brightness-110 disabled:opacity-60" title="Look in the WorkDrive PO folder for PDFs carrying these invoices' PO numbers">{scan.busy ? <Busy text="Finding POs…" /> : "Find POs"}</button>
        {foundCount > 0 && <button type="button" aria-pressed={filtering} onClick={() => setOnlyFound(!filtering)} className={`press num h-11 shrink-0 rounded-full px-5 text-[13.5px] font-semibold ${filtering ? "bg-brand-soft text-brand ring-1 ring-brand/40" : "bg-surface text-ink shadow-card hover:bg-surface-2"}`}>{foundCount} PO{foundCount === 1 ? "" : "s"} found{filtering ? " ✕" : ""}</button>}
        {log === "" && <button type="button" onClick={() => setLog("open")} className="press h-11 shrink-0 rounded-full px-4 text-[13.5px] font-medium text-muted hover:bg-surface hover:text-ink">Scan log</button>}
        {log === "" && scan.text && <span className={`num text-[13px] ${scan.bad ? "text-high" : "text-muted"}`} role="status">{scan.text}</span>}
        {log !== "" && <PoScanLog now={scan} run={run} small={log === "small"} onSmall={smallLog} onClose={() => setLog("")} />}
        {data && data.pending > 0 && <span className="inline-flex items-center gap-1.5 text-[13px] text-muted"><Spinner />Reading e-way bills and attachments from Zoho · {data.pending} left</span>}
      </div>
      {data?.dsc && <DscBar dsc={data.dsc} onDone={load} />}
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
                      <span>Invoice</span><span>Value</span><span>Purchase order</span><span title={`Needed over ${inr(EWAY_OVER)}`}>E-way bill</span><span>Other attachments</span><span>Merged PDF</span>
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
    </DscCtx.Provider>
  );
}

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

/**
 * The DSC signer PC (owner, 28 Nov): on or off, and for Sumit / Admin a button to make the PC they're on the signer
 * (it must have the DSC signer running and the token in). The page asks the server for a key and hands it straight to
 * the signer on this PC, which from then on asks the server for PDFs to sign.
 */
function DscBar({ dsc, onDone }: { dsc: DscState; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const pair = async () => {
    setBusy(true); setMsg("");
    try {
      const st = await fetch(`${DSC_SIGNER}/status`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (!st?.ok) return setMsg("The DSC signer isn't running on this PC. Run install-autostart.cmd in the dsc-signer folder, plug in the token, then try again.");
      if (!st.certificates?.length) return setMsg("The DSC signer can't see the token's certificate. Plug in the token, then try again.");
      const k = await fetch("/api/invoice-converter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "dscPair" }) }).then((r) => r.json()).catch(() => ({ error: "Couldn't reach the server" }));
      if (!k.key) return setMsg(k.error ?? "Couldn't connect");
      const r = await fetch(`${DSC_SIGNER}/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: k.key, server: window.location.origin }) }).then((x) => x.json()).catch(() => ({ error: "The DSC signer stopped answering" }));
      if (r.error) return setMsg(r.error);
      setMsg(r.pin ? "This PC is now the DSC signer." : "This PC is now the DSC signer. Run save-pin.cmd in the dsc-signer folder once, so others can sign without the PIN being typed here.");
      setTimeout(onDone, 4000);
    } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
      <span className="inline-flex items-center gap-2 text-ink-2">
        <span aria-hidden className={`size-2 rounded-full ${dsc.online ? "bg-low" : "bg-faint"}`} />
        {!dsc.paired ? "DSC signing: no signer PC connected yet" : dsc.online ? `DSC signer PC is on${dsc.certificate ? ` · ${dsc.certificate}` : ""}` : `DSC signer PC is off · last seen ${ago(dsc.seenAt)}`}
      </span>
      {dsc.canPair && (
        <button type="button" onClick={pair} disabled={busy} className="font-semibold text-brand hover:underline disabled:opacity-60" title="This PC has the DSC token and the DSC signer running: it signs for everyone from now on">
          {busy ? <Busy text="Connecting…" /> : dsc.paired ? "Make this PC the signer instead" : "Make this PC the DSC signer"}
        </button>
      )}
      {msg && <span className="text-muted" role="status">{msg}</span>}
    </div>
  );
}

// Columns with a clear gap between them (owner, 18 Nov: the headings shouldn't stick to each other). The left padding
// (pl-11) leaves room for the line that links invoices of the same PI.
// Columns of the same width (owner, 18 Nov); a sixth for other attachments (27 Nov).
const COLS = "grid-cols-[repeat(6,minmax(0,1fr))]";
// Written out in full so Tailwind finds it (a class built from a variable isn't generated).
const COLS_LG = "lg:grid-cols-[repeat(6,minmax(0,1fr))]";

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
  const [merging, setMerging] = useState("");
  const [choose, setChoose] = useState<"" | "download" | "sign">("");
  // Sign with DSC (owner, 27 Nov: "instead of Zoho Sign signature, we use this … signature"; 28 Nov: from anyone's login
  // while the token is in Sumit's PC): the merged PDF is queued on the server, the DSC signer on the signer PC picks it up,
  // signs it with the token (PIN saved there) and sends it back; it's put on the invoice in Zoho and downloaded here.
  const dsc = useContext(DscCtx);
  const [signing, setSigning] = useState("");
  const signDsc = async (pick: { po: boolean; others: boolean }, title: string) => {
    setChoose(""); setError(""); setSigning("Making the PDF…");
    try {
      const w = [pick.po && "po", pick.others && "others"].filter(Boolean).join(",");
      const q = await fetch("/api/invoice-converter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "dscSign", id: i.id, with: w }) }).then((x) => x.json()).catch(() => ({ error: "Couldn't reach the server" }));
      if (q.error || !q.job) return setError(q.error ?? "Couldn't send it for signing");
      const skipped: string[] = q.skipped ?? [];
      // Asked every 2.5 s for up to 3 minutes; after that it's still signed when the PC picks it up (within 30 min).
      for (let n = 0; n < 72; n++) {
        await new Promise((ok) => setTimeout(ok, 2500));
        const st = await fetch(`/api/invoice-converter?dscJob=${q.job}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
        if (!st || st.error) continue;
        if (st.status === "done") {
          onPatch({ signedPdf: st.signedName ?? `Invoice ${i.number} signed.pdf` });
          const a = document.createElement("a");
          a.href = `/api/invoice-converter?signed=${i.id}`; a.download = `${title.replace("Invoice", `Invoice ${i.number}`)} signed.pdf`;
          document.body.appendChild(a); a.click(); a.remove();
          if (skipped.length) setError(`Signed. Left out (not a PDF or picture): ${skipped.join(", ")}`);
          return;
        }
        if (st.status === "failed") return setError(st.error ?? "Signing didn't work");
        setSigning(st.status === "signing" ? "Signing on the signer PC…" : st.signer?.online ? "Waiting for the signer PC…" : "Signer PC is off; waiting…");
      }
      setError("Not signed yet: the signer PC hasn't answered. It will be signed and put on the invoice when that PC is on with the token in (within 30 minutes); refresh later.");
    } catch { setError("Couldn't reach the server"); } finally { setSigning(""); }
  };
  // Four ways (owner, 27 Nov): Invoice; Invoice - PO; Invoice - Attachment; Invoice - PO - Attachment (in that order in the PDF).
  const downloadMerged = async (pick: { po: boolean; others: boolean }, title: string) => {
    setMerging(title); setError("");
    try {
      const w = [pick.po && "po", pick.others && "others"].filter(Boolean).join(",");
      const r = await fetch(`/api/invoice-converter?merged=${i.id}&with=${w}`, { cache: "no-store" });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setError(j.error ?? "Couldn't make the merged PDF"); return; }
      const skipped = decodeURIComponent(r.headers.get("x-skipped") ?? "");
      if (skipped) setError(`Left out (not a PDF or picture): ${skipped}`);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url; a.download = `${title.replace("Invoice", `Invoice ${i.number}`)}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { setError("Couldn't reach the server"); } finally { setMerging(""); setChoose(""); }
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
      <Others i={i} onPatch={onPatch} label={label} />
      {/* Sign with DSC (owner, 27 Nov) took the place of Merge & draft (Zoho Sign, 20 Nov; startDraft is kept for when
          Zoho Sign is wanted again): the merged PDF signed with the DSC token on this PC and put on the invoice in Zoho. */}
      <div className="col-span-2 lg:col-span-1">
        <p className={label}>Merged PDF</p>
        <button type="button" className="press h-9 rounded-full bg-surface-2 px-4 text-[13px] font-semibold text-ink hover:bg-line disabled:opacity-50" disabled={Boolean(signing) || Boolean(merging)} onClick={() => setChoose((v) => v === "sign" ? "" : "sign")} aria-expanded={choose === "sign"}
          title={dsc?.paired ? `Merge, then sign with Sumit's DSC on the signer PC (${dsc.online ? "on now" : "off now: it waits"}); the signed PDF is put on the invoice in Zoho` : "No DSC signer PC is connected yet"}>
          {signing ? <Busy text={signing} /> : `${i.signedPdf ? "Sign again" : "Sign with DSC"} ${choose === "sign" ? "▴" : "▾"}`}
        </button>
        {i.signedPdf && !signing && (
          <a href={`/api/invoice-converter?signed=${i.id}`} className="mt-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-ink hover:underline" title={`${i.signedPdf}, on the invoice in Zoho`}><Mark ok small />Signed · Download</a>
        )}
        {/* The merged PDF on its own (owner, 17 Nov: Zoho Sign's plan refuses API sends). */}
        {/* Fetched here (not a plain link) so the spinner shows while Zoho's files are gathered and merged. */}
        <button type="button" className="mt-1 block text-left text-[12.5px] font-semibold text-brand hover:underline disabled:no-underline" disabled={Boolean(merging) || Boolean(signing)} onClick={() => setChoose((v) => v === "download" ? "" : "download")} aria-expanded={choose === "download"}>{merging ? <Busy text={`Making ${merging}…`} /> : `Download PDF ${choose === "download" ? "▴" : "▾"}`}</button>
        {choose && !merging && !signing && (
          <div className="mt-1 flex flex-col items-start gap-0.5 rounded-lg border border-line bg-surface p-1.5 text-[12.5px]">
            {choose === "sign" && <p className="px-2 pb-0.5 text-[12px] text-muted">Sign which PDF?</p>}
            {([
              ["Invoice", { po: false, others: false }, true],
              ["Invoice - PO", { po: true, others: false }, i.poPdf],
              ["Invoice - Attachment", { po: false, others: true }, Boolean(i.others?.length)],
              ["Invoice - PO - Attachment", { po: true, others: true }, i.poPdf && Boolean(i.others?.length)],
            ] as const).map(([title, pick, ok]) => (
              <button key={title} type="button" disabled={!ok} onClick={() => choose === "sign" ? signDsc(pick, title) : downloadMerged(pick, title)}
                className="w-full rounded px-2 py-1 text-left font-semibold text-ink hover:bg-surface-2 disabled:cursor-not-allowed disabled:font-normal disabled:text-muted disabled:hover:bg-transparent"
                title={ok ? `${choose === "sign" ? "Sign" : "Download"} ${title}` : title.includes("PO") && !i.poPdf ? "No PO PDF on this invoice yet" : "No other attachments on this invoice yet"}>{title}</button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="col-span-full rounded-lg bg-high-bg px-3 py-2 text-[13px] text-high">{error}</p>}
    </li>
  );
}

/**
 * Other attachments (owner, 27 Nov: "add another column to add additional attachment, we can add as many, it only shows
 * the attachment name"): any files, attached to this invoice in Zoho one by one under their own names.
 */
function Others({ i, onPatch, label }: { i: ConvInvoice; onPatch: (p: Partial<ConvInvoice>) => void; label: string }) {
  const pick = useRef<HTMLInputElement>(null);
  const [left, setLeft] = useState(0);
  const [error, setError] = useState("");
  const names = i.others ?? [];
  const add = async (files: File[]) => {
    if (!files.length) return;
    setError("");
    let have = names;
    for (let k = 0; k < files.length; k++) {
      setLeft(files.length - k);
      const f = new FormData();
      f.append("id", i.id); f.append("which", "extra"); f.append("file", files[k]);
      const r = await fetch("/api/invoice-converter", { method: "POST", body: f }).then((x) => x.json()).catch(() => ({ error: "Couldn't reach the server" }));
      if (r.error) { setError(`${files[k].name}: ${r.error}`); break; }
      have = [...have, r.name ?? files[k].name];
      onPatch({ others: have });
    }
    setLeft(0);
  };
  return (
    <div className="min-w-0">
      <p className={label}>Other attachments</p>
      {i.pending ? <span className="text-[12.5px] text-muted">Reading from Zoho…</span> : (
        <>
          {names.length > 0 && (
            <ul className="mb-1 space-y-0.5">
              {names.map((n, k) => <li key={`${n}-${k}`} className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-2" title={n}><Mark ok small /><span className="truncate">{n}</span></li>)}
            </ul>
          )}
          <button type="button" className="rounded px-1 text-[12.5px] font-semibold text-brand hover:bg-brand-soft disabled:opacity-50" disabled={left > 0} onClick={() => pick.current?.click()}>
            {left > 0 ? <Busy text={left > 1 ? `Attaching · ${left} left…` : "Attaching…"} /> : names.length ? "+ Add more" : "+ Add"}
          </button>
          {error && <p className="mt-1 text-[12px] text-high">{error}</p>}
        </>
      )}
      <input ref={pick} type="file" multiple className="hidden" onChange={(e) => { const list = Array.from(e.target.files ?? []); e.target.value = ""; add(list); }} />
    </div>
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
