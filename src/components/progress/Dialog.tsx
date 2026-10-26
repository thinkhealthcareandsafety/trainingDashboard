"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "../ui";

/**
 * A popup over the whole page, centred on the screen (portal — inside the page a fixed overlay can centre on the
 * whole long page, HANDOFF §11 #9). Esc / the backdrop / × close it; `z` lets a second popup sit on top of a first.
 */
export function Dialog({ title, sub, onClose, children, footer, width = 560, z = 70 }: {
  title: React.ReactNode; sub?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; width?: number; z?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey);
    const body = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = body; };
  }, [onClose]);
  return createPortal(
    <div className="fade-in fixed inset-0 grid place-items-center bg-black/25 p-3 backdrop-blur-sm sm:p-4" style={{ zIndex: z }} onMouseDown={onClose}>
      <div role="dialog" aria-modal className="modal-in flex max-h-[92vh] w-full flex-col overflow-hidden rounded-[20px] bg-surface shadow-pop" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 pb-3 pt-4">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold leading-snug tracking-tight text-ink">{title}</h2>
            {sub && <div className="mt-0.5 text-[13px] text-muted">{sub}</div>}
          </div>
          <IconButton label="Close" onClick={onClose}><path d="M5 5l10 10M15 5L5 15" /></IconButton>
        </div>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
