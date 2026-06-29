// Cron-invoked: evaluates active price_alerts, inserts events, updates state.
// No JWT required — invoked by pg_cron via pg_net.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Alert = {
  id: string;
  user_id: string;
  asset: string;
  condition: "crosses" | "crosses_up" | "crosses_down" | "gte" | "lte";
  target_price: number;
  status: string;
  repeat: boolean;
  cooldown_minutes: number;
  last_triggered_at: string | null;
  last_price: number | null;
};

// --- Price providers ----------------------------------------------------------

async function fetchBinance(symbol: string): Promise<number | null> {
  // symbol like BTCUSDT
  try {
    const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    if (!r.ok) return null;
    const j = await r.json();
    return parseFloat(j.price);
  } catch { return null; }
}

async function fetchFx(base: string, quote: string): Promise<number | null> {
  // exchangerate.host (no key). Supports FX + metals (XAU, XAG).
  try {
    const r = await fetch(`https://api.exchangerate.host/latest?base=${base}&symbols=${quote}`);
    if (!r.ok) return null;
    const j = await r.json();
    const v = j?.rates?.[quote];
    if (typeof v === "number") return v;
    return null;
  } catch { return null; }
}

// Map TradeVaultz asset symbol -> price fetch
async function getPrice(asset: string): Promise<number | null> {
  const a = asset.toUpperCase().trim();

  // Crypto
  const cryptoMap: Record<string, string> = {
    BTCUSD: "BTCUSDT", ETHUSD: "ETHUSDT", SOLUSD: "SOLUSDT",
    BNBUSD: "BNBUSDT", XRPUSD: "XRPUSDT", ADAUSD: "ADAUSDT",
    DOGEUSD: "DOGEUSDT",
  };
  if (cryptoMap[a]) return fetchBinance(cryptoMap[a]);
  if (a.endsWith("USDT")) return fetchBinance(a);

  // 6-letter FX / metals like XAUUSD, EURUSD
  if (/^[A-Z]{6}$/.test(a)) {
    const base = a.slice(0, 3);
    const quote = a.slice(3);
    // exchangerate.host supports XAU/XAG as base
    return fetchFx(base, quote);
  }

  return null; // indices / commodities not supported in MVP
}

// --- Condition check ---------------------------------------------------------

function shouldTrigger(a: Alert, current: number): boolean {
  const prev = a.last_price;
  const t = Number(a.target_price);
  switch (a.condition) {
    case "gte": return current >= t;
    case "lte": return current <= t;
    case "crosses_up":
      return prev != null && prev < t && current >= t;
    case "crosses_down":
      return prev != null && prev > t && current <= t;
    case "crosses":
      return prev != null && ((prev < t && current >= t) || (prev > t && current <= t));
  }
}

function withinCooldown(a: Alert): boolean {
  if (!a.last_triggered_at) return false;
  const last = new Date(a.last_triggered_at).getTime();
  return Date.now() - last < a.cooldown_minutes * 60_000;
}

// --- Main --------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: alerts, error } = await supabase
    .from("price_alerts")
    .select("id, user_id, asset, condition, target_price, status, repeat, cooldown_minutes, last_triggered_at, last_price")
    .eq("status", "active");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!alerts || alerts.length === 0) {
    return new Response(JSON.stringify({ checked: 0, triggered: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Dedupe asset fetches
  const assets = Array.from(new Set(alerts.map((a) => a.asset.toUpperCase())));
  const priceEntries = await Promise.all(
    assets.map(async (asset) => [asset, await getPrice(asset)] as const),
  );
  const priceMap = new Map<string, number | null>(priceEntries);

  let triggered = 0;
  for (const a of alerts as Alert[]) {
    const current = priceMap.get(a.asset.toUpperCase());
    if (current == null) continue;

    const update: Record<string, unknown> = { last_price: current };

    if (shouldTrigger(a, current) && !withinCooldown(a)) {
      await supabase.from("price_alert_events").insert({
        alert_id: a.id,
        user_id: a.user_id,
        asset: a.asset,
        condition: a.condition,
        target_price: a.target_price,
        triggered_price: current,
      });
      update.last_triggered_at = new Date().toISOString();
      if (!a.repeat) update.status = "triggered";
      triggered++;
    }

    await supabase.from("price_alerts").update(update).eq("id", a.id);
  }

  return new Response(
    JSON.stringify({ checked: alerts.length, triggered, assets: assets.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
