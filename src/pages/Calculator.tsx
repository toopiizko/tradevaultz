import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator as CalcIcon, AlertTriangle } from "lucide-react";

export default function Calculator() {
  const [balance, setBalance] = useState("10000");
  const [riskPct, setRiskPct] = useState("1");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [contractSize, setContractSize] = useState("100000"); // 1 standard lot for FX
  const [unit, setUnit] = useState<"units" | "lots">("lots");

  const result = useMemo(() => {
    const bal = parseFloat(balance);
    const risk = parseFloat(riskPct);
    const e = parseFloat(entry);
    const s = parseFloat(stop);
    const cs = parseFloat(contractSize);
    if (!bal || !risk || !e || !s || e === s) return null;
    const riskAmount = (bal * risk) / 100;
    const distance = Math.abs(e - s);
    const positionUnits = riskAmount / distance;
    const lots = positionUnits / cs;
    return {
      riskAmount,
      distance,
      positionUnits,
      lots,
      rrTargets: [1, 2, 3].map((r) => ({
        ratio: r,
        target: e + (e > s ? distance * r : -distance * r),
        profit: riskAmount * r,
      })),
    };
  }, [balance, riskPct, entry, stop, contractSize]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Position Size Calculator</h1>
        <p className="text-muted-foreground mt-1">Risk-based position sizing</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="glass-card rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
              <CalcIcon className="h-4 w-4 text-primary-foreground" />
            </div>
            <h2 className="font-semibold">Inputs</h2>
          </div>
          <div>
            <Label>Account Balance ($)</Label>
            <Input type="number" value={balance} onChange={(e) => setBalance(e.target.value)} />
          </div>
          <div>
            <Label>Risk per Trade (%)</Label>
            <Input type="number" step="0.1" value={riskPct} onChange={(e) => setRiskPct(e.target.value)} />
          </div>
          <div>
            <Label>Entry Price</Label>
            <Input type="number" step="any" value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="e.g. 1.0850" />
          </div>
          <div>
            <Label>Stop Loss</Label>
            <Input type="number" step="any" value={stop} onChange={(e) => setStop(e.target.value)} placeholder="e.g. 1.0820" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Contract Size</Label>
              <Input type="number" value={contractSize} onChange={(e) => setContractSize(e.target.value)} />
              <p className="text-[10px] text-muted-foreground mt-1">FX std lot = 100,000</p>
            </div>
            <div>
              <Label>Display</Label>
              <Select value={unit} onValueChange={(v: any) => setUnit(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lots">Lots</SelectItem>
                  <SelectItem value="units">Units</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl p-5 border border-primary/30" style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-glow)" }}>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Position Size</p>
            <p className="text-4xl font-bold gradient-text mt-2">
              {result ? (unit === "lots" ? result.lots.toFixed(3) : result.positionUnits.toFixed(0)) : "—"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">{unit === "lots" ? "Lots" : "Units"}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="stat-card">
              <p className="text-xs text-muted-foreground">Risk Amount</p>
              <p className="text-xl font-bold text-destructive mt-1">${result?.riskAmount.toFixed(2) ?? "—"}</p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-muted-foreground">SL Distance</p>
              <p className="text-xl font-bold mt-1">{result?.distance.toFixed(4) ?? "—"}</p>
            </div>
          </div>

          {result && (
            <div className="glass-card rounded-xl p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Profit Targets (R:R)</p>
              <div className="space-y-2">
                {result.rrTargets.map((rr) => (
                  <div key={rr.ratio} className="flex items-center justify-between text-sm border-b border-border/40 last:border-0 pb-2 last:pb-0">
                    <span className="font-medium">1:{rr.ratio} R</span>
                    <span className="text-muted-foreground text-xs">@ {rr.target.toFixed(4)}</span>
                    <span className="font-bold text-success">+${rr.profit.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {parseFloat(riskPct) > 2 && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 flex gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <p className="text-warning-foreground/90">Risking more than 2% per trade is aggressive. Consider lowering it.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
