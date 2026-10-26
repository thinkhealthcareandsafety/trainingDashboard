"use client";

import { useState } from "react";
import { CATEGORIES, CATEGORY_ORDER, type Category, LIMITS, type Priority, type PtRequest, type Who } from "@/lib/progress/model";
import { btn, inputCls } from "../ui";
import { Dialog } from "./Dialog";
import { CategoryIcon, PersonAvatar, firstName } from "./bits";
import { call } from "./useProgress";

export type RequestDraft = { title?: string; cardId?: string; search?: string; waitingOnId?: string; category?: Category; note?: string };

/**
 * New request [S10, S13]: what kind (the four categories [S11], each with when to use it), who you're waiting on, what
 * it's about (pre-filled when it comes from a board card or a check-in line), a note, Normal / Urgent [S14].
 */
export function RequestForm({ me, team, draft, onClose, onCreated, z }: { me: Who; team: Who[]; draft?: RequestDraft; onClose: () => void; onCreated?: (r: PtRequest) => void; z?: number }) {
  const [category, setCategory] = useState<Category | null>(draft?.category ?? null);
  const [to, setTo] = useState(draft?.waitingOnId ?? "");
  const [title, setTitle] = useState(draft?.title ?? "");
  const [card, setCard] = useState(draft?.cardId ? { id: draft.cardId, search: draft.search } : null);
  const [note, setNote] = useState(draft?.note ?? "");
  const [priority, setPriority] = useState<Priority>("normal");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const others = team.filter((m) => m.id !== me.id);
  const missing = [!category && "what kind", !to && "who you're waiting on", !title.trim() && "what it's about"].filter(Boolean) as string[];

  const send = async () => {
    if (missing.length || sending) return;
    setSending(true);
    setError("");
    const j = await call<{ request?: PtRequest }>("/api/progress/requests", "POST", { category, priority, waitingOnId: to, title, note, cardId: card?.id, search: card?.search });
    setSending(false);
    if (j.error || !j.request) return setError(j.error ?? "Not sent");
    onCreated?.(j.request);
    onClose();
  };

  return (
    <Dialog title="Ask a teammate" sub="They see it on their card straight away; you can ping them after 4 hours." onClose={onClose} width={640} z={z}
      footer={<>
        {error && <span className="mr-auto text-[13.5px] font-medium text-high">{error}</span>}
        {!error && missing.length > 0 && <span className="mr-auto text-[13px] text-muted">Still to choose: {missing.join(", ")}</span>}
        <button className={btn.ghost} onClick={onClose}>Cancel</button>
        <button className={btn.primary} disabled={missing.length > 0 || sending} onClick={send}>{sending ? "Sending…" : "Send request"}</button>
      </>}>
      <div className="space-y-4">
        <section>
          <h3 className="mb-1.5 text-[13px] font-semibold text-ink-2">What do you need?</h3>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Kind of request">
            {CATEGORY_ORDER.map((c) => {
              const k = CATEGORIES[c];
              const on = category === c;
              return (
                <button key={c} type="button" role="radio" aria-checked={on} onClick={() => setCategory(c)}
                  className={`press flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition ${on ? "border-transparent ring-2 ring-brand" : "border-line hover:border-line-strong"}`}>
                  <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${k.tone}`}><CategoryIcon c={c} /></span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-ink">{k.label}</span>
                    <span className="block text-[12.5px] leading-snug text-muted">{k.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="mb-1.5 text-[13px] font-semibold text-ink-2">Who are you waiting on?</h3>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Waiting on">
            {others.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={to === m.id} onClick={() => setTo(m.id)}
                className={`press inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-[13.5px] font-medium ${to === m.id ? "bg-ink text-surface" : "bg-surface-2 text-ink-2 hover:bg-line"}`}>
                <PersonAvatar name={m.name} size={24} />
                {m.id === "admin" ? "Admin" : firstName(m.name)}
              </button>
            ))}
          </div>
        </section>

        <section>
          <label className="mb-1.5 block text-[13px] font-semibold text-ink-2" htmlFor="pt-title">What is it about?</label>
          {card && (
            <div className="mb-1.5 flex items-center gap-2 text-[13px] text-muted">
              <span className="rounded-md bg-brand-soft px-2 py-0.5 font-medium text-brand">From the board</span>
              <span className="min-w-0 truncate">{card.search ?? card.id}</span>
              <button type="button" className="ml-auto shrink-0 text-[12.5px] font-medium hover:text-ink hover:underline" onClick={() => setCard(null)}>Don't link the card</button>
            </div>
          )}
          <input id="pt-title" className={inputCls} value={title} maxLength={LIMITS.title} placeholder="e.g. Participant list for Saturday's training" onChange={(e) => setTitle(e.target.value)} />
        </section>

        <section>
          <label className="mb-1.5 block text-[13px] font-semibold text-ink-2" htmlFor="pt-note">Anything they should know? <span className="font-normal text-muted">(optional)</span></label>
          <textarea id="pt-note" className={`${inputCls} h-auto py-2`} rows={3} value={note} maxLength={LIMITS.note} placeholder="What exactly you need, and by when" onChange={(e) => setNote(e.target.value)} />
        </section>

        <section className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] font-semibold text-ink-2">Priority</span>
          <div className="inline-flex rounded-full bg-surface-2 p-0.5" role="radiogroup" aria-label="Priority">
            {(["normal", "urgent"] as const).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={priority === p} onClick={() => setPriority(p)}
                className={`rounded-full px-3.5 py-1 text-[13px] font-medium ${priority === p ? (p === "urgent" ? "bg-high text-white" : "bg-surface text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]") : "text-muted hover:text-ink"}`}>
                {p === "urgent" ? "Urgent" : "Normal"}
              </button>
            ))}
          </div>
          <span className="text-[12.5px] text-muted">Urgent = there's a deadline, not "it matters".</span>
        </section>
      </div>
    </Dialog>
  );
}
