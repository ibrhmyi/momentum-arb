"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MomentumSignalRow, SignalStats, SignalsResponse } from "@/app/api/signals/route";

const POLL_MS = 5_000;
type ConfidenceFilter = "all" | "low" | "medium" | "high";

// ─── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function fmtVelocity(v: number): string {
  return `${(v * 100).toFixed(1)}¢/s`;
}

function velBarWidth(v: number, peak: number): string {
  if (peak === 0) return "0%";
  return `${Math.min((v / peak) * 100, 100).toFixed(1)}%`;
}

function isRecentlyActive(lastSignalAt: string | null): boolean {
  if (!lastSignalAt) return false;
  return Date.now() - new Date(lastSignalAt).getTime() < 5 * 60 * 1000;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: string }) {
  if (confidence === "high") {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        HIGH
      </span>
    );
  }
  if (confidence === "medium") {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold bg-yellow-500/20 text-yellow-400 ring-1 ring-yellow-500/30">
        <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
        MED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-zinc-800 text-zinc-500 ring-1 ring-zinc-700">
      LOW
    </span>
  );
}

function OrderStatus({ row }: { row: MomentumSignalRow }) {
  if (row.dry_run) {
    return <span className="font-mono text-xs text-amber-500/80">dry run</span>;
  }
  if (row.order_placed) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
        <span>✓</span>
        <span className="font-mono">{row.order_id?.slice(0, 8) ?? "filled"}</span>
      </span>
    );
  }
  return (
    <span
      className="text-xs text-red-400 cursor-help"
      title={row.order_error ?? "Order failed"}
    >
      ✗ failed
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 space-y-1">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="font-mono text-sm font-semibold text-zinc-100">{value}</p>
      {sub && <p className="text-[11px] text-zinc-600">{sub}</p>}
    </div>
  );
}

function FilterTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-zinc-700 text-zinc-100"
          : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
      }`}
    >
      {label}
      <span
        className={`rounded px-1 py-0.5 text-[10px] font-mono ${
          active ? "bg-zinc-600 text-zinc-200" : "bg-zinc-800 text-zinc-500"
        }`}
      >
        {count.toLocaleString()}
      </span>
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function Dashboard() {
  const [data, setData] = useState<SignalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ConfidenceFilter>("all");
  const [countdown, setCountdown] = useState(POLL_MS / 1000);
  const [, setTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSignals = useCallback(async (cf: ConfidenceFilter) => {
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (cf !== "all") params.set("confidence", cf);
      const res = await fetch(`/api/signals?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json() as SignalsResponse);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchSignals(filter);
    setCountdown(POLL_MS / 1000);

    timerRef.current = setInterval(() => {
      fetchSignals(filter);
      setTick((t) => t + 1);
      setCountdown(POLL_MS / 1000);
    }, POLL_MS);

    countRef.current = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countRef.current) clearInterval(countRef.current);
    };
  }, [filter, fetchSignals]);

  const stats: SignalStats = data?.stats ?? {
    total: 0, today: 0, high: 0, medium: 0, low: 0, peakVelocity: 0, lastSignalAt: null,
  };
  const signals = data?.signals ?? [];
  const active = isRecentlyActive(stats.lastSignalAt);
  const peak = stats.peakVelocity;

  return (
    <div className="space-y-5">

      {/* ── Status bar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`h-2 w-2 rounded-full ${active ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`} />
          <span className="text-sm text-zinc-400">
            {active
              ? `Active · last signal ${relativeTime(stats.lastSignalAt!)}`
              : stats.lastSignalAt
              ? `Idle · last signal ${relativeTime(stats.lastSignalAt)}`
              : "Waiting for first signal…"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {data?.supabaseConfigured === false && (
            <span className="rounded px-2 py-0.5 text-xs bg-red-500/10 text-red-400 ring-1 ring-red-500/20">
              Supabase not configured
            </span>
          )}
          <span className="font-mono text-xs text-zinc-600">
            refresh in {countdown}s
          </span>
        </div>
      </div>

      {/* ── Stats cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total signals"
          value={stats.total.toLocaleString()}
          sub={`${stats.today} today`}
        />
        <StatCard
          label="High confidence"
          value={stats.high.toLocaleString()}
          sub={stats.total > 0 ? `${((stats.high / stats.total) * 100).toFixed(0)}% of all` : undefined}
        />
        <StatCard
          label="Peak velocity"
          value={peak > 0 ? fmtVelocity(peak) : "—"}
          sub="all-time high"
        />
        <StatCard
          label="Kalshi matched"
          value={
            signals.length > 0
              ? `${signals.filter((s) => s.kalshi_ticker).length} / ${signals.length}`
              : "—"
          }
          sub="in current view"
        />
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex items-center gap-1 border-b border-zinc-800 pb-3">
        {(
          [
            { key: "all", label: "All", count: stats.total },
            { key: "high", label: "High", count: stats.high },
            { key: "medium", label: "Medium", count: stats.medium },
            { key: "low", label: "Low", count: stats.low },
          ] as { key: ConfidenceFilter; label: string; count: number }[]
        ).map(({ key, label, count }) => (
          <FilterTab
            key={key}
            label={label}
            count={count}
            active={filter === key}
            onClick={() => setFilter(key)}
          />
        ))}
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-10 text-center text-sm text-zinc-600">
          Loading signals…
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !error && signals.length === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-12 text-center space-y-2">
          <p className="text-sm font-medium text-zinc-400">
            {data?.tableReady === false ? "⏳ Run the SQL migration first" : "No signals yet"}
          </p>
          <p className="text-xs text-zinc-600 max-w-sm mx-auto">
            {!data?.supabaseConfigured
              ? "Add SUPABASE_URL and SUPABASE_ANON_KEY to dashboard/.env.local and restart."
              : data?.tableReady === false
              ? "Paste supabase/momentum-signals.sql into the Supabase SQL Editor and run it."
              : filter !== "all"
              ? `No ${filter} confidence signals yet. Try the All tab.`
              : "Start the bot with npm run start inside bot/ — signals appear here within seconds."}
          </p>
        </div>
      )}

      {/* ── Signal table ── */}
      {signals.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/80">
                {["Market", "Conf", "Velocity", "Bid / Ask", "Kalshi", "Order", "Fired"].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={`px-3 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wide ${
                        i === 0 ? "text-left pl-4" : i >= 5 ? "text-center" : "text-right"
                      }`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {signals.map((s) => (
                <tr
                  key={s.id}
                  className="bg-zinc-950 hover:bg-zinc-900/50 transition-colors"
                >
                  {/* Market */}
                  <td className="pl-4 pr-3 py-3 max-w-[260px]">
                    <span className="line-clamp-2 text-zinc-200 leading-snug text-[13px]">
                      {s.title}
                    </span>
                    <span className="block mt-0.5 font-mono text-[10px] text-zinc-700">
                      {s.poly_condition_id.slice(0, 10)}…
                    </span>
                  </td>

                  {/* Confidence */}
                  <td className="px-3 py-3 text-right">
                    <ConfidenceBadge confidence={s.confidence} />
                  </td>

                  {/* Velocity with bar */}
                  <td className="px-3 py-3 text-right">
                    <span
                      className={`font-mono font-semibold tabular-nums text-[13px] ${
                        s.velocity >= 0.12
                          ? "text-emerald-400"
                          : s.velocity >= 0.07
                          ? "text-yellow-400"
                          : "text-zinc-400"
                      }`}
                    >
                      {fmtVelocity(s.velocity)}
                    </span>
                    <div className="mt-1 h-0.5 rounded-full bg-zinc-800 w-16 ml-auto">
                      <div
                        className={`h-full rounded-full ${
                          s.velocity >= 0.12
                            ? "bg-emerald-500"
                            : s.velocity >= 0.07
                            ? "bg-yellow-500"
                            : "bg-zinc-600"
                        }`}
                        style={{ width: velBarWidth(s.velocity, peak) }}
                      />
                    </div>
                  </td>

                  {/* Bid / Ask */}
                  <td className="px-3 py-3 text-right font-mono text-xs tabular-nums text-zinc-500">
                    <span className="text-zinc-300">{(s.yes_bid * 100).toFixed(1)}</span>
                    <span className="text-zinc-700 mx-0.5">/</span>
                    <span>{(s.yes_ask * 100).toFixed(1)}</span>
                  </td>

                  {/* Kalshi */}
                  <td className="px-3 py-3 text-center">
                    {s.kalshi_ticker ? (
                      <span className="font-mono text-xs text-sky-400 bg-sky-400/10 rounded px-1.5 py-0.5">
                        {s.kalshi_ticker}
                      </span>
                    ) : (
                      <span className="text-zinc-700 text-xs">—</span>
                    )}
                  </td>

                  {/* Order */}
                  <td className="px-3 py-3 text-center">
                    <OrderStatus row={s} />
                  </td>

                  {/* Fired */}
                  <td className="px-3 py-3 text-right text-xs text-zinc-600 tabular-nums whitespace-nowrap">
                    {relativeTime(s.fired_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {data && data.filtered > signals.length && (
            <div className="border-t border-zinc-800 px-4 py-2.5 text-xs text-zinc-600 text-center">
              Showing {signals.length} of {data.filtered.toLocaleString()} signals
            </div>
          )}
        </div>
      )}
    </div>
  );
}
