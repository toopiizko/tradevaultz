import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Props = {
  value: number;
  currency: string;
  onSave: (next: number) => void | Promise<void>;
};

/** Inline editable amount: edits the RAW stored amount in its stored currency. */
export function AmountEditor({ value, currency, onSave }: Props) {
  const [v, setV] = useState(String(value));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n < 0) return;
    if (n === Number(value)) return;
    setBusy(true);
    try { await onSave(n); } finally { setBusy(false); }
  };
  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="number"
        step="0.01"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="h-7 text-xs"
        disabled={busy}
      />
      <span className="text-[10px] text-muted-foreground font-medium">{currency}</span>
    </div>
  );
}
