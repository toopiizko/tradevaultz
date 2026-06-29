import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Bell, BellOff, Trash2, Pencil, BellRing, Check } from "lucide-react";
import { usePriceAlerts, type PriceAlert } from "@/hooks/usePriceAlerts";
import { useAlertEvents } from "@/hooks/useAlertEvents";
import { AlertFormDialog } from "@/components/AlertFormDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const CONDITION_LABEL: Record<string, string> = {
  crosses: "crosses",
  crosses_up: "crosses ↑",
  crosses_down: "crosses ↓",
  gte: "≥",
  lte: "≤",
};

export default function Alerts() {
  const { alerts } = usePriceAlerts();
  const { events, unreadCount, acknowledge, acknowledgeAll } = useAlertEvents();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PriceAlert | null>(null);

  const active = alerts.filter((a) => a.status === "active");
  const paused = alerts.filter((a) => a.status === "paused");
  const triggered = alerts.filter((a) => a.status === "triggered");

  const requestBrowserNotif = async () => {
    if (typeof Notification === "undefined") {
      toast.error("Browser notifications not supported");
      return;
    }
    const p = await Notification.requestPermission();
    toast[p === "granted" ? "success" : "info"](`Notifications: ${p}`);
  };

  const toggleStatus = async (a: PriceAlert) => {
    const next = a.status === "active" ? "paused" : "active";
    await supabase.from("price_alerts").update({ status: next }).eq("id", a.id);
  };

  const remove = async (id: string) => {
    await supabase.from("price_alerts").delete().eq("id", id);
    toast.success("Alert deleted");
  };

  const renderRow = (a: PriceAlert) => (
    <Card key={a.id} className="p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{a.asset}</span>
          <Badge variant="secondary" className="text-[10px]">
            {CONDITION_LABEL[a.condition]} {Number(a.target_price).toLocaleString()}
          </Badge>
          {a.repeat && <Badge variant="outline" className="text-[10px]">repeat</Badge>}
          {a.status === "triggered" && <Badge className="text-[10px]">triggered</Badge>}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {a.last_price != null ? `now ${Number(a.last_price).toLocaleString()}` : "waiting for price…"}
          {a.note && ` · ${a.note}`}
        </div>
      </div>
      <Switch checked={a.status === "active"} onCheckedChange={() => toggleStatus(a)} />
      <Button variant="ghost" size="icon" onClick={() => { setEditing(a); setOpen(true); }}>
        <Pencil className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => remove(a.id)}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </Card>
  );

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BellRing className="h-6 w-6 text-primary" />
              Price Alerts
            </h1>
            <p className="text-sm text-muted-foreground">
              TradingView-style alerts. Checked every minute.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={requestBrowserNotif}>
              <Bell className="h-4 w-4 mr-1" /> Enable notifications
            </Button>
            <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> New Alert
            </Button>
          </div>
        </div>

        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
            <TabsTrigger value="paused">Paused ({paused.length})</TabsTrigger>
            <TabsTrigger value="triggered">Triggered ({triggered.length})</TabsTrigger>
            <TabsTrigger value="history">
              History {unreadCount > 0 && <Badge className="ml-2 h-4 px-1">{unreadCount}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-2 mt-3">
            {active.length === 0 && <EmptyState text="No active alerts. Tap + New Alert to create one." />}
            {active.map(renderRow)}
          </TabsContent>
          <TabsContent value="paused" className="space-y-2 mt-3">
            {paused.length === 0 && <EmptyState text="No paused alerts." />}
            {paused.map(renderRow)}
          </TabsContent>
          <TabsContent value="triggered" className="space-y-2 mt-3">
            {triggered.length === 0 && <EmptyState text="No triggered alerts yet." />}
            {triggered.map(renderRow)}
          </TabsContent>
          <TabsContent value="history" className="space-y-2 mt-3">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={acknowledgeAll} disabled={unreadCount === 0}>
                <Check className="h-4 w-4 mr-1" /> Mark all read
              </Button>
            </div>
            {events.length === 0 && <EmptyState text="No alert history yet." />}
            {events.map((e) => (
              <Card key={e.id} className={`p-3 flex items-center gap-3 ${!e.acknowledged ? "border-primary/40" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{e.asset}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {CONDITION_LABEL[e.condition]} {Number(e.target_price).toLocaleString()}
                    </Badge>
                    {!e.acknowledged && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Triggered at {Number(e.triggered_price).toLocaleString()} ·{" "}
                    {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                  </div>
                </div>
                {!e.acknowledged && (
                  <Button variant="ghost" size="icon" onClick={() => acknowledge(e.id)}>
                    <Check className="h-4 w-4" />
                  </Button>
                )}
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      <AlertFormDialog open={open} onOpenChange={setOpen} editing={editing} />
    </AppLayout>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card className="p-8 text-center text-sm text-muted-foreground">
      <BellOff className="h-8 w-8 mx-auto mb-2 opacity-40" />
      {text}
    </Card>
  );
}
