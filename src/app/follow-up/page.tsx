"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { FollowUpBoard } from "@/components/FollowUps";

function Inner() {
  const sp = useSearchParams();
  return <FollowUpBoard key={sp.toString()} initialQuery={sp.get("q") ?? ""} initialOpen={sp.get("open")} />;
}

export default function FollowUpPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
