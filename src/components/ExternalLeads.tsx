"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Kolkata" });

export function ExternalLeads() {
  const [res, setRes] = useState<Res | null>(null);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [scan, setScan] = useState<Scan | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  // A visiting card (owner, 27 Nov): one or more photos of the same card, read in this browser, then the form filled in.
  const readCard = async (files: FileList | null) => {
    const list = [...(files ?? [])].filter((x) => x.type.startsWith("image/")).slice(0, 6);
    if (!list.length) return;
    const { readPicture, stopReading } = await import("@/lib/pageRead");
    const texts: string[] = [];
    try {
      for (let i = 0; i < list.length; i++) {
        setReading(list.length > 1 ? `Reading photo ${i + 1} of ${list.length}…` : "Reading the card…");
        texts.push(await readPicture(list[i]).catch(() => ""));
      }
    } finally { stopReading(); setReading(null); }
    const words = texts.join("\n").trim();
    const g = parseCard(words);
    const start: Partial<Form> = Object.fromEntries(Object.entries({
      company: g.company, salutation: g.salutation, firstName: g.firstName, lastName: g.lastName, designation: g.designation, phone: g.phone,
      email: g.email, website: g.website, gstin: g.gstin, street: g.street, street2: g.street2, city: g.city, state: g.state, zip: g.zip,
      remarks: g.phones.length > 1 ? `Other numbers on the card: ${g.phones.filter((p) => p !== g.phone).join(", ")}` : undefined,
    }).filter(([, v]) => v)) as Partial<Form>;
    setScan({ start, pictures: list.map((x) => URL.createObjectURL(x)), words });
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
          {res.canAdd && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {reading && <span className="text-[13px] font-medium text-brand" role="status">{reading}</span>}
              <label className={`${btn.ghost} cursor-pointer`}>Take a photo<input type="file" accept="image/*" capture="environment" className="sr-only" disabled={Boolean(reading)} onChange={(e) => { readCard(e.target.files); e.target.value = ""; }} /></label>
              <label className={`${btn.ghost} cursor-pointer`}>Scan card photos<input type="file" accept="image/*" multiple className="sr-only" disabled={Boolean(reading)} onChange={(e) => { readCard(e.target.files); e.target.value = ""; }} /></label>
              <button className={btn.primary} onClick={() => setAdding(true)}>+ Add a lead</button>
            </div>
          )}
        </div>
        {!shown.length ? (
          <p className="py-12 text-center text-[14px] text-muted">{res.leads.length ? "No lead matches that." : "No external leads yet. Add the first one with “+ Add a lead”."}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line/70">
            {shown.map((l) => <LeadRow key={l._id} l={l} onChanged={load} canAdd={res.canAdd} />)}
          </ul>
        )}
      </section>
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
    const r = await fetch("/api/external-leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lead: { ...f, gstin, source: scan ? "card" : "manual" } }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setState({ error: j.error ?? "Couldn't add the lead" }); return; }
    onClose(true);
  };
  const input = (k: keyof Form, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <Field label={label} hint={hint}><input className={inputCls} value={f[k]} onChange={set(k)} {...extra} /></Field>
  );

  return (
    <Modal open onClose={() => onClose(false)} title={scan ? "Check what the card says" : "Add an external lead"} wide>
      <div className="space-y-5">
        {scan && (
          <div className="rounded-[14px] bg-surface-2 p-3">
            <div className="flex gap-2 overflow-x-auto">{scan.pictures.map((u) => <img key={u} src={u} alt="The card" className="h-24 rounded-lg object-contain" />)}</div>
            <p className="mt-2 text-[13px] text-muted">{scan.words ? "The labels below are filled from the card. Check each one before adding." : "Nothing could be read from these photos. Type the details, or try a sharper photo in good light."}{scan.words && <> <button className="font-medium text-brand hover:underline" onClick={() => setShowWords((x) => !x)}>{showWords ? "Hide" : "Show"} the words read</button></>}</p>
            {showWords && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[12px] text-ink-2">{scan.words}</pre>}
          </div>
        )}
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
