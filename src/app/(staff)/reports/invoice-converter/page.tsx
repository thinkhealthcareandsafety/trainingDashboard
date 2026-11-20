"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { BoqQuote } from "@/components/BoqQuote";
import { InvoiceConverter } from "@/components/InvoiceConverter";
import { useSession } from "@/lib/session";
import { canConvertInvoices } from "@/lib/roles";

// Reports → Invoice Converter (owner, 17 Nov): each customer's invoices with their PO and e-way bill, completed from here.
// Its second section (owner, 20 Nov): a customer's BOQ sheet → a temporary quotation, items and prices filled in.
type Tab = "invoices" | "boq";
const TABS: { key: Tab; label: string; sub: string }[] = [
  { key: "invoices", label: "Invoices", sub: "Each customer's invoices: the purchase order and, over ₹50,000, the e-way bill. Add what's missing; it goes straight to the invoice in Zoho Books." },
  { key: "boq", label: "Sheet → Quotation", sub: "Upload any customer sheet of items (BOQ, enquiry, requirement list): our items and prices are filled in for a temporary quotation. Check, change, save, and download it as Excel." },
];

export default function InvoiceConverterPage() {
  const { member } = useSession();
  const [tab, setTab] = useState<Tab>("invoices");
  // ?tab=boq opens the BOQ section (read after the first paint, so the server's page and the browser's agree).
  useEffect(() => { if (new URLSearchParams(window.location.search).get("tab") === "boq") setTab("boq"); }, []);
  const pick = (t: Tab) => {
    setTab(t);
    const u = new URL(window.location.href);
    if (t === "boq") u.searchParams.set("tab", "boq"); else u.searchParams.delete("tab");
    window.history.replaceState(null, "", u);
  };
  const now = TABS.find((t) => t.key === tab)!;
  if (member && !canConvertInvoices(member)) return <><PageHeader title="Invoice Converter" sub={now.sub} /><p className="card p-6 text-[14px] text-muted">This page is for the people who make and check invoices.</p></>;
  return (
    <>
      <PageHeader title="Invoice Converter" sub={now.sub} />
      <div role="tablist" aria-label="Section" className="mb-4 inline-flex rounded-xl bg-surface-2 p-1">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => pick(t.key)}
            className={`h-9 rounded-lg px-4 text-[13px] font-medium transition ${tab === t.key ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>{t.label}</button>
        ))}
      </div>
      {tab === "invoices" ? <InvoiceConverter /> : <BoqQuote />}
    </>
  );
}
