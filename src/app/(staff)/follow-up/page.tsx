"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/AppShell";
import { FollowUpBoard } from "@/components/FollowUps";
import { hasFollowUps } from "@/lib/roles";
import { useSession } from "@/lib/session";

function Inner() {
  const sp = useSearchParams();
  return <FollowUpBoard key={sp.toString()} initialQuery={sp.get("q") ?? ""} initialOpen={sp.get("open")} />;
}

export default function FollowUpPage() {
  const { member } = useSession();
  // Links from the Overview and the ticker can still land here.
  if (member && !hasFollowUps(member)) return <PageHeader title="Follow-ups" sub="Follow-ups aren't on your account yet." />;
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
