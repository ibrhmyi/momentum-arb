"use client";

import { useState } from "react";
import { Dashboard } from "@/components/dashboard";
import { LiveMarkets } from "@/components/live-markets";

type Tab = "live" | "signals";

export default function Page() {
  const [tab, setTab] = useState<Tab>("live");

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 md:px-10">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-zinc-100 tracking-tight">
                ⚡ momentum-arb
              </span>
              <span className="rounded-full px-2 py-0.5 text-[11px] font-medium bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20">
                DRY RUN
              </span>
            </div>
            <p className="text-sm text-zinc-500">
              Polymarket order-book velocity signals →{" "}
              <span className="text-zinc-400">Kalshi execution</span>
            </p>
          </div>

          {/* Config pills */}
          <div className="hidden sm:flex items-center gap-2 flex-wrap justify-end">
            {[
              { label: "threshold", value: "4¢/s" },
              { label: "window", value: "4s" },
              { label: "cooldown", value: "30s" },
              { label: "size", value: "$25" },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1"
              >
                <span className="text-[11px] text-zinc-600">{label}</span>
                <span className="font-mono text-[11px] font-medium text-zinc-300">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-zinc-800">
          {(
            [
              { key: "live", label: "Live Markets" },
              { key: "signals", label: "Signals" },
            ] as { key: Tab; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === key
                  ? "border-zinc-300 text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "live" ? <LiveMarkets /> : <Dashboard />}
      </div>
    </main>
  );
}
