"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/session";
import { type LinkApp } from "@/lib/apps";
import { homeOf } from "@/lib/roles";
import { APP_ICONS } from "./appIcons";
import "./launcher.css";

/*
 * The apps home page (owner, 23 Nov; rules in lib/apps.ts): the applications as big icons — Training Dashboard (ours,
 * straight into its first page; the folders page in between was dropped: "scrape it, just keep the application page"),
 * then the ones Admin adds as links, which open in the same tab (Back returns here).
 */

const ICONS = APP_ICONS;
const Glyph = ({ children, size = 34 }: { children: React.ReactNode; size?: number }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const greet = (d: Date) => (d.getHours() < 12 ? "Good morning" : d.getHours() < 17 ? "Good afternoon" : "Good evening");
const first = (name: string) => name.trim().split(/\s+/)[0] ?? "";
const host = (url: string) => { try { return new URL(url).hostname; } catch { return ""; } };
// An application without a picture gets its first letter on a colour of its own (the same colour every time).
const TINTS = ["#034f72", "#00843d", "#005387", "#9a5b00", "#7a4fc0", "#b42318", "#1f6f8b", "#5a6b2f"];
const tint = (s: string) => TINTS[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % TINTS.length];

type Who = { id: string; name: string };

function Top({ member, signOut }: { member: Who; signOut: () => void }) {
  return (
    <header className="lx-top">
      <span className="lx-mark">think<span>health</span></span>
      <span className="lx-me"><span>{member.name}</span><button type="button" onClick={signOut}>Sign out</button></span>
    </header>
  );
}

/* ---------------- The main page: applications ---------------- */

export function Launcher() {
  const { member, signOut } = useSession();
  if (!member) return null;
  return <LauncherView member={member} signOut={signOut} />;
}

export function LauncherView({ member, signOut }: { member: Who; signOut: () => void }) {
  const [hello, setHello] = useState("");
  useEffect(() => { setHello(greet(new Date())); }, []);
  const [apps, setApps] = useState<LinkApp[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => {
    fetch("/api/apps").then((r) => r.json()).then((j) => { setApps(j.apps ?? []); setCanEdit(Boolean(j.canEdit)); }).catch(() => setApps([]));
  }, []);
  const [error, setError] = useState("");
  const remove = async (a: LinkApp) => {
    if (!window.confirm(`Take ${a.name} off the page for everyone?`)) return;
    const r = await fetch(`/api/apps?id=${encodeURIComponent(a.id)}`, { method: "DELETE" }).then((x) => x.json()).catch(() => ({ error: "Couldn't reach the server" }));
    if (r.error) return setError(r.error);
    setApps(r.apps);
  };

  return (
    <div className="lx">
      <Top member={member} signOut={signOut} />
      <main className="lx-in">
        <h1>{hello ? `${hello}, ${first(member.name)}.` : " "}</h1>
        <nav className="lx-grid lx-big" aria-label="Applications">
          <Link href={homeOf(member)} className="lx-tile">
            <span className="lx-ic" style={{ background: "#034f72" }}><Glyph>{ICONS.reports}</Glyph></span>
            <span className="lx-name">Training Dashboard</span>
          </Link>
          {(apps ?? []).map((a) => (
            <div key={a.id} className="lx-sw">
              {/* Same tab (owner): their website opens here, and Back comes back to this page. */}
              <a href={a.url} className="lx-tile" title={a.url}>
                <AppPicture a={a} />
                <span className="lx-name">{a.name}</span>
              </a>
              {canEdit && (
                <button type="button" className="lx-x" aria-label={`Remove ${a.name}`} title="Remove" onClick={() => remove(a)}>
                  <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></svg>
                </button>
              )}
            </div>
          ))}
          {canEdit && apps && <AddApp onAdded={(l) => { setApps(l); setError(""); }} onError={setError} />}
        </nav>
        {error && <p className="lx-err">{error}</p>}
      </main>
    </div>
  );
}

function AddApp({ onAdded, onError }: { onAdded: (l: LinkApp[]) => void; onError: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    const r = await fetch("/api/apps", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, name }) }).then((x) => x.json()).catch(() => ({ error: "Couldn't reach the server" }));
    setBusy(false);
    if (r.error) return onError(r.error);
    onAdded(r.apps); setUrl(""); setName(""); setOpen(false);
  };
  return (
    <>
      <button type="button" className="lx-tile" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="lx-ic lx-plus"><svg viewBox="0 0 20 20" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><path d="M10 4.5v11M4.5 10h11" /></svg></span>
        <span className="lx-name">Add application</span>
      </button>
      {open && (
        <form className="lx-form" onSubmit={(e) => { e.preventDefault(); if (url.trim()) add(); }} onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Application name" aria-label="Application name" maxLength={40} />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Its link, e.g. their-app.vercel.app" aria-label="Link" inputMode="url" />
          <button type="submit" disabled={busy || !url.trim()}>{busy ? "Adding…" : "Add"}</button>
        </form>
      )}
    </>
  );
}

/**
 * The application's picture (owner, 24 Nov): the site's own icon filling the tile (/api/apps/icon), else Google's favicon
 * (16px globe = none), else the site's small old-style icon, else its first letter.
 */
function AppPicture({ a }: { a: LinkApp }) {
  const [stage, setStage] = useState(0);
  const h = host(a.url);
  const own = `/api/apps/icon?id=${encodeURIComponent(a.id)}`;
  const next = () => setStage((s) => s + 1);
  if (!h || stage > 2) return <span className="lx-ic" style={{ background: tint(a.name) }}><b>{a.name.charAt(0).toUpperCase()}</b></span>;
  /* eslint-disable @next/next/no-img-element -- any site's icon */
  if (stage === 0) return <span className="lx-ic lx-own"><img key="own" src={own} alt="" onError={next} /></span>;
  const src = stage === 1 ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=128` : `${own}&any=1`;
  return <span className="lx-ic lx-site"><img key={stage} src={src} alt="" width={40} height={40} onError={next} onLoad={(e) => { if (stage === 1 && e.currentTarget.naturalWidth < 32) next(); }} /></span>;
  /* eslint-enable @next/next/no-img-element */
}
