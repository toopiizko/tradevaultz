import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { POPULAR_ASSETS } from "@/lib/types";
import { toast } from "sonner";
import type { PriceAlert } from "@/hooks/usePriceAlerts";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: PriceAlert | null;
  onSaved?: () => void;
};

const CONDITIONS = [
  { value: "crosses", label: "Crosses" },
  { value: "crosses_up", label: "Crosses up" },
  { value: "crosses_down", label: "Crosses down" },
  { value: "gte", label: "Price ≥" },
  { value: "lte", label: "Price ≤" },
] as const;

export function AlertFormDialog({ open, onOpenChange, editing, onSaved }: Props) {
  const { user } = useAuth();
  const [asset, setAsset] = useState(editing?.asset ?? "BTCUSD");
  const [condition, setCondition] = useState<PriceAlert["condition"]>(editing?.condition ?? "crosses_up");
  const [price, setPrice] = useState(editing?.target_price.toString() ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [repeat, setRepeat] = useState(editing?.repeat ?? false);
  const [cooldown, setCooldown] = useState(editing?.cooldown_minutes ?? 60);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!user) return;
    const target = parseFloat(price);
    if (!asset.trim() || isNaN(target) || target <= 0) {
      toast.error("Asset and target price required");
      return;
    }
    setBusy(true);
    const payload = {
      user_id: user.id,
      asset: asset.trim().toUpperCase(),
      condition,
      target_price: target,
      note: note.trim() || null,
      repeat,
      cooldown_minutes: cooldown,
    };
    const { error } = editing
      ? await supabase.from("price_alerts").update(payload).eq("id", editing.id)
      : await supabase.from("price_alerts").insert(payload);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Alert updated" : "Alert created");
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Alert" : "New Price Alert"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Asset</Label>
            <Input
              list="popular-assets-list"
              value={asset}
              onChange={(e) => setAsset(e.target.value.toUpperCase())}
              placeholder="BTCUSD, EURUSD, XAUUSD…"
            />
            <datalist id="popular-assets-list">
              {POPULAR_ASSETS.map((a) => <option key={a} value={a} />)}
            </datalist>
            <p className="text-[11px] text-muted-foreground mt-1">
              Supported: crypto (BTCUSD…), forex & metals (EURUSD, XAUUSD…)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Condition</Label>
              <Select value={condition} onValueChange={(v) => setCondition(v as PriceAlert["condition"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target price</Label>
              <Input type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">Repeat alert</Label>
              <p className="text-[11px] text-muted-foreground">Keep firing after trigger</p>
            </div>
            <Switch checked={repeat} onCheckedChange={setRepeat} />
          </div>

          {repeat && (
            <div>
              <Label>Cooldown (minutes)</Label>
              <Input
                type="number" min={1}
                value={cooldown}
                onChange={(e) => setCooldown(parseInt(e.target.value) || 60)}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
