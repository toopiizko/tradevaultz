import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Trade } from "@/lib/types";

export function useTrades() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("trades")
      .select("*")
      .order("trade_date", { ascending: false });
    if (!error && data) setTrades(data as Trade[]);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    if (!user) return;
    const channel = supabase
      .channel("trades-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "trades" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return { trades, loading, refresh };
}
