"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { FullCalendar } from "@/components/Calendar";
import { PageHeader } from "@/components/AppShell";
import { useSession } from "@/lib/session";
import { seesWholeCalendar } from "@/lib/roles";

function CalendarPageInner() {
  const sp = useSearchParams();
  const date = sp.get("date") ?? undefined;
  const { member } = useSession();
  const whole = member ? seesWholeCalendar(member) : false;
  return (
    <>
      <PageHeader title="Calendar" sub={whole ? "Everyone's trainings, meetings and events — each person in their own colour." : "Your trainings, meetings and events — each person in their own colour."} />
      <FullCalendar key={sp.toString() || "today"} initialDate={date} openCard={sp.get("card") ?? undefined} openEntry={sp.get("entry") ?? undefined} />
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
