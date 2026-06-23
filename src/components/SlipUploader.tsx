import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, Sparkles, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useCategoriesDB } from "@/hooks/useCategoriesDB";
import { useWallets, ALL_WALLETS } from "@/hooks/useWallets";
import { useCategorizeRules } from "@/hooks/useCategorizeRules";
import { useCurrency } from "@/lib/currency-context";
import { format } from "date-fns";
import { compressDataUrl } from "@/lib/imageCompress";

type Slip = {
  type: "income" | "expense";
  amount: number;
  currency: string;
  expense_date: string;
  merchant: string;
  description: string;
  suggested_category: string;
  confidence: number;
  _userChangedCategory?: boolean;
  _selected: boolean;
  _previewUrl: string;
};

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } {
  const [meta, b64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(meta)?.[1] || "image/jpeg";
  const ext = mime.split("/")[1]?.split("+")[0] || "jpg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return { blob: new Blob([arr], { type: mime }), ext };
}

export function SlipUploader({ trigger }: { trigger?: React.ReactNode }) {
  const { user } = useAuth();
  const { expense: expenseCats, income: incomeCats } = useCategoriesDB();
  const { wallets, activeId: activeWalletId } = useWallets();
  const { rate, currency: appCurrency } = useCurrency();
  const { apply: applyRules, add: addRule } = useCategorizeRules();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [slips, setSlips] = useState<Slip[]>([]);
  const [walletId, setWalletId] = useState<string>(activeWalletId !== ALL_WALLETS ? activeWalletId : "");

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const MAX_SLIPS = 20;
    const BATCH = 5;
    const all = Array.from(e.target.files ?? []);
    const files = all.slice(0, MAX_SLIPS);
    e.target.value = "";
    if (!files.length) return;
    if (all.length > MAX_SLIPS) toast.info(`Picked first ${MAX_SLIPS} of ${all.length} files`);
    setOpen(true);
    setBusy(true);
    try {
      const dataUrls = await Promise.all(files.map(fileToDataUrl));
      toast.info(`AI analyzing ${files.length} slip${files.length > 1 ? "s" : ""}…`);
      // Batch into chunks of 5 (parse-slip limit) and call in parallel
      const chunks: { urls: string[]; offset: number }[] = [];
      for (let i = 0; i < dataUrls.length; i += BATCH) {
        chunks.push({ urls: dataUrls.slice(i, i + BATCH), offset: i });
      }
      const results = await Promise.all(
        chunks.map((c) =>
          supabase.functions.invoke("parse-slip", { body: { images: c.urls, currencyHint: appCurrency } })
        )
      );
      const parsed: Slip[] = [];
      results.forEach((r, idx) => {
        if (r.error) throw r.error;
        const chunk = chunks[idx];
        const slips = (r.data?.slips ?? []) as Slip[];
        slips.forEach((s, i) => {
          parsed.push({ ...s, _previewUrl: dataUrls[chunk.offset + i] ?? "" } as Slip);
        });
      });
      const enriched = parsed.map((s) => {
        const ruled = applyRules(s.description || s.merchant || "", s.type);
        return {
          ...s,
          suggested_category: ruled || s.suggested_category || "Other",
          _selected: true,
        };
      });
      setSlips(enriched);
      toast.success(`Parsed ${enriched.length} slip${enriched.length > 1 ? "s" : ""}`);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to parse slip");
    } finally {
      setBusy(false);
    }
  };

  const update = (i: number, patch: Partial<Slip>) => {
    setSlips((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  const handleSave = async () => {
    if (!user) return;
    const picked = slips.filter((s) => s._selected);
    if (!picked.length) return toast.error("Nothing selected");
    setBusy(true);
    try {
      const rows = picked.map((s) => {
        const cur = (s.currency || "THB").toUpperCase();
        return {
          user_id: user.id,
          type: s.type,
          amount: s.amount,
          currency: cur,
          category: s.suggested_category,
          description: (s.description || "").trim() || null,
          expense_date: new Date(s.expense_date).toISOString(),
          ...(walletId ? { wallet_id: walletId } as any : {}),
        } as any;
      });
      const { data: inserted, error } = await supabase.from("expenses").insert(rows as any).select("id");
      if (error) throw error;

      // Compress + upload slip image for each saved row → store paths in expenses.image_urls
      for (let i = 0; i < picked.length; i++) {
        const s = picked[i];
        const row = inserted?.[i];
        if (!row || !s._previewUrl) continue;
        try {
          const { blob, ext, bytes } = await compressDataUrl(s._previewUrl);
          const key = `${user.id}/expense/${row.id}/${Date.now()}-slip.${ext}`;
          const up = await supabase.storage.from("transaction-images").upload(key, blob, { contentType: blob.type, upsert: false });
          if (up.error) { console.warn("slip upload failed", up.error); continue; }
          await supabase.from("expenses").update({ image_urls: [key] } as any).eq("id", row.id);
          console.log(`slip ${i} compressed → ${(bytes / 1024).toFixed(0)}KB`);
        } catch (e) { console.warn(e); }
      }

      // Auto-learn: if user changed the category, create a rule from the merchant keyword
      for (const s of picked) {
        if (!s._userChangedCategory) continue;
        const keyword = (s.merchant || "").trim().split(/\s+/).slice(0, 3).join(" ");
        if (keyword.length < 3) continue;
        try {
          await addRule({
            match_type: "keyword",
            pattern: keyword,
            category: s.suggested_category,
            transaction_type: s.type,
            priority: 10,
          });
        } catch { /* ignore duplicate */ }
      }

      toast.success(`Saved ${rows.length} transaction${rows.length > 1 ? "s" : ""}`);
      setSlips([]);
      setOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {trigger ?? (
        <Button asChild variant="outline" size="sm" className="gap-1.5 relative overflow-hidden">
          <label className="cursor-pointer">
            <Receipt className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Slip</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handlePick}
              className="absolute inset-0 opacity-0 cursor-pointer"
              aria-label="Upload slip image"
            />
          </label>
        </Button>
      )}
      <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) { setOpen(false); setSlips([]); } else setOpen(o); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Review Parsed Slips
          </DialogTitle>
        </DialogHeader>

        {busy && slips.length === 0 && (
          <div className="py-8 flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <p className="text-sm">Reading slip with AI…</p>
          </div>
        )}

        {slips.length > 0 && (
          <div className="space-y-3">
            <div>
              <Label>Save to wallet</Label>
              <Select value={walletId || "none"} onValueChange={(v) => setWalletId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {wallets.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: w.color }} />
                        {w.name} ({w.currency})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {slips.map((s, i) => {
              const cats = s.type === "income" ? incomeCats : expenseCats;
              return (
                <div key={i} className="rounded-lg border border-border/60 p-3 space-y-2 bg-secondary/30">
                  <div className="flex items-start gap-3">
                    {s._previewUrl && (
                      <img src={s._previewUrl} alt="slip" className="h-20 w-20 rounded object-cover border border-border" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <input type="checkbox" checked={s._selected} onChange={(e) => update(i, { _selected: e.target.checked })} />
                        <span className="text-[10px] text-muted-foreground">conf {(s.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <p className="font-semibold text-sm truncate">{s.merchant || "—"}</p>
                    </div>
                  </div>

                  {/* AI-extracted note preview — confirm before save */}
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-2">
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-[10px] flex items-center gap-1 text-primary">
                        <Sparkles className="h-3 w-3" /> AI-extracted Note (will be saved as Description)
                      </Label>
                      {!(s.description || "").trim() && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">⚠ No note on slip</span>
                      )}
                    </div>
                    <Input
                      className="h-8 text-xs"
                      value={s.description}
                      placeholder="(empty — will save with no description)"
                      onChange={(e) => update(i, { description: e.target.value })}
                    />
                    {!(s.description || "").trim() && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        AI didn't find a user note on this slip. It will be saved with an empty description. You can type one above if you'd like.
                      </p>
                    )}
                  </div>


                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px]">Type</Label>
                      <Select value={s.type} onValueChange={(v: "income" | "expense") => update(i, { type: v })}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="expense">Expense</SelectItem>
                          <SelectItem value="income">Income</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px]">Amount ({s.currency || "THB"})</Label>
                      <Input className="h-8" type="number" step="any" value={s.amount}
                        onChange={(e) => update(i, { amount: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Date</Label>
                      <Input className="h-8" type="date" value={s.expense_date.slice(0, 10)}
                        onChange={(e) => update(i, { expense_date: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Category</Label>
                      <Select value={s.suggested_category} onValueChange={(v) => update(i, { suggested_category: v, _userChangedCategory: true })}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {cats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => setSlips((p) => p.filter((_, x) => x !== i))}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                    </Button>
                  </div>
                </div>
              );
            })}

            <p className="text-[11px] text-muted-foreground">
              💡 If you change the category, a rule is auto-saved so future slips from "{slips[0]?.merchant?.split(/\s+/).slice(0, 3).join(" ") || "this merchant"}" auto-categorize.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => { setOpen(false); setSlips([]); }} disabled={busy}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy || slips.filter((s) => s._selected).length === 0}
            style={{ background: "var(--gradient-primary)", color: "hsl(var(--primary-foreground))" }}>
            {busy ? "Saving…" : `Save ${slips.filter((s) => s._selected).length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
