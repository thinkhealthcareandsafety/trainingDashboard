"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Sprints moved out of Reports to its own item (owner, 18 Nov); an old link lands there.
export default function Redirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/sprints"); }, [router]);
  return null;
}
