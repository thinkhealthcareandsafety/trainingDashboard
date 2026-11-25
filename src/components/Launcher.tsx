"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/session";
import { type LinkApp } from "@/lib/apps";
import { homeOf } from "@/lib/roles";
import { arranged, pinnedFirst, ZOHO_APPS } from "@/lib/zohoApps";
import "./launcher.css";

/*
 * The apps home page (owner, 23 Nov; rules in lib/apps.ts): the applications as big icons — Training Dashboard (ours,
 * straight into its first page; the folders page in between was dropped: "scrape it, just keep the application page"),
 * then the ones Admin adds as links, which open in the same tab (Back returns here). Below, every Zoho app (lib/zohoApps.ts).
 * Right-click on any → Pin: first in its list, for that person (owner, 24 Nov).
 */

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
  // Undefined while loading; null = couldn't be read, so nothing is pinned (saving would lose the kept ones).
  const [pins, setPins] = useState<string[] | null>();
  useEffect(() => {
    fetch("/api/ui-prefs").then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => setPins(Array.isArray(j.prefs?.appPins) ? j.prefs.appPins : [])).catch(() => setPins(null));
  }, []);
  const [menu, setMenu] = useState<MenuAt | null>(null);
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const pin = (id: string) => {
    setMenu(null);
    if (!pins) return setError("Couldn't read your pins. Refresh the page and try again.");
    const was = pins, next = was.includes(id) ? was.filter((x) => x !== id) : [...was, id];
    setPins(next); setError("");
    // One save after another, so the last one wins.
    saving.current = saving.current.then(() => fetch("/api/ui-prefs", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: "appPins", value: next }) }))
      .then((r) => { if (!r.ok) throw new Error(); }).catch(() => { setPins((p) => (p === next ? was : p)); setError("Couldn't save the pin. Try again."); });
  };
  const onMenu = (id: string, name: string, url: string) => (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect(), keyed = !e.clientX && !e.clientY; // from the keyboard
    setMenu({ id, name, url, x: keyed ? r.left + r.width / 2 : e.clientX, y: keyed ? r.top + r.height / 2 : e.clientY });
  };
  const isPinned = (id: string) => Boolean(pins?.includes(id));
  const ours: { id: string; app?: LinkApp }[] = arranged(apps ?? [], pins ?? []);
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
        <nav className="lx-grid lx-big lx-panel" aria-label="Applications">
          {ours.map(({ id, app: a }) => !a ? (
            <Link key={id} href={homeOf(member)} className="lx-tile lx-sw" onContextMenu={onMenu(id, "Think Health Dashboard", homeOf(member))}>
              {isPinned(id) && <PinMark />}
              {/* eslint-disable-next-line @next/next/no-img-element -- a small fixed picture (the browser tab's icon) */}
              <span className="lx-ic lx-own"><img src="/dashboard-icon.svg" alt="" /></span>
              <span className="lx-name">Think Health Dashboard</span>
            </Link>
          ) : (
            <div key={id} className="lx-sw" onContextMenu={onMenu(id, a.name, a.url)}>
              {isPinned(id) && <PinMark />}
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
        {error && <p className="lx-err" role="alert">{error}</p>}
        {pins !== undefined && (
          <section className="lx-zoho lx-panel">
            <h2>Zoho</h2>
            <nav className="lx-grid" aria-label="Zoho apps">
              {pinnedFirst(ZOHO_APPS, pins ?? []).map((z) => (
                <a key={z.id} href={z.url} className="lx-tile lx-sw" title={z.url} onContextMenu={onMenu(z.id, z.name, z.url)}>
                  {isPinned(z.id) && <PinMark />}
                  {/* eslint-disable-next-line @next/next/no-img-element -- a small fixed picture */}
                  <span className="lx-ic lx-zic"><img src={z.icon} alt="" width={44} height={44} loading="lazy" /></span>
                  <span className="lx-name">{z.name}</span>
                </a>
              ))}
            </nav>
          </section>
        )}
      </main>
      {menu && <TileMenu at={menu} pinned={isPinned(menu.id)} onPin={() => pin(menu.id)} onClose={() => setMenu(null)} />}
    </div>
  );
}

type MenuAt = { id: string; name: string; url: string; x: number; y: number };

const PinMark = () => (
  <span className="lx-pin" title="Pinned">
    <svg viewBox="0 0 20 20" width="11" height="11" fill="currentColor" aria-label="Pinned"><path d="M7 2.5h6l-.6 5 2.6 2.8v1.4h-4.2V17l-.8 1.5-.8-1.5v-5.3H5v-1.4l2.6-2.8z" /></svg>
  </span>
);

/** Right-click on an application: pin it, or what the browser's own menu offered. */
function TileMenu({ at, pinned, onPin, onClose }: { at: MenuAt; pinned: boolean; onPin: () => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    const out = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); before?.focus({ preventScroll: true }); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = [...(box.current?.querySelectorAll<HTMLElement>("button, a") ?? [])];
        items[(items.indexOf(document.activeElement as HTMLElement) + 1) % items.length]?.focus();
      }
    };
    window.addEventListener("pointerdown", out);
    window.addEventListener("keydown", key);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => { window.removeEventListener("pointerdown", out); window.removeEventListener("keydown", key); window.removeEventListener("scroll", onClose, true); window.removeEventListener("resize", onClose); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, [at]);
  const left = Math.max(8, Math.min(at.x, window.innerWidth - 196)), top = Math.max(8, Math.min(at.y, window.innerHeight - 104));
  return (
    <div ref={box} className="lx-menu" role="menu" aria-label={at.name} style={{ left, top }} onContextMenu={(e) => e.preventDefault()}>
      <button type="button" role="menuitem" onClick={onPin}>{pinned ? "Unpin" : "Pin to the top"}</button>
      <a role="menuitem" href={at.url} target="_blank" rel="noreferrer" onClick={onClose}>Open in a new tab</a>
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
