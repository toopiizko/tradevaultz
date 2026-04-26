import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTrades } from "@/hooks/useTrades";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Trade, STRATEGIES, EMOTIONS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Check, X, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function Trades() {
  const { user } = useAuth();
  const { trades, loading } = useTrades();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Trade>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const [form, setForm] = useState({
    asset: "",
    side: "buy" as "buy" | "sell",
    entry_price: "",
    exit_price: "",
    volume: "",
    pnl: "",
    strategy: STRATEGIES[0],
    emotion: EMOTIONS[0].value,
    note: "",
    trade_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  });

  // Open dialog when ?new=1 (from bottom-bar FAB)
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setOpen(true);
      searchParams.delete("new");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const entry = parseFloat(form.entry_price);
    const exit = parseFloat(form.exit_price);
    const vol = parseFloat(form.volume);
    const pnl = parseFloat(form.pnl);
    if (Number.isNaN(pnl)) return toast.error("Please enter P&L");
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
    setForm({ ...form, asset: "", entry_price: "", exit_price: "", volume: "", pnl: "", note: "" });
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
    const side = (editDraft.side as "buy" | "sell") ?? "buy";
    const { error } = await supabase.from("trades").update({
      asset: editDraft.asset,
      side,
      entry_price: Number(editDraft.entry_price),
      exit_price: Number(editDraft.exit_price),
      volume: Number(editDraft.volume),
      strategy: editDraft.strategy,
      emotion: editDraft.emotion,
      note: editDraft.note,
      pnl: Number(editDraft.pnl),
    }).eq("id", editingId);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    setEditingId(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Trade Log</h1>
          <p className="text-muted-foreground mt-1 text-sm">{trades.length} trades recorded</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 font-semibold hidden lg:inline-flex" style={{ background: "var(--gradient-primary)", color: "hsl(var(--primary-foreground))" }}>
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
                  <Label>P&L ($)</Label>
                  <Input
                    type="number"
                    step="any"
                    required
                    value={form.pnl}
                    onChange={(e) => setForm({ ...form, pnl: e.target.value })}
                    placeholder="e.g. 125.50 or -40"
                  />
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
                <div className="col-span-2">
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

      {/* Desktop full table */}
      <div className="glass-card rounded-xl overflow-hidden hidden md:block">
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
                      {isEdit ? (
                        <Input className="h-8 w-24" type="number" step="any" value={editDraft.pnl as any} onChange={(e) => setEditDraft({ ...editDraft, pnl: parseFloat(e.target.value) })} />
                      ) : (
                        <>{Number(t.pnl) >= 0 ? "+" : ""}{Number(t.pnl).toFixed(2)}</>
                      )}
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

      {/* Mobile compact list — Asset / Volume / P&L; tap row to expand */}
      <div className="md:hidden glass-card rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2.5 bg-secondary/40 border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          <span>Asset</span>
          <span className="text-right">Vol</span>
          <span className="text-right">P&L</span>
        </div>
        {loading && <div className="py-12 text-center text-muted-foreground text-sm">Loading…</div>}
        {!loading && trades.length === 0 && (
          <div className="py-12 text-center text-muted-foreground text-sm">No trades yet. Tap the + button below.</div>
        )}
        {trades.map((t) => {
          const isOpen = expandedId === t.id;
          const pnlNum = Number(t.pnl);
          return (
            <div key={t.id} className="border-b border-border/40 last:border-b-0">
              <button
                onClick={() => setExpandedId(isOpen ? null : t.id)}
                className="w-full grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3 py-3 text-left hover:bg-secondary/30 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{t.asset}</div>
                    <div className="text-[10px] text-muted-foreground">{format(new Date(t.trade_date), "MMM dd, HH:mm")}</div>
                  </div>
                </div>
                <span className="text-sm tabular-nums text-right">{Number(t.volume)}</span>
                <span className={`font-bold tabular-nums text-right text-sm ${pnlNum >= 0 ? "text-success" : "text-destructive"}`}>
                  {pnlNum >= 0 ? "+" : ""}{pnlNum.toFixed(2)}
                </span>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 pt-1 grid grid-cols-2 gap-y-1.5 gap-x-3 text-xs bg-secondary/20">
                  <div className="text-muted-foreground">Side</div>
                  <div className="text-right">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${t.side === "buy" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>{t.side.toUpperCase()}</span>
                  </div>
                  <div className="text-muted-foreground">Entry</div>
                  <div className="text-right tabular-nums">{Number(t.entry_price).toFixed(2)}</div>
                  <div className="text-muted-foreground">Exit</div>
                  <div className="text-right tabular-nums">{Number(t.exit_price).toFixed(2)}</div>
                  <div className="text-muted-foreground">Strategy</div>
                  <div className="text-right truncate">{t.strategy ?? "—"}</div>
                  <div className="text-muted-foreground">Emotion</div>
                  <div className="text-right text-base">{t.emotion ?? "—"}</div>
                  {t.note && (
                    <>
                      <div className="text-muted-foreground col-span-2 mt-1">Note</div>
                      <div className="col-span-2 text-foreground/80">{t.note}</div>
                    </>
                  )}
                  <div className="col-span-2 flex justify-end gap-2 mt-2">
                    <Button size="sm" variant="outline" className="h-8" onClick={() => { startEdit(t); }}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-destructive border-destructive/30" onClick={() => handleDelete(t.id)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile edit dialog */}
      <Dialog open={!!editingId} onOpenChange={(o) => !o && setEditingId(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto md:hidden">
          <DialogHeader><DialogTitle>Edit Trade</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Asset</Label>
                <Input value={editDraft.asset ?? ""} onChange={(e) => setEditDraft({ ...editDraft, asset: e.target.value })} />
              </div>
              <div>
                <Label>Side</Label>
                <Select value={editDraft.side as string} onValueChange={(v: "buy" | "sell") => setEditDraft({ ...editDraft, side: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="buy">Buy</SelectItem><SelectItem value="sell">Sell</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label>Entry</Label>
                <Input type="number" step="any" value={editDraft.entry_price as any} onChange={(e) => setEditDraft({ ...editDraft, entry_price: parseFloat(e.target.value) })} />
              </div>
              <div>
                <Label>Exit</Label>
                <Input type="number" step="any" value={editDraft.exit_price as any} onChange={(e) => setEditDraft({ ...editDraft, exit_price: parseFloat(e.target.value) })} />
              </div>
              <div>
                <Label>Volume</Label>
                <Input type="number" step="any" value={editDraft.volume as any} onChange={(e) => setEditDraft({ ...editDraft, volume: parseFloat(e.target.value) })} />
              </div>
              <div>
                <Label>P&L</Label>
                <Input type="number" step="any" value={editDraft.pnl as any} onChange={(e) => setEditDraft({ ...editDraft, pnl: parseFloat(e.target.value) })} />
              </div>
              <div className="col-span-2">
                <Label>Strategy</Label>
                <Select value={editDraft.strategy as string} onValueChange={(v) => setEditDraft({ ...editDraft, strategy: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STRATEGIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Note</Label>
              <Textarea value={editDraft.note ?? ""} onChange={(e) => setEditDraft({ ...editDraft, note: e.target.value })} rows={3} />
            </div>
            <Button onClick={saveEdit} className="w-full font-semibold" style={{ background: "var(--gradient-primary)", color: "hsl(var(--primary-foreground))" }}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
