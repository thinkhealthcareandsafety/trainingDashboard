"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/session";
import { type LinkApp, type Section, pageSections } from "@/lib/apps";
import { APP_ICONS } from "./appIcons";
import "./launcher.css";

/*
 * The apps home page (owner, 23 Nov; rules in lib/apps.ts). Two quiet pages in one look:
 *  - the main page (/): the applications as big icons — Training Dashboard (ours), then the ones Admin adds as links,
 *    which open in the same tab (Back returns here);
 *  - inside Training Dashboard (/dashboard): our pages as big icons, "All apps" back.
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

// A folder's mark: what the section is about, drawn on the folder's front (like a Windows folder's overlay).
const SECTION_GLYPH: Record<Section, React.ReactNode> = {
  Overview: <path d="M3.5 4.5h5v5h-5zM11.5 4.5h5v5h-5zM3.5 12.5h5v3h-5zM11.5 12.5h5v3h-5z" />,
  Sales: <path d="M6 3.5h6l3 3v10H6zM12 3.5v3h3M8.5 10h4M8.5 13h4" />,
  Inventory: <path d="M3.5 6.5 10 3.5l6.5 3v7L10 16.5l-6.5-3zM3.5 6.5 10 9.5l6.5-3M10 9.5v7" />,
  Utilities: <path d="M12.5 3.5a3.5 3.5 0 0 0-3.3 4.6L3.8 13.5a1.5 1.5 0 0 0 2.1 2.1l5.4-5.4a3.5 3.5 0 0 0 4.6-3.3l-2 2-2-.6-.6-2z" />,
};
/** A folder in the File Explorer style the owner pointed to (23 Nov): a back flap, a front, the section's mark. */
function Folder({ section }: { section: Section }) {
  return (
    <svg viewBox="0 0 64 52" width="64" height="52" aria-hidden className="lx-folder">
      <path d="M4 8a4 4 0 0 1 4-4h14.3a4 4 0 0 1 2.8 1.2L29 9h27a4 4 0 0 1 4 4v4H4z" fill="#E3A21A" />
      <rect x="4" y="13" width="56" height="35" rx="4" fill="#FFC83D" />
      <rect x="4" y="13" width="56" height="3" rx="1.5" fill="#FFD76E" />
      <g transform="translate(22 21) scale(1)">
        <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="#8A5A00" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{SECTION_GLYPH[section]}</svg>
      </g>
    </svg>
  );
}
const slug = (s: Section) => s.toLowerCase();

/*
 * Inside Training Dashboard (owner, 23 Nov: "this rather better looks like this" — a File Explorer window of folders):
 * the sections as folders; a folder opens to its pages. The open folder is in the address (?f=sales), so Back closes it.
 */
export function DashboardHomeView({ member, signOut }: { member: Who; signOut: () => void }) {
  const sections = pageSections(member);
  const [open, setOpen] = useState<Section | null>(null);
  useEffect(() => {
    const read = () => { const f = new URLSearchParams(window.location.search).get("f"); setOpen(sections.find((s) => slug(s.section) === f)?.section ?? null); };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- the sections don't change while the page is open
  const go = (s: Section | null) => {
    window.history.pushState(null, "", s ? `/dashboard?f=${slug(s)}` : "/dashboard");
    setOpen(s);
  };
  const folder = sections.find((s) => s.section === open);
  return (
    <div className="lx">
      <Top member={member} signOut={signOut} back />
      <main className="lx-ex">
        <nav className="lx-crumbs" aria-label="Where you are">
          {folder ? <button type="button" onClick={() => go(null)}>Training Dashboard</button> : <span aria-current="page">Training Dashboard</span>}
          {folder && <><svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 5l5 5-5 5" /></svg><span aria-current="page">{folder.section}</span></>}
        </nav>
        {folder ? (
          <div className="lx-files">
            {folder.pages.map((p) => (
              <Link key={p.id} href={p.href} className="lx-file">
                <span className="lx-ic" style={{ background: p.color }}><Glyph size={28}>{ICONS[p.icon]}</Glyph></span>
                <span className="lx-name">{p.name}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="lx-files">
            {sections.map((s) => (
              <button key={s.section} type="button" className="lx-file" onClick={() => go(s.section)} title={s.pages.map((p) => p.name).join(", ")}>
                <Folder section={s.section} />
                <span className="lx-name">{s.section}</span>
                {/* What's inside, as the pages' own little icons (owner, 23 Nov: "not pages, make it icons"). */}
                <span className="lx-peek" aria-hidden>
                  {s.pages.map((p) => <span key={p.id} style={{ background: p.color }}><Glyph size={11}>{ICONS[p.icon]}</Glyph></span>)}
                </span>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
