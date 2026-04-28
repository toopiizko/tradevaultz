import { useState } from "react";
import { useCategories } from "@/hooks/useCategories";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, X, Tag, Settings2 } from "lucide-react";
import { toast } from "sonner";

export function CategoryManager({ trigger }: { trigger?: React.ReactNode }) {
  const { income, expense, add, remove, isCustom } = useCategories();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"expense" | "income">("expense");
  const [name, setName] = useState("");

  const handleAdd = () => {
    const ok = add(tab, name);
    if (!ok) return toast.error("Invalid or duplicate category");
    toast.success("Category added");
    setName("");
  };

  const list = tab === "expense" ? expense : income;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" className="gap-2">
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">Categories</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" /> Manage Categories
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="expense">Expense</TabsTrigger>
            <TabsTrigger value="income">Income</TabsTrigger>
          </TabsList>

          {(["expense", "income"] as const).map((t) => (
            <TabsContent key={t} value={t} className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder={`New ${t} category…`}
                  value={tab === t ? name : ""}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
                />
                <Button onClick={handleAdd} className="gap-1 shrink-0" style={{ background: "var(--gradient-primary)", color: "hsl(var(--primary-foreground))" }}>
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 max-h-[50vh] overflow-y-auto">
                {list.map((c) => {
                  const custom = isCustom(t, c);
                  return (
                    <span
                      key={c}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${
                        custom ? "bg-primary/10 border-primary/30 text-primary" : "bg-secondary/60 border-border/40 text-foreground"
                      }`}
                    >
                      {c}
                      {custom ? (
                        <button
                          onClick={() => remove(t, c)}
                          className="hover:text-destructive"
                          aria-label={`Remove ${c}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      ) : (
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">default</span>
                      )}
                    </span>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">Custom categories are saved on this device.</p>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
