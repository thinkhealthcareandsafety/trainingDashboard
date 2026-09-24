"use client";

import { useEffect, useState } from "react";
import type { CardEvent, CardEventKind, Member, Phase } from "@/lib/types";
import { type CardView, type ContactEntry, describeEvent, normEmail, normPhone, salespersonLabel } from "@/lib/pipeline";
import { fmtDate, fmtTime } from "@/lib/dates";
import { zohoUrl } from "@/lib/zohoLinks";
import { useStore } from "@/lib/store";
import { Avatar, IconButton, btn, inputCls, selectCls } from "../ui";

export type BoardOptions = { typeOptions: string[]; sectorOptions: string[]; orgId?: string };
type Cards = Map<string, CardView>;

const phaseOf = (c: CardView): Phase => (c.kind === "lead" ? "Lead" : "Quote");
const nameFor = (cards: Cards) => (id: string) => {
  const c = cards.get(id);
  if (!c) return "a card";
  return c.kind === "quote" ? `quote ${c.quote?.number}` : c.name;
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ---------------- Small pieces ---------------- */

export function FlagBadge() {
  return (
    <span title="Flagged: this client is both a lead and a quote — open to merge" className="grid size-5 shrink-0 place-items-center rounded-md bg-high-bg text-[11px] font-bold text-high">
      F
    </span>
  );
}

function Lock() {
  return (
    <svg viewBox="0 0 20 20" className="size-3.5 shrink-0 text-faint" fill="none" stroke="currentColor" strokeWidth="1.6" aria-label="Locked — synced from Zoho Books">
      <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </svg>
  );
}

function Row({ label, required, locked, children }: { label: string; required?: boolean; locked?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 border-b border-line py-2.5 last:border-b-0">
      <dt className="flex items-start gap-1 pt-0.5 text-[13px] text-muted">
        {label}
        {required && <span className="text-high">*</span>}
        {locked && <Lock />}
      </dt>
      <dd className="min-w-0 text-[13px] text-ink-2 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function SourceTag({ phases }: { phases: Phase[] }) {
  return <span className="rounded-full bg-surface-2 px-1.5 py-px text-[11px] text-muted">from {phases.join(" · ")}</span>;
}

function Entries({ entries, empty, missing }: { entries: ContactEntry[]; empty: string; missing?: boolean }) {
  if (!entries.length) return <span className={missing ? "font-medium text-high" : "text-faint"}>{empty}</span>;
  return (
    <ul className="space-y-1">
      {entries.map((e, i) => (
        <li key={e.value} className="flex flex-wrap items-center gap-2">
          <span className={`min-w-0 [overflow-wrap:anywhere] ${i === 0 ? "font-medium text-ink" : ""}`}>{e.value}</span>
          <SourceTag phases={e.phases} />
        </li>
      ))}
    </ul>
  );
}

const PHASE_DOCS = ["Quote", "Sales Order / PI", "Invoice", "Payment Received"] as const;

/** Read-only view of a card: the same fields for every phase; later phases fill in as they're connected. */
export function CardDetails({ card, cards, options, onUnmerge }: { card: CardView; cards: Cards; options: BoardOptions; onUnmerge?: (leadId: string) => void }) {
  const q = card.quote;
  const docs: Record<(typeof PHASE_DOCS)[number], { no?: string; date?: string; href?: string }> = {
    Quote: { no: q?.number, date: q?.date, href: q ? zohoUrl("estimate", q.estimateId, options.orgId) : undefined },
    "Sales Order / PI": {},
    Invoice: {},
    "Payment Received": {},
  };
  return (
    <div className="space-y-5">
      <dl>
        <Row label="Customer name" required>
          <div className="font-medium text-ink">{card.name}</div>
          {card.aliases.length > 0 && <div className="mt-0.5 text-[12px] text-muted">Also known as {card.aliases.join(", ")}</div>}
        </Row>
        <Row label="Email">
          <Entries entries={card.emails} empty="—" />
        </Row>
        <Row label="Contact number" required>
          <Entries entries={card.phones} empty="Missing — add one" missing />
        </Row>
        <Row label="Customer type">{card.type ?? <span className="text-faint">—</span>}</Row>
        <Row label="Sector">{card.sector ?? <span className="text-faint">—</span>}</Row>
        <Row label="Created in Zoho" locked>{card.customerSince ? fmtDate(card.customerSince, { day: "numeric", month: "short", year: "numeric" }) : "—"}</Row>
        <Row label="Sales person" locked>{card.salespeople.length ? salespersonLabel(card.salespeople) : <span className="text-faint">—</span>}</Row>
      </dl>

      {q && (
        <div>
          <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted">Training</h3>
          <table className="w-full text-[13px]">
            <thead className="text-left text-[12px] text-muted">
              <tr className="border-b border-line"><th className="py-1.5 font-medium">Item</th><th className="w-20 py-1.5 text-right font-medium">QTY</th></tr>
            </thead>
            <tbody>
              {q.items.map((i, n) => (
                <tr key={n} className="border-b border-line last:border-b-0">
                  <td className="py-1.5 text-ink-2">{i.name}</td>
                  <td className="num py-1.5 text-right text-ink-2">{i.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-1.5 text-[12px] text-muted">Zoho status: <span className="capitalize text-ink-2">{q.status}</span></div>
        </div>
      )}

      <div>
        <h3 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted">
          IDs &amp; dates <Lock /> <span className="font-normal normal-case tracking-normal text-faint">from Zoho Books — read only</span>
        </h3>
        <table className="w-full text-[13px]">
          <thead className="text-left text-[12px] text-muted">
            <tr className="border-b border-line"><th className="py-1.5 font-medium">Document</th><th className="py-1.5 font-medium">Number</th><th className="py-1.5 font-medium">Date</th></tr>
          </thead>
          <tbody>
            {PHASE_DOCS.map((k) => (
              <tr key={k} className="border-b border-line last:border-b-0">
                <td className="py-1.5 text-muted">{k}</td>
                <td className="py-1.5 text-ink-2">
                  {docs[k].no ? (docs[k].href ? <a href={docs[k].href} target="_blank" rel="noreferrer" className="text-brand hover:underline">{docs[k].no}</a> : docs[k].no) : <span className="text-faint">—</span>}
                </td>
                <td className="num py-1.5 text-ink-2">{docs[k].date ? fmtDate(docs[k].date!, { day: "numeric", month: "short", year: "numeric" }) : <span className="text-faint">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {card.mergedLeadIds.length > 0 && (
        <div className="rounded-lg bg-surface-2/70 px-3 py-2 text-[12.5px] text-muted">
          {card.mergedLeadIds.map((id) => (
            <div key={id} className="flex items-center justify-between gap-2">
              <span>Merged from lead <b className="font-medium text-ink-2">{cards.get(id)?.lead?.name ?? id}</b></span>
              {onUnmerge && <button className="text-[12px] font-medium text-brand hover:underline" onClick={() => onUnmerge(id)}>Unmerge</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Change log (the modal's extension) ---------------- */

export function ChangeLog({ cardIds, cards, member }: { cardIds: string[]; cards: Cards; member: Member }) {
  const { cardEvents, revertCardEvent } = useStore();
  const ids = new Set(cardIds);
  const list = cardEvents.filter((e) => e.cardIds.some((id) => ids.has(id))).sort((a, b) => b.at.localeCompare(a.at));
  const nameOf = nameFor(cards);
  return (
    <div className="p-5">
      <h3 className="text-[13px] font-semibold text-ink">Changes</h3>
      <p className="mb-4 text-[12px] text-muted">Who changed what. Every change can be reverted.</p>
      {list.length === 0 ? (
        <p className="text-[12.5px] text-faint">No changes yet.</p>
      ) : (
        <ol className="space-y-3">
          {list.map((e) => (
            <li key={e.id} className={`rounded-lg border border-line bg-surface p-2.5 text-[12.5px] ${e.revertedAt ? "opacity-60" : ""}`}>
              <div className={e.revertedAt ? "text-muted line-through" : "text-ink-2"}>{describeEvent(e, nameOf)}</div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted">
                  <Avatar name={e.by} />
                  <span className="truncate">{e.by} · {fmtDate(e.at)}, {fmtTime(e.at)}</span>
                </span>
                {!e.revertedAt && (
                  <button className="shrink-0 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-brand hover:bg-brand-soft" onClick={() => revertCardEvent(e.id, member.name)}>
                    Revert
                  </button>
                )}
              </div>
              {e.revertedAt && <div className="mt-1 text-[11.5px] text-muted">Reverted by {e.revertedBy} · {fmtDate(e.revertedAt)}, {fmtTime(e.revertedAt)}</div>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ---------------- Modal shell: details on the left, change log on the right ---------------- */

function Shell({ label, onClose, side, children }: { label: string; onClose: () => void; side: React.ReactNode; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/25 backdrop-blur-md sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={label}
        className="modal-in flex max-h-[92vh] w-full max-w-[1120px] flex-col overflow-hidden rounded-t-[22px] bg-surface shadow-pop sm:rounded-[22px] md:flex-row"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
        <aside className="max-h-[35vh] shrink-0 overflow-y-auto border-t border-line bg-surface-2/40 md:max-h-none md:w-[320px] md:border-l md:border-t-0">{side}</aside>
      </div>
    </div>
  );
}

function Header({ kind, title, flagged, onClose }: { kind: string; title: string; flagged?: boolean; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 px-6 pb-3 pt-5">
      <div className="min-w-0">
        <div className="text-[12px] font-medium uppercase tracking-wide text-muted">{kind}</div>
        <h2 className="mt-0.5 flex items-center gap-2 text-[18px] font-semibold leading-snug tracking-tight">
          <span className="truncate">{title}</span>
          {flagged && <FlagBadge />}
        </h2>
      </div>
      <IconButton label="Close" onClick={onClose}><path d="M5 5l10 10M15 5L5 15" /></IconButton>
    </div>
  );
}

/* ---------------- Editing ---------------- */

type EntryDraft = ContactEntry & { isNew?: boolean };
type Draft = { name: string; aliases: string[]; emails: EntryDraft[]; phones: EntryDraft[]; type: string; sector: string };

function EntryEditor({ label, required, entries, onChange, keyOf, validate, phase, placeholder }: {
  label: string; required?: boolean; entries: EntryDraft[]; onChange: (e: EntryDraft[]) => void;
  keyOf: (v: string) => string; validate: (v: string) => string | null; phase: Phase; placeholder: string;
}) {
  const [v, setV] = useState("");
  const [err, setErr] = useState("");
  const add = () => {
    const x = v.trim();
    const bad = validate(x);
    if (bad) return setErr(bad);
    if (entries.some((e) => keyOf(e.value) === keyOf(x))) return setErr("Already on this card.");
    onChange([{ value: x, phases: [phase], at: new Date().toISOString(), isNew: true }, ...entries]);
    setV("");
    setErr("");
  };
  return (
    <Row label={label} required={required}>
      <ul className="mb-2 space-y-1">
        {entries.map((e) => (
          <li key={e.value} className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 text-ink [overflow-wrap:anywhere]">{e.value}</span>
            <SourceTag phases={e.phases} />
            <button type="button" aria-label={`Remove ${e.value}`} className="ml-auto rounded px-1 text-faint hover:bg-surface-2 hover:text-high" onClick={() => onChange(entries.filter((x) => x !== e))}>×</button>
          </li>
        ))}
        {entries.length === 0 && <li className={required ? "text-high" : "text-faint"}>{required ? "At least one is required" : "None"}</li>}
      </ul>
      <div className="flex gap-2">
        <input className={`${inputCls} !h-9 text-[13px]`} value={v} placeholder={placeholder} onChange={(e) => { setV(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} />
        <button type="button" className={btn.ghost} onClick={add}>Add</button>
      </div>
      {err && <p className="mt-1 text-[12px] text-high">{err}</p>}
    </Row>
  );
}

function Editor({ card, draft, setDraft, options }: { card: CardView; draft: Draft; setDraft: (d: Draft) => void; options: BoardOptions }) {
  const [alias, setAlias] = useState("");
  const addAlias = () => {
    const a = alias.trim();
    if (a && !draft.aliases.includes(a) && a !== draft.name) setDraft({ ...draft, aliases: [...draft.aliases, a] });
    setAlias("");
  };
  const withCurrent = (opts: string[], cur: string) => (cur && !opts.includes(cur) ? [cur, ...opts] : opts);
  return (
    <dl>
      <Row label="Customer name" required>
        <input className={`${inputCls} !h-9 text-[13px]`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Customer name" />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {draft.aliases.map((a) => (
            <span key={a} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[12px] text-ink-2">
              {a}
              <button type="button" aria-label={`Remove alias ${a}`} className="text-faint hover:text-high" onClick={() => setDraft({ ...draft, aliases: draft.aliases.filter((x) => x !== a) })}>×</button>
            </span>
          ))}
          <input className="h-7 min-w-[140px] flex-1 rounded-md border border-dashed border-line bg-transparent px-2 text-[12px] focus:border-brand focus:outline-none" placeholder="+ Add alias (optional)" value={alias} onChange={(e) => setAlias(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAlias())} onBlur={addAlias} />
        </div>
      </Row>
      <EntryEditor label="Email" entries={draft.emails} onChange={(emails) => setDraft({ ...draft, emails })} keyOf={normEmail} phase={phaseOf(card)} placeholder="name@company.com"
        validate={(x) => (EMAIL_RE.test(x) ? null : "Enter a valid email.")} />
      <EntryEditor label="Contact number" required entries={draft.phones} onChange={(phones) => setDraft({ ...draft, phones })} keyOf={normPhone} phase={phaseOf(card)} placeholder="+91 98765 43210"
        validate={(x) => (/^[+\d\s()-]+$/.test(x) && x.replace(/\D/g, "").length >= 7 ? null : "Enter a valid number.")} />
      <Row label="Customer type">
        <select className={`${selectCls} w-full`} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} aria-label="Customer type">
          <option value="">—</option>
          {withCurrent(options.typeOptions, draft.type).map((o) => <option key={o}>{o}</option>)}
        </select>
      </Row>
      <Row label="Sector">
        <select className={`${selectCls} w-full`} value={draft.sector} onChange={(e) => setDraft({ ...draft, sector: e.target.value })} aria-label="Sector">
          <option value="">—</option>
          {withCurrent(options.sectorOptions, draft.sector).map((o) => <option key={o}>{o}</option>)}
        </select>
      </Row>
      <Row label="Created in Zoho" locked>{card.customerSince ? fmtDate(card.customerSince, { day: "numeric", month: "short", year: "numeric" }) : "—"}</Row>
      <Row label="Sales person" locked>{card.salespeople.length ? salespersonLabel(card.salespeople) : "—"}</Row>
    </dl>
  );
}

/** Turn the edited draft into one event per change, so each can be reverted on its own. */
function diff(card: CardView, d: Draft, by: string): Omit<CardEvent, "id" | "at">[] {
  const base = { cardIds: [card.id], by };
  const out: Omit<CardEvent, "id" | "at">[] = [];
  const ev = (kind: CardEventKind, extra: Partial<CardEvent>) => out.push({ ...base, kind, ...extra });
  if (d.name.trim() !== card.name) ev("set_name", { value: d.name.trim(), before: card.name });
  for (const a of card.aliases) if (!d.aliases.includes(a)) ev("remove_alias", { value: a });
  for (const a of d.aliases) if (!card.aliases.includes(a)) ev("add_alias", { value: a });
  const keep = (list: EntryDraft[], key: (v: string) => string) => new Set(list.filter((e) => !e.isNew).map((e) => key(e.value)));
  const keptEmails = keep(d.emails, normEmail);
  const keptPhones = keep(d.phones, normPhone);
  for (const e of card.emails) if (!keptEmails.has(normEmail(e.value))) ev("remove_email", { value: e.value });
  for (const p of card.phones) if (!keptPhones.has(normPhone(p.value))) ev("remove_phone", { value: p.value });
  for (const e of [...d.emails].reverse()) if (e.isNew) ev("add_email", { value: e.value, phase: e.phases[0] });
  for (const p of [...d.phones].reverse()) if (p.isNew) ev("add_phone", { value: p.value, phase: p.phases[0] });
  if (d.type !== (card.type ?? "")) ev("set_type", { value: d.type, before: card.type ?? "" });
  if (d.sector !== (card.sector ?? "")) ev("set_sector", { value: d.sector, before: card.sector ?? "" });
  return out;
}

/* ---------------- Card modal (same modal for every phase) ---------------- */

export function CardModal({ card, cards, member, options, onClose, onReviewMerge }: {
  card: CardView; cards: Cards; member: Member; options: BoardOptions; onClose: () => void; onReviewMerge: () => void;
}) {
  const { addCardEvents, revertCardEvent, cardEvents, toast } = useStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { setDraft(null); setError(""); setConfirmDelete(false); }, [card.id]);

  const startEdit = () => setDraft({
    name: card.name, aliases: [...card.aliases], emails: card.emails.map((e) => ({ ...e })), phones: card.phones.map((p) => ({ ...p })),
    type: card.type ?? "", sector: card.sector ?? "",
  });

  const save = () => {
    if (!draft) return;
    if (!draft.name.trim()) return setError("Customer name is required.");
    if (!draft.phones.length) return setError("At least one contact number is required.");
    addCardEvents(diff(card, draft, member.name));
    setDraft(null);
    setError("");
  };

  const activeEvent = (pred: (e: CardEvent) => boolean) => cardEvents.find((e) => !e.revertedAt && pred(e));
  const del = () => {
    const [ev] = addCardEvents([{ cardIds: [card.id], kind: "delete", by: member.name }]);
    toast({ text: `Deleted ${card.name}`, actionLabel: "Undo", onAction: () => revertCardEvent(ev.id, member.name) });
    onClose();
  };
  const restore = () => {
    const ev = activeEvent((e) => e.kind === "delete" && e.cardIds.includes(card.id));
    if (ev) revertCardEvent(ev.id, member.name);
  };
  const unmerge = (leadId: string) => {
    const ev = activeEvent((e) => e.kind === "merge" && e.cardIds[0] === leadId && e.cardIds[1] === card.id);
    if (ev) revertCardEvent(ev.id, member.name);
  };

  return (
    <Shell label={`${card.name} details`} onClose={onClose} side={<ChangeLog cardIds={card.historyIds} cards={cards} member={member} />}>
      <Header kind={card.kind === "lead" ? "Lead" : `Quotation · ${card.quote?.number}`} title={card.name} flagged={card.flaggedWith.length > 0} onClose={onClose} />
      <div className="px-6 pb-6">
        {card.deleted && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-high-bg px-3 py-2 text-[13px] text-high">
            This card is deleted from the board.
            <button className="font-medium underline" onClick={restore}>Restore</button>
          </div>
        )}
        {card.flaggedWith.length > 0 && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
            <span className="inline-flex items-center gap-2"><FlagBadge /> This client is in both Leads and Quotations.</span>
            <button className="font-medium text-brand hover:underline" onClick={onReviewMerge}>Review &amp; merge</button>
          </div>
        )}
        {draft ? <Editor card={card} draft={draft} setDraft={setDraft} options={options} /> : <CardDetails card={card} cards={cards} options={options} onUnmerge={unmerge} />}
        {error && <p className="mt-3 text-[12.5px] text-high">{error}</p>}
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {draft ? (
            <>
              <button className={btn.primary} onClick={save}>Save changes</button>
              <button className={btn.ghost} onClick={() => { setDraft(null); setError(""); }}>Cancel</button>
            </>
          ) : (
            <>
              <button className={btn.primary} onClick={startEdit} disabled={card.deleted}>Edit</button>
              {!card.deleted && (confirmDelete ? (
                <span className="ml-auto inline-flex items-center gap-2 text-[13px] text-muted">
                  Delete from the board? (Zoho is not changed)
                  <button className={btn.danger} onClick={del}>Delete</button>
                  <button className={btn.quiet} onClick={() => setConfirmDelete(false)}>Keep</button>
                </span>
              ) : (
                <button className={`${btn.danger} ml-auto`} onClick={() => setConfirmDelete(true)}>Delete</button>
              ))}
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}

/* ---------------- Merge: the same client in Leads and Quotations ---------------- */

export function MergeModal({ leadId, quoteIds, initialQuoteId, cards, member, options, onClose, onOpen }: {
  leadId: string; quoteIds: string[]; initialQuoteId?: string; cards: Cards; member: Member; options: BoardOptions;
  onClose: () => void; onOpen: (cardId: string) => void;
}) {
  const { addCardEvents, revertCardEvent, toast } = useStore();
  const [sel, setSel] = useState(initialQuoteId ?? quoteIds[0]);
  const lead = cards.get(leadId);
  const quote = cards.get(sel);
  if (!lead || !quote) return null;

  const merge = () => {
    const [ev] = addCardEvents([{ cardIds: [lead.id, quote.id], kind: "merge", by: member.name }]);
    toast({ text: `Merged ${lead.name} into ${quote.quote?.number}`, actionLabel: "Undo", onAction: () => revertCardEvent(ev.id, member.name) });
    onOpen(quote.id);
  };

  return (
    <Shell label="Review and merge" onClose={onClose} side={<ChangeLog cardIds={[lead.id, ...quoteIds]} cards={cards} member={member} />}>
      <Header kind="Same client in Leads and Quotations" title={lead.name} flagged onClose={onClose} />
      <div className="px-6 pb-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-line p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-ink">Lead</h3>
              <button className="text-[12.5px] font-medium text-brand hover:underline" onClick={() => onOpen(lead.id)}>Open &amp; edit</button>
            </div>
            <CardDetails card={lead} cards={cards} options={options} />
          </section>
          <section className="rounded-xl border border-line p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-[13px] font-semibold text-ink">Quotation</h3>
              <button className="text-[12.5px] font-medium text-brand hover:underline" onClick={() => onOpen(quote.id)}>Open &amp; edit</button>
            </div>
            {quoteIds.length > 1 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {quoteIds.map((id) => (
                  <button key={id} onClick={() => setSel(id)} className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${id === sel ? "bg-ink text-surface" : "bg-surface-2 text-ink-2 hover:bg-line"}`}>
                    {cards.get(id)?.quote?.number}
                  </button>
                ))}
              </div>
            )}
            <CardDetails card={quote} cards={cards} options={options} />
          </section>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="max-w-lg text-[12.5px] text-muted">
            Merging moves the lead&apos;s name, aliases, emails and numbers into the quotation card, and the lead leaves the Leads column. It&apos;s recorded in Changes and can be reverted (unmerged) any time.
          </p>
          <button className={btn.primary} onClick={merge}>Merge lead into {quote.quote?.number}</button>
        </div>
      </div>
    </Shell>
  );
}
