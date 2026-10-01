"use client";

import { useState } from "react";
import type { Member } from "@/lib/types";
import { useStore } from "@/lib/store";
import { Avatar, btn, inputCls } from "../ui";

/** Signs in as the admin (PIN in ADMIN_PIN on the server); changes are recorded as "Admin". */
const ADMIN: Member = { id: "admin", name: "Admin", createdAt: "" };
const newId = () => Math.random().toString(36).slice(2, 10);

async function post(url: string, body: object): Promise<{ ok: boolean; error?: string; token?: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; token?: string };
    return res.ok && json.ok ? { ok: true, token: json.token } : { ok: false, error: json.error ?? "Something went wrong" };
  } catch {
    return { ok: false, error: "Can't reach the server" };
  }
}

function PinField({ value, onChange, label, autoFocus }: { value: string; onChange: (v: string) => void; label: string; autoFocus?: boolean }) {
  return (
    <input
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={4}
      className={`${inputCls} num text-center text-[18px] tracking-[0.5em]`}
      placeholder="••••"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
      aria-label={label}
      autoFocus={autoFocus}
    />
  );
}

const ShieldBadge = () => (
  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-surface" aria-hidden>
    <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M10 2.5 4 5v4.5c0 3.6 2.6 6.6 6 7.5 3.4-.9 6-3.9 6-7.5V5l-6-2.5Z" /></svg>
  </span>
);

/** Shown every time Follow-ups opens: pick who you are and enter your PIN. Changes are recorded under this name. */
export function MembersScreen({ onPick }: { onPick: (m: Member, token: string) => void }) {
  const { members, addMember } = useStore();
  const [who, setWho] = useState<Member | null>(null);
  const [adding, setAdding] = useState(false);
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name));

  const back = () => {
    setWho(null);
    setAdding(false);
    setPin("");
    setNewPin("");
    setAdminPin("");
    setError("");
  };

  const signIn = async (value: string) => {
    if (!who || value.length !== 4 || busy) return;
    setBusy(true);
    const r = await post("/api/members/sign-in", { memberId: who.id, pin: value });
    setBusy(false);
    if (r.ok && r.token) return onPick(who, r.token);
    setError(r.error ?? "Wrong PIN");
    setPin("");
  };
  // Signs in as soon as the 4th digit is typed.
  const typePin = (v: string) => {
    setPin(v);
    setError("");
    if (v.length === 4) void signIn(v);
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (clean.length < 2) return setError("Enter a username (at least 2 characters).");
    if (clean.toLowerCase() === "admin" || members.some((m) => m.name.toLowerCase() === clean.toLowerCase())) return setError(`“${clean}” is already a member.`);
    if (newPin.length !== 4) return setError("Choose a 4-digit PIN for the new member.");
    if (adminPin.length !== 4) return setError("Enter the admin PIN to add a member.");
    setBusy(true);
    const id = newId();
    const r = await post("/api/members/pin", { adminPin, memberId: id, pin: newPin });
    if (!r.ok) return (setBusy(false), setError(r.error ?? "Couldn't add the member"));
    // Signed straight in as the new member.
    const s = await post("/api/members/sign-in", { memberId: id, pin: newPin });
    setBusy(false);
    const m = addMember(clean, id);
    if (s.ok && s.token) onPick(m, s.token);
    else setError(s.error ?? "Added — now pick the name to sign in.");
  };

  return (
    <div className="mx-auto mt-10 max-w-md">
      <div className="card p-6">
        {who ? (
          <form onSubmit={(e) => { e.preventDefault(); void signIn(pin); }}>
            <div className="flex items-center gap-3">
              {who.id === ADMIN.id ? <ShieldBadge /> : <Avatar name={who.name} />}
              <div className="min-w-0">
                <h1 className="truncate text-[20px] font-semibold tracking-tight">{who.name}</h1>
                <p className="text-[13px] text-muted">Enter your 4-digit PIN.</p>
              </div>
            </div>
            <div className="mt-5">
              <PinField value={pin} onChange={typePin} label={`PIN for ${who.name}`} autoFocus />
            </div>
            {error && <p className="mt-2 text-[13px] font-medium text-high">{error}</p>}
            <div className="mt-4 flex justify-between gap-2">
              <button type="button" className={btn.ghost} onClick={back}>Back</button>
              <button type="submit" className={btn.primary} disabled={pin.length !== 4 || busy}>{busy ? "Checking…" : "Sign in"}</button>
            </div>
          </form>
        ) : adding ? (
          <form onSubmit={add} className="space-y-3">
            <div>
              <h1 className="text-[20px] font-semibold tracking-tight">Add a new member</h1>
              <p className="mt-1 text-[13px] text-muted">The admin PIN is needed to add someone.</p>
            </div>
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-ink-2">Username</span>
              <input autoFocus className={inputCls} placeholder="Full name" value={name} onChange={(e) => { setName(e.target.value); setError(""); }} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[13px] font-medium text-ink-2">Their PIN</span>
                <PinField value={newPin} onChange={(v) => { setNewPin(v); setError(""); }} label="New member's PIN" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[13px] font-medium text-ink-2">Admin PIN</span>
                <PinField value={adminPin} onChange={(v) => { setAdminPin(v); setError(""); }} label="Admin PIN" />
              </label>
            </div>
            {error && <p className="text-[13px] font-medium text-high">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={btn.ghost} onClick={back}>Cancel</button>
              <button type="submit" className={btn.primary} disabled={busy}>{busy ? "Adding…" : "Add & continue"}</button>
            </div>
          </form>
        ) : (
          <>
            <h1 className="text-[20px] font-semibold tracking-tight">Who&apos;s working on follow-ups?</h1>
            <p className="mt-1 text-[13px] text-muted">Pick your name and enter your PIN. Every change you make is recorded under your name.</p>
            {sorted.length > 0 ? (
              <ul className="mt-5 space-y-1.5">
                {sorted.map((m) => (
                  <li key={m.id}>
                    <button
                      onClick={() => setWho(m)}
                      className="press flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left text-[14px] font-medium text-ink hover:border-line-strong hover:bg-surface-2/60"
                    >
                      <Avatar name={m.name} />
                      {m.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 text-[13px] text-muted">No members yet — the admin can add the first one.</p>
            )}
            <button
              onClick={() => setWho(ADMIN)}
              className="press mt-3 flex w-full items-center gap-3 rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-[14px] font-medium text-ink-2 hover:border-line-strong hover:bg-surface-2/60"
            >
              <ShieldBadge />
              Admin
            </button>
            <button className={`${btn.ghost} mt-4 w-full`} onClick={() => setAdding(true)}>+ Add new member</button>
          </>
        )}
      </div>
    </div>
  );
}
