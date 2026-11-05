import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TIPOS_DE_CLIENTE, type TipoDeCliente } from "@/lib/permissoes";

type Props = {
  value: TipoDeCliente;
  onChange: (tipo: TipoDeCliente) => void;
  disabled?: boolean;
  /** Prefixo dos ids, para mais de um campo na mesma tela. */
  idPrefix?: string;
};

/** Escolha entre agência e marca, no cadastro, na criação de organização e no plano. */
export const ClientTypeField = ({ value, onChange, disabled, idPrefix = "tipo" }: Props) => (
  <RadioGroup
    value={value}
    onValueChange={(v) => onChange(v === "marca" ? "marca" : "agencia")}
    disabled={disabled}
    className="grid gap-2 sm:grid-cols-2"
    aria-label="Tipo de cliente"
  >
    {TIPOS_DE_CLIENTE.map((t) => (
      <Label
        key={t.key}
        htmlFor={`${idPrefix}-${t.key}`}
        className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 font-normal has-[:checked]:border-primary has-[[data-state=checked]]:border-primary"
      >
        <RadioGroupItem id={`${idPrefix}-${t.key}`} value={t.key} className="mt-0.5" />
        <span>
          <span className="block text-sm font-medium">{t.label}</span>
          <span className="block text-xs text-muted-foreground">{t.description}</span>
        </span>
      </Label>
    ))}
  </RadioGroup>
);
