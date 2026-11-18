"use client";

import { PageHeader } from "@/components/AppShell";
import { SprintsBoard } from "@/components/SprintsBoard";

// Sprints (owner, 18 Nov): Zoho Sprints' board, its own sidebar item in the Progress tracker's place, for everyone.
export default function SprintsPage() {
  return (
    <>
      <PageHeader title="Sprints" sub="The team's sprint board, live from Zoho Sprints." />
      <SprintsBoard />
    </>
  );
}
