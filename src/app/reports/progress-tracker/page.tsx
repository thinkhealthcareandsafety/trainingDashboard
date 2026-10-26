"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/AppShell";
import { ProgressTracker } from "@/components/progress/ProgressTracker";
import { TrackerInfo } from "@/components/progress/Info";

// Reports → Progress tracker (owner, 26 Oct: "it goes under report, section"). ?task=<card id>&title=…&q=… comes from
// a board card's "Ask a teammate"; ?request=<id> from a notice.
function Inner() {
  const sp = useSearchParams();
  const task = sp.get("task");
  const title = sp.get("title") ?? undefined;
  return (
    <ProgressTracker
      initialTask={task || title ? { cardId: task ?? undefined, title, search: sp.get("q") ?? undefined } : undefined}
      initialRequest={sp.get("request") ?? undefined}
    />
  );
}

export default function ProgressTrackerPage() {
  return (
    <>
      <PageHeader title="Progress tracker" titleAside={<TrackerInfo />} sub="What everyone needs to do, what they've done, and who's waiting on whom — read from the boards." />
      <Suspense>
        <Inner />
      </Suspense>
    </>
  );
}
