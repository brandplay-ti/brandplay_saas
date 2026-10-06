import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Upload, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { parseCSV, normalizeHeader, parseNumberBR } from "@/lib/csvParse";

interface Property { id: string; name: string; }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string | null;
  userId: string | null;
  properties: Property[];
  existingNames: string[];
  knownCategories: string[];
  onCategoriesCreated: (names: string[]) => void;
  onImported: () => void;
}

interface ParsedRow {
  line: number;
  name: string;
  category: string;
  unit_value: number;
  quantity: number;
  notes: string;
  propertyName: string;
  propertyId: string | null;
  errors: string[];
  warnings: string[];
}

const TEMPLATE = [
  "nome,categoria,valor_unitario,quantidade,propriedade,observacoes",
  "Placa de campo 3x1,Placa,25000,2,Campeonato Estadual,Visível nas transmissões",
  "Naming do evento,Naming,150000,1,,Cota exclusiva",
].join("\n");

const HEADER_ALIASES: Record<string, string> = {
  nome: "name",
  name: "name",
  ativo: "name",
  categoria: "category",
  category: "category",
  valor_unitario: "unit_value",
  valor: "unit_value",
  unit_value: "unit_value",
  preco: "unit_value",
  quantidade: "quantity",
  qtd: "quantity",
  quantity: "quantity",
  propriedade: "property",
  property: "property",
  observacoes: "notes",
  obs: "notes",
  notas: "notes",
  notes: "notes",
};

const norm = (s: string) =>
  s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export default function AssetBulkImportDialog({
  open,
  onOpenChange,
  orgId,
  userId,
  properties,
  existingNames,
  knownCategories,
  onCategoriesCreated,
  onImported,
}: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const rows: ParsedRow[] = useMemo(() => {
    if (!raw.trim()) return [];
    const matrix = parseCSV(raw);
    if (matrix.length === 0) return [];
    const headers = matrix[0].map((h) => HEADER_ALIASES[normalizeHeader(h)] ?? normalizeHeader(h));
    if (!headers.includes("name")) return [];
    const existing = new Set(existingNames.map(norm));
    const propByName = new Map(properties.map((p) => [norm(p.name), p.id]));

    return matrix.slice(1).map((cells, idx) => {
      const get = (key: string) => {
        const i = headers.indexOf(key);
        return i > -1 ? (cells[i] ?? "").trim() : "";
      };
      const errors: string[] = [];
      const warnings: string[] = [];

      const name = get("name").slice(0, 200);
      if (!name) errors.push("Nome vazio");
      else if (existing.has(norm(name))) warnings.push("Nome já existe no catálogo");

      const category = get("category") || "Outro";

      const valueRaw = get("unit_value");
      const parsedValue = parseNumberBR(valueRaw);
      if (parsedValue === null) errors.push("Valor inválido");

      const qtyRaw = get("quantity");
      const parsedQty = qtyRaw ? parseNumberBR(qtyRaw) : 1;
      if (parsedQty === null || parsedQty === undefined) errors.push("Quantidade inválida");

      const propertyName = get("property");
      const propertyId = propertyName ? propByName.get(norm(propertyName)) ?? null : null;
      if (propertyName && !propertyId) warnings.push("Propriedade não encontrada");

      return {
        line: idx + 2,
        name,
        category,
        unit_value: parsedValue ?? 0,
        quantity: Math.max(1, Math.round(parsedQty || 1)),
        notes: get("notes").slice(0, 2000),
        propertyName,
        propertyId,
        errors,
        warnings,
      };
    });
  }, [raw, properties, existingNames]);

  const validRows = rows.filter((r) => r.errors.length === 0);
  const invalidRows = rows.filter((r) => r.errors.length > 0);
  const headerMissing = raw.trim().length > 0 && rows.length === 0;

  const newCategories = useMemo(() => {
    const known = new Set(knownCategories.map(norm));
    const out: string[] = [];
    validRows.forEach((r) => {
      if (!known.has(norm(r.category))) {
        known.add(norm(r.category));
        out.push(r.category);
      }
    });
    return out;
  }, [validRows, knownCategories]);

  const reset = () => {
    setRaw("");
    setProgress(0);
    setImporting(false);
  };

  const downloadTemplate = () => {
    const blob = new Blob(["\uFEFF" + TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-ativos.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      return toast({ title: "Arquivo muito grande", description: "Limite de 5 MB.", variant: "destructive" });
    }
    setRaw(await file.text());
  };

  const runImport = async () => {
    if (!orgId || !userId || validRows.length === 0) return;
    setImporting(true);
    setProgress(0);

    const chunkSize = 100;
    let created = 0;
    const allocations: { asset_id: string; property_id: string; organization_id: string }[] = [];

    for (let i = 0; i < validRows.length; i += chunkSize) {
      const chunk = validRows.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from("assets")
        .insert(
          chunk.map((r) => ({
            owner_id: userId,
            organization_id: orgId,
            name: r.name,
            category: r.category,
            unit_value: r.unit_value,
            quantity: r.quantity,
            notes: r.notes || null,
          })),
        )
        .select("id");

      if (error) {
        setImporting(false);
        return toast({ title: "Erro na importação", description: error.message, variant: "destructive" });
      }

      (data ?? []).forEach((row: { id: string }, idx: number) => {
        created++;
        const src = chunk[idx];
        if (src?.propertyId) {
          allocations.push({ asset_id: row.id, property_id: src.propertyId, organization_id: orgId });
        }
      });

      setProgress(Math.round(((i + chunk.length) / validRows.length) * 100));
    }

    if (allocations.length > 0) {
      await supabase.from("asset_allocations" as any).insert(allocations);
    }

    if (newCategories.length > 0) onCategoriesCreated(newCategories);

    setImporting(false);
    toast({
      title: "Importação concluída",
      description: `${created} ativo(s) importado(s)${invalidRows.length ? `, ${invalidRows.length} linha(s) ignorada(s)` : ""}.`,
    });
    reset();
    onOpenChange(false);
    onImported();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" /> Importar ativos em massa
          </DialogTitle>
          <DialogDescription>
            Envie um arquivo CSV ou cole o conteúdo. Colunas: nome, categoria, valor_unitario, quantidade, propriedade, observacoes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" /> Baixar modelo
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" /> Selecionar arquivo CSV
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>

          <div>
            <Textarea
              rows={6}
              placeholder="Ou cole aqui o conteúdo CSV…"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          {headerMissing && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
              <span>Não encontramos a coluna "nome" no cabeçalho. Baixe o modelo e ajuste o arquivo.</span>
            </div>
          )}

          {rows.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">{validRows.length} válidas</Badge>
                {invalidRows.length > 0 && <Badge variant="destructive">{invalidRows.length} com erro</Badge>}
                {newCategories.length > 0 && (
                  <Badge variant="outline">{newCategories.length} nova(s) categoria(s): {newCategories.join(", ")}</Badge>
                )}
              </div>

              <div className="border rounded-md overflow-auto max-h-72">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-left">
                      <th className="p-2">#</th>
                      <th className="p-2">Nome</th>
                      <th className="p-2">Categoria</th>
                      <th className="p-2">Valor</th>
                      <th className="p-2">Qtd</th>
                      <th className="p-2">Propriedade</th>
                      <th className="p-2">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.line} className={`border-t ${r.errors.length ? "bg-destructive/5" : ""}`}>
                        <td className="p-2 text-muted-foreground">{r.line}</td>
                        <td className="p-2">{r.name || <span className="text-muted-foreground">—</span>}</td>
                        <td className="p-2">{r.category}</td>
                        <td className="p-2">{r.unit_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                        <td className="p-2">{r.quantity}</td>
                        <td className="p-2">{r.propertyName || "—"}</td>
                        <td className="p-2">
                          {r.errors.length > 0 ? (
                            <span className="text-destructive">{r.errors.join("; ")}</span>
                          ) : r.warnings.length > 0 ? (
                            <span className="text-amber-600 dark:text-amber-500">{r.warnings.join("; ")}</span>
                          ) : (
                            <span className="text-muted-foreground">Ok</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importing && <Progress value={progress} />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancelar
          </Button>
          <Button onClick={runImport} disabled={importing || validRows.length === 0}>
            {importing ? `Importando… ${progress}%` : `Importar ${validRows.length} ativo(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
