"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/session";
import { type AppIcon, type Shortcut, appsFor, groupApps } from "@/lib/apps";
import "./launcher.css";

/*
 * The apps home page (owner, 23 Nov): "like Chrome's main page — they log in, they see the applications". Then (same
 * day): "not looking good — a base page where all applications are; make it minimalist". So: a quiet page, a short
 * greeting, every application as an icon with its name, then the person's own website shortcuts the same way.
 * Who sees which app: lib/apps.ts.
 */

// The sidebar's icons (AppShell NAV), so an app looks the same here and there.
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
const greet = (d: Date) => (d.getHours() < 12 ? "Good morning" : d.getHours() < 17 ? "Good afternoon" : "Good evening");
const first = (name: string) => name.trim().split(/\s+/)[0] ?? "";
const host = (url: string) => { try { return new URL(url).hostname; } catch { return ""; } };
// A shortcut without a picture gets its first letter on a colour of its own (the same colour every time).
const TINTS = ["#034f72", "#00843d", "#005387", "#9a5b00", "#7a4fc0", "#b42318", "#1f6f8b", "#5a6b2f"];
const tint = (s: string) => TINTS[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % TINTS.length];

export function Launcher() {
  const { member, signOut } = useSession();
  if (!member) return null;
  return <LauncherView member={member} signOut={signOut} />;
}

/** The page itself, from plain values (the wrapper above reads the session). */
export function LauncherView({ member, signOut }: { member: { id: string; name: string }; signOut: () => void }) {
  const [hello, setHello] = useState("");
  useEffect(() => { setHello(greet(new Date())); }, []);
  const [shortcuts, setShortcuts] = useState<Shortcut[] | null>(null);
  useEffect(() => { fetch("/api/shortcuts").then((r) => r.json()).then((j) => setShortcuts(j.shortcuts ?? [])).catch(() => setShortcuts([])); }, []);
  const apps = appsFor(member);

  return (
    <div className="lx">
      <header className="lx-top">
        <span className="lx-mark">think<span>health</span></span>
        <span className="lx-me"><span>{member.name}</span><button type="button" onClick={signOut}>Sign out</button></span>
      </header>
      <main className="lx-in">
        <h1>{hello ? `${hello}, ${first(member.name)}.` : " "}</h1>
        {/* One block per application (owner, 23 Nov: "under Training Dashboard comes all this stuff"); a colleague's app gets its own. */}
        {groupApps(apps).map((g) => (
          <section key={g.group} className="lx-group" aria-label={g.group}>
            <h2>{g.group}</h2>
            <nav className="lx-grid">
              {g.apps.map((a) => (
                <Link key={a.id} href={a.href} className="lx-tile">
                  <span className="lx-ic" style={{ background: a.color }}>
                    <svg viewBox="0 0 20 20" width="28" height="28" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[a.icon]}</svg>
                  </span>
                  <span className="lx-name">{a.name}</span>
                </Link>
              ))}
            </nav>
          </section>
        ))}
        <Shortcuts list={shortcuts} onChange={setShortcuts} />
      </main>
    </div>
  );
}

function Shortcuts({ list, onChange }: { list: Shortcut[] | null; onChange: (l: Shortcut[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const add = async () => {
    setBusy(true); setError("");
    const r = await fetch("/api/shortcuts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, name }) }).then((x) => x.json()).catch(() => ({ error: "Couldn't reach the server" }));
    setBusy(false);
    if (r.error) return setError(r.error);
    onChange(r.shortcuts); setUrl(""); setName(""); setAdding(false);
  };
  const remove = async (s: Shortcut) => {
    const r = await fetch(`/api/shortcuts?id=${encodeURIComponent(s.id)}`, { method: "DELETE" }).then((x) => x.json()).catch(() => ({ error: "Couldn't reach the server" }));
    if (r.error) return setError(r.error);
    onChange(r.shortcuts);
  };
  if (!list) return null;
  return (
    <section className="lx-shortcuts" aria-label="My shortcuts">
      <h2>My shortcuts</h2>
      <div className="lx-grid">
        {list.map((s) => (
          <div key={s.id} className="lx-sw">
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="lx-tile" title={s.url}>
              <Favicon s={s} />
              <span className="lx-name">{s.name}</span>
            </a>
            <button type="button" className="lx-x" aria-label={`Remove ${s.name}`} title="Remove" onClick={() => remove(s)}>
              <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></svg>
            </button>
          </div>
        ))}
        <button type="button" className="lx-tile" onClick={() => { setAdding((v) => !v); setError(""); }} aria-expanded={adding}>
          <span className="lx-ic lx-plus"><svg viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M10 4.5v11M4.5 10h11" /></svg></span>
          <span className="lx-name">Add shortcut</span>
        </button>
      </div>
      {adding && (
        <form className="lx-form" onSubmit={(e) => { e.preventDefault(); if (url.trim()) add(); }} onKeyDown={(e) => { if (e.key === "Escape") setAdding(false); }}>
          <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Web address, e.g. books.zoho.in" aria-label="Web address" inputMode="url" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" aria-label="Name" maxLength={40} />
          <button type="submit" disabled={busy || !url.trim()}>{busy ? "Adding…" : "Add"}</button>
        </form>
      )}
      {error && <p className="lx-err">{error}</p>}
    </section>
  );
}

/** The site's own icon (from Google's favicon service), or its first letter when there is none (Google's 16px globe = none). */
function Favicon({ s }: { s: Shortcut }) {
  const [failed, setFailed] = useState(false);
  const h = host(s.url);
  if (failed || !h) return <span className="lx-ic" style={{ background: tint(s.name) }}><b>{s.name.charAt(0).toUpperCase()}</b></span>;
  // eslint-disable-next-line @next/next/no-img-element -- a remote icon, any site
  return <span className="lx-ic lx-site"><img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=64`} alt="" width={28} height={28} onError={() => setFailed(true)} onLoad={(e) => { if (e.currentTarget.naturalWidth < 32) setFailed(true); }} /></span>;
}
