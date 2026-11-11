"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/AppShell";
import { Reports } from "@/components/reports/Reports";
import { useSession } from "@/lib/session";
import { boardsFor } from "@/lib/roles";

export default function ReportsPage() {
  const { member } = useSession();
  const router = useRouter();
  // The dashboards are Books money — Training-board members only. Everyone else's Reports is the Progress tracker (D9).
  const money = member ? boardsFor(member).includes("training") : true;
  useEffect(() => { if (!money) router.replace("/reports/progress-tracker"); }, [money, router]);
  if (!money) return null;
  return (
    <>
      <PageHeader title="Reports" sub="All of Zoho Books and the boards — click any bar to drill in, or build your own report." />
      <Reports />
    </>
  );
}
