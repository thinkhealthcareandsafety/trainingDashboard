"use client";

import { PageHeader } from "@/components/AppShell";
import { SprintsBoard } from "@/components/SprintsBoard";

// Reports → Zoho Sprints (owner, 18 Nov): in the Progress tracker's place, for everyone.
export default function SprintsPage() {
  return (
    <>
      <PageHeader title="Zoho Sprints" sub="The team's sprint board, live from Zoho Sprints." />
      <SprintsBoard />
    </>
  );
}
