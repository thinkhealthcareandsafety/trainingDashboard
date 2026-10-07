"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { KIND_LABEL, describeEvent, kindOfId } from "@/lib/pipeline";
import { fmtDate, fmtTime } from "@/lib/dates";
import { btn } from "./ui";

/** Card labels aren't at hand here; most changes carry their own (merges store both cards' names). */
const labelOf = (id: string) => KIND_LABEL[kindOfId(id)] ?? "card";
const when = (at: string) => `${fmtDate(at)}, ${fmtTime(at)}`;

/**
 * "Revert this change?" — shown when a revert would also revert later steps of the same flow (cascade.ts), listing
 * each one with who made it, so nothing disappears unexpectedly. Above every modal.
 */
export function RevertConfirm() {
  const { pendingRevert: p, confirmRevert, cancelRevert } = useStore();
  useEffect(() => {
    if (!p) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") (e.stopPropagation(), cancelRevert()); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [p, cancelRevert]);
  if (!p) return null;
  const n = p.later.length;
  return (
    <div className="fade-in fixed inset-0 z-[90] grid place-items-center bg-black/35 p-4" onMouseDown={cancelRevert}>
      <div role="alertdialog" aria-label="Revert this change?" className="modal-in w-full max-w-lg rounded-2xl bg-surface p-5 shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="text-[17px] font-bold tracking-tight text-ink">Revert {p.targets.length > 1 ? "these changes" : "this change"}?</h3>
        <ul className="mt-2 space-y-1 text-[13.5px] text-ink">
          {p.targets.map((e) => <li key={e.id} className="font-semibold">{describeEvent(e, labelOf)}</li>)}
        </ul>
        <p className="mt-3 text-[13.5px] text-muted">
          It also reverts {n === 1 ? "the step that came after it" : `the ${n} steps that came after it`}, so the card goes back to where it was:
        </p>
        <ol className="no-scrollbar mt-2 max-h-[40vh] space-y-1.5 overflow-y-auto rounded-xl border border-line p-2.5">
          {p.later.map((e) => (
            <li key={e.id} className="text-[13px] leading-snug">
              <span className="text-ink-2">{describeEvent(e, labelOf)}</span>
              <span className="block text-[12px] text-muted">{e.by} · {when(e.at)}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex justify-end gap-2">
          <button className={btn.ghost} onClick={cancelRevert} autoFocus>Cancel</button>
          <button className={`${btn.primary} !bg-high !text-white`} onClick={confirmRevert}>Revert {n + p.targets.length} changes</button>
        </div>
      </div>
    </div>
  );
}
