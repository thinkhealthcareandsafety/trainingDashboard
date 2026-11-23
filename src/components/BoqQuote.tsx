"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CHECK, type NewItem, type QuoteLine, draftBlock, lineAmount, totals } from "@/lib/boq";
import { canQuote } from "@/lib/roles";
import { useSession } from "@/lib/session";
import { QuoteFromLines } from "./Quotations";
import { Skeleton, btn } from "./ui";

/*
 * BOQ → temporary quotation (owner, 20 Nov: "we get similar sheets with different qty and 70% different items — auto
 * populate the items and prices and create a temporary quotation"). Upload the customer's sheet; each line comes back
 * matched to our item and priced (last quoted / invoiced, else Zoho's rate); change what's wrong, Save (remembered for
 * the next sheet), Download Excel = their sheet with our rates.
 * Two tabs (owner, 23 Nov): Quotations (each ends in a real Zoho draft, "Make Zoho draft", once every line is our item)
 * and New items (the lines of every sheet that aren't our items yet, once each: confirm / pick ours, or make them in Zoho
 * by hand and "Check Zoho for new items").
 */

type Summary = { id: string; title: string; fileName: string; lines: number; subtotal: number; gst: number; total: number; priced: number; createdBy: string; updatedAt: string };
type Item = { id: string; name: string; rate?: number; gst?: number; active?: boolean };
type Quote = { id: string; title: string; fileName: string; sheets: { name: string; count: number; chosen: boolean }[]; lines: QuoteLine[]; createdBy: string; updatedAt: string };

const inr = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const when = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const post = (body: unknown) => fetch("/api/boq", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({ error: "Couldn't reach the server" }));
const keyOf = (l: Pick<QuoteLine, "sheet" | "row">) => `${l.sheet}:${l.row}`;

function Spinner() {
  return <svg viewBox="0 0 24 24" width="14" height="14" className="shrink-0 animate-spin" aria-hidden><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>;
}

export function BoqQuote() {
  const [tab, setTab] = useState<"quotes" | "new">("quotes");
  const [newCount, setNewCount] = useState<number | null>(null);
  const [list, setList] = useState<Summary[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const load = async () => {
    const r = await fetch("/api/boq").then((x) => x.json()).catch(() => ({ error: "Couldn't reach the server" }));
    if (r.error) return setError(r.error);
    setList(r.quotes); setItems(r.items);
    fetch("/api/boq?new=1").then((x) => x.json()).then((j) => { if (Array.isArray(j.newItems)) setNewCount(j.newItems.length); }).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const upload = async (f?: File | null) => {
    if (!f) return;
    setBusy("upload"); setError("");
    const fd = new FormData();
    fd.append("file", f);
    const r = await fetch("/api/boq", { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({ error: "Couldn't reach the server" }));
    setBusy("");
    if (r.error) return setError(r.error);
    setQuote(r);
    load();
  };
  const open = async (id: string) => {
    setBusy(id); setError("");
    const r = await fetch(`/api/boq?id=${id}`).then((x) => x.json()).catch(() => ({ error: "Couldn't reach the server" }));
    setBusy("");
    if (r.error) return setError(r.error);
    setQuote(r);
  };

  if (quote) return <Editor quote={quote} items={items} onClose={() => { setQuote(null); load(); }} />;

  const tabs = (
    <div role="tablist" aria-label="Sheet → Quotation" className="flex gap-1 border-b border-line">
      {([["quotes", "Quotations", null], ["new", "New items", newCount]] as const).map(([k, label, n]) => (
        <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
          className={`-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2 text-[14px] font-semibold transition ${tab === k ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"}`}>
          {label}{n ? <span className="num rounded-full bg-medium-bg px-2 py-0.5 text-[11.5px] font-semibold text-medium">{n}</span> : null}
        </button>
      ))}
    </div>
  );
  if (tab === "new") return <div className="space-y-4">{tabs}<NewItems onCount={setNewCount} /></div>;

  return (
    <div className="space-y-4">
      {tabs}
      <div
        className="card flex flex-col items-center gap-3 border-2 border-dashed border-line px-6 py-8 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files?.[0]); }}
      >
        <p className="text-[15px] font-semibold text-ink">Upload a customer&apos;s item list</p>
        <p className="max-w-[60ch] text-[13px] leading-relaxed text-muted">An Excel sheet (.xls or .xlsx) or .csv with an Item and a Qty column. Each line is matched to our items and priced from our last quotation or invoice for it; lines you priced before fill themselves.</p>
        <button type="button" className={btn.primary} disabled={busy === "upload"} onClick={() => file.current?.click()}>
          {busy === "upload" ? <><Spinner />Reading and matching…</> : "Choose a file"}
        </button>
        <input ref={file} type="file" accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {error && <p className="rounded-xl bg-high-bg px-4 py-3 text-[13px] text-high">{error}</p>}
      <section className="space-y-2">
        <h2 className="text-[14px] font-semibold text-ink-2">Temporary quotations</h2>
        {!list ? <Skeleton className="h-24" /> : list.length === 0 ? <p className="card p-5 text-[13.5px] text-muted">None yet. Upload a customer&apos;s sheet to make one.</p> : (
          <ul className="card divide-y divide-line">
            {list.map((q) => (
              <li key={q.id}>
                <button type="button" onClick={() => open(q.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 text-left hover:bg-surface-2/50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold text-ink">{q.title}</span>
                    <span className="num block text-[12.5px] text-muted">{q.priced} of {q.lines} lines priced · {q.createdBy} · {when(q.updatedAt)}</span>
                  </span>
                  <span className="num text-[14px] font-semibold text-ink">{busy === q.id ? <Spinner /> : inr(q.total)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Editor({ quote: start, items, onClose }: { quote: Quote; items: Item[]; onClose: () => void }) {
  const { member } = useSession();
  const mayQuote = Boolean(member && canQuote(member));
  const [drafting, setDrafting] = useState<QuoteLine[] | null>(null);
  const [made, setMade] = useState(false);
  const [quote, setQuote] = useState(start);
  const [title, setTitle] = useState(start.title);
  const [lines, setLines] = useState(start.lines);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [picking, setPicking] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const t = totals(lines);

  const patch = (k: string, p: Partial<QuoteLine>) => { setLines((ls) => ls.map((l) => (keyOf(l) === k ? { ...l, ...p } : l))); setDirty(true); };
  const pick = (k: string, it: Item | null) => {
    const l = lines.find((x) => keyOf(x) === k);
    patch(k, it ? { itemId: it.id, itemName: it.name, gst: it.gst ?? l?.gst ?? 18, ...(!l?.rate && it.rate ? { rate: it.rate, priceNote: "Zoho item rate", source: "zoho" } : {}), score: 1 } : { itemId: undefined, itemName: undefined });
    setPicking("");
  };
  const save = async () => {
    setBusy("save"); setError("");
    const r = await post({ action: "save", id: quote.id, title, lines: lines.map((l) => ({ sheet: l.sheet, row: l.row, itemId: l.itemId, rate: l.rate, qty: l.qty, gst: l.gst, score: l.score })) });
    setBusy("");
    if (r.error) { setError(r.error); return false; }
    setQuote(r); setLines(r.lines); setTitle(r.title); setDirty(false);
    return r.lines as QuoteLine[];
  };
  const block = draftBlock(lines);
  const makeDraft = async () => {
    const saved = dirty ? await save() : lines;
    if (!saved || draftBlock(saved)) return;
    setMade(false); setDrafting(saved);
  };
  const download = async () => {
    if (dirty && !(await save())) return;
    window.location.href = `/api/boq?export=${quote.id}`;
  };
  const sheets = async (name: string) => {
    if (dirty && !(await save())) return;
    const names = quote.sheets.filter((s) => (s.name === name ? !s.chosen : s.chosen)).map((s) => s.name);
    setBusy("sheets"); setError("");
    const r = await post({ action: "sheets", id: quote.id, names });
    setBusy("");
    if (r.error) return setError(r.error);
    setQuote(r); setLines(r.lines);
  };
  const remove = async () => {
    setBusy("delete");
    const r = await post({ action: "delete", id: quote.id });
    setBusy("");
    if (r.error) return setError(r.error);
    onClose();
  };

  let section = "", sheet = "";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={btn.quiet} onClick={() => { if (!dirty || window.confirm("Leave without saving your changes?")) onClose(); }}>← All quotations</button>
        <input className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 text-[15px] font-semibold text-ink" value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} maxLength={120} aria-label="Quotation name" />
      </div>
      {quote.sheets.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-muted">Sheets to quote:</span>
          {quote.sheets.map((s) => (
            <button key={s.name} type="button" onClick={() => sheets(s.name)} disabled={busy === "sheets"} aria-pressed={s.chosen}
              className={`press rounded-full border px-3 py-1 font-medium ${s.chosen ? "border-brand bg-brand/10 text-ink" : "border-line text-muted hover:text-ink"}`}>
              {s.chosen ? "✓ " : ""}{s.name} <span className="num text-faint">· {s.count}</span>
            </button>
          ))}
          {busy === "sheets" && <Spinner />}
        </div>
      )}
      {error && <p className="rounded-xl bg-high-bg px-4 py-3 text-[13px] text-high">{error}</p>}

      <div className="card overflow-hidden">
        <div className="hidden grid-cols-[2.2rem_minmax(0,2.2fr)_4.5rem_minmax(0,2fr)_7rem_4rem_7rem] gap-3 border-b border-line px-4 py-2.5 text-[12px] font-medium text-muted lg:grid">
          <span>#</span><span>Asked for</span><span className="text-right">Qty</span><span>Our item</span><span className="text-right">Rate</span><span className="text-right">GST %</span><span className="text-right">Amount</span>
        </div>
        <ul className="divide-y divide-line">
          {lines.map((l) => {
            const k = keyOf(l);
            const head = quote.sheets.filter((s) => s.chosen).length > 1 && l.sheet !== sheet ? l.sheet : "";
            const sec = l.section !== section || head ? l.section : "";
            sheet = l.sheet; section = l.section;
            const check = l.itemId && l.score > 0 && l.score < CHECK;
            return (
              <li key={k}>
                {head && <p className="bg-surface-2 px-4 py-2 text-[12.5px] font-semibold text-ink-2">{head}</p>}
                {sec && <p className="bg-surface-2/60 px-4 py-1.5 text-[12.5px] font-medium text-muted">{sec}</p>}
                <div className="grid grid-cols-[2.2rem_minmax(0,1fr)_5rem] gap-x-3 gap-y-2 px-4 py-3 lg:grid-cols-[2.2rem_minmax(0,2.2fr)_4.5rem_minmax(0,2fr)_7rem_4rem_7rem] lg:items-start">
                  <span className="num pt-1 text-[12.5px] text-faint">{l.sno || "·"}</span>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-[13.5px] text-ink" title={l.item}>{l.item}</p>
                    <p className="text-[12px] text-muted">{[l.make, l.unit].filter(Boolean).join(" · ")}{l.note ? ` · ${l.note}` : ""}</p>
                  </div>
                  <input className="num h-8 w-full rounded-lg border border-line bg-surface px-2 text-right text-[13px] text-ink" inputMode="decimal" value={l.qty || ""} placeholder="0" onChange={(e) => patch(k, { qty: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} aria-label="Quantity" />
                  <div className="col-span-3 min-w-0 lg:col-span-1">
                    <button type="button" onClick={() => setPicking(picking === k ? "" : k)} className={`flex w-full min-w-0 items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2 ${l.itemId ? "border-line" : "border-dashed border-line-strong"}`}>
                      <span className={`min-w-0 flex-1 ${l.itemId ? "text-ink" : "text-muted"}`}>{l.itemName ?? (l.candidates.length ? "Pick our item" : "No match: pick or leave")}</span>
                      {check && <span className="shrink-0 rounded-md bg-medium-bg px-1.5 py-0.5 text-[11px] font-semibold text-medium" title={`Matched at ${Math.round(l.score * 100)}%`}>check</span>}
                    </button>
                    {picking === k && <Picker line={l} items={items} byId={byId} onPick={(it) => pick(k, it)} onClose={() => setPicking("")} />}
                  </div>
                  <div className="col-span-1 col-start-2 lg:col-span-1 lg:col-start-auto">
                    <input className="num h-8 w-full rounded-lg border border-line bg-surface px-2 text-right text-[13px] text-ink" inputMode="decimal" value={l.rate || ""} placeholder="Rate" onChange={(e) => patch(k, { rate: Number(e.target.value.replace(/[^\d.]/g, "")) || 0, source: "memory", priceNote: "Set by hand" })} aria-label="Rate" />
                    {l.priceNote && <p className="mt-0.5 truncate text-right text-[11.5px] leading-tight text-faint" title={l.priceNote}>{l.priceNote}</p>}
                  </div>
                  <input className="num h-8 w-full rounded-lg border border-line bg-surface px-2 text-right text-[13px] text-ink" inputMode="decimal" value={l.gst} onChange={(e) => patch(k, { gst: Math.min(100, Number(e.target.value.replace(/[^\d.]/g, "")) || 0) })} aria-label="GST percent" />
                  <p className="num col-span-3 pt-1 text-right text-[13.5px] font-semibold text-ink lg:col-span-1">{lineAmount(l) ? inr(lineAmount(l)) : <span className="font-normal text-faint">—</span>}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="card sticky bottom-3 z-20 bg-surface/95 px-4 py-3 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <p className="num text-[13px] text-muted">{t.priced} of {lines.length} priced</p>
          <p className="num text-[13px] text-ink-2">Subtotal <b className="text-ink">{inr(t.subtotal)}</b></p>
          <p className="num text-[13px] text-ink-2">GST <b className="text-ink">{inr(t.gst)}</b></p>
          <p className="num text-[14px] text-ink-2">Total <b className="text-[15px] text-ink">{inr(t.total)}</b></p>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {confirmDelete ? (
              <span className="inline-flex items-center gap-1 text-[13px] text-ink-2">Delete it?
                <button type="button" className={btn.danger} onClick={remove} disabled={busy === "delete"}>{busy === "delete" ? <Spinner /> : "Delete"}</button>
                <button type="button" className={btn.quiet} onClick={() => setConfirmDelete(false)}>Keep</button>
              </span>
            ) : <button type="button" className={btn.danger} onClick={() => setConfirmDelete(true)}>Delete</button>}
            <button type="button" className={btn.ghost} onClick={download} disabled={busy === "save"}>Download Excel</button>
            <button type="button" className={btn.ghost} onClick={save} disabled={!dirty || busy === "save"}>{busy === "save" ? <><Spinner />Saving…</> : dirty ? "Save" : "Saved"}</button>
            {mayQuote && <button type="button" className={btn.primary} onClick={makeDraft} disabled={Boolean(block) || busy === "save"} title={block || "Pick the customer, then save it as a draft quotation in Zoho Books"}>Make Zoho draft</button>}
          </span>
        </div>
        {mayQuote && block && <p className="mt-1.5 text-right text-[12.5px] text-muted">Zoho draft: {block}</p>}
        {made && <p className="mt-1.5 text-right text-[12.5px] font-medium text-ink-2">Made in Zoho Books. It&apos;s on the Quotations page too.</p>}
      </div>
      {drafting && <QuoteFromLines lines={drafting.map((l) => ({ id: l.itemId!, name: l.itemName ?? l.item, rate: l.rate, gst: l.gst, qty: l.qty }))} onClose={(ok) => { setDrafting(null); if (ok) setMade(true); }} />}
    </div>
  );
}

/**
 * New items (owner, 23 Nov: "these items are from our quotations; if something matches our items we will not need them
 * here, just match them — we need new items only"). The same words once, with the sheets they're on. Confirm the
 * suggested item or pick ours (every sheet, and the next one); the rest are made in Zoho by hand, then "Check Zoho".
 */
function NewItems({ onCount }: { onCount: (n: number) => void }) {
  const [data, setData] = useState<{ newItems: NewItem[]; items: Item[] } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [picking, setPicking] = useState("");
  const byId = useMemo(() => new Map((data?.items ?? []).map((i) => [i.id, i])), [data]);
  const load = async () => {
    const r = await fetch("/api/boq?new=1").then((x) => x.json()).catch(() => ({ error: "Couldn't reach the server" }));
    if (r.error) return setError(r.error);
    setData(r); onCount(r.newItems.length);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once
  const match = async (key: string, itemId: string) => {
    setBusy(key); setError(""); setNote(""); setPicking("");
    const r = await post({ action: "match", key, itemId });
    if (r.error) { setBusy(""); return setError(r.error); }
    await load();
    setBusy("");
  };
  const refresh = async () => {
    setBusy("refresh"); setError(""); setNote("");
    const r = await post({ action: "refreshItems" });
    if (r.error) { setBusy(""); return setError(r.error); }
    await load();
    setBusy("");
    setNote(`Read ${r.items} items from Zoho.`);
  };
  const copy = async () => {
    const rows = (data?.newItems ?? []).map((g) => [g.item, g.make, g.unit, g.qty || ""].join("\t"));
    try { await navigator.clipboard.writeText(["Item\tMake\tUnit\tQty asked", ...rows].join("\n")); setNote("Copied. Paste it into Excel or a message."); } catch { setError("Couldn't copy here."); }
  };
  if (!data) return error ? <p className="rounded-xl bg-high-bg px-4 py-3 text-[13px] text-high">{error}</p> : <Skeleton className="h-40" />;
  const list = data.newItems;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 basis-80 text-[13.5px] text-ink-2">Lines from your sheets that aren&apos;t our Zoho items yet. If it&apos;s something we have, confirm or pick it. If it&apos;s new, make it in Zoho, then check Zoho.</p>
        <button type="button" className={btn.ghost} onClick={copy} disabled={!list.length}>Copy list</button>
        <button type="button" className={btn.primary} onClick={refresh} disabled={busy === "refresh"}>{busy === "refresh" ? <><Spinner />Reading Zoho…</> : "Check Zoho for new items"}</button>
      </div>
      {error && <p className="rounded-xl bg-high-bg px-4 py-3 text-[13px] text-high">{error}</p>}
      {note && <p className="text-[12.5px] text-muted">{note}</p>}
      {!list.length ? <p className="card p-5 text-[13.5px] text-muted">No new items. Every line of every sheet is one of our items.</p> : (
        <ul className="card divide-y divide-line">
          {list.map((g) => (
            <li key={g.key} className="grid gap-x-5 gap-y-2 px-5 py-3.5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
              <div className="min-w-0">
                <p className="line-clamp-2 text-[14px] font-medium text-ink" title={g.item}>{g.item}</p>
                <p className="text-[12.5px] text-muted">
                  {[g.make, g.unit].filter(Boolean).join(" · ")}{g.make || g.unit ? " · " : ""}
                  <span className="num">{g.qty ? `${g.qty} asked` : "no qty"}</span> · {g.quotes.map((q) => q.title).join(", ")}
                </p>
              </div>
              <div className="min-w-0">
                {busy === g.key ? <p className="flex items-center gap-2 text-[13px] text-muted"><Spinner />Matching on every sheet…</p> : (
                  <div className="flex flex-wrap items-center gap-2">
                    {g.suggest && <>
                      <span className="min-w-0 flex-1 basis-48 text-[13px] text-ink-2">Ours? <b className="font-semibold text-ink">{g.suggest.itemName}</b> <span className="num text-faint">{Math.round(g.suggest.score * 100)}%</span></span>
                      <button type="button" className={btn.primary} onClick={() => match(g.key, g.suggest!.itemId)}>Confirm</button>
                    </>}
                    <button type="button" className={btn.ghost} onClick={() => setPicking(picking === g.key ? "" : g.key)}>{g.suggest ? "Pick another" : "Pick our item"}</button>
                  </div>
                )}
                {picking === g.key && <Picker line={{ candidates: g.candidates }} items={data.items} byId={byId} onPick={(it) => it && match(g.key, it.id)} onClose={() => setPicking("")} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Our item for a line: the suggestions first (with how well they match), then any item by typing. */
function Picker({ line, items, byId, onPick, onClose }: { line: Pick<QuoteLine, "candidates"> & { itemId?: string }; items: Item[]; byId: Map<string, Item>; onPick: (it: Item | null) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const found = useMemo(() => {
    const ws = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!ws.length) return [];
    return items.filter((i) => { const n = i.name.toLowerCase(); return ws.every((w) => n.includes(w)); }).slice(0, 30);
  }, [q, items]);
  const sugg = line.candidates.map((c) => ({ it: byId.get(c.itemId), score: c.score })).filter((x): x is { it: Item; score: number } => Boolean(x.it));
  const Opt = ({ it, score }: { it: Item; score?: number }) => (
    <button type="button" onClick={() => onPick(it)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2 ${it.id === line.itemId ? "bg-brand/10" : ""}`}>
      <span className="min-w-0 flex-1 text-ink">{it.name}{it.active === false && <span className="text-faint"> · inactive</span>}</span>
      {it.rate ? <span className="num shrink-0 text-[12px] text-muted">{inr(it.rate)}</span> : null}
      {score !== undefined && <span className="num shrink-0 text-[11.5px] text-faint">{Math.round(score * 100)}%</span>}
    </button>
  );
  return (
    <div className="mt-1.5 rounded-xl border border-line bg-surface p-2 shadow-lg" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <input autoFocus className="mb-1.5 h-8 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink placeholder:text-faint" placeholder="Search our items" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search our items" />
      <div className="max-h-64 overflow-y-auto">
        {!q && (sugg.length ? sugg.map((s) => <Opt key={s.it.id} it={s.it} score={s.score} />) : <p className="px-2.5 py-1.5 text-[12.5px] text-muted">No close match. Search above.</p>)}
        {q && (found.length ? found.map((it) => <Opt key={it.id} it={it} />) : <p className="px-2.5 py-1.5 text-[12.5px] text-muted">Nothing with those words.</p>)}
      </div>
      <div className="mt-1.5 flex justify-between border-t border-line pt-1.5">
        {line.itemId ? <button type="button" className={btn.quiet} onClick={() => onPick(null)}>Not ours (clear)</button> : <span />}
        <button type="button" className={btn.quiet} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
