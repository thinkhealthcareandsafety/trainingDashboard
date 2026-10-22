"use client";

import { PageHeader } from "@/components/AppShell";
import { Reports } from "@/components/reports/Reports";

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" sub="Dashboards and reports on all of Zoho Books and the boards — filter anything, click a bar to drill in, or build your own." />
      <Reports />
    </>
  );
}
