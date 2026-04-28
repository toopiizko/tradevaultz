import { useEffect, useMemo, useState } from "react";
import { useExpenses } from "@/hooks/useExpenses";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import { getUsdThbRate, formatMoney } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, ArrowDownCircle, ArrowUpCircle, Wallet, PieChart as PieIcon, Upload, Download, Sparkles, Edit2 } from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth } from "date-fns";
import { extractStatementText, exportExpensesToExcel } from "@/lib/statementIO";
import { Textarea } from "@/components/ui/textarea";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--destructive))",
  "hsl(48 96% 53%)",
  "hsl(280 70% 60%)",
  "hsl(190 80% 55%)",
  "hsl(20 90% 60%)",
  "hsl(150 60% 50%)",
  "hsl(330 70% 60%)",
];

export default function Expenses() {
  const { user } = useAuth();
  const { expenses, loading } = useExpenses();
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState<"USD" | "THB">("USD");
  const [rate, setRate] = useState(36);

  const [form, setForm] = useState({
    type: "expense" as "income" | "expense",
    amount: "",
    category: EXPENSE_CATEGORIES.expense[0],
    description: "",
    expense_date: format(new Date(), "yyyy-MM-dd"),
  });

  useEffect(() => {
    getUsdThbRate().then(setRate);
  }, []);

  // Import state
  const [importing, setImporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<Array<{
    type: "income" | "expense"; amount: number; category: string; description: string; expense_date: string; _selected: boolean;
  }>>([]);
  const [importFileName, setImportFileName] = useState("");
  const ALL_CATS = [...EXPENSE_CATEGORIES.income, ...EXPENSE_CATEGORIES.expense];

  const totals = useMemo(() => {
    const income = expenses.filter((e) => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
    const expense = expenses.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
    return { income, expense, net: income - expense };
  }, [expenses]);

  const convert = (usd: number) => (currency === "THB" ? usd * rate : usd);

  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    expenses
      .filter((e) => e.type === "expense")
      .forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + Number(e.amount)));
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value: Number(convert(value).toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  }, [expenses, currency, rate]);

  const monthlyData = useMemo(() => {
    const map = new Map<string, { month: string; income: number; expense: number }>();
    expenses.forEach((e) => {
      const key = format(startOfMonth(new Date(e.expense_date)), "yyyy-MM");
      const label = format(new Date(e.expense_date), "MMM yy");
      const cur = map.get(key) ?? { month: label, income: 0, expense: 0 };
      if (e.type === "income") cur.income += Number(e.amount);
      else cur.expense += Number(e.amount);
      map.set(key, cur);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([, v]) => ({
        month: v.month,
        Income: Number(convert(v.income).toFixed(2)),
        Expense: Number(convert(v.expense).toFixed(2)),
      }));
  }, [expenses, currency, rate]);

  const topCategory = categoryData[0];
  const totalExpenseConverted = categoryData.reduce((s, c) => s + c.value, 0);

  const display = (amount: number) => {
    const v = currency === "THB" ? amount * rate : amount;
    return formatMoney(v, currency);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const inputAmount = parseFloat(form.amount);
    if (Number.isNaN(inputAmount)) return toast.error("Invalid amount");
    // Always store in USD (base currency); convert if user typed in THB
    const amountUsd = currency === "THB" ? inputAmount / rate : inputAmount;
    const { error } = await supabase.from("expenses").insert({
      user_id: user.id,
      type: form.type,
      amount: amountUsd,
      category: form.category,
      description: form.description || null,
      expense_date: new Date(form.expense_date).toISOString(),
    });
    if (error) return toast.error(error.message);
    toast.success("Saved!");
    setOpen(false);
    setForm({ ...form, amount: "", description: "" });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setImporting(true);
      toast.info("Reading file…");
      const text = await extractStatementText(file);
      if (!text.trim()) throw new Error("Could not read file content");

      toast.info("AI analyzing statement…");
      const { data, error } = await supabase.functions.invoke("analyze-statement", {
        body: { text, currencyHint: currency },
      });
      if (error) throw error;
      const txns = (data?.transactions ?? []) as Array<any>;
      if (!txns.length) {
        toast.warning("No transactions detected");
        setImporting(false);
        return;
      }
      setImportRows(txns.map((t) => ({
        type: t.type === "income" ? "income" : "expense",
        amount: Number(t.amount) || 0,
        category: t.category || "Other",
        description: String(t.description || ""),
        expense_date: String(t.expense_date || format(new Date(), "yyyy-MM-dd")).slice(0, 10),
        _selected: true,
      })));
      setImportFileName(file.name);
      setImportOpen(true);
      toast.success(`Found ${txns.length} transactions`);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to analyze statement");
    } finally {
      setImporting(false);
    }
  };

  const handleImportSave = async () => {
    if (!user) return;
    const picked = importRows.filter((r) => r._selected);
    if (!picked.length) return toast.error("Nothing selected");
    const rows = picked.map((r) => {
      // treat amount as already in the selected currency; store as USD
      const amountUsd = currency === "THB" ? r.amount / rate : r.amount;
      return {
        user_id: user.id,
        type: r.type,
        amount: amountUsd,
        category: r.category,
        description: r.description || null,
        expense_date: new Date(r.expense_date).toISOString(),
      };
    });
    const { error } = await supabase.from("expenses").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(`Imported ${rows.length} transactions`);
    setImportOpen(false);
    setImportRows([]);
  };

  const handleExport = () => {
    if (!expenses.length) return toast.error("Nothing to export");
    exportExpensesToExcel(expenses as any);
    toast.success("Exported");
  };


  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Expense Tracker</h1>
          <p className="text-muted-foreground mt-1">Personal income & expenses (1 USD ≈ {rate.toFixed(2)} THB)</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border bg-secondary/50 p-0.5">
            {(["USD", "THB"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                  currency === c ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <label className="relative">
            <input
              type="file"
              accept=".pdf,.xlsx,.xls,.csv"
              onChange={handleFilePick}
              disabled={importing}
              className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-wait"
            />
            <Button variant="outline" className="gap-2 pointer-events-none" disabled={importing}>
              {importing ? <Sparkles className="h-4 w-4 animate-pulse" /> : <Upload className="h-4 w-4" />}
              <span className="hidden sm:inline">{importing ? "Analyzing…" : "Import"}</span>
            </Button>
          </label>
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 font-semibold" style={{ background: "var(--gradient-primary)", color: "hsl(var(--primary-foreground))" }}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
              <form onSubmit={handleAdd} className="space-y-3">
                <div>
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v: "income" | "expense") => setForm({ ...form, type: v, category: EXPENSE_CATEGORIES[v][0] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income">Income</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Amount ({currency})</Label>
                    <Input
                      type="number"
                      step="0.01"
                      required
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      placeholder={currency === "THB" ? "e.g. 1000" : "e.g. 25.00"}
                    />
                    {currency === "THB" && form.amount && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        ≈ ${(parseFloat(form.amount) / rate || 0).toFixed(2)} USD (stored)
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>Date</Label>
                    <Input type="date" required value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES[form.type].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Description</Label>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <Button type="submit" className="w-full font-semibold" style={{ background: "var(--gradient-primary)", color: "hsl(var(--primary-foreground))" }}>Save</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 lg:gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpCircle className="h-4 w-4 text-success" />
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Income</p>
          </div>
          <p className="text-xl lg:text-2xl font-bold text-success">{display(totals.income)}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <ArrowDownCircle className="h-4 w-4 text-destructive" />
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Expense</p>
          </div>
          <p className="text-xl lg:text-2xl font-bold text-destructive">{display(totals.expense)}</p>
        </div>
        <div className="stat-card border-primary/30" style={{ boxShadow: "var(--shadow-glow)" }}>
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="h-4 w-4 text-primary" />
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Net</p>
          </div>
          <p className={`text-xl lg:text-2xl font-bold ${totals.net >= 0 ? "text-success" : "text-destructive"}`}>{display(totals.net)}</p>
        </div>
      </div>

      {/* Insights dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <PieIcon className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Spending by Category</h2>
            </div>
            <span className="text-xs text-muted-foreground">{currency}</span>
          </div>
          <div className="h-64">
            {categoryData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No expenses yet</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => formatMoney(v, currency)}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          {topCategory && (
            <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Top category</span>
              <span className="font-semibold">
                {topCategory.name} · {((topCategory.value / totalExpenseConverted) * 100).toFixed(0)}%
              </span>
            </div>
          )}
        </div>

        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Monthly Trend</h2>
            <span className="text-xs text-muted-foreground">Last 6 months</span>
          </div>
          <div className="h-64">
            {monthlyData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => formatMoney(v, currency)}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Income" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Expense" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 border-b border-border/60">
              <tr className="text-left">
                {["Date", "Type", "Category", "Description", "Amount", ""].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-xs uppercase tracking-wider text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">Loading…</td></tr>}
              {!loading && expenses.length === 0 && <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">No transactions yet.</td></tr>}
              {expenses.map((e) => (
                <tr key={e.id} className="border-b border-border/40 hover:bg-secondary/30">
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{format(new Date(e.expense_date), "MMM dd, yyyy")}</td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${e.type === "income" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                      {e.type === "income" ? "IN" : "OUT"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs">{e.category}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-xs truncate">{e.description}</td>
                  <td className={`px-3 py-2.5 font-bold ${e.type === "income" ? "text-success" : "text-destructive"}`}>
                    {e.type === "income" ? "+" : "-"}{display(Number(e.amount))}
                  </td>
                  <td className="px-3 py-2.5">
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
