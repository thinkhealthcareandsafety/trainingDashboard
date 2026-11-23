"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { homeOf } from "@/lib/roles";

// The folders page here was dropped (owner, 23 Nov: "scrape it, just keep the application page"); old links land on
// the person's first page of the Training Dashboard.
export default function TrainingDashboardHome() {
  const { member } = useSession();
  const router = useRouter();
  useEffect(() => { if (member) router.replace(homeOf(member)); }, [member, router]);
  return null;
}
