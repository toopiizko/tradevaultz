import { useMemo } from "react";
import { useTrades } from "@/hooks/useTrades";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, TrendingDown, Target, DollarSign, Activity } from "lucide-react";
import { format } from "date-fns";

function StatCard({ label, value, icon: Icon, accent, sub }: any) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${accent ?? ""}`}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className="h-9 w-9 rounded-lg bg-secondary/80 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { trades, loading } = useTrades();

  const stats = useMemo(() => {
    const closed = trades;
    const wins = closed.filter((t) => Number(t.pnl) > 0);
    const losses = closed.filter((t) => Number(t.pnl) < 0);
    const totalPnL = closed.reduce((s, t) => s + Number(t.pnl), 0);
    const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
    const grossWin = wins.reduce((s, t) => s + Number(t.pnl), 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + Number(t.pnl), 0));
    const profitFactor = grossLoss ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
    const avgWin = wins.length ? grossWin / wins.length : 0;
    const avgLoss = losses.length ? grossLoss / losses.length : 0;
    return { totalPnL, winRate, profitFactor, totalTrades: closed.length, wins: wins.length, losses: losses.length, avgWin, avgLoss };
  }, [trades]);

  const equityCurve = useMemo(() => {
    const sorted = [...trades].sort((a, b) => new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime());
    let cum = 0;
    return sorted.map((t) => {
      cum += Number(t.pnl);
      return { date: format(new Date(t.trade_date), "MMM dd"), equity: Number(cum.toFixed(2)) };
    });
  }, [trades]);

  const strategyData = useMemo(() => {
    const map = new Map<string, { strategy: string; pnl: number; count: number; wins: number }>();
    trades.forEach((t) => {
      const k = t.strategy || "Unspecified";
      const cur = map.get(k) || { strategy: k, pnl: 0, count: 0, wins: 0 };
      cur.pnl += Number(t.pnl);
      cur.count += 1;
      if (Number(t.pnl) > 0) cur.wins += 1;
      map.set(k, cur);
    });
    return Array.from(map.values()).map((s) => ({ ...s, pnl: Number(s.pnl.toFixed(2)), winRate: Math.round((s.wins / s.count) * 100) }));
  }, [trades]);

  const assetData = useMemo(() => {
    const map = new Map<string, { asset: string; count: number; wins: number; pnl: number }>();
    trades.forEach((t) => {
      const k = t.asset || "Unknown";
      const cur = map.get(k) || { asset: k, count: 0, wins: 0, pnl: 0 };
      cur.count += 1;
      cur.pnl += Number(t.pnl);
      if (Number(t.pnl) > 0) cur.wins += 1;
      map.set(k, cur);
    });
    const total = trades.length || 1;
    return Array.from(map.values())
      .map((a) => ({
        ...a,
        pct: Number(((a.count / total) * 100).toFixed(1)),
        winRate: Math.round((a.wins / a.count) * 100),
        pnl: Number(a.pnl.toFixed(2)),
      }))
      .sort((a, b) => b.count - a.count);
  }, [trades]);

  const ASSET_COLORS = [
    "hsl(var(--primary))",
    "hsl(var(--success))",
    "hsl(var(--destructive))",
    "hsl(var(--accent))",
    "hsl(220 70% 60%)",
    "hsl(280 65% 60%)",
    "hsl(35 90% 55%)",
    "hsl(160 60% 50%)",
    "hsl(330 70% 60%)",
    "hsl(200 80% 55%)",
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Performance at a glance</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard
          label="Total P&L"
          value={`$${stats.totalPnL.toFixed(2)}`}
          icon={DollarSign}
          accent={stats.totalPnL >= 0 ? "text-success" : "text-destructive"}
          sub={`${stats.totalTrades} trades`}
        />
        <StatCard
          label="Win Rate"
          value={`${stats.winRate.toFixed(1)}%`}
          icon={Target}
          accent="text-primary"
          sub={`${stats.wins}W / ${stats.losses}L`}
        />
        <StatCard
          label="Profit Factor"
          value={isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "∞"}
          icon={Activity}
          accent={stats.profitFactor >= 1 ? "text-success" : "text-destructive"}
        />
        <StatCard
          label="Avg Win / Loss"
          value={`$${stats.avgWin.toFixed(0)} / $${stats.avgLoss.toFixed(0)}`}
          icon={stats.avgWin >= stats.avgLoss ? TrendingUp : TrendingDown}
          accent="text-foreground"
        />
      </div>

      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Equity Curve</h2>
          <span className="text-xs text-muted-foreground">Cumulative P&L over time</span>
        </div>
        <div className="h-72">
          {equityCurve.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              {loading ? "Loading..." : "No trades yet — log your first trade!"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={equityCurve}>
                <defs>
                  <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Line type="monotone" dataKey="equity" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} fill="url(#eq)" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Strategy Performance</h2>
          <span className="text-xs text-muted-foreground">P&L by strategy</span>
        </div>
        <div className="h-72">
          {strategyData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={strategyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="strategy" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="pnl" name="P&L ($)" radius={[6, 6, 0, 0]}>
                  {strategyData.map((d, i) => (
                    <rect key={i} fill={d.pnl >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
