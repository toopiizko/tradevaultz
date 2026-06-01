import { useEffect, useState } from "react";

const KEY = "expense-desc-max-len";
const DEFAULT = 60;

export function useDescMaxLen() {
  const [n, setN] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT;
    const v = parseInt(localStorage.getItem(KEY) ?? "", 10);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT;
  });
  useEffect(() => {
    try { localStorage.setItem(KEY, String(n)); } catch { /* ignore */ }
  }, [n]);
  return [n, setN] as const;
}

export function truncate(s: string | null | undefined, max: number): string {
  const t = (s ?? "").trim();
  if (!t) return "";
  if (max <= 0 || t.length <= max) return t;
  return t.slice(0, Math.max(1, max - 1)).trimEnd() + "…";
}
