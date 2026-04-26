import { useState } from "react";
import { useTrades } from "@/hooks/useTrades";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Trade, STRATEGIES, EMOTIONS, calcPnL } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function Trades() {
  const { user } = useAuth();
  const { trades, loading } = useTrades();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Trade>>({});

  const [form, setForm] = useState({
    asset: "",
    side: "buy" as "buy" | "sell",
    entry_price: "",
    exit_price: "",
    volume: "",
    strategy: STRATEGIES[0],
    emotion: EMOTIONS[0].value,
    note: "",
    trade_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const entry = parseFloat(form.entry_price);
    const exit = parseFloat(form.exit_price);
    const vol = parseFloat(form.volume);
    const pnl = calcPnL({ side: form.side, entry_price: entry, exit_price: exit, volume: vol });
    const { error } = await supabase.from("trades").insert({
      user_id: user.id,
      asset: form.asset.toUpperCase(),
      side: form.side,
      entry_price: entry,
      exit_price: exit,
      volume: vol,
      strategy: form.strategy,
      emotion: form.emotion,
      note: form.note || null,
      trade_date: new Date(form.trade_date).toISOString(),
      pnl,
    });
    if (error) return toast.error(error.message);
    toast.success("Trade logged!");
    setOpen(false);
    setForm({ ...form, asset: "", entry_price: "", exit_price: "", volume: "", note: "" });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("trades").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Trade deleted");
  };

  const startEdit = (t: Trade) => {
    setEditingId(t.id);
    setEditDraft({ ...t });
  };

  const saveEdit = async () => {
    if (!editingId || !editDraft) return;
    const entry = Number(editDraft.entry_price);
    const exit = Number(editDraft.exit_price);
    const vol = Number(editDraft.volume);
    const side = (editDraft.side as "buy" | "sell") ?? "buy";
    const pnl = calcPnL({ side, entry_price: entry, exit_price: exit, volume: vol });
    const { error } = await supabase.from("trades").update({
      asset: editDraft.asset,
      side,
      entry_price: entry,
      exit_price: exit,
      volume: vol,
      strategy: editDraft.strategy,
      emotion: editDraft.emotion,
      note: editDraft.note,
      pnl,
    }).eq("id", editingId);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    setEditingId(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trade Log</h1>
          <p className="text-muted-foreground mt-1">{trades.length} trades recorded</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 font-semibold" style={{ background: "var(--gradient-primary)", color: "hsl(var(--primary-foreground))" }}>
              <Plus className="h-4 w-4" /> New Trade
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Log New Trade</DialogTitle></DialogHeader>
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Asset</Label>
                  <Input required value={form.asset} onChange={(e) => setForm({ ...form, asset: e.target.value })} placeholder="EURUSD" />
                </div>
                <div>
                  <Label>Side</Label>
                  <Select value={form.side} onValueChange={(v: "buy" | "sell") => setForm({ ...form, side: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buy">Buy / Long</SelectItem>
                      <SelectItem value="sell">Sell / Short</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Entry Price</Label>
                  <Input type="number" step="any" required value={form.entry_price} onChange={(e) => setForm({ ...form, entry_price: e.target.value })} />
                </div>
                <div>
                  <Label>Exit Price</Label>
                  <Input type="number" step="any" required value={form.exit_price} onChange={(e) => setForm({ ...form, exit_price: e.target.value })} />
                </div>
                <div>
                  <Label>Volume</Label>
                  <Input type="number" step="any" required value={form.volume} onChange={(e) => setForm({ ...form, volume: e.target.value })} />
                </div>
                <div>
                  <Label>Date</Label>
                  <Input type="datetime-local" required value={form.trade_date} onChange={(e) => setForm({ ...form, trade_date: e.target.value })} />
                </div>
                <div>
                  <Label>Strategy</Label>
                  <Select value={form.strategy} onValueChange={(v) => setForm({ ...form, strategy: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STRATEGIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Emotion</Label>
                  <Select value={form.emotion} onValueChange={(v) => setForm({ ...form, emotion: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EMOTIONS.map((e) => <SelectItem key={e.value} value={e.value}>{e.value} {e.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Note</Label>
                <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="What happened?" rows={3} />
              </div>
              <Button type="submit" className="w-full font-semibold" style={{ background: "var(--gradient-primary)", color: "hsl(var(--primary-foreground))" }}>Save Trade</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 border-b border-border/60">
              <tr className="text-left">
                {["Date", "Asset", "Side", "Entry", "Exit", "Vol", "Strategy", "🎭", "P&L", ""].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-xs uppercase tracking-wider text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={10} className="py-12 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!loading && trades.length === 0 && (
                <tr><td colSpan={10} className="py-12 text-center text-muted-foreground">No trades yet. Click "New Trade" above.</td></tr>
              )}
              {trades.map((t) => {
                const isEdit = editingId === t.id;
                return (
                  <tr key={t.id} className="border-b border-border/40 hover:bg-secondary/30 transition-colors">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{format(new Date(t.trade_date), "MMM dd, HH:mm")}</td>
                    <td className="px-3 py-2 font-semibold">
                      {isEdit ? <Input className="h-8 w-24" value={editDraft.asset ?? ""} onChange={(e) => setEditDraft({ ...editDraft, asset: e.target.value })} /> : t.asset}
                    </td>
                    <td className="px-3 py-2">
                      {isEdit ? (
                        <Select value={editDraft.side as string} onValueChange={(v: "buy" | "sell") => setEditDraft({ ...editDraft, side: v })}>
                          <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="buy">Buy</SelectItem><SelectItem value="sell">Sell</SelectItem></SelectContent>
                        </Select>
                      ) : (
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${t.side === "buy" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>{t.side.toUpperCase()}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{isEdit ? <Input className="h-8 w-20" type="number" step="any" value={editDraft.entry_price as any} onChange={(e) => setEditDraft({ ...editDraft, entry_price: parseFloat(e.target.value) })} /> : Number(t.entry_price).toFixed(2)}</td>
                    <td className="px-3 py-2">{isEdit ? <Input className="h-8 w-20" type="number" step="any" value={editDraft.exit_price as any} onChange={(e) => setEditDraft({ ...editDraft, exit_price: parseFloat(e.target.value) })} /> : Number(t.exit_price).toFixed(2)}</td>
                    <td className="px-3 py-2">{isEdit ? <Input className="h-8 w-16" type="number" step="any" value={editDraft.volume as any} onChange={(e) => setEditDraft({ ...editDraft, volume: parseFloat(e.target.value) })} /> : Number(t.volume)}</td>
                    <td className="px-3 py-2 text-xs">
                      {isEdit ? (
                        <Select value={editDraft.strategy as string} onValueChange={(v) => setEditDraft({ ...editDraft, strategy: v })}>
                          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>{STRATEGIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : t.strategy}
                    </td>
                    <td className="px-3 py-2 text-lg">{t.emotion}</td>
                    <td className={`px-3 py-2 font-bold ${Number(t.pnl) >= 0 ? "text-success" : "text-destructive"}`}>
                      {Number(t.pnl) >= 0 ? "+" : ""}{Number(t.pnl).toFixed(2)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        {isEdit ? (
                          <>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={saveEdit}><Check className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                          </>
                        ) : (
                          <>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
