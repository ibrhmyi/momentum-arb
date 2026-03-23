import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export interface MomentumSignalRow {
  id: string;
  poly_condition_id: string;
  poly_token_id: string;
  title: string;
  yes_bid: number;
  yes_ask: number;
  velocity: number;
  confidence: "low" | "medium" | "high";
  dry_run: boolean;
  kalshi_ticker: string | null;
  order_placed: boolean;
  order_id: string | null;
  order_error: string | null;
  fired_at: string;
  created_at: string;
}

export interface SignalStats {
  total: number;
  today: number;
  high: number;
  medium: number;
  low: number;
  peakVelocity: number;
  lastSignalAt: string | null;
}

export interface SignalsResponse {
  signals: MomentumSignalRow[];
  filtered: number;
  stats: SignalStats;
  generatedAt: string;
  supabaseConfigured: boolean;
  tableReady?: boolean;
}

function emptyResponse(supabaseConfigured: boolean, tableReady?: boolean): SignalsResponse {
  return {
    signals: [],
    filtered: 0,
    stats: { total: 0, today: 0, high: 0, medium: 0, low: 0, peakVelocity: 0, lastSignalAt: null },
    generatedAt: new Date().toISOString(),
    supabaseConfigured,
    tableReady,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const confidence = searchParams.get("confidence"); // low | medium | high | null=all

  // Support both standalone naming and the parent-project's momentum-specific naming
  const url = process.env.SUPABASE_URL ?? process.env.MOMENTUM_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.MOMENTUM_SUPABASE_ANON_KEY;

  if (!url || !key) return Response.json(emptyResponse(false));

  const supabase = createClient(url, key);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Build the main paginated query
  let mainQuery = supabase
    .from("momentum_signals")
    .select("*", { count: "exact" })
    .order("fired_at", { ascending: false })
    .limit(limit);

  if (confidence && ["low", "medium", "high"].includes(confidence)) {
    mainQuery = mainQuery.eq("confidence", confidence);
  }

  // Run all queries concurrently
  const [
    mainResult,
    totalResult,
    highResult,
    medResult,
    lowResult,
    todayResult,
    peakResult,
    lastResult,
  ] = await Promise.all([
    mainQuery,
    supabase.from("momentum_signals").select("*", { count: "exact", head: true }),
    supabase.from("momentum_signals").select("*", { count: "exact", head: true }).eq("confidence", "high"),
    supabase.from("momentum_signals").select("*", { count: "exact", head: true }).eq("confidence", "medium"),
    supabase.from("momentum_signals").select("*", { count: "exact", head: true }).eq("confidence", "low"),
    supabase.from("momentum_signals").select("*", { count: "exact", head: true }).gte("fired_at", todayStart.toISOString()),
    supabase.from("momentum_signals").select("velocity").order("velocity", { ascending: false }).limit(1),
    supabase.from("momentum_signals").select("fired_at").order("fired_at", { ascending: false }).limit(1),
  ]);

  if (mainResult.error) {
    const isMissing =
      mainResult.error.message.includes("schema cache") ||
      mainResult.error.message.includes("does not exist");
    if (isMissing) return Response.json(emptyResponse(true, false));
    return Response.json({ error: mainResult.error.message }, { status: 500 });
  }

  const stats: SignalStats = {
    total: totalResult.count ?? 0,
    today: todayResult.count ?? 0,
    high: highResult.count ?? 0,
    medium: medResult.count ?? 0,
    low: lowResult.count ?? 0,
    peakVelocity: (peakResult.data?.[0]?.velocity as number | undefined) ?? 0,
    lastSignalAt: (lastResult.data?.[0]?.fired_at as string | undefined) ?? null,
  };

  const response: SignalsResponse = {
    signals: (mainResult.data ?? []) as MomentumSignalRow[],
    filtered: mainResult.count ?? 0,
    stats,
    generatedAt: new Date().toISOString(),
    supabaseConfigured: true,
    tableReady: true,
  };

  return Response.json(response);
}
