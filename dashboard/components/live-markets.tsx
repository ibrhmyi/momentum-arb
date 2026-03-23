"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const WS_URL = "ws://localhost:3001";
const FLASH_MS = 600;
const SIGNAL_HIGHLIGHT_MS = 30_000;

// ─── Types ────────────────────────────────────────────────────────────────────

interface MarketRow {
  tokenId: string;
  conditionId: string;
  title: string;
  yesBid: number;
  yesAsk: number;
  velocity: number;
  lastUpdate: number;
  signalConfidence: "low" | "medium" | "high" | null;
  signalAt: number | null;
}

type FlashDir = "up" | "down";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(v: number) {
  return (v * 100).toFixed(1);
}

function fmtVel(v: number) {
  if (v === 0) return "—";
  return `${(v * 100).toFixed(1)}¢/s`;
}

function relativeTime(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function velColor(v: number) {
  if (v >= 0.12) return "text-emerald-400";
  if (v >= 0.07) return "text-yellow-400";
  if (v > 0) return "text-zinc-300";
  return "text-zinc-600";
}

function ConfidenceBadge({ c }: { c: "low" | "medium" | "high" }) {
  const styles = {
    high: "bg-emerald-500/20 text-emerald-400 ring-emerald-500/30",
    medium: "bg-yellow-500/20 text-yellow-400 ring-yellow-500/30",
    low: "bg-zinc-800 text-zinc-500 ring-zinc-700",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${styles[c]}`}>
      {c === "high" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
      {c.toUpperCase()}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function LiveMarkets() {
  const [markets, setMarkets] = useState<Map<string, MarketRow>>(new Map());
  const [flashes, setFlashes] = useState<Map<string, FlashDir>>(new Map());
  const [connected, setConnected] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [, setTick] = useState(0); // drives relative-time refresh

  const flashTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const signalTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);

  // Tick every 5s to refresh relative timestamps
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5_000);
    return () => clearInterval(t);
  }, []);

  const flash = useCallback((tokenId: string, dir: FlashDir) => {
    setFlashes((prev) => new Map(prev).set(tokenId, dir));
    const existing = flashTimers.current.get(tokenId);
    if (existing) clearTimeout(existing);
    flashTimers.current.set(
      tokenId,
      setTimeout(() => {
        setFlashes((prev) => {
          const next = new Map(prev);
          next.delete(tokenId);
          return next;
        });
      }, FLASH_MS)
    );
  }, []);

  const scheduleSignalClear = useCallback((tokenId: string) => {
    const existing = signalTimers.current.get(tokenId);
    if (existing) clearTimeout(existing);
    signalTimers.current.set(
      tokenId,
      setTimeout(() => {
        setMarkets((prev) => {
          const next = new Map(prev);
          const row = next.get(tokenId);
          if (row) next.set(tokenId, { ...row, signalConfidence: null, signalAt: null });
          return next;
        });
      }, SIGNAL_HIGHLIGHT_MS)
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) setTimeout(connect, 2_000);
      };

      ws.onerror = () => ws.close();

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data as string) as {
          type: "book" | "signal";
          tokenId: string;
          conditionId: string;
          title: string;
          yesBid: number;
          yesAsk: number;
          velocity: number;
          confidence?: "low" | "medium" | "high";
          timestamp: number;
        };

        if (msg.type === "book") {
          setMarkets((prev) => {
            const existing = prev.get(msg.tokenId);
            const bidChanged = existing && Math.abs(existing.yesBid - msg.yesBid) > 0.001;
            const askChanged = existing && Math.abs(existing.yesAsk - msg.yesAsk) > 0.001;

            if (bidChanged || askChanged) {
              const dir =
                msg.yesBid > (existing?.yesBid ?? msg.yesBid) ? "up" : "down";
              flash(msg.tokenId, dir);
            }

            const next = new Map(prev);
            next.set(msg.tokenId, {
              tokenId: msg.tokenId,
              conditionId: msg.conditionId,
              title: msg.title,
              yesBid: msg.yesBid,
              yesAsk: msg.yesAsk,
              velocity: msg.velocity,
              lastUpdate: msg.timestamp,
              signalConfidence: existing?.signalConfidence ?? null,
              signalAt: existing?.signalAt ?? null,
            });
            return next;
          });
        }

        if (msg.type === "signal" && msg.confidence) {
          setMarkets((prev) => {
            const next = new Map(prev);
            const existing = prev.get(msg.tokenId);
            if (existing) {
              next.set(msg.tokenId, {
                ...existing,
                velocity: msg.velocity,
                signalConfidence: msg.confidence!,
                signalAt: msg.timestamp,
              });
              scheduleSignalClear(msg.tokenId);
            }
            return next;
          });
          flash(msg.tokenId, "up");
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      wsRef.current?.close();
      flashTimers.current.forEach(clearTimeout);
      signalTimers.current.forEach(clearTimeout);
    };
  }, [flash, scheduleSignalClear]);

  // Sort: signals first, then markets with real prices, then by most recently updated
  const allRows = Array.from(markets.values()).sort((a, b) => {
    if (a.signalConfidence && !b.signalConfidence) return -1;
    if (!a.signalConfidence && b.signalConfidence) return 1;
    const aHasPrice = a.yesBid > 0 ? 1 : 0;
    const bHasPrice = b.yesBid > 0 ? 1 : 0;
    if (aHasPrice !== bHasPrice) return bHasPrice - aHasPrice;
    return b.lastUpdate - a.lastUpdate;
  });

  const rows = hideEmpty ? allRows.filter((r) => r.yesBid > 0) : allRows;
  const activeSignals = allRows.filter((r) => r.signalConfidence).length;
  const liquidCount = allRows.filter((r) => r.yesBid > 0).length;

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-red-500"}`} />
          <span className="text-sm text-zinc-400">
            {connected
              ? `Connected · ${markets.size} markets`
              : "Connecting to ws://localhost:3001…"}
          </span>
          {activeSignals > 0 && (
            <span className="rounded px-2 py-0.5 text-xs font-semibold bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25 animate-pulse">
              {activeSignals} active signal{activeSignals > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button
          onClick={() => setHideEmpty((v) => !v)}
          className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
            hideEmpty
              ? "border-zinc-700 bg-zinc-800 text-zinc-300"
              : "border-zinc-800 bg-transparent text-zinc-600 hover:text-zinc-400"
          }`}
        >
          {hideEmpty ? `liquid only (${liquidCount})` : `all markets (${allRows.length})`}
        </button>
      </div>

      {/* Not connected state */}
      {!connected && markets.size === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-10 text-center space-y-2">
          <p className="text-sm font-medium text-zinc-400">Waiting for bot…</p>
          <p className="text-xs text-zinc-600">
            Start the bot with{" "}
            <code className="font-mono bg-zinc-800 px-1 rounded">npm run start</code>{" "}
            inside <code className="font-mono bg-zinc-800 px-1 rounded">bot/</code>
          </p>
        </div>
      )}

      {/* Market table */}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/80">
                <th className="pl-4 pr-3 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Market</th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-zinc-500 uppercase tracking-wide">YES Bid</th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-zinc-500 uppercase tracking-wide">YES Ask</th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-zinc-500 uppercase tracking-wide">Spread</th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-zinc-500 uppercase tracking-wide">Velocity</th>
                <th className="px-3 py-2.5 text-center text-xs font-medium text-zinc-500 uppercase tracking-wide">Signal</th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-zinc-500 uppercase tracking-wide">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {rows.map((row) => {
                const flashDir = flashes.get(row.tokenId);
                const hasSignal = !!row.signalConfidence;
                const spread = row.yesAsk - row.yesBid;

                const rowBg = hasSignal
                  ? "bg-emerald-950/40"
                  : flashDir === "up"
                  ? "bg-emerald-500/10"
                  : flashDir === "down"
                  ? "bg-red-500/10"
                  : "bg-zinc-950";

                return (
                  <tr
                    key={row.tokenId}
                    className={`transition-colors duration-300 hover:bg-zinc-900/50 ${rowBg}`}
                  >
                    {/* Title */}
                    <td className="pl-4 pr-3 py-2.5 max-w-[280px]">
                      <span className="line-clamp-1 text-zinc-200 text-[13px] leading-snug">
                        {row.title}
                      </span>
                      {hasSignal && (
                        <span className="block mt-0.5 text-[10px] text-emerald-500 font-medium">
                          ⚡ signal {relativeTime(row.signalAt!)}
                        </span>
                      )}
                    </td>

                    {/* YES Bid */}
                    <td className={`px-3 py-2.5 text-right font-mono tabular-nums text-[13px] transition-colors duration-300 ${
                      flashDir === "up" ? "text-emerald-400" : flashDir === "down" ? "text-red-400" : "text-zinc-200"
                    }`}>
                      {fmtPrice(row.yesBid)}¢
                    </td>

                    {/* YES Ask */}
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[13px] text-zinc-400">
                      {fmtPrice(row.yesAsk)}¢
                    </td>

                    {/* Spread */}
                    <td className={`px-3 py-2.5 text-right font-mono tabular-nums text-xs ${
                      spread < 0.03 ? "text-emerald-500" : spread < 0.07 ? "text-yellow-500" : "text-zinc-500"
                    }`}>
                      {(spread * 100).toFixed(1)}¢
                    </td>

                    {/* Velocity */}
                    <td className={`px-3 py-2.5 text-right font-mono tabular-nums text-xs font-semibold ${velColor(row.velocity)}`}>
                      {fmtVel(row.velocity)}
                    </td>

                    {/* Signal badge */}
                    <td className="px-3 py-2.5 text-center">
                      {row.signalConfidence ? (
                        <ConfidenceBadge c={row.signalConfidence} />
                      ) : (
                        <span className="text-zinc-800 text-xs">—</span>
                      )}
                    </td>

                    {/* Last update */}
                    <td className="px-3 py-2.5 text-right text-[11px] text-zinc-600 tabular-nums whitespace-nowrap">
                      {relativeTime(row.lastUpdate)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
