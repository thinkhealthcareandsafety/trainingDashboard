"use client";

import { useState } from "react";
import type { Member } from "@/lib/types";
import { useStore } from "@/lib/store";
import { Avatar, btn, inputCls } from "../ui";

/** Shown every time Follow-ups opens: pick who you are, or add yourself. Changes are recorded under this name. */
export function MembersScreen({ onPick }: { onPick: (m: Member) => void }) {
  const { members, addMember } = useStore();
  const [adding, setAdding] = useState(members.length === 0);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (clean.length < 2) return setError("Enter a username (at least 2 characters).");
    onPick(addMember(clean));
  };

  return (
    <div className="mx-auto mt-10 max-w-md">
      <div className="card p-6">
        <h1 className="text-[20px] font-semibold tracking-tight">Who&apos;s working on follow-ups?</h1>
        <p className="mt-1 text-[13px] text-muted">Every change you make is recorded under your name.</p>

        {sorted.length > 0 && (
          <ul className="mt-5 space-y-1.5">
            {sorted.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => onPick(m)}
                  className="press flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left text-[14px] font-medium text-ink hover:border-line-strong hover:bg-surface-2/60"
                >
                  <Avatar name={m.name} />
                  {m.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {sorted.length === 0 && <p className="mt-5 text-[13px] text-muted">No members yet — add yourself to get started.</p>}

        {adding ? (
          <form onSubmit={submit} className="mt-5 space-y-2">
            <input
              autoFocus
              className={inputCls}
              placeholder="Your username"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              aria-label="Username"
            />
            {error && <p className="text-xs text-high">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              {sorted.length > 0 && <button type="button" className={btn.ghost} onClick={() => setAdding(false)}>Cancel</button>}
              <button type="submit" className={btn.primary}>Continue</button>
            </div>
          </form>
        ) : (
          <button className={`${btn.ghost} mt-4 w-full`} onClick={() => setAdding(true)}>+ Add new member</button>
        )}
      </div>
    </div>
  );
}
