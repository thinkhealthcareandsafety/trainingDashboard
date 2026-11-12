"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type QuoteEmailInput, type TemplateOverrides, buildQuoteEmail, signature } from "@/lib/quoteEmails";
import { buildTsEmail } from "@/lib/totalSupply";
import { renderTemplate, templateProblems } from "@/lib/templateText";
import { fmtDate } from "@/lib/dates";
import { PORTAL_TEMPLATES, loginBoxHtml, loginEmail } from "@/lib/portalEmail";
import { piEmail } from "@/lib/performaRules";
import { btn, inputCls, selectCls } from "./ui";

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

const GROUPS: { id: Entry["group"]; label: string }[] = [
  { id: "quote", label: "Quotation emails" },
  { id: "topic", label: "Item paragraphs" },
  { id: "ts", label: "Total Supply emails" },
  { id: "pi", label: "Performa emails" },
  { id: "sign", label: "Signatures" },
  { id: "portal", label: "Training Manager login" },
  { id: "aed", label: "AED onboarding (hello@)" },
  { id: "fulfil", label: "Fulfillment thank-you (learn@)" },
];

/** What each {placeholder} becomes, for the chips' tooltips. */
const VAR_HELP: Record<string, string> = {
  hi: "\"Hi Rahul,\" (or \"Hello,\" with no contact name)", ref: "\"Quotation-24-002753 for Acme Hotels\"", what: "the first two kinds of item, \"Zoll AED + training\"",
  total: "the total with GST, \"₹1,74,480\"", valid: "the quote's expiry date (empty when it has none)", table: "the item table (on its own line)",
  topics: "the item paragraphs, one per kind of item", sign: "\"Warm regards,\" and the signature", signature: "the signature without \"Warm regards,\"",
  company: "the customer's company", number: "the quotation number", items: "the item names, \"Zoll AED Plus and Zoll AED 3\"",
  name: "the person's name as the quote has it", details: "the company details (address, numbers, website)",
  invoice: "the invoice number", person: "the concerned person (or \"Sir/ Ma'am\")", location: "the training's location", customer: "the customer's name",
  course: "the training's name", dates: "the training dates", people: "how many people came",
  training: "the training's name, \"CPR & AED Training\"",
  quote: "the quotation number",
};

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
  const subjectEl = useRef<HTMLInputElement>(null);
  const bodyEl = useRef<HTMLTextAreaElement>(null);

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
    setKey(k); setSubject(e.subject ?? ""); setBody(e.body); setMsg(""); remember(k);
  };
  const insert = (name: string) => {
    const el = lastField.current === "subject" && entry?.subject !== null ? subjectEl.current : bodyEl.current;
    if (!el) return;
    const v = el.value, a = el.selectionStart ?? v.length, b = el.selectionEnd ?? v.length;
    const next = `${v.slice(0, a)}{${name}}${v.slice(b)}`;
    (el === subjectEl.current ? setSubject : setBody)(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + name.length + 2, a + name.length + 2); });
  };
  const save = async (reset = false) => {
    if (!entry) return;
    if (reset && !window.confirm(`Put "${entry.label}" back to the built-in wording? Your changes to it will be gone.`)) return;
    setBusy(true); setMsg("");
    const r = await fetch("/api/templates", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(reset ? { key, reset: true } : { key, subject, body }) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }) : { error: "Couldn't reach the server" };
    setBusy(false);
    if (!j.ok) return setMsg(j.error ?? "Couldn't save");
    await load(key);
    setMsg(reset ? "Back to the built-in wording." : "Saved. The next email uses it.");
  };

  if (error) return <p className="text-[14px] text-high">{error}</p>;
  if (!list || !entry) return <p className="text-[14px] text-muted">Loading the templates…</p>;
  const readOnly = !entry.canEdit;

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
                {t.edited && <span className="size-1.5 shrink-0 rounded-full bg-brand" title="Changed from the built-in wording" />}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <section className="min-w-0 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[16px] font-semibold">{entry.label}</h2>
          <span className="text-[12px] text-muted">
            {entry.edited ? "Changed" : "Built-in wording"}{entry.editedBy && entry.editedAt ? ` · last saved by ${entry.editedBy}, ${fmtDate(entry.editedAt, { day: "numeric", month: "short" })}` : ""}
          </span>
        </div>
        {entry.note && <p className="mt-1 text-[12.5px] text-muted">{entry.note}</p>}
        {readOnly && <p className="mt-1 text-[12.5px] text-medium">{entry.owner ? `Only ${entry.label} and Admin change this signature.` : "Only Admin changes this."}</p>}

        {entry.subject !== null && (
          <label className="mt-3 block">
            <span className="text-[12px] font-medium text-muted">Subject</span>
            <input ref={subjectEl} className={`${inputCls} mt-1`} value={subject} readOnly={readOnly} onFocus={() => { lastField.current = "subject"; }} onChange={(e) => setSubject(e.target.value)} />
          </label>
        )}
        <label className="mt-3 block">
          <span className="text-[12px] font-medium text-muted">{entry.group === "topic" ? "Paragraph" : entry.group === "sign" ? "Signature" : "Message"}</span>
          <textarea ref={bodyEl} className={`${inputCls} mt-1 !h-auto min-h-[220px] resize-y py-2.5 leading-relaxed xl:min-h-[calc(100vh-620px)]`} rows={12} value={body} readOnly={readOnly}
            onFocus={() => { lastField.current = "body"; }} onChange={(e) => setBody(e.target.value)} spellCheck />
        </label>

        {!readOnly && entry.vars.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-muted">Insert:</span>
            {entry.vars.map((v) => (
              <button key={v} type="button" onClick={() => insert(v)} title={VAR_HELP[v] ?? v} className="rounded-full bg-surface-2 px-2.5 py-0.5 font-mono text-[12px] text-ink-2 hover:bg-line">{`{${v}}`}</button>
            ))}
          </div>
        )}
        <p className="mt-2 text-[12px] leading-relaxed text-faint">
          Words in {"{ }"} are filled in for each email. Put a part in [square brackets] to leave it out when a value inside it is empty, e.g. <span className="font-mono">[, valid until {"{valid}"}]</span>.
          {entry.choices && <> <span className="font-mono">{"{is|are}"}</span> picks the first with one item, the second with several.</>}
        </p>

        {problems.length > 0 && <ul className="mt-2 space-y-0.5 text-[13px] text-high">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        {msg && <p className={`mt-2 text-[13px] ${/^Saved|^Back/.test(msg) ? "text-low" : "text-high"}`} role="status">{msg}</p>}

        {!readOnly && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className={btn.primary} disabled={busy || !dirty || problems.length > 0} onClick={() => save()}>{busy ? "Saving…" : "Save"}</button>
            {dirty && <button type="button" className={btn.ghost} disabled={busy} onClick={() => { setSubject(entry.subject ?? ""); setBody(entry.body); setMsg(""); }}>Undo changes</button>}
            {entry.edited && <button type="button" className={btn.danger} disabled={busy} onClick={() => save(true)}>Reset to built-in</button>}
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
        ) : <p className="mt-3 text-[13px] text-muted">Fix the problems on the left to see it.</p>}
      </section>
    </div>
  );
}
