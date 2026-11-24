"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type QuoteEmailInput, type TemplateOverrides, buildQuoteEmail, signature } from "@/lib/quoteEmails";
import { buildTsEmail } from "@/lib/totalSupply";
import { renderTemplate, templateProblems } from "@/lib/templateText";
import { fmtDate } from "@/lib/dates";
import { PORTAL_TEMPLATES, loginBoxHtml, loginEmail } from "@/lib/portalEmail";
import { piEmail } from "@/lib/performaRules";
import { certEmail } from "@/lib/portalCertRules";
import { btn, selectCls } from "./ui";
import { type EditorHandle, type FillIn, FillInEditor } from "./FillInEditor";

/*
 * The Templates page (owner, 10 Nov: "we should technically be able to edit templates on the page"): pick a template,
 * change its subject and wording, see it filled in with a sample, Save, or Reset to the built-in text.
 * The server (src/lib/templateStore.ts) checks and keeps it; quote emails pick it up in the email step.
 */

type Entry = {
  key: string; group: "quote" | "topic" | "ts" | "pi" | "sign" | "portal" | "aed" | "fulfil"; label: string; owner?: string;
  subject: string | null; body: string; builtin: { subject: string | null; body: string };
  vars: string[]; choices: boolean; adminOnly: boolean; note?: string;
  edited: boolean; editedBy?: string; editedAt?: string; canEdit: boolean;
};

// Each group in plain words: what it is and when it goes out (owner, 23 Nov: easy for anyone).
const GROUPS: { id: Entry["group"]; label: string; when: string }[] = [
  { id: "quote", label: "Quotation emails", when: "The email that goes with a quotation. You pick one of these when you send a quote." },
  { id: "topic", label: "Item paragraphs", when: "A short paragraph added to a quotation email for each kind of item in the quote." },
  { id: "ts", label: "Total Supply emails", when: "The same quotation emails, for quotes from Total Supply." },
  { id: "pi", label: "Performa emails", when: "Sent with the Performa invoice once a customer confirms a training." },
  { id: "sign", label: "Signatures", when: "Shown under \"Warm regards,\" at the end of quotation emails." },
  { id: "portal", label: "Training Manager", when: "Emails to training coordinators and participants: their sign-in, their certificate." },
  { id: "aed", label: "AED onboarding (hello@)", when: "The welcome emails after someone buys an AED, sent from hello@." },
  { id: "fulfil", label: "Fulfillment thank-you (learn@)", when: "The thank-you email after a training, sent from learn@." },
];

/** Each fill-in in plain words, with an example (what the boxes in the editor say). */
const FILLS: Record<string, FillIn> = {
  hi: { label: "Greeting", example: "\"Hi Rahul,\"" }, ref: { label: "Quotation name", example: "\"Quotation-24-002753 for Acme Hotels\"" },
  what: { label: "What's quoted", example: "\"Zoll AED + training\"" }, total: { label: "Total price", example: "\"₹1,74,480\"" },
  valid: { label: "Valid-until date", example: "\"10 Dec 2026\"" }, table: { label: "Item table", example: "the table of items and prices" },
  topics: { label: "Item paragraphs", example: "one short paragraph per kind of item" }, sign: { label: "Warm regards + signature" },
  signature: { label: "Signature" }, company: { label: "Customer's company", example: "\"Acme Hotels Pvt Ltd\"" },
  number: { label: "Quotation number", example: "\"Quotation-24-002753\"" }, items: { label: "Item names", example: "\"Zoll AED Plus and Zoll AED 3\"" },
  name: { label: "Person's name", example: "\"Mr. Rahul Mehta\"" }, details: { label: "Company details", example: "our address, phone numbers and website" },
  invoice: { label: "Invoice number", example: "\"2026-01-123\"" }, person: { label: "Contact person", example: "\"Ms. Neha Kulkarni\"" },
  location: { label: "Training place", example: "\"Acme Hotels, Pune\"" }, customer: { label: "Customer", example: "\"Acme Hotels Pvt Ltd\"" },
  course: { label: "Training name", example: "\"CPR & AED Training\"" }, dates: { label: "Training dates", example: "\"12 Nov 2026\"" },
  people: { label: "Number of people", example: "\"20\"" }, training: { label: "Training name", example: "\"CPR & AED Training\"" },
  quote: { label: "Quotation number", example: "\"Quotation-24-002753\"" }, score: { label: "Quiz score", example: "\"90%\"" },
  link: { label: "Certificate link", example: "their own page to download the certificate" }, certno: { label: "Certificate number", example: "\"IAGS-SN/012\"" },
  report: { label: "Quiz report line", example: "\"Your quiz report is attached too.\"" },
};
/** Where a fill-in means something else in one email. */
const FILLS_FOR: Record<string, Record<string, FillIn>> = {
  "portal:certificate": { name: { label: "Participant's name", example: "\"Asha Rao\"" } },
  "portal:login": { name: { label: "Coordinator's name", example: "\"Riya Mehta\"" } },
  "portal:box": { name: { label: "Coordinator's name", example: "\"Riya Mehta\"" } },
  pi: { number: { label: "Performa number", example: "\"Performa-25-1196\"" }, total: { label: "Performa total", example: "\"₹45,000\"" }, name: { label: "Coordinator's name", example: "\"Riya Mehta\"" } },
  fulfil: { ref: { label: "Quotation number", example: "\"Performa-25-0456\"" } },
  sign: { name: { label: "Your name", example: "\"Ashish\"" } },
};
const fillsOf = (e: Entry): Record<string, FillIn> => ({ ...FILLS, ...FILLS_FOR[e.group], ...FILLS_FOR[e.key] });

// A made-up quote, so the preview shows every part (nothing here is a real customer).
const SAMPLE: QuoteEmailInput = {
  company: "Acme Hotels Pvt Ltd", contact: "Mr. Rahul Mehta", number: "Quotation-24-002753", total: 174480, expiry: "2026-12-10", salesperson: "Ashish", signer: null,
  lines: [
    { name: "Zoll AED Plus", qty: 1, group: "All AEDs", rate: 120000, gst: 5 },
    { name: "Zoll CPR-D Padz", qty: 2, group: "AED Pads", rate: 9000, gst: 12 },
    { name: "CPR & AED Training", qty: 20, group: "Training Services", rate: 1200, gst: 18 },
  ],
};
const FLOW_SAMPLE: Record<string, string> = {
  invoice: "2026-01-123", person: "Ms. Neha Kulkarni", location: "Acme Hotels, Pune", customer: "Acme Hotels Pvt Ltd", ref: "Performa-25-0456",
  course: "CPR & AED Training", dates: "12 Nov 2026", people: "20",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const textHtml = (s: string) => s.split(/\n{2,}/).map((p) => `<p style="margin:0 0 1em">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

/** The draft filled in with the sample: subject and HTML. */
function preview(e: Entry, subject: string, body: string, noExpiry: boolean, saved: TemplateOverrides): { subject: string | null; html: string } {
  const q = noExpiry ? { ...SAMPLE, expiry: null } : SAMPLE;
  if (e.group === "sign") {
    const o = { ...saved, [e.key]: { body } };
    const who = e.key === "sign:details" ? (SAMPLE.salesperson ?? "") : e.label;
    return { subject: null, html: textHtml(`Warm regards,\n${signature(who, o)}`) };
  }
  if (e.group === "quote" || e.group === "ts") {
    const id = e.key.split(":")[1];
    const o = { ...saved, [e.key]: { subject, body } };
    const m = e.group === "ts" ? buildTsEmail(id, q, [], o) : buildQuoteEmail(id, q, [], undefined, o);
    return { subject: m.subject, html: m.html };
  }
  if (e.group === "pi") {
    const m = piEmail({ subject, body }, { name: "Riya Mehta", number: "Performa-25-1196", quote: SAMPLE.number, training: "CPR & AED Training", dates: "Fri, 4 Dec 2026, 10:00 am + Sat, 5 Dec 2026", location: "The Grand, Pune · Ballroom 2", people: "36", total: "₹45,000", sign: `Warm regards,\n${signature(SAMPLE.salesperson ?? "", saved)}` });
    return { subject: m.subject, html: textHtml(m.text) };
  }
  if (e.key === "portal:certificate") {
    const m = certEmail({ subject, body }, { name: "Asha Rao", training: "CPR & AED Training", score: "90%", link: "https://training.thinkhealth.in/Quotation-24-002753/TH012?p=…", certno: "IAGS-SN/012", report: " Your quiz report is attached too." });
    return { subject: m.subject, html: m.html };
  }
  if (e.group === "portal") {
    const v = { name: "Riya Mehta", training: "CPR & AED Training", number: SAMPLE.number };
    const box = { link: `https://work.thinkhealth.in/training/${SAMPLE.number}`, email: "riya@acmehotels.com", password: "k7RmPq4xWz2e" };
    if (e.key === "portal:box") return { subject: null, html: loginBoxHtml({ ...box, intro: renderTemplate(body, v) }) };
    return loginEmail({ subject, body, box: saved["portal:box"]?.body ?? PORTAL_TEMPLATES[0].body }, v, box);
  }
  if (e.group === "topic") {
    const one = renderTemplate(body, { items: "Zoll AED Plus" }, false);
    const many = renderTemplate(body, { items: "Zoll AED Plus and Zoll AED 3" }, true);
    return { subject: null, html: `<p style="margin:0 0 .35em;font-size:12px;opacity:.65">With one item</p>${textHtml(one)}<p style="margin:1em 0 .35em;font-size:12px;opacity:.65">With several</p>${textHtml(many)}` };
  }
  return { subject: renderTemplate(subject, FLOW_SAMPLE), html: textHtml(renderTemplate(body, FLOW_SAMPLE)) };
}

const remember = (k: string) => { try { localStorage.setItem("th.templates.key", k); } catch { /* private window */ } };
const remembered = () => { try { return localStorage.getItem("th.templates.key"); } catch { return null; } };

export function Templates() {
  const [list, setList] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");
  const [key, setKey] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [noExpiry, setNoExpiry] = useState(false);
  const lastField = useRef<"subject" | "body">("body");
  const subjectEl = useRef<EditorHandle>(null);
  const bodyEl = useRef<EditorHandle>(null);
  const [adding, setAdding] = useState(false);

  const load = async (keep?: string) => {
    const r = await fetch("/api/templates").catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { templates?: Entry[]; error?: string }) : { error: "Couldn't reach the server" };
    if (!j.templates) return setError(j.error ?? "Couldn't read the templates");
    setList(j.templates);
    const k = keep ?? remembered();
    const e = j.templates.find((t) => t.key === k) ?? j.templates[0];
    setKey(e.key); setSubject(e.subject ?? ""); setBody(e.body);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const entry = list?.find((t) => t.key === key);
  const dirty = Boolean(entry && ((entry.subject ?? "") !== subject || entry.body !== body));
  const problems = useMemo(() => (entry ? [
    ...(entry.subject === null ? [] : templateProblems(subject, entry.vars).map((p) => `Subject: ${p}`)),
    ...templateProblems(body, entry.vars, { choices: entry.choices }),
  ] : []), [entry, subject, body]);
  // What's saved for the quotation emails, as the email step gets it (so the preview shows the saved signatures and paragraphs).
  const saved = useMemo(() => Object.fromEntries((list ?? []).filter((t) => t.edited && ["quote", "ts", "topic", "sign", "portal"].includes(t.group))
    .map((t) => [t.key, { ...(t.subject !== null ? { subject: t.subject } : {}), body: t.body }])) as TemplateOverrides, [list]);
  const shown = useMemo(() => (entry && !problems.length ? preview(entry, subject, body, noExpiry, saved) : null), [entry, subject, body, noExpiry, problems.length, saved]);

  const pick = (k: string) => {
    if (k === key) return;
    if (dirty && !window.confirm("Leave this template without saving your changes?")) return;
    const e = list!.find((t) => t.key === k)!;
    setKey(k); setSubject(e.subject ?? ""); setBody(e.body); setMsg(""); setAdding(false); remember(k);
  };
  const insert = (name: string) => {
    setAdding(false);
    (lastField.current === "subject" && entry?.subject !== null ? subjectEl.current : bodyEl.current)?.insert(name);
  };
  const save = async (reset = false) => {
    if (!entry) return;
    if (reset && !window.confirm(`Put "${entry.label}" back to its original wording? Your changes to it will be gone.`)) return;
    setBusy(true); setMsg("");
    const r = await fetch("/api/templates", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(reset ? { key, reset: true } : { key, subject, body }) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }) : { error: "Couldn't reach the server" };
    setBusy(false);
    if (!j.ok) return setMsg(j.error ?? "Couldn't save");
    await load(key);
    setMsg(reset ? "Back to the original wording." : "Saved. The next email uses it.");
  };

  if (error) return <p className="text-[14px] text-high">{error}</p>;
  if (!list || !entry) return <p className="text-[14px] text-muted">Loading the templates…</p>;
  const readOnly = !entry.canEdit;
  const fills = fillsOf(entry);
  const group = GROUPS.find((g) => g.id === entry.group)!;

  return (
    <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_minmax(0,1fr)]">
      {/* The list: a sidebar on wide screens, a dropdown on phones. */}
      <select className={`${selectCls} w-full lg:hidden`} value={key} onChange={(e) => pick(e.target.value)} aria-label="Template">
        {GROUPS.map((g) => (
          <optgroup key={g.id} label={g.label}>
            {list.filter((t) => t.group === g.id).map((t) => <option key={t.key} value={t.key}>{t.label}{t.edited ? " (changed)" : ""}</option>)}
          </optgroup>
        ))}
      </select>
      <nav aria-label="Templates" className="hidden max-h-[calc(100vh-180px)] overflow-y-auto rounded-2xl border border-line bg-surface p-2 lg:block [scrollbar-width:none]">
        {GROUPS.map((g) => (
          <div key={g.id} className="mb-2">
            <div className="px-2.5 pb-1 pt-2 text-[11.5px] font-semibold uppercase tracking-wide text-faint">{g.label}</div>
            {list.filter((t) => t.group === g.id).map((t) => (
              <button key={t.key} type="button" onClick={() => pick(t.key)} aria-current={t.key === key}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] ${t.key === key ? "bg-brand-soft font-medium text-ink" : "text-ink-2 hover:bg-surface-2"}`}>
                <span className="min-w-0 flex-1 truncate" title={t.label}>{t.label}</span>
                {t.edited && <span className="size-1.5 shrink-0 rounded-full bg-brand" title="Changed from the original wording" />}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <section className="min-w-0 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[16px] font-semibold">{entry.label}</h2>
          <span className="text-[12px] text-muted">
            {entry.edited ? "Changed by us" : "Original wording"}{entry.editedBy && entry.editedAt ? ` · last saved by ${entry.editedBy}, ${fmtDate(entry.editedAt, { day: "numeric", month: "short" })}` : ""}
          </span>
        </div>
        <p className="mt-1 text-[13px] text-muted">{group.when}{entry.note ? ` ${entry.note}` : ""}</p>
        {readOnly && <p className="mt-1 text-[12.5px] text-medium">{entry.owner ? `Only ${entry.label} and Admin change this signature.` : "Only Admin changes this."}</p>}

        {entry.subject !== null && (
          <div className="mt-4">
            <span className="text-[13px] font-semibold text-ink-2">Subject line</span>
            <FillInEditor ref={subjectEl} className="mt-1.5" label="Subject line" singleLine value={subject} onChange={setSubject} fills={fills} readOnly={readOnly} onFocus={() => { lastField.current = "subject"; }} />
          </div>
        )}
        <div className="mt-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <span className="text-[13px] font-semibold text-ink-2">{entry.group === "topic" ? "Paragraph" : entry.group === "sign" ? "Signature" : "Email"}</span>
            {!readOnly && entry.vars.length > 0 && (
              <div className="relative">
                <button type="button" className={`${btn.ghost} !h-8 !px-3 !text-[13px]`} aria-expanded={adding} onMouseDown={(e) => e.preventDefault()} onClick={() => setAdding((v) => !v)}>
                  + Add a detail
                </button>
                {adding && (
                  <div className="absolute right-0 top-9 z-20 max-h-80 w-72 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-pop" onMouseDown={(e) => e.preventDefault()}>
                    <p className="px-2 pb-1 pt-1 text-[12px] text-muted">Goes where the cursor is. Filled in for each email.</p>
                    {entry.vars.map((v) => (
                      <button key={v} type="button" onClick={() => insert(v)} className="flex w-full flex-col rounded-lg px-2 py-1.5 text-left hover:bg-surface-2">
                        <span className="text-[13.5px] font-semibold text-brand">{fills[v]?.label ?? v}</span>
                        {fills[v]?.example && <span className="text-[12px] text-muted">e.g. {fills[v].example}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <FillInEditor ref={bodyEl} className={`mt-1.5 ${entry.group === "sign" || entry.group === "topic" ? "min-h-[140px]" : "min-h-[260px]"}`} label={entry.label} value={body} onChange={setBody} fills={fills} readOnly={readOnly} onFocus={() => { lastField.current = "body"; }} />
        </div>

        {!readOnly && (
          <ul className="mt-3 space-y-1.5 text-[12.5px] leading-relaxed text-muted">
            {entry.vars.length > 0 && <li><span className="fi-chip !text-[12px]">Coloured boxes</span> are filled in for each email. Remove one with Backspace; add one with <b className="font-semibold text-ink-2">+ Add a detail</b>.</li>}
            {/\[[^\]]*\{\w+\}/.test(subject + body) && <li><span className="fi-chip fi-opt !text-[12px]">Dashed boxes</span> show only when their detail exists (no valid-until date: no sentence). Click one to change its words.</li>}
            {entry.choices && <li><span className="fi-chip fi-choice !text-[12px]">is / are</span> uses the first word with one item, the second with several.</li>}
          </ul>
        )}

        {problems.length > 0 && <ul className="mt-2 space-y-0.5 text-[13px] text-high">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        {msg && <p className={`mt-2 text-[13px] ${/^Saved|^Back/.test(msg) ? "text-low" : "text-high"}`} role="status">{msg}</p>}

        {!readOnly && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className={btn.primary} disabled={busy || !dirty || problems.length > 0} onClick={() => save()}>{busy ? "Saving…" : "Save"}</button>
            {dirty && <button type="button" className={btn.ghost} disabled={busy} onClick={() => { setSubject(entry.subject ?? ""); setBody(entry.body); setMsg(""); }}>Undo changes</button>}
            {entry.edited && <button type="button" className={btn.danger} disabled={busy} onClick={() => save(true)}>Back to original</button>}
          </div>
        )}
      </section>

      <section className="min-w-0 rounded-2xl border border-line bg-surface p-4 lg:col-start-2 xl:col-start-auto" aria-label="Preview">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[16px] font-semibold">Preview</h2>
          {(entry.group === "quote" || entry.group === "ts") && (
            <label className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
              <input type="checkbox" className="size-3.5 accent-[var(--brand)]" checked={noExpiry} onChange={(e) => setNoExpiry(e.target.checked)} />
              Quote with no expiry date
            </label>
          )}
        </div>
        <p className="mt-0.5 text-[12px] text-faint">{entry.group === "sign" ? "As it shows under the email." : entry.group === "aed" || entry.group === "fulfil" || entry.group === "portal" || entry.group === "pi" ? "Filled in with made-up details." : `A made-up quote: ${SAMPLE.lines.map((l) => l.name).join(", ")}.`}</p>
        {shown ? (
          <>
            {shown.subject !== null && <p className="mt-3 text-[13.5px]"><span className="text-muted">Subject: </span><span className="font-medium">{shown.subject}</span></p>}
            <div className="mt-2 max-h-[calc(100vh-300px)] overflow-y-auto rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-[14px] leading-relaxed text-ink [scrollbar-width:thin] [&_*]:!bg-transparent [&_*]:!text-ink [&_a]:!text-brand [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: shown.html }} />
          </>
        ) : <p className="mt-3 text-[13px] text-muted">Fix the note in red to see it.</p>}
      </section>
    </div>
  );
}
