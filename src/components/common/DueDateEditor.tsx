import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DueDateEditorProps {
  /** ISO string or yyyy-mm-dd (null when there is no date yet) */
  value: string | null;
  /** Receives yyyy-mm-dd (or yyyy-mm-ddTHH:mm when withTime) — null when cleared */
  onSave: (next: string | null) => Promise<void> | void;
  withTime?: boolean;
  disabled?: boolean;
  className?: string;
  label?: string;
}

const toInputValue = (value: string | null, withTime?: boolean) => {
  if (!value) return "";
  const iso = value.includes("T") ? value : `${value}T00:00:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return withTime ? `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
};

const formatLabel = (value: string | null, withTime?: boolean) => {
  if (!value) return "Sem data";
  const iso = value.includes("T") ? value : `${value}T12:00:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Sem data";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit" as const, minute: "2-digit" as const } : {}),
  });
};

/**
 * Inline editable due date used across every task/activity list in the app.
 */
export const DueDateEditor = ({
  value,
  onSave,
  withTime,
  disabled,
  className,
  label = "Prazo",
}: DueDateEditorProps) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(toInputValue(value, withTime));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(toInputValue(value, withTime));
  }, [value, withTime]);

  const commit = async (next: string | null) => {
    setSaving(true);
    try {
      await onSave(next);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (disabled) {
    return (
      <span className={`text-xs text-muted-foreground inline-flex items-center gap-1 ${className ?? ""}`}>
        <CalendarClock className="h-3 w-3" /> {formatLabel(value, withTime)}
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`text-xs text-muted-foreground inline-flex items-center gap-1 rounded px-1 -mx-1 hover:bg-muted hover:text-foreground transition ${className ?? ""}`}
          title="Alterar data"
        >
          <CalendarClock className="h-3 w-3" /> {formatLabel(value, withTime)}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3 space-y-2 pointer-events-auto" align="start">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <Input
          type={withTime ? "datetime-local" : "date"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-9"
        />
        <div className="flex gap-2">
          <Button size="sm" disabled={saving} onClick={() => commit(draft || null)}>
            Salvar
          </Button>
          <Button size="sm" variant="ghost" disabled={saving || !value} onClick={() => commit(null)}>
            Limpar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
