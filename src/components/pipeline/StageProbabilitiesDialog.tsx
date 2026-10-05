import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Stage = Database["public"]["Enums"]["opportunity_stage"];

const STAGES: { id: Stage; label: string; default: number }[] = [
  { id: "prospect", label: "Prospect", default: 10 },
  { id: "reuniao", label: "Reunião", default: 30 },
  { id: "proposta_enviada", label: "Proposta enviada", default: 60 },
  { id: "negociacao", label: "Negociação", default: 80 },
  { id: "fechado", label: "Fechado", default: 100 },
  { id: "perdido", label: "Perdido", default: 0 },
];

export function StageProbabilitiesDialog({
  open,
  onOpenChange,
  current,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  current: Record<Stage, number>;
  onSaved: (next: Record<Stage, number>) => void;
}) {
  const { user } = useAuth();
  const { orgId } = useOrganization();
  const [values, setValues] = useState<Record<Stage, number>>(current);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setValues(current);
  }, [open, current]);

  const handleSave = async () => {
    if (!user || !orgId) return;
    setSaving(true);
    const rows = STAGES.map((s) => ({
      user_id: user.id,
      organization_id: orgId,
      stage: s.id,
      probability: Math.max(0, Math.min(100, Number(values[s.id]) || 0)),
    }));
    const { error } = await supabase.from("user_stage_probabilities").upsert(rows, {
      onConflict: "user_id,organization_id,stage",
    });
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar probabilidades");
      return;
    }
    toast.success("Probabilidades salvas");
    onSaved(Object.fromEntries(rows.map((r) => [r.stage, r.probability])) as Record<Stage, number>);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Probabilidades por etapa</DialogTitle>
          <DialogDescription>
            Usadas para calcular o forecast ponderado. Valores entre 0 e 100.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          {STAGES.map((s) => (
            <div key={s.id} className="grid grid-cols-2 items-center gap-3">
              <Label htmlFor={`prob-${s.id}`} className="text-sm">
                {s.label}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`prob-${s.id}`}
                  type="number"
                  min={0}
                  max={100}
                  value={values[s.id] ?? s.default}
                  onChange={(e) =>
                    setValues({ ...values, [s.id]: Number(e.target.value) })
                  }
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const DEFAULT_PROBABILITIES: Record<Stage, number> = {
  prospect: 10,
  reuniao: 30,
  proposta_enviada: 60,
  negociacao: 80,
  fechado: 100,
  perdido: 0,
};
