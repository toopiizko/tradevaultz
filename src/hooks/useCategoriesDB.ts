import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { EXPENSE_CATEGORIES } from "@/lib/types";

export type CategoryRow = {
  id: string;
  user_id: string;
  name: string;
  type: "income" | "expense";
  color: string;
  icon: string | null;
};

export function useCategoriesDB() {
  const { user } = useAuth();
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("expense_categories")
      .select("*")
      .order("created_at", { ascending: true });
    setRows((data ?? []) as CategoryRow[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
    if (!user) return;
    const ch = supabase
      .channel("expense_categories-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_categories" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, refresh]);

  const customIncome = rows.filter((r) => r.type === "income").map((r) => r.name);
  const customExpense = rows.filter((r) => r.type === "expense").map((r) => r.name);

  const allIncome = [
    ...EXPENSE_CATEGORIES.income.filter((c) => c !== "Other"),
    ...customIncome,
    "Other",
  ];
  const allExpense = [
    ...EXPENSE_CATEGORIES.expense.filter((c) => c !== "Other"),
    ...customExpense,
    "Other",
  ];

  const add = useCallback(async (type: "income" | "expense", name: string, color = "#6366f1") => {
    if (!user) return false;
    const n = name.trim();
    if (!n) return false;
    const defaults = EXPENSE_CATEGORIES[type] as readonly string[];
    const existing = [...defaults, ...rows.filter((r) => r.type === type).map((r) => r.name)]
      .map((s) => s.toLowerCase());
    if (existing.includes(n.toLowerCase())) return false;
    const { error } = await supabase
      .from("expense_categories")
      .insert({ user_id: user.id, name: n, type, color });
    if (error) return false;
    return true;
  }, [user, rows]);

  const remove = useCallback(async (type: "income" | "expense", name: string) => {
    const row = rows.find((r) => r.type === type && r.name === name);
    if (!row) return;
    await supabase.from("expense_categories").delete().eq("id", row.id);
  }, [rows]);

  const isCustom = useCallback((type: "income" | "expense", name: string) => {
    return rows.some((r) => r.type === type && r.name === name);
  }, [rows]);

  const colorOf = useCallback((type: "income" | "expense", name: string) => {
    const r = rows.find((x) => x.type === type && x.name === name);
    return r?.color ?? null;
  }, [rows]);

  return {
    income: allIncome,
    expense: allExpense,
    rows,
    loading,
    add,
    remove,
    isCustom,
    colorOf,
    refresh,
  };
}
