"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/session";
import { type AppIcon, type LinkApp, dashboardPages } from "@/lib/apps";
import "./launcher.css";

/*
 * The apps home page (owner, 23 Nov; rules in lib/apps.ts). Two quiet pages in one look:
 *  - the main page (/): the applications as big icons — Training Dashboard (ours), then the ones Admin adds as links,
 *    which open in the same tab (Back returns here);
 *  - inside Training Dashboard (/dashboard): our pages as big icons, "All apps" back.
 */

// The sidebar's icons (AppShell NAV), so a page looks the same here and there.
const ICONS: Record<AppIcon, React.ReactNode> = {
  overview: <path d="M3.5 4.5h5v5h-5zM11.5 4.5h5v5h-5zM3.5 12.5h5v3h-5zM11.5 12.5h5v3h-5z" />,
  quotations: <path d="M6 3.5h6l3 3v10H6zM12 3.5v3h3M8.5 10h4M8.5 13h4" />,
  trainings: <><path d="M10 3.5 3 7l7 3.5L17 7z" /><path d="M6 8.7v3.8c1 1.2 2.4 1.8 4 1.8s3-.6 4-1.8V8.7M17 7v4" /></>,
  items: <path d="M3.5 6.5 10 3.5l6.5 3v7L10 16.5l-6.5-3zM3.5 6.5 10 9.5l6.5-3M10 9.5v7" />,
  templates: <path d="M3.5 5.5h13v9h-13zM3.5 6l6.5 5 6.5-5" />,
  followups: <path d="M4 5.5h12M4 10h12M4 14.5h7" />,
  calendar: <><rect x="3.5" y="4.5" width="13" height="12" rx="2" /><path d="M3.5 8.5h13M7 3v3M13 3v3" /></>,
  sprints: <><rect x="3" y="3.5" width="14" height="13" rx="2" /><path d="M7.7 3.5v13M12.3 3.5v13M4.8 6.5h1.4M9.3 6.5h1.4M9.3 9h1.4M13.8 6.5h1.4" /></>,
  reports: <path d="M4 16V9M8.5 16V5M13 16v-4.5M16.5 16V7.5" />,
  converter: <path d="M5 2.5h7l3 3v12H5zM12 2.5v3h3M7.5 12l2 2 3.5-4" />,
  sheet: <path d="M3 4.5h8v11H3zM3 8h8M3 11.5h8M6.5 4.5v11M13 10h4M15 8l2 2-2 2" />,
};
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

function Top({ member, signOut, back }: { member: Who; signOut: () => void; back?: boolean }) {
  return (
    <header className="lx-top">
      {back ? (
        <Link href="/" className="lx-back"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 10H5M9 6l-4 4 4 4" /></svg>All apps</Link>
      ) : <span className="lx-mark">think<span>health</span></span>}
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
          <Link href="/dashboard" className="lx-tile">
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

/** The site's own icon (from Google's favicon service), or its first letter when there is none (Google's 16px globe = none). */
function AppPicture({ a }: { a: LinkApp }) {
  const [failed, setFailed] = useState(false);
  const h = host(a.url);
  if (failed || !h) return <span className="lx-ic" style={{ background: tint(a.name) }}><b>{a.name.charAt(0).toUpperCase()}</b></span>;
  // eslint-disable-next-line @next/next/no-img-element -- a remote icon, any site
  return <span className="lx-ic lx-site"><img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=128`} alt="" width={40} height={40} onError={() => setFailed(true)} onLoad={(e) => { if (e.currentTarget.naturalWidth < 32) setFailed(true); }} /></span>;
}

/* ---------------- Inside Training Dashboard ---------------- */

export function DashboardHome() {
  const { member, signOut } = useSession();
  if (!member) return null;
  return <DashboardHomeView member={member} signOut={signOut} />;
}

export function DashboardHomeView({ member, signOut }: { member: Who; signOut: () => void }) {
  return (
    <div className="lx">
      <Top member={member} signOut={signOut} back />
      <main className="lx-in">
        <h1>Training Dashboard</h1>
        <nav className="lx-grid lx-big" aria-label="Training Dashboard">
          {dashboardPages(member).map((p) => (
            <Link key={p.id} href={p.href} className="lx-tile">
              <span className="lx-ic" style={{ background: p.color }}><Glyph>{ICONS[p.icon]}</Glyph></span>
              <span className="lx-name">{p.name}</span>
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}
