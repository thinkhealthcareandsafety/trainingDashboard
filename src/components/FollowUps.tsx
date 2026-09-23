"use client";

import { useEffect, useMemo, useState } from "react";
import type { Deal, Lead, Priority } from "@/lib/types";
import { fmtDate, fmtINR } from "@/lib/dates";
import { type DealStage, dealCascade, dealStage, dealStageLabel } from "@/lib/deals";
import { zohoUrl } from "@/lib/zohoLinks";
import { newId, useStore } from "@/lib/store";
import { PageHeader } from "./AppShell";
import { Avatar, Combobox, Field, IconButton, Modal, PriorityBadge, PriorityDot, btn, inputCls, selectCls } from "./ui";

const LEAD_SOURCES = ["Referral", "Website", "Cold call", "Repeat client", "Exhibition", "Other"];

/* ---------------- Stage cell ---------------- */

function StageCell({ done, date, sub }: { done: boolean; date?: string; sub?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px]">
      {done ? (
        <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-low" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4.5 10.5l3.5 3.5 7.5-8" />
        </svg>
      ) : (
        <span className="size-4 shrink-0 text-center leading-none text-faint" aria-hidden>–</span>
      )}
      <span className={done ? "text-ink-2" : "text-faint"}>
        {done ? (date ? fmtDate(date) : sub ?? "Done") : "—"}
      </span>
    </span>
  );
}

/* ---------------- New / edit lead ---------------- */

function LeadModal({ open, onClose, initial, customers, owners, trainingTypes }: { open: boolean; onClose: () => void; initial: Lead | null; customers: string[]; owners: string[]; trainingTypes: string[] }) {
  const { saveLead } = useStore();
  const [customerName, setCustomer] = useState("");
  const [trainingType, setTrainingType] = useState("");
  const [source, setSource] = useState("");
  const [contact, setContact] = useState("");
  const [owner, setOwner] = useState("");
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCustomer(initial?.customerName ?? "");
    setTrainingType(initial?.trainingType ?? "");
    setSource(initial?.source ?? "");
    setContact(initial?.contact ?? "");
    setOwner(initial?.owner ?? "");
    setNotes(initial?.notes ?? "");
    setTouched(false);
  }, [open, initial]);

  const valid = Boolean(customerName.trim());

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    saveLead({
      id: initial?.id ?? newId(),
      customerName: customerName.trim(),
      trainingType: trainingType.trim() || undefined,
      source: source.trim() || undefined,
      contact: contact.trim() || undefined,
      owner: owner.trim() || undefined,
      notes: notes.trim() || undefined,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      status: initial?.status ?? "open",
    });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit lead" : "New lead"}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Client">
          <Combobox value={customerName} onChange={setCustomer} options={customers} placeholder="Search or add a client" noun="clients" customLabel="Add" ariaLabel="Client" />
        </Field>
        <Field label="Interested in (optional)">
          <Combobox value={trainingType} onChange={setTrainingType} options={trainingTypes} placeholder="e.g. First Aid Training" noun="training types" customLabel="Add" ariaLabel="Training type" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Source">
            <Combobox value={source} onChange={setSource} options={LEAD_SOURCES} placeholder="How did they find us" noun="sources" customLabel="Add" ariaLabel="Source" />
          </Field>
          <Field label="Owner">
            <Combobox value={owner} onChange={setOwner} options={owners} placeholder="Who's chasing this" noun="people" customLabel="Assign to" ariaLabel="Owner" />
          </Field>
        </div>
        <Field label="Contact (optional)">
          <input className={inputCls} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Phone or email" />
        </Field>
        <Field label="Notes (optional)">
          <textarea className={`${inputCls} h-20 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {touched && !valid && <p className="text-xs text-high">Add a client name.</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btn.ghost} onClick={onClose}>Cancel</button>
          <button type="submit" className={btn.primary}>{initial ? "Save changes" : "Create lead"}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------------- Detail drawer ---------------- */

function Drawer({ deal, onClose, onEditLead }: { deal: Deal | null; onClose: () => void; onEditLead: (id: string) => void }) {
  const { leads, deleteLead, data } = useStore();
  useEffect(() => {
    if (!deal) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deal, onClose]);
  if (!deal) return null;
  const lead = leads.find((l) => l.id === deal.leadId);
  const { hasQuotation, hasPerforma } = dealCascade(deal);
  const orgId = data?.orgId;

  const stages: [string, boolean, string | undefined, string | undefined][] = [
    ["Lead", Boolean(deal.leadId), deal.leadAt, undefined],
    ["Quotation", hasQuotation, deal.quotationAt, deal.quotationDocId ? zohoUrl("estimate", deal.quotationDocId, orgId) : undefined],
    ["Performa invoice", hasPerforma, deal.performaAt, deal.performaDocId ? zohoUrl("salesorder", deal.performaDocId, orgId) : undefined],
    ["Training date", Boolean(deal.trainingDate), deal.trainingDate, undefined],
    ["Training completed", deal.trainingCompleted, deal.trainingCompleted ? deal.trainingDate : undefined, undefined],
    ["Invoice sent", deal.invoiceSent, undefined, deal.invoiceDocId ? zohoUrl("invoice", deal.invoiceDocId, orgId) : undefined],
    ["Payment received", deal.paymentReceived, undefined, undefined],
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/20 backdrop-blur-[1px]" onMouseDown={onClose}>
      <aside className="rise flex h-full w-full max-w-[440px] flex-col border-l border-line bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()} aria-label="Deal details">
        <div className="flex items-start justify-between gap-3 px-6 pb-4 pt-5">
          <div className="min-w-0">
            <div className="text-[13px] text-muted">{deal.trainingType || "General enquiry"}</div>
            <h2 className="mt-0.5 truncate text-[17px] font-semibold leading-snug tracking-tight">{deal.customerName}</h2>
          </div>
          <IconButton label="Close" onClick={onClose}><path d="M5 5l10 10M15 5L5 15" /></IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="rounded-full bg-surface-2 px-2.5 py-1 font-medium text-ink-2">{dealStageLabel(deal)}</span>
            {deal.priority && <PriorityBadge p={deal.priority} />}
          </div>
          <dl className="divide-y divide-line border-y border-line text-[13px]">
            {stages.map(([label, done, date, href]) => (
              <div key={label} className="grid grid-cols-[150px_1fr] items-center py-2.5">
                <dt className="text-muted">{label}</dt>
                <dd className="flex items-center gap-2 text-ink-2">
                  <StageCell done={done} date={date} />
                  {href && (
                    <a href={href} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                      View in Zoho
                    </a>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 grid grid-cols-2 gap-3 text-[13px]">
            <div><div className="mb-1 text-muted">Documents</div>
              <div className="text-ink-2">{[deal.quotationDocNumber, deal.performaDocNumber, deal.invoiceDocNumber].filter(Boolean).join(" · ") || "—"}</div>
            </div>
            <div><div className="mb-1 text-muted">Participants</div><div className="text-ink-2">{deal.participants || "—"}</div></div>
          </div>
          {lead && (
            <div className="mt-6">
              <h3 className="mb-3 text-[13px] font-medium text-ink-2">Lead details</h3>
              <dl className="space-y-2 text-[13px]">
                {lead.source && <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted">Source</dt><dd className="text-ink-2">{lead.source}</dd></div>}
                {lead.contact && <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted">Contact</dt><dd className="text-ink-2">{lead.contact}</dd></div>}
                {lead.owner && <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted">Owner</dt><dd className="inline-flex items-center gap-2 text-ink-2"><Avatar name={lead.owner} />{lead.owner}</dd></div>}
                {lead.notes && <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted">Notes</dt><dd className="whitespace-pre-wrap text-ink-2">{lead.notes}</dd></div>}
              </dl>
            </div>
          )}
        </div>
        {lead && (
          <div className="flex items-center gap-2 border-t border-line px-6 py-4">
            <button className={btn.ghost} onClick={() => onEditLead(lead.id)}>Edit lead</button>
            <button className={`${btn.danger} ml-auto`} onClick={() => { deleteLead(lead.id); onClose(); }}>Delete lead</button>
          </div>
        )}
      </aside>
    </div>
  );
}

/* ---------------- Board ---------------- */

type SortKey = "recent" | "amount";

const STAGE_ORDER: DealStage[] = ["lead", "quotation", "performa", "training", "training_completed", "invoiced", "paid"];

const STAGE_META: Record<DealStage, { label: string; header: string; dot: string }> = {
  lead: { label: "Leads", header: "bg-surface-2", dot: "bg-faint" },
  quotation: { label: "Quotations", header: "bg-brand-soft", dot: "bg-brand-2" },
  performa: { label: "Performa invoice", header: "bg-medium-bg", dot: "bg-medium" },
  training: { label: "Training scheduled", header: "bg-brand-soft", dot: "bg-brand" },
  training_completed: { label: "Training completed", header: "bg-low-bg", dot: "bg-low" },
  invoiced: { label: "Invoice sent", header: "bg-medium-bg", dot: "bg-medium" },
  paid: { label: "Payment received", header: "bg-low-bg", dot: "bg-low" },
};

function cardDetail(d: Deal, stage: DealStage): string {
  switch (stage) {
    case "lead": return d.leadSource ? `via ${d.leadSource}` : "New lead";
    case "quotation": return d.quotationDocNumber ? `Quote ${d.quotationDocNumber}` : "Quotation sent";
    case "performa": return d.performaDocNumber ? `PI ${d.performaDocNumber}` : "Performa invoice";
    case "training": return d.trainingDate ? `Scheduled ${fmtDate(d.trainingDate)}` : "Awaiting date";
    case "training_completed": return d.trainingDate ? `Delivered ${fmtDate(d.trainingDate)}` : "Delivered";
    case "invoiced": return d.invoiceDocNumber ? `${d.invoiceDocNumber} · ${d.invoiceStatus}` : "Invoice sent";
    case "paid": return d.invoiceDocNumber ? `${d.invoiceDocNumber} · Paid` : "Paid";
  }
}

function DealCard({ deal, stage, onClick }: { deal: Deal; stage: DealStage; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="card-hover block w-full rounded-xl border border-line bg-surface p-3 text-left shadow-card transition"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-ink">{deal.customerName}</div>
          <div className="truncate text-[12px] text-muted">{deal.trainingType || "General enquiry"}</div>
        </div>
        {deal.priority && <PriorityDot p={deal.priority} className="mt-1.5 shrink-0" />}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 text-[12px]">
        <span className="num font-medium text-ink-2">{deal.amount ? fmtINR(deal.amount, true) : "—"}</span>
        <span className="truncate text-faint">{cardDetail(deal, stage)}</span>
      </div>
    </button>
  );
}

// Roughly 6 card-heights tall — the rest scrolls within the column, independent of the page.
const VISIBLE_ROWS_HEIGHT = "520px";

function StageColumn({ stage, items, onOpen }: { stage: DealStage; items: Deal[]; onOpen: (id: string) => void }) {
  const meta = STAGE_META[stage];
  const total = items.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="flex min-w-0 flex-col rounded-xl bg-surface-2/60">
      <div className={`flex items-center justify-between gap-2 rounded-t-xl px-3 py-2.5 ${meta.header}`}>
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className={`size-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
          <span className="truncate text-[13px] font-semibold text-ink">{meta.label}</span>
        </span>
        <span className="shrink-0 rounded-full bg-surface px-1.5 text-[12px] num text-muted">{items.length}</span>
      </div>
      <div className="px-3 pb-2 pt-1.5 text-[12px] num text-muted">{total ? fmtINR(total, true) : "—"}</div>
      <div className={`no-scrollbar overflow-y-auto px-3 pb-3 ${items.length === 0 ? "flex" : "space-y-2"}`} style={{ height: VISIBLE_ROWS_HEIGHT }}>
        {items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line text-center text-[12px] text-faint">No deals</div>
        ) : (
          items.map((d) => <DealCard key={d.id} deal={d} stage={stage} onClick={() => onOpen(d.id)} />)
        )}
      </div>
    </div>
  );
}

export function FollowUpBoard({ initialQuery = "" }: { initialQuery?: string; initialOpen?: string | null }) {
  const { deals, leads, data, team, customers: zohoCustomers } = useStore();
  const [q, setQ] = useState(initialQuery);
  const [priority, setPriority] = useState<Priority | "all">("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [leadModal, setLeadModal] = useState<{ open: boolean; row: Lead | null }>({ open: false, row: null });

  const uniqSorted = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const owners = useMemo(() => uniqSorted([...team, ...leads.map((l) => l.owner ?? "")]), [team, leads]);
  const customers = useMemo(
    () => uniqSorted([...zohoCustomers, ...(data?.trainings ?? []).map((t) => t.customerName), ...deals.map((d) => d.customerName)]),
    [zohoCustomers, data, deals],
  );
  const trainingTypes = useMemo(() => uniqSorted(deals.map((d) => d.trainingType)), [deals]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return deals
      .filter((d) => priority === "all" || d.priority === priority)
      .filter((d) => !needle || [d.customerName, d.trainingType, d.quotationDocNumber, d.performaDocNumber, d.invoiceDocNumber].some((v) => v?.toLowerCase().includes(needle)))
      .sort((a, b) => (sort === "amount" ? b.amount - a.amount : b.updatedAt.localeCompare(a.updatedAt)));
  }, [deals, q, priority, sort]);

  const columns = useMemo(
    () => STAGE_ORDER.map((stage) => ({ stage, items: filtered.filter((d) => dealStage(d) === stage) })),
    [filtered],
  );

  const drawerDeal = filtered.find((d) => d.id === drawerId) ?? deals.find((d) => d.id === drawerId) ?? null;
  const totalValue = filtered.reduce((s, d) => s + d.amount, 0);

  return (
    <>
      <PageHeader
        title="Follow-ups"
        sub={`Every client engagement, tracked from lead to payment received · ${filtered.length} deals · ${fmtINR(totalValue, true)}`}
        actions={<button className={btn.primary} onClick={() => setLeadModal({ open: true, row: null })}>New lead</button>}
      />
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="relative w-full sm:w-64">
            <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="9" cy="9" r="5.5" /><path d="M13.5 13.5 17 17" strokeLinecap="round" /></svg>
            <input className={`${inputCls} !h-9 pl-8 text-[13px]`} placeholder="Search client, training, invoice" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className={selectCls} value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} aria-label="Priority">
            <option value="all">Any priority</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select className={selectCls} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
            <option value="recent">Most recent activity</option>
            <option value="amount">Sort by amount</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="text-[14px] font-medium text-ink">Nothing here</div>
            <p className="mt-1 text-[13px] text-muted">No deals match this view.</p>
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-2 p-4">
            {columns.map(({ stage, items }) => (
              <StageColumn key={stage} stage={stage} items={items} onOpen={setDrawerId} />
            ))}
          </div>
        )}
      </div>

      <Drawer
        deal={drawerDeal}
        onClose={() => setDrawerId(null)}
        onEditLead={(id) => {
          const row = leads.find((l) => l.id === id) ?? null;
          setDrawerId(null);
          setLeadModal({ open: true, row });
        }}
      />
      <LeadModal
        open={leadModal.open}
        onClose={() => setLeadModal({ open: false, row: null })}
        initial={leadModal.row}
        customers={customers}
        owners={owners}
        trainingTypes={trainingTypes}
      />
    </>
  );
}
