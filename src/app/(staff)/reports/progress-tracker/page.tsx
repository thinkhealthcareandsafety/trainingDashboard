"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The Progress tracker is hidden (owner, 18 Nov: "hide the progress tracker entirely"); Sprints is in its place.
// Old links (notices, bookmarks) land on Sprints. The tracker's code stays in components/progress.
export default function ProgressTrackerPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/sprints"); }, [router]);
  return null;
}
