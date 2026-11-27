"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Field, Modal, btn, inputCls } from "@/components/ui";
import { useLive } from "@/lib/live";
import { GSTIN_RE, fromGstin } from "@/lib/gstin";
import type { ExternalLead } from "@/lib/externalLeads";
import { parseCard } from "@/lib/cardScan";

/* External Leads (owner, 27 Nov): the important leads, added by hand and made customers in Zoho Books. lib/externalLeads.ts. */

type Treatment = { value: string; label: string; hint: string; gstin: boolean };
type Res = { leads: ExternalLead[]; canAdd: boolean; states: [string, string][]; sectors: string[]; types: string[]; treatments: Treatment[]; salutations: string[]; error?: string };
type Form = Record<"company" | "salutation" | "firstName" | "lastName" | "designation" | "phone" | "email" | "website" | "gstin" | "treatment" | "street" | "street2" | "city" | "state" | "zip" | "remarks" | "sector" | "type", string> & { kind: "customer" | "vendor" };
const EMPTY: Form = { kind: "customer", company: "", salutation: "", firstName: "", lastName: "", designation: "", phone: "", email: "", website: "", gstin: "", treatment: "business_gst", street: "", street2: "", city: "", state: "MH", zip: "", remarks: "", sector: "", type: "New Customer" };
/** What a scan brought: the form filled in, the photos, and the words read (to check against). */
type Scan = { start: Partial<Form>; pictures: string[]; words: string };

/** Photos of one card, read in this browser (pageRead.readPicture). Pictures only; some phones give no type. */
/**
 * The card scanner (owner, 27 Nov: "a new application that runs separately … its sole purpose to scan"): its own Vercel
 * project (../card-scanner), the best character reader with the photo cleaned and turned. Set its address here once it
 * is live; until then, and whenever it can't be reached, the photo is read in this browser instead.
 */
const CARD_SCANNER = process.env.NEXT_PUBLIC_CARD_SCANNER_URL || "https://card-scanner-sigma-two.vercel.app";
/** A phone photo made smaller before it is sent (the scanner works at 2400 px at most anyway). */
async function smaller(file: File): Promise<Blob> {
  try {
    const img = await createImageBitmap(file);
    const k = Math.min(1, 2400 / Math.max(img.width, img.height));
    if (k === 1 && file.size < 3_000_000) { img.close(); return file; }
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    img.close();
    return await new Promise<Blob>((ok) => c.toBlob((b) => ok(b ?? file), "image/jpeg", 0.9));
  } catch { return file; }
}
async function scanOnServer(file: File): Promise<string | null> {
  if (!CARD_SCANNER) return null;
  try {
    const r = await fetch(`${CARD_SCANNER.replace(/\/+$/, "")}/api/scan`, { method: "POST", headers: { "content-type": "image/jpeg" }, body: await smaller(file), signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { text?: string };
    return typeof j.text === "string" ? j.text : null;
  } catch { return null; }
}
async function readPhotos(files: File[], say: (s: string | null) => void): Promise<{ words: string; pictures: string[] } | string> {
  const list = files.filter((x) => !x.type || x.type.startsWith("image/")).slice(0, 6);
  if (!list.length) return files.length ? "That isn't a picture. Pick a photo of the card." : "No photo was picked.";
  const texts: string[] = [];
  let local: typeof import("@/lib/pageRead") | null = null;
  try {
    for (let i = 0; i < list.length; i++) {
      say(list.length > 1 ? `Reading photo ${i + 1} of ${list.length}…` : "Reading the card…");
      const fromServer = await scanOnServer(list[i]);
      if (fromServer !== null) { texts.push(fromServer); continue; }
      local ??= await import("@/lib/pageRead");
      texts.push(await local.readPicture(list[i]).catch(() => ""));
    }
  } finally { local?.stopReading(); say(null); }
  return { words: texts.join("\n").trim(), pictures: list.map((x) => URL.createObjectURL(x)) };
}
/** The card's words as the form's labels (only those found). */
function fillFrom(words: string): Partial<Form> {
  const g = parseCard(words);
  return Object.fromEntries(Object.entries({
    company: g.company, salutation: g.salutation, firstName: g.firstName, lastName: g.lastName, designation: g.designation, phone: g.phone,
    email: g.email, website: g.website, gstin: g.gstin, street: g.street, street2: g.street2, city: g.city, state: g.state, zip: g.zip,
    remarks: g.phones.length > 1 ? `Other numbers on the card: ${g.phones.filter((p) => p !== g.phone).join(", ")}` : undefined,
  }).filter(([, v]) => v)) as Partial<Form>;
}
/** "Take a photo" opens the camera in the page (owner, 27 Nov: "use the camera, don't make me pick; ask for the camera and
 *  go with that; if there's no camera, at least say so"). "Choose photos": one or more from the gallery or the files; the
 *  files are copied before the picker is cleared, since clearing it empties its list. */
function PhotoButtons({ onFiles, disabled, take = "Take a photo", choose = "Choose photos" }: { onFiles: (f: File[]) => void; disabled?: boolean; take?: string; choose?: string }) {
  const [camera, setCamera] = useState(false);
  const closeCamera = useCallback(() => setCamera(false), []);
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; onFiles(files); };
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={btn.primary} disabled={disabled} onClick={() => setCamera(true)}>{take}</button>
      <label className={`${btn.ghost} cursor-pointer ${disabled ? "pointer-events-none opacity-40" : ""}`}>{choose}<input type="file" accept="image/*" multiple className="sr-only" disabled={disabled} onChange={pick} /></label>
      {camera && createPortal(<Camera onClose={closeCamera} onShot={(file) => { setCamera(false); onFiles([file]); }} onPick={(files) => { setCamera(false); onFiles(files); }} />, document.body)}
    </div>
  );
}

/** The camera, full screen: asks the browser for it (the back camera on a phone), a live picture and a shutter button. */
function Camera({ onShot, onClose, onPick }: { onShot: (f: File) => void; onClose: () => void; onPick: (f: File[]) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let stopped = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setProblem("This browser can't open a camera here."); return; }
      try {
        const cams = (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter((d) => d.kind === "videoinput");
        if (cams.length === 0 && (await navigator.mediaDevices.enumerateDevices().catch(() => null)) !== null) { setProblem("No camera found on this device."); return; }
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); setReady(true); }
      } catch (e) {
        const n = e instanceof DOMException ? e.name : "";
        setProblem(n === "NotAllowedError" || n === "SecurityError" ? "Camera access was refused. Allow the camera for this site (the camera icon by the address bar), then try again."
          : n === "NotFoundError" || n === "OverconstrainedError" || n === "DevicesNotFoundError" ? "No camera found on this device."
          : n === "NotReadableError" ? "The camera is busy in another app. Close it there and try again."
          : "The camera couldn't be opened.");
      }
    })();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { stopped = true; window.removeEventListener("keydown", onKey); stream.current?.getTracks().forEach((t) => t.stop()); };
  }, [onClose]);
  const shoot = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob((b) => { if (b) onShot(new File([b], `card-${Date.now()}.jpg`, { type: "image/jpeg" })); }, "image/jpeg", 0.92);
  };
  return (
    // Full screen on a phone; a centred window on a computer (owner, 27 Nov: the options were lost in the corners).
    <div className="fade-in fixed inset-0 z-[90] grid place-items-center bg-black/70 backdrop-blur-sm sm:p-6" role="dialog" aria-label="Camera" onMouseDown={onClose}>
      {problem ? (
        // No camera, or not allowed: say so in the middle, with the way on right under it.
        <div className="modal-in w-[calc(100%-2rem)] max-w-md rounded-[22px] bg-surface p-6 text-center shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-high-bg text-high" aria-hidden>
            <svg viewBox="0 0 20 20" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6.5h3l1.5-2h5L14 6.5h3v9H3zM3 3l14 14" /></svg>
          </span>
          <p className="mt-3 text-[16px] font-semibold text-ink">{problem.split(". ")[0].replace(/\.?$/, ".")}</p>
          {problem.includes(". ") && <p className="mt-1 text-[14px] text-muted">{problem.split(". ").slice(1).join(". ")}</p>}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <label className={`${btn.primary} cursor-pointer`}>Choose photos instead<input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) onPick(files); }} /></label>
            <button type="button" className={btn.ghost} onClick={onClose}>Close</button>
          </div>
        </div>
      ) : (
        <div className="modal-in flex h-full w-full flex-col overflow-hidden bg-black sm:h-auto sm:max-h-[88vh] sm:max-w-3xl sm:rounded-[22px]" onMouseDown={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
            <span className="text-[15px] font-semibold">Fit the card in the frame</span>
            <button type="button" className="press rounded-full bg-white/15 px-4 py-2 text-[14px] font-medium hover:bg-white/25" onClick={onClose}>Close</button>
          </div>
          <div className="relative min-h-0 flex-1 sm:aspect-video sm:flex-none">
            <video ref={video} playsInline muted className="h-full w-full object-contain" />
            {!ready && <p className="absolute inset-0 grid place-items-center text-[15px] text-white/80">Opening the camera…</p>}
          </div>
          <div className="flex items-center justify-center gap-4 p-5">
            <button type="button" aria-label="Take the photo" disabled={!ready} onClick={shoot} className="press h-16 w-16 rounded-full border-4 border-white bg-white/30 hover:bg-white/50 disabled:opacity-40" />
          </div>
        </div>
      )}
    </div>
  );
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Kolkata" });

export function ExternalLeads() {
  const [res, setRes] = useState<Res | null>(null);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [scan, setScan] = useState<Scan | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  // A visiting card (owner, 27 Nov): one or more photos of the same card, read in this browser, then the form filled in.
  // (The files are copied before the picker is cleared: clearing it empties its list, 27 Nov.) Some phones give no type.
  const [pickError, setPickError] = useState<string | null>(null);
  const readCard = async (files: File[]): Promise<boolean> => {
    setPickError(null);
    const got = await readPhotos(files, setReading);
    if (typeof got === "string") { setPickError(got); return false; }
    setScan({ start: fillFrom(got.words), ...got });
    return true;
  };
  const load = useCallback(async () => {
    const r = await fetch("/api/external-leads", { cache: "no-store" });
    setRes(await r.json().catch(() => ({ error: "Couldn't load the leads" })));
  }, []);
  useEffect(() => { load(); }, [load]);
  useLive(load, ["work"]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (res?.leads ?? []).filter((l) => !k || [l.company, l.firstName, l.lastName, l.email, l.phone, l.gstin, l.city].some((v) => v?.toLowerCase().includes(k)));
  }, [res, q]);

  if (!res) return <section className="card p-6 text-[14px] text-muted">Loading…</section>;
  if (res.error && !res.leads) return <section className="card p-6 text-[14px] text-high">{res.error}</section>;
  return (
    <>
      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <input className={`${inputCls} max-w-sm`} placeholder="Search a company, person, email, phone or GSTIN…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search external leads" />
          <span className="text-[13px] text-muted">{res.leads.length} {res.leads.length === 1 ? "lead" : "leads"}</span>
          {res.canAdd && <button className={`${btn.primary} ml-auto`} onClick={() => setChoosing(true)}>+ Add a lead</button>}
        </div>
        {!shown.length ? (
          <p className="py-12 text-center text-[14px] text-muted">{res.leads.length ? "No lead matches that." : "No external leads yet. Add the first one with “+ Add a lead”."}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line/70">
            {shown.map((l) => <LeadRow key={l._id} l={l} onChanged={load} canAdd={res.canAdd} />)}
          </ul>
        )}
      </section>
      {/* One button, then the choice (owner, 27 Nov): "Add Manually" or "Auto-Fill Via Picture". On a phone, the picture
          choice offers the camera or the gallery; one or more photos of the same card. */}
      <Modal open={choosing} onClose={() => { if (!reading) setChoosing(false); }} title="Add a lead" wide>
        {reading ? (
          <p className="py-8 text-center text-[15px] font-medium text-brand" role="status">{reading}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" className="press flex flex-col items-start justify-start rounded-[18px] border border-line bg-surface-2 p-5 text-left hover:border-brand" onClick={() => { setChoosing(false); setAdding(true); }}>
              <span className="block text-[16px] font-semibold text-ink">Add Manually</span>
              <span className="mt-1 block text-[13px] text-muted">Type the details yourself.</span>
            </button>
            <div className="rounded-[18px] border border-line bg-surface-2 p-5 text-left">
              <span className="block text-[16px] font-semibold text-ink">Auto-Fill Via Picture</span>
              <span className="mt-1 block text-[13px] text-muted">A photo of the visiting card (front and back are fine); the details are filled in for you to check.</span>
              {pickError && <span className="mt-1 block text-[13px] font-medium text-high">{pickError}</span>}
              <div className="mt-3"><PhotoButtons onFiles={async (files) => { if (await readCard(files)) setChoosing(false); }} /></div>
            </div>
          </div>
        )}
      </Modal>
      {adding && <AddLead res={res} onClose={(ok) => { setAdding(false); if (ok) load(); }} />}
      {scan && <AddLead res={res} scan={scan} onClose={(ok) => { scan.pictures.forEach((u) => URL.revokeObjectURL(u)); setScan(null); if (ok) load(); }} />}
    </>
  );
}

function LeadRow({ l, onChanged, canAdd }: { l: ExternalLead; onChanged: () => void; canAdd: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const person = [l.salutation, l.firstName, l.lastName].filter(Boolean).join(" ");
  const retry = async () => {
    setBusy(true); setErr(null);
    const r = await fetch("/api/external-leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ retry: l._id }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) setErr(j.error ?? "Zoho said no again");
    onChanged();
  };
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 font-semibold text-ink">{l.company}{l.kind === "vendor" && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] font-medium text-ink-2">Vendor</span>}{l.source === "card" && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] font-medium text-muted">From a card</span>}</div>
        <div className="mt-0.5 text-[13px] text-muted">{[person, l.designation, l.phone, l.email].filter(Boolean).join(" · ")}</div>
        <div className="mt-0.5 text-[13px] text-muted">{[l.gstin && `GSTIN ${l.gstin}`, l.city, l.type, l.sector, `added ${day(l.at)} by ${l.by.split(" ")[0]}`].filter(Boolean).join(" · ")}</div>
        {l.remarks && <p className="mt-1 max-w-[70ch] whitespace-pre-wrap text-[13px] text-ink-2">{l.remarks}</p>}
        {(err ?? l.error) && <p className="mt-1 text-[13px] font-medium text-high">{err ?? l.error}</p>}
      </div>
      <div className="shrink-0 text-right">
        {l.zoho
          ? <span className={`inline-block rounded-full px-3 py-1 text-[12.5px] font-medium ${l.existed ? "bg-surface-2 text-ink-2" : "bg-low-bg text-low"}`}>{l.existed ? "Already in Zoho" : "Added to Zoho"}</span>
          : canAdd ? <button className={btn.ghost} onClick={retry} disabled={busy}>{busy ? "Trying…" : "Try Zoho again"}</button>
          : <span className="text-[12.5px] text-muted">Not in Zoho yet</span>}
      </div>
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 border-b border-line pb-1.5 text-[14px] font-semibold text-ink">{title}</h4>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function AddLead({ res, onClose, scan }: { res: Res; onClose: (ok: boolean) => void; scan?: Scan }) {
  const [f, setF] = useState<Form>({ ...EMPTY, ...scan?.start });
  const [showWords, setShowWords] = useState(false);
  // More photos of the same card (owner, 27 Nov: "add another picture if they want"): read, and only empty labels filled.
  const [shots, setShots] = useState<{ pictures: string[]; words: string }>({ pictures: scan?.pictures ?? [], words: scan?.words ?? "" });
  const [reading, setReading] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // The photos added here are let go when the form closes (the first ones belong to the page, which lets them go).
  const added = useRef<string[]>([]);
  useEffect(() => () => added.current.forEach((u) => URL.revokeObjectURL(u)), []);
  const morePhotos = async (files: File[]) => {
    setPhotoError(null);
    const got = await readPhotos(files, setReading);
    if (typeof got === "string") { setPhotoError(got); return; }
    const words = [shots.words, got.words].filter(Boolean).join("\n");
    added.current.push(...got.pictures);
    setShots({ pictures: [...shots.pictures, ...got.pictures], words });
    const found = fillFrom(words);
    setF((x) => ({ ...x, ...Object.fromEntries(Object.entries(found).filter(([k]) => !String(x[k as keyof Form] ?? "").trim() || (k === "state" && !x.gstin))) }));
  };
  const [state, setState] = useState<{ busy?: boolean; error?: string }>({});
  const [match, setMatch] = useState<{ id: string; name: string } | null>(null);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const gstin = f.gstin.toUpperCase().replace(/\s/g, "");
  const gstOk = GSTIN_RE.test(gstin);
  const fromG = gstOk ? fromGstin(gstin) : null;
  const stateName = (code?: string) => res.states.find(([c]) => c === code)?.[1];
  const withGstin = res.treatments.filter((t) => t.gstin), without = res.treatments.filter((t) => !t.gstin);

  // Already in Zoho by that name? Shown as you type; the lead is then linked to it instead of making a second one.
  useEffect(() => {
    const name = f.company.trim();
    if (name.length < 2 || f.kind === "vendor") { setMatch(null); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/external-leads?match=${encodeURIComponent(name)}`, { cache: "no-store" }).catch(() => null);
      const j = r?.ok ? await r.json().catch(() => ({})) : {};
      setMatch(j.match ?? null);
    }, 500);
    return () => clearTimeout(t);
  }, [f.company, f.kind]);
  // Typing a GSTIN switches to a registered treatment (Regular by default); clearing it, to Unregistered.
  useEffect(() => {
    setF((x) => {
      const t = res.treatments.find((y) => y.value === x.treatment);
      if (gstin && !t?.gstin) return { ...x, treatment: "business_gst" };
      if (!gstin && t?.gstin) return { ...x, treatment: "business_none" };
      return x;
    });
  }, [gstin, res.treatments]);

  const ready = f.company.trim().length >= 2 && f.lastName.trim() && f.sector && (!gstin || (gstOk && fromG?.state));
  const save = async () => {
    setState({ busy: true });
    const r = await fetch("/api/external-leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lead: { ...f, gstin, source: shots.pictures.length ? "card" : "manual" } }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setState({ error: j.error ?? "Couldn't add the lead" }); return; }
    onClose(true);
  };
  const input = (k: keyof Form, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <Field label={label} hint={hint}><input className={inputCls} value={f[k]} onChange={set(k)} {...extra} /></Field>
  );

  return (
    <Modal open onClose={() => onClose(false)} title={shots.pictures.length ? "Check what the card says" : "Add an external lead"} wide>
      <div className="space-y-5">
        <div className="rounded-[14px] bg-surface-2 p-3">
          {shots.pictures.length > 0 && <div className="mb-2 flex gap-2 overflow-x-auto">{shots.pictures.map((u) => <img key={u} src={u} alt="The card" className="h-24 rounded-lg object-contain" />)}</div>}
          {shots.pictures.length > 0 && (
            <p className="mb-2 text-[13px] text-muted">{shots.words ? "The labels below are filled from the card. Check each one before adding." : "Nothing could be read from these photos. Type the details, or try a sharper photo in good light."}{shots.words && <> <button className="font-medium text-brand hover:underline" onClick={() => setShowWords((x) => !x)}>{showWords ? "Hide" : "Show"} the words read</button></>}</p>
          )}
          {showWords && <pre className="mb-2 max-h-40 overflow-auto whitespace-pre-wrap text-[12px] text-ink-2">{shots.words}</pre>}
          {reading ? <p className="text-[13px] font-medium text-brand" role="status">{reading}</p> : (
            <PhotoButtons onFiles={morePhotos} take={shots.pictures.length ? "+ Take another photo" : "Fill from a photo"} choose={shots.pictures.length ? "+ Add another photo" : "Choose photos"} />
          )}
          {photoError && <p className="mt-1 text-[13px] font-medium text-high">{photoError}</p>}
        </div>
        <div className="flex gap-1" role="radiogroup" aria-label="Customer or vendor">
          {(["customer", "vendor"] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={f.kind === k} className={`rounded-full px-3.5 py-1.5 text-[13.5px] font-medium ${f.kind === k ? "bg-ink text-surface" : "bg-surface-2 text-ink-2"}`} onClick={() => setF((x) => ({ ...x, kind: k, type: x.type === (k === "vendor" ? "New Customer" : "New Vendor") ? (k === "vendor" ? "New Vendor" : "New Customer") : x.type }))}>{k === "customer" ? "Customer" : "Vendor"}</button>)}
        </div>
        <Section title="Company">
          <div className="sm:col-span-2">
            {input("company", "Company name *", { maxLength: 200, autoFocus: true }, "Goes into Zoho as both the Company Name and the Display Name.")}
            {match && <p className="mt-1 text-[13px] font-medium text-medium">Already in Zoho Books as “{match.name}”: the lead will be linked to it, no second customer is made.</p>}
          </div>
          <Field label={f.kind === "vendor" ? "Type *" : "Customer type *"}>
            <select className={inputCls} value={f.type} onChange={set("type")}>{res.types.map((t) => <option key={t}>{t}</option>)}</select>
          </Field>
          <Field label="Sector *">
            <select className={inputCls} value={f.sector} onChange={set("sector")}><option value="">Pick the sector…</option>{res.sectors.map((s) => <option key={s}>{s}</option>)}</select>
          </Field>
        </Section>

        <Section title="Primary contact">
          <Field label="Salutation">
            <select className={inputCls} value={f.salutation} onChange={set("salutation")}><option value="">—</option>{res.salutations.map((s) => <option key={s}>{s}</option>)}</select>
          </Field>
          {input("firstName", "First name", { maxLength: 100 })}
          {input("lastName", "Last name *", { maxLength: 100 }, "Zoho needs a last name.")}
          {input("designation", "Designation", { maxLength: 100 })}
          {input("phone", "Work phone", { type: "tel", maxLength: 30 })}
          {input("email", "Email address", { type: "email", maxLength: 200 })}
          {input("website", "Website", { maxLength: 200 })}
        </Section>

        <Section title="GST">
          <div>
            {input("gstin", "GSTIN (if they have one)", { maxLength: 15, placeholder: "27ABCDE1234F1Z5", onChange: (e) => setF((x) => ({ ...x, gstin: e.target.value.toUpperCase().replace(/\s/g, "") })) })}
            {gstin && <p className={`mt-1 text-[13px] ${gstOk && fromG?.state ? "text-muted" : "text-high"}`}>{!gstOk ? "A GSTIN has 15 characters, like 27ABCDE1234F1Z5" : !fromG?.state ? "Its first two digits aren't a state code" : `Place of supply ${stateName(fromG.state)} · PAN ${fromG.pan} · Taxable`}</p>}
          </div>
          <Field label="GST treatment *">
            <select className={inputCls} value={f.treatment} onChange={set("treatment")}>
              {(gstin ? withGstin : without).map((t) => <option key={t.value} value={t.value} title={t.hint}>{t.label}</option>)}
            </select>
          </Field>
        </Section>

        <Section title="Billing address">
          <div className="sm:col-span-2">{input("street", "Street 1", { maxLength: 200 })}</div>
          <div className="sm:col-span-2">{input("street2", "Street 2", { maxLength: 200 })}</div>
          {input("city", "City", { maxLength: 100 })}
          <Field label={fromG?.state ? "State (from the GSTIN)" : "State *"}>
            <select className={inputCls} value={fromG?.state ?? f.state} onChange={set("state")} disabled={Boolean(fromG?.state)}>
              {res.states.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </select>
          </Field>
          {input("zip", "PIN code", { inputMode: "numeric", maxLength: 6 })}
        </Section>

        <Section title="Remarks">
          <div className="sm:col-span-2">
            <Field label="Remarks (for internal use)"><textarea className={`${inputCls} !h-24 py-2`} value={f.remarks} onChange={set("remarks")} maxLength={2000} /></Field>
          </div>
        </Section>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          {state.error && <span className="mr-auto text-[14px] font-medium text-high">{state.error}</span>}
          <button className={btn.ghost} onClick={() => onClose(false)}>Cancel</button>
          <button className={btn.primary} onClick={save} disabled={!ready || state.busy}>{state.busy ? "Adding…" : match ? "Add and link to Zoho" : f.kind === "vendor" ? "Add as a vendor in Zoho" : "Add as a customer in Zoho"}</button>
        </div>
      </div>
    </Modal>
  );
}
