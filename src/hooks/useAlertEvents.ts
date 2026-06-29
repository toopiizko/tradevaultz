import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export type AlertEvent = {
  id: string;
  alert_id: string;
  user_id: string;
  asset: string;
  condition: string;
  target_price: number;
  triggered_price: number;
  acknowledged: boolean;
  created_at: string;
};

export function useAlertEvents() {
  const { user } = useAuth();
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("price_alert_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setEvents((data as AlertEvent[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
    if (!user) return;
    const ch = supabase
      .channel(`alert_events-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "price_alert_events", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const e = payload.new as AlertEvent;
          toast.success(`🔔 ${e.asset} hit ${e.target_price}`, {
            description: `Price: ${e.triggered_price}`,
          });
          setEvents((prev) => [e, ...prev]);
          // Browser notification (no SW push) — works when tab is open & permission granted
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              new Notification(`${e.asset} alert`, {
                body: `${e.asset} at ${e.triggered_price} (target ${e.target_price})`,
                icon: "/favicon.ico",
              });
            } catch { /* ignore */ }
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, refresh]);

  const unreadCount = events.filter((e) => !e.acknowledged).length;

  const acknowledge = async (id: string) => {
    await supabase.from("price_alert_events").update({ acknowledged: true }).eq("id", id);
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, acknowledged: true } : e)));
  };

  const acknowledgeAll = async () => {
    if (!user) return;
    await supabase
      .from("price_alert_events")
      .update({ acknowledged: true })
      .eq("user_id", user.id)
      .eq("acknowledged", false);
    setEvents((prev) => prev.map((e) => ({ ...e, acknowledged: true })));
  };

  return { events, loading, unreadCount, acknowledge, acknowledgeAll, refresh };
}
