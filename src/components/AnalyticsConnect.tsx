"use client";

import { useEffect, useMemo, useState } from "react";
import { btn, inputCls } from "./ui";

/*
 * Admin: connect the owner's Zoho Analytics workspace (read-only) and see what's in it — tables, query tables, reports,
 * dashboards (ANALYTICS-PLAN.md §2b.2). The code and Client Secret go straight to the server; nothing is shown back.
 */

type View = { id: string; name: string; type: string; description?: string; modifiedAt?: string };
type Info = { workspaceId: string; orgName?: string; connectedAt: string; connectedBy: string };

const DEFAULT_LINK = "https://analytics.zoho.in/workspace/421000000000021002/settings/general";
/** Zoho's view types, grouped the way the workspace's left panel shows them. */
const GROUPS: { label: string; match: (t: string) => boolean }[] = [
  { label: "Tables", match: (t) => /^table$/i.test(t) },
  { label: "Query tables", match: (t) => /query/i.test(t) },
  { label: "Dashboards", match: (t) => /dashboard/i.test(t) },
  { label: "Charts & reports", match: (t) => /chart|analysis|pivot|summary|tabular|report/i.test(t) },
];
const stamp = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

export function AnalyticsConnect({ onClose }: { onClose: () => void }) {
  const [link, setLink] = useState(DEFAULT_LINK);
  const [code, setCode] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [scopes, setScopes] = useState("ZohoAnalytics.metadata.read,ZohoAnalytics.data.read");
  const [state, setState] = useState<{ loading?: boolean; busy?: boolean; error?: string; info?: Info | null; views?: View[]; justConnected?: boolean }>({ loading: true });
  const [reconnect, setReconnect] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    fetch("/api/zoho-analytics").then((r) => r.json()).then((j: { info?: Info | null; scopes?: string; views?: View[]; error?: string }) => {
      if (j.scopes) setScopes(j.scopes);
      setState({ info: j.info ?? null, views: j.views, error: j.error });
    }).catch(() => setState({ error: "Couldn't reach the server" }));
  }, []);

  const connect = async () => {
    setState((s) => ({ ...s, busy: true, error: undefined }));
    const r = await fetch("/api/zoho-analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link, code, clientId, clientSecret }) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; info?: Info; views?: View[] }) : { error: "Couldn't reach the server" };
    if (j.ok) {
      setState({ info: j.info, views: j.views, justConnected: true });
      setCode("");
      setClientSecret("");
      setReconnect(false);
    } else setState((s) => ({ ...s, busy: false, error: j.error ?? "Couldn't connect" }));
  };

  const grouped = useMemo(() => {
    const views = state.views ?? [];
    const used = new Set<string>();
    const out = GROUPS.map((g) => {
      const list = views.filter((v) => !used.has(v.id) && g.match(v.type)).sort((a, b) => a.name.localeCompare(b.name));
      list.forEach((v) => used.add(v.id));
      return { label: g.label, list };
    });
    const other = views.filter((v) => !used.has(v.id));
    return other.length ? [...out, { label: "Other", list: other }] : out;
  }, [state.views]);

  const showForm = !state.loading && (!state.info || reconnect);
  return (
    <div className="fade-in fixed inset-0 z-[80] grid place-items-center bg-black/30 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-label="Zoho Analytics" className="modal-in flex max-h-[92vh] w-full max-w-[720px] flex-col rounded-2xl bg-surface shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="px-6 pb-3 pt-5">
          <h3 className="text-[18px] font-bold tracking-tight text-ink">Zoho Analytics</h3>
          <p className="mt-0.5 text-[13px] text-muted">Read-only — the dashboard reads your workspace&apos;s tables and reports; it never changes anything in Zoho Analytics.</p>
        </div>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto border-y border-line px-6 py-4">
          {state.loading && <p className="text-[13px] text-muted">Loading…</p>}
          {state.info && !reconnect && (
            <p className="text-[13px] text-ink-2">
              <span className="font-semibold text-low">Connected</span>
              {state.info.orgName ? <> · organisation <b>{state.info.orgName}</b></> : null} · workspace <span className="num">{state.info.workspaceId}</span> · by {state.info.connectedBy}, {stamp(state.info.connectedAt)}
              {" · "}<button type="button" className="font-semibold text-brand hover:underline" onClick={() => setReconnect(true)}>Connect again</button>
            </p>
          )}
          {showForm && (
            <>
              <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-ink-2">
                <li>Open <a className="font-semibold text-brand underline" href="https://api-console.zoho.in" target="_blank" rel="noreferrer">api-console.zoho.in</a>, signed in as the Zoho account that owns the Analytics workspace, and open <b>Self Client</b>.</li>
                <li><b>Generate Code</b> tab → Scope: <code className="select-all rounded bg-surface-2 px-1 text-[12px]">{scopes}</code> · Time duration: <b>10 minutes</b> · Description: Training Dashboard → <b>Create</b>, and copy the code.</li>
                <li><b>Client Secret</b> tab → copy the <b>Client ID</b> and <b>Client Secret</b>.</li>
                <li>Paste all three below (within the 10 minutes) and press <b>Connect</b>.</li>
              </ol>
              <div className="mt-3 space-y-2">
                <input className={inputCls} placeholder="Workspace link (https://analytics.zoho.in/workspace/…)" value={link} onChange={(e) => setLink(e.target.value)} />
                <input className={inputCls} placeholder="Code (1000.…)" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className={inputCls} placeholder="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" />
                  <input className={inputCls} placeholder="Client Secret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="new-password" />
                </div>
              </div>
            </>
          )}
          {state.error && <p className="mt-3 text-[13px] font-medium text-high">{state.error}</p>}
          {state.justConnected && <p className="mt-2 text-[13px] font-medium text-low">Connected — here&apos;s what the dashboard can see in the workspace.</p>}
          {state.views && !reconnect && (
            <div className="mt-4 space-y-4">
              <p className="text-[13px] text-muted">{state.views.length} items in the workspace.</p>
              {grouped.filter((g) => g.list.length).map((g) => (
                <div key={g.label}>
                  <div className="text-[12px] font-bold uppercase tracking-wide text-muted">{g.label} <span className="font-medium normal-case">({g.list.length})</span></div>
                  <ul className="mt-1.5 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                    {g.list.map((v) => (
                      <li key={v.id} className="truncate text-[13px] text-ink-2" title={`${v.name} — ${v.type}${v.description ? ` — ${v.description}` : ""}`}>{v.name}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4">
          <button className={btn.ghost} onClick={onClose}>Close</button>
          {showForm && (
            <button className={btn.primary} onClick={connect} disabled={!code.trim() || !link.trim() || !clientId.trim() || !clientSecret.trim() || state.busy}>
              {state.busy ? "Connecting…" : "Connect"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
