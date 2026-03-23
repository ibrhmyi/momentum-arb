import { Dashboard } from "@/components/dashboard";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 md:px-10">
      <div className="mx-auto max-w-5xl space-y-8">

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

          {/* Config summary */}
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

        {/* Dashboard */}
        <Dashboard />
      </div>
    </main>
  );
}
