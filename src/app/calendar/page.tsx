"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { FullCalendar } from "@/components/Calendar";
import { PageHeader } from "@/components/AppShell";

function CalendarPageInner() {
  const date = useSearchParams().get("date") ?? undefined;
  return (
    <>
      <PageHeader title="Calendar" sub="Meetings, notes and key dates. Each day takes the colour of its highest-priority entry." />
      <FullCalendar key={date ?? "today"} initialDate={date} />
    </>
  );
}

export default function CalendarPage() {
  return (
    <Suspense>
      <CalendarPageInner />
    </Suspense>
  );
}
