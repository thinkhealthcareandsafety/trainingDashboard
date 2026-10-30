"use client";

import { useEffect, useRef, useState } from "react";

/** The (i) next to "Progress tracker" (owner, 26 Oct): what the page shows, where it comes from, what isn't tracked. */
export function TrackerInfo() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <span ref={box} className="relative inline-flex align-middle">
      <button type="button" aria-label="About the Progress tracker" aria-expanded={open} title="About the Progress tracker" onClick={() => setOpen(!open)}
        className={`press grid size-7 place-items-center rounded-full border text-[14px] font-bold italic leading-none transition ${open ? "border-ink bg-ink text-surface" : "border-line-strong text-muted hover:border-ink hover:text-ink"}`}>
        <span className="font-serif">i</span>
      </button>
      {open && (
        <div role="dialog" aria-label="About the Progress tracker" className="modal-in absolute left-0 top-9 z-40 w-[min(460px,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-4 text-left text-[13.5px] font-normal not-italic leading-snug tracking-normal text-ink-2 shadow-pop">
          <p className="text-[15px] font-semibold text-ink">What's on this page</p>
          <dl className="mt-2 space-y-2">
            <div><dt className="font-semibold text-ink">Everyone's to-do</dt><dd>What each person needs to do — overdue, today, the next 7 days — read straight from the boards: trainings to give, ones to mark completed or postpone, missing contact numbers, AED, certificate and shipping steps, meetings, and requests waiting on them. Nobody types it in.</dd></div>
            <div><dt className="font-semibold text-ink">Work done</dt><dd>Everything each person did on the boards in the last 7 days, recorded on its own from the change log (an undone change doesn't count), plus the requests they resolved.</dd></div>
            <div><dt className="font-semibold text-ink">Requests</dt><dd>Ask a teammate for input, a review or a hand-off, or flag a blocker — from here or from any card (the speech-bubble next to ×). Ping after 4 hours; anything open over a day turns red; resolving tells them to carry on.</dd></div>
            <div><dt className="font-semibold text-ink">Tagged</dt><dd>When a request is for you, or someone types @ and your name in its thread, you get a <span className="font-semibold text-high">red number</span> on Progress tracker. It stays until you reply in that request or resolve it.</dd></div>
            <div><dt className="font-semibold text-ink">Who sees what</dt><dd>Admin, Shikha, Sumit, Ashish and Nikita see everyone's columns; everyone else sees their own.</dd></div>
            <div><dt className="font-semibold text-ink">Active / Away</dt><dd>Active = the dashboard open on screen in the last 10 minutes; you can set Away or your focus on your own card. Nothing else is tracked — no screens, keys or apps, and no history of when anyone was online.</dd></div>
          </dl>
        </div>
      )}
    </span>
  );
}
