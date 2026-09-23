"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import type { TickerItem } from "@/lib/types";
import { PRIORITY_CLASSES } from "@/lib/priority";

const SPEED_PX_S = 55;

function Item({ item, onSnooze }: { item: TickerItem; onSnooze: (id: string) => void }) {
  return (
    <span className="group inline-flex items-center gap-2.5 whitespace-nowrap pr-10">
      <span aria-hidden className={`size-1.5 rounded-full ${PRIORITY_CLASSES[item.priority].dot} ${item.priority === "high" ? "pulse-dot" : ""}`} />
      <span className="sr-only">{item.priority} priority:</span>
      <Link href={item.href} className="inline-flex items-center gap-2.5 text-[12.5px] text-ticker-ink/75 transition hover:text-ticker-ink">
        <span className="font-semibold text-ticker-ink">{item.label}</span>
        <span>{item.text}</span>
      </Link>
      <button
        onClick={() => onSnooze(item.id)}
        className="hidden rounded px-1.5 text-[11px] text-ticker-ink/40 hover:bg-white/10 hover:text-ticker-ink group-hover:inline"
        title="Hide for 4 hours"
      >
        Snooze
      </button>
    </span>
  );
}

export function Ticker() {
  const { ticker, snoozeTicker, ready } = useStore();
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [duration, setDuration] = useState(60);
  const [flash, setFlash] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const prevHigh = useRef<Set<string>>(new Set());

  // Constant reading speed regardless of item count.
  useLayoutEffect(() => {
    const w = trackRef.current ? trackRef.current.scrollWidth / 2 : 0;
    setDuration(Math.max(25, w / SPEED_PX_S));
  }, [ticker]);

  // Flash once when a new High item arrives.
  useEffect(() => {
    const high = new Set(ticker.filter((i) => i.priority === "high").map((i) => i.id));
    const isNew = [...high].some((id) => !prevHigh.current.has(id));
    const hadAny = prevHigh.current.size > 0;
    prevHigh.current = high;
    if (hadAny && isNew) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1300);
      return () => clearTimeout(t);
    }
  }, [ticker]);

  const urgent = ticker.filter((i) => i.priority === "high").length;

  return (
    <div className={`sticky top-0 z-40 flex h-9 items-center bg-ticker text-ticker-ink ${flash ? "flash" : ""}`} role="region" aria-label="Urgent tasks and announcements">
      <div className="flex h-full shrink-0 items-center gap-3 pl-3 pr-4">
        <button
          onClick={() => setPaused((p) => !p)}
          className="grid size-6 place-items-center rounded text-ticker-ink/60 hover:bg-white/10 hover:text-ticker-ink"
          aria-label={paused ? "Play ticker" : "Pause ticker"}
        >
          {paused ? (
            <svg viewBox="0 0 16 16" className="size-3" fill="currentColor"><path d="M4.5 3v10l8-5z" /></svg>
          ) : (
            <svg viewBox="0 0 16 16" className="size-3" fill="currentColor"><path d="M4.5 3h2.5v10H4.5zM9 3h2.5v10H9z" /></svg>
          )}
        </button>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium">
          <span className={`size-1.5 rounded-full ${urgent ? "bg-high" : "bg-low"}`} />
          {urgent ? `${urgent} need attention` : "All clear"}
        </span>
        <span className="h-4 w-px bg-white/15" />
      </div>

      <div
        className={`relative h-full min-w-0 flex-1 overflow-hidden ${paused || hover ? "ticker-paused" : ""}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        onTouchStart={() => setHover(true)}
        onTouchEnd={() => setHover(false)}
      >
        {!ready ? (
          <div className="flex h-full items-center text-[12.5px] text-ticker-ink/50">Loading live updates…</div>
        ) : ticker.length === 0 ? (
          <div className="flex h-full items-center text-[12.5px] text-ticker-ink/50">Nothing urgent right now.</div>
        ) : (
          <div ref={trackRef} className="ticker-track flex h-full w-max items-center" style={{ ["--ticker-duration" as string]: `${duration}s` }}>
            {[0, 1].map((copy) => (
              <div key={copy} className="flex items-center" aria-hidden={copy === 1}>
                {ticker.map((item) => (
                  <Item key={`${copy}-${item.id}`} item={item} onSnooze={(id) => snoozeTicker(id, 4)} />
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-ticker" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-ticker" />
      </div>
    </div>
  );
}
