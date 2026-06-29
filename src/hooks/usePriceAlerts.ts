import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type PriceAlert = {
  id: string;
  user_id: string;
  asset: string;
  condition: "crosses" | "crosses_up" | "crosses_down" | "gte" | "lte";
  target_price: number;
  note: string | null;
  status: "active" | "paused" | "triggered";
  repeat: boolean;
  cooldown_minutes: number;
  last_triggered_at: string | null;
  last_price: number | null;
  created_at: string;
  updated_at: string;
};

export function usePriceAlerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("price_alerts")
      .select("*")
      .order("created_at", { ascending: false });
    setAlerts((data as PriceAlert[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
    if (!user) return;
    const ch = supabase
      .channel(`price_alerts-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "price_alerts" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, refresh]);

  return { alerts, loading, refresh };
}
