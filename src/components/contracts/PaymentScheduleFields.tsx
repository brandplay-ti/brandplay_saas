import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CalendarPlus, X } from "lucide-react";

interface Props {
  dueDays: string;
  onDueDaysChange: (v: string) => void;
  dates: string[];
  onDatesChange: (dates: string[]) => void;
  startDate?: string;
}

const fmt = (d: string) => (d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—");

export function PaymentScheduleFields({
  dueDays,
  onDueDaysChange,
  dates,
  onDatesChange,
  startDate,
}: Props) {
  const addDate = () => {
    const base = dates.length ? dates[dates.length - 1] : startDate || new Date().toISOString().slice(0, 10);
    const next = new Date(base + "T00:00:00");
    if (dates.length) next.setMonth(next.getMonth() + 1);
    onDatesChange([...dates, next.toISOString().slice(0, 10)]);
  };

  const update = (i: number, v: string) => {
    const copy = [...dates];
    copy[i] = v;
    onDatesChange(copy);
  };

  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="grid gap-2 sm:max-w-[220px]">
        <Label htmlFor="due-days">Vencer em (dias)</Label>
        <Input
          id="due-days"
          inputMode="numeric"
          value={dueDays}
          placeholder="Ex.: 30"
          onChange={(e) => onDueDaysChange(e.target.value.replace(/\D/g, ""))}
        />
        <p className="text-xs text-muted-foreground">
          Prazo somado à data de início para o primeiro vencimento.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div>
          <Label>Datas de vencimento manuais</Label>
          <p className="text-xs text-muted-foreground">
            Se informadas, substituem o cálculo automático das parcelas.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addDate}>
          <CalendarPlus className="h-4 w-4 mr-1" /> Adicionar data
        </Button>
      </div>

      {dates.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma data adicionada.</p>
      ) : (
        <div className="grid gap-2">
          {dates.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <Badge variant="outline" className="shrink-0">
                {i + 1}/{dates.length}
              </Badge>
              <Input type="date" value={d} onChange={(e) => update(i, e.target.value)} />
              <span className="text-xs text-muted-foreground hidden sm:block w-24">{fmt(d)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onDatesChange(dates.filter((_, idx) => idx !== i))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
