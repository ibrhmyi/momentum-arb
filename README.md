# momentum-arb

Real-time **Polymarket → Kalshi** arbitrage bot.

Monitors Polymarket order books for rapid YES price movements (momentum), detects
profitable repricing opportunities, and executes on Kalshi.

```
bot/        Node.js signal-detection engine (TypeScript)
dashboard/  Next.js live-signal dashboard
supabase/   Database schema
```

---

## How it works

1. **bot** connects to Polymarket CLOB via WebSocket and tracks ~100–150 markets
2. Linear regression over a 4-second rolling window measures price velocity (¢/sec)
3. When velocity exceeds the threshold a `MomentumSignal` fires
4. The signal is matched to a Kalshi market, checked against risk limits, and a limit order is placed
5. Every signal is persisted to Supabase so the dashboard can display it live

---

## Quick start

### 1. Supabase

Create a project at [supabase.com](https://supabase.com), open the SQL Editor, and run:

```sql
-- paste contents of supabase/momentum-signals.sql
```

### 2. Bot

```bash
cd bot
cp .env.example .env          # fill in your credentials
npm install
npm run start                 # or npm run dev for watch mode
```

**Required env vars (`bot/.env`):**

| Variable | Description |
|---|---|
| `KALSHI_API_KEY_ID` | Kalshi API key UUID |
| `KALSHI_PRIVATE_KEY` | RSA private key (PEM, `\n`-escaped) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `DRY_RUN` | `true` = paper trading (default), `false` = live orders |

### 3. Dashboard

```bash
cd dashboard
cp .env.example .env.local    # fill in Supabase credentials
npm install
npm run dev                   # http://localhost:3000
```

**Required env vars (`dashboard/.env.local`):**

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |

---

## Configuration

Edit `bot/.env` to tune detection behaviour:

| Variable | Default | Description |
|---|---|---|
| `VELOCITY_THRESHOLD` | `0.04` | Fire signal if YES moves ≥ 4¢/sec |
| `WINDOW_MS` | `4000` | Rolling velocity window (ms) |
| `MIN_YES_BID` | `0.05` | Ignore markets below 5¢ |
| `MAX_YES_BID` | `0.75` | Ignore markets above 75¢ |
| `COOLDOWN_MS` | `30000` | Min gap between signals on same market |
| `POSITION_SIZE_USD` | `25` | $ per trade |
| `MAX_OPEN_POSITIONS` | `3` | Max concurrent positions |
| `MAX_TOTAL_EXPOSURE_USD` | `150` | Max total $ at risk |

---

## Safety

- `DRY_RUN=true` is the default. The bot logs all trade intent without placing orders.
- Set `DRY_RUN=false` only after you have verified that signals look correct in the dashboard.
- Risk limits (max positions, max exposure) are enforced regardless of `DRY_RUN`.
