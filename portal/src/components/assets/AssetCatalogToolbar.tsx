import { Search, LayoutGrid, List, Rows3 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type AssetViewMode = "grid" | "list" | "compact";
export type AssetSortBy =
  | "name_asc"
  | "name_desc"
  | "category"
  | "category_desc"
  | "quantity_desc"
  | "quantity_asc"
  | "value_desc"
  | "value_asc"
  | "exclusive";

export interface AssetCatalogToolbarProps {
  search: string;
  onSearchChange: (v: string) => void;
  sortBy: AssetSortBy;
  onSortChange: (v: AssetSortBy) => void;
  categories?: string[];
  categoryFilter?: string;
  onCategoryChange?: (v: string) => void;
  exclusiveFilter?: "all" | "only" | "none";
  onExclusiveChange?: (v: "all" | "only" | "none") => void;
  viewMode?: AssetViewMode;
  onViewModeChange?: (v: AssetViewMode) => void;
  /** Hide sort options that don't apply to the dataset */
  showQuantitySort?: boolean;
  showValueSort?: boolean;
}

export function AssetCatalogToolbar({
  search,
  onSearchChange,
  sortBy,
  onSortChange,
  categories,
  categoryFilter,
  onCategoryChange,
  exclusiveFilter,
  onExclusiveChange,
  viewMode,
  onViewModeChange,
  showQuantitySort = true,
  showValueSort = true,
}: AssetCatalogToolbarProps) {
  return (
    <div className="flex gap-2 items-center flex-wrap">
      <div className="relative">
        <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8 w-56"
          placeholder="Buscar ativo…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {categories && onCategoryChange && (
        <Select value={categoryFilter ?? "all"} onValueChange={onCategoryChange}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {onExclusiveChange && (
        <Select value={exclusiveFilter ?? "all"} onValueChange={(v) => onExclusiveChange(v as any)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os ativos</SelectItem>
            <SelectItem value="only">Somente exclusivos</SelectItem>
            <SelectItem value="none">Não exclusivos</SelectItem>
          </SelectContent>
        </Select>
      )}

      <Select value={sortBy} onValueChange={(v) => onSortChange(v as AssetSortBy)}>
        <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="name_asc">Nome (A–Z)</SelectItem>
          <SelectItem value="name_desc">Nome (Z–A)</SelectItem>
          {categories && <SelectItem value="category">Categoria (A–Z)</SelectItem>}
          {categories && <SelectItem value="category_desc">Categoria (Z–A)</SelectItem>}
          {showQuantitySort && <SelectItem value="quantity_desc">Quantidade (maior)</SelectItem>}
          {showQuantitySort && <SelectItem value="quantity_asc">Quantidade (menor)</SelectItem>}
          {showValueSort && <SelectItem value="value_desc">Valor (maior)</SelectItem>}
          {showValueSort && <SelectItem value="value_asc">Valor (menor)</SelectItem>}
        </SelectContent>
      </Select>

      {viewMode && onViewModeChange && (
        <div className="flex items-center rounded-md border p-0.5">
          {([
            { v: "grid" as const, icon: LayoutGrid, label: "Cartões" },
            { v: "list" as const, icon: List, label: "Lista" },
            { v: "compact" as const, icon: Rows3, label: "Compacto" },
          ]).map(({ v, icon: Icon, label }) => (
            <Button
              key={v}
              type="button"
              size="sm"
              variant={viewMode === v ? "secondary" : "ghost"}
              className="h-8 px-2"
              aria-label={label}
              title={label}
              onClick={() => onViewModeChange(v)}
            >
              <Icon className="h-4 w-4" />
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export function filterAndSortAssets<
  T extends {
    name: string;
    category?: string | null;
    quantity?: number | null;
    unit_value?: number | null;
    is_exclusive?: boolean | null;
  }
>(
  items: T[],
  opts: {
    search: string;
    sortBy: AssetSortBy;
    categoryFilter?: string;
    exclusiveFilter?: "all" | "only" | "none";
  }
): T[] {
  const term = opts.search.trim().toLowerCase();
  let out = items.filter((a) => {
    if (term && !`${a.name} ${a.category ?? ""}`.toLowerCase().includes(term)) return false;
    if (opts.categoryFilter && opts.categoryFilter !== "all" && a.category !== opts.categoryFilter) return false;
    if (opts.exclusiveFilter === "only" && !a.is_exclusive) return false;
    if (opts.exclusiveFilter === "none" && a.is_exclusive) return false;
    return true;
  });

  const q = (a: T) => Number(a.quantity ?? 0);
  const v = (a: T) => Number(a.unit_value ?? 0) * Number(a.quantity ?? 1);

  out = [...out].sort((a, b) => {
    switch (opts.sortBy) {
      case "name_desc": return b.name.localeCompare(a.name, "pt-BR");
      case "category": return (a.category ?? "").localeCompare(b.category ?? "", "pt-BR") || a.name.localeCompare(b.name, "pt-BR");
      case "category_desc": return (b.category ?? "").localeCompare(a.category ?? "", "pt-BR") || a.name.localeCompare(b.name, "pt-BR");
      case "quantity_desc": return q(b) - q(a);
      case "quantity_asc": return q(a) - q(b);
      case "value_desc": return v(b) - v(a);
      case "value_asc": return v(a) - v(b);
      case "exclusive": return Number(!!b.is_exclusive) - Number(!!a.is_exclusive) || a.name.localeCompare(b.name, "pt-BR");
      default: return a.name.localeCompare(b.name, "pt-BR");
    }
  });

  return out;
}
