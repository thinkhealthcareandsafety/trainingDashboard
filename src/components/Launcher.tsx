"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { useStore } from "@/lib/store";
import { boardsFor, isAdmin } from "@/lib/roles";
import { type AppIcon, type Found, type Shortcut, appsFor, search } from "@/lib/apps";
import { upcoming } from "@/lib/kpi";
import "./launcher.css";

/*
 * The apps home page (owner, 23 Nov): "like Chrome's main page — they log in, they see the applications". Look C,
 * "Signboard": the navy band with the greeting and a clock, a search for apps and pages, the applications as signs (the
 * ThinkHealth Dashboard first and wide), then each person's own website shortcuts. Rules in lib/apps.ts.
 */

const ICONS: Record<AppIcon, React.ReactNode> = {
  dashboard: <path d="M4 16V9M8.5 16V5M13 16v-4.5M16.5 16V7.5" />,
  trainings: <><path d="M10 3.5 3 7l7 3.5L17 7z" /><path d="M6 8.7v3.8c1 1.2 2.4 1.8 4 1.8s3-.6 4-1.8V8.7" /></>,
  converter: <path d="M5 2.5h7l3 3v12H5zM12 2.5v3h3M7.5 12l2 2 3.5-4" />,
  sheet: <path d="M3 4.5h8v11H3zM3 8h8M3 11.5h8M6.5 4.5v11M13 10h4M15 8l2 2-2 2" />,
};
const Glyph = ({ icon, size }: { icon: AppIcon; size: number }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[icon]}</svg>
);
const Arrow = () => <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 10h10M11 6l4 4-4 4" /></svg>;

const greet = (d: Date) => (d.getHours() < 12 ? "Good morning" : d.getHours() < 17 ? "Good afternoon" : "Good evening");
const first = (name: string) => name.trim().split(/\s+/)[0] ?? "";
const dayLabel = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const host = (url: string) => { try { return new URL(url).hostname; } catch { return ""; } };
// A shortcut without a picture gets its first letter on a colour of its own (the same colour every time).
const TINTS = ["#034f72", "#00843d", "#005387", "#9a5b00", "#7a4fc0", "#b42318", "#1f6f8b", "#5a6b2f"];
const tint = (s: string) => TINTS[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % TINTS.length];

export function Launcher() {
  const { member, signOut } = useSession();
  const { ready, data, now } = useStore();
  // The Dashboard's tile carries one real fact: the trainings in the next 7 days (for those on the Training board).
  const week = useMemo(() => (member && ready && data?.board && boardsFor(member).includes("training") ? upcoming(data.board, now, 7) : null), [member, ready, data, now]);
  if (!member) return null;
  return <LauncherView member={member} signOut={signOut} week={week} now={now} />;
}

/** The page itself, from plain values (the wrapper above reads the session and the board). */
export function LauncherView({ member, signOut, week, now }: { member: { id: string; name: string }; signOut: () => void; week: ReturnType<typeof upcoming> | null; now: Date }) {
  const router = useRouter();
  const [clock, setClock] = useState<Date | null>(null);
  useEffect(() => { setClock(new Date()); const t = setInterval(() => setClock(new Date()), 15_000); return () => clearInterval(t); }, []);

  const [shortcuts, setShortcuts] = useState<Shortcut[] | null>(null);
  useEffect(() => { fetch("/api/shortcuts").then((r) => r.json()).then((j) => setShortcuts(j.shortcuts ?? [])).catch(() => setShortcuts([])); }, []);

  const apps = useMemo(() => appsFor(member), [member]);

  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const found: Found[] = useMemo(() => search(q, member, shortcuts ?? []), [q, member, shortcuts]);
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest("input, textarea");
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) { e.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const go = (f: Found) => { if (f.external) window.open(f.href, "_blank", "noopener"); else router.push(f.href); };

  const main = apps.find((a) => a.main);
  const rest = apps.filter((a) => !a.main);
  const t = clock ?? now;

  return (
    <div className="lx">
      <header className="lx-band">
        <div className="lx-band-in">
          <div className="lx-top">
            <span className="lx-plate" aria-label="Think Health">think<span>health</span></span>
            <div className="lx-me"><span className="who">{member.name}</span><button type="button" className="lx-out" onClick={signOut}>Sign out</button></div>
          </div>
          <div className="lx-hello">
            <div>
              <h1>{greet(t)}, {first(member.name)}.</h1>
              <p>Pick an app to get started.</p>
            </div>
            {clock && <div className="lx-clock" aria-hidden><b>{clock.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).replace(/\s?[ap]m$/i, "")}</b><span>{clock.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</span></div>}
          </div>
        </div>
      </header>

      <main className="lx-in">
        <div className="lx-search">
          <label>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><circle cx="9" cy="9" r="5.5" /><path d="m13.5 13.5 3 3" /></svg>
            <input
              ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an app, a page or a shortcut" aria-label="Find an app, a page or a shortcut"
              role="combobox" aria-expanded={Boolean(q)} aria-controls="lx-found" aria-autocomplete="list"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, found.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
                if (e.key === "Enter" && found[sel]) go(found[sel]);
                if (e.key === "Escape") setQ("");
              }}
            />
            <kbd>Ctrl K</kbd>
          </label>
          {q && (
            <ul className="lx-results" id="lx-found" role="listbox">
              {found.length ? found.map((f, i) => (
                <li key={f.href}>
                  <a href={f.href} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={(e) => { e.preventDefault(); go(f); }}>
                    {f.name}<small>{f.kind === "app" ? "App" : f.kind === "page" ? "Dashboard page" : host(f.href)}</small>
                  </a>
                </li>
              )) : <li><p>Nothing called that. Try &ldquo;quotations&rdquo; or &ldquo;calendar&rdquo;.</p></li>}
            </ul>
          )}
        </div>

        <h2 className="lx-h">Applications</h2>
        <div className="lx-board">
          {main && (
            <Link href={main.href} className="lx-app lx-main">
              <span className="lx-sign" style={{ background: main.color }}><Glyph icon={main.icon} size={40} /></span>
              <div>
                <h3>{main.name}</h3>
                <p>{main.about}</p>
                {week && (
                  <div className="lx-facts">
                    <div><b>{week.length}</b>{week.length === 1 ? "Training" : "Trainings"} in the next 7 days</div>
                    {week[0] && <div><b>{dayLabel(week[0].next)}</b>Next: {week[0].t.customerName || week[0].t.training}</div>}
                  </div>
                )}
              </div>
              <span className="lx-open">Open <Arrow /></span>
            </Link>
          )}
          {rest.map((a) => (
            <Link key={a.id} href={a.href} className="lx-app">
              <span className="lx-sign" style={{ background: a.color }}><Glyph icon={a.icon} size={30} /></span>
              <div><h3>{a.name}</h3><p>{a.about}</p></div>
            </Link>
          ))}
          {/* Where a colleague's app will appear; only for whoever builds them (lib/apps.ts says how). */}
          {isAdmin(member) && (
            <div className="lx-app lx-slot">
              <span className="lx-sign"><svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M10 4v12M4 10h12" /></svg></span>
              <div><h3>A colleague&apos;s app</h3><p>Built in our project and added to the app list, it gets a sign here.</p></div>
            </div>
          )}
        </div>

        <h2 className="lx-h">My shortcuts</h2>
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
  if (!list) return <div className="lx-shrow" aria-busy="true" />;
  return (
    <>
      <div className="lx-shrow">
        {list.map((s) => (
          <div key={s.id} className="lx-sw">
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="lx-s" title={s.url}>
              <Favicon s={s} />
              <span className="name">{s.name}</span>
            </a>
            <button type="button" className="lx-x" aria-label={`Remove ${s.name}`} title="Remove" onClick={() => remove(s)}>
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></svg>
            </button>
          </div>
        ))}
        {adding ? (
          <form className="lx-form" onSubmit={(e) => { e.preventDefault(); if (url.trim()) add(); }} onKeyDown={(e) => { if (e.key === "Escape") setAdding(false); }}>
            <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Web address, e.g. books.zoho.in" aria-label="Web address" inputMode="url" />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" aria-label="Name" maxLength={40} />
            {error && <p className="lx-err">{error}</p>}
            <div className="row">
              <button type="submit" className="lx-btn" disabled={busy || !url.trim()}>{busy ? "Adding…" : "Add"}</button>
              <button type="button" className="lx-quiet" onClick={() => { setAdding(false); setError(""); }}>Cancel</button>
            </div>
          </form>
        ) : (
          <button type="button" className="lx-s lx-add" onClick={() => { setAdding(true); setError(""); }}>
            <span className="lx-fav"><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M10 4.5v11M4.5 10h11" /></svg></span>
            <span className="name">Add shortcut</span>
          </button>
        )}
      </div>
      {!list.length && !adding && <p className="lx-note">Add the websites you open every day: Zoho Books, Zoho Mail, WhatsApp Web. Only you see them.</p>}
      {error && !adding && <p className="lx-err" style={{ marginTop: 10 }}>{error}</p>}
    </>
  );
}

/** The site's own icon (from Google's favicon service), or its first letter when there is none. */
function Favicon({ s }: { s: Shortcut }) {
  const [failed, setFailed] = useState(false);
  const h = host(s.url);
  if (failed || !h) return <span className="lx-fav" style={{ background: tint(s.name) }}>{s.name.charAt(0).toUpperCase()}</span>;
  // eslint-disable-next-line @next/next/no-img-element -- a remote icon, any site
  return <span className="lx-fav"><img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=64`} alt="" onError={() => setFailed(true)} /></span>;
}
