"use client";

import { PageHeader } from "@/components/AppShell";
import { ExternalLeads } from "@/components/ExternalLeads";
import { useSession } from "@/lib/session";
import { canSee } from "@/lib/roles";

// External Leads (owner, 27 Nov): the important leads, product buyers who may also book trainings. lib/externalLeads.ts.
export default function ExternalLeadsPage() {
  const { member } = useSession();
  if (member && !canSee(member, "quotations")) return <PageHeader title="External Leads" sub="External leads aren't on your account." />;
  return (
    <>
      <PageHeader title="External Leads" sub="Important leads we add ourselves: they buy our products and may book trainings too. Each one is made a customer in Zoho Books." />
      <ExternalLeads />
    </>
  );
}
