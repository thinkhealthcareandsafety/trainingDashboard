"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/AppShell";
import { Reports } from "@/components/reports/Reports";
import { useSession } from "@/lib/session";
import { canConvertInvoices, canSee, homeOf } from "@/lib/roles";

export default function ReportsPage() {
  const { member } = useSession();
  const router = useRouter();
  // The dashboards are Books money — Training-board members only. Everyone else: the Invoice Converter (logistics), else Sprints.
  const money = member ? canSee(member, "reports") : true;
  useEffect(() => { if (!money) router.replace(member && canConvertInvoices(member) ? "/reports/invoice-converter" : member ? homeOf(member) : "/sprints"); }, [money, router]);
  // Owner, 26 Nov (the host paused the site for using too much server time): nothing is worked out until someone asks.
  const [show, setShow] = useState(false);
  if (!money) return null;
  return (
    <>
      <PageHeader title="Reports" sub="All of Zoho Books and the boards — click any bar to drill in, or build your own report." />
      {show ? <Reports /> : (
        <section className="card flex flex-col items-center gap-4 px-6 py-14 text-center">
          <p className="max-w-[52ch] text-[15px] text-muted">The reports are worked out from all of Zoho Books, which takes a moment. They load only when you ask for them.</p>
          <button type="button" onClick={() => setShow(true)} className="press h-11 rounded-full bg-brand px-6 text-[14px] font-semibold text-brand-ink shadow-[0_6px_16px_-8px_color-mix(in_srgb,var(--brand)_70%,transparent)] hover:brightness-110">Click to see reports</button>
        </section>
      )}
    </>
  );
}
