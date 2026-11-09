import { forwardRef, useState, type ChangeEvent, type ClipboardEvent, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { parseNumberBR } from "@/lib/csvParse";
import { campoParaDecimal, moedaCabeNoLimite, moedaParaCampo } from "@/lib/mascaras";

type CurrencyInputProps = Omit<
  ComponentProps<typeof Input>,
  "type" | "value" | "defaultValue" | "onChange" | "inputMode"
> & {
  /** Decimal do formulário: 1234.56, "1234.56" ou vazio. */
  value?: string | number | null;
  /** Valor inicial quando o campo não é controlado por `value`. */
  defaultValue?: string | number | null;
  /** Recebe decimal com ponto ("1234.56") ou "" quando o campo é esvaziado. */
  onValueChange?: (decimal: string) => void;
  /** Casas decimais. Só os preços de IA, em R$ por 1 milhão de tokens, usam mais de 2. */
  casas?: number;
};

/**
 * Campo de dinheiro do portal: mostra "R$ 1.234,56" e preenche da direita para
 * a esquerda. Todo campo de valor em reais usa este componente
 * (`.claude/rules/frontend.md`, "Campos de valor e de data").
 */
export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, defaultValue, onValueChange, casas = 2, placeholder = moedaParaCampo(0, casas), onPaste, ...props }, ref) => {
    const [interno, setInterno] = useState(defaultValue ?? "");
    const exibido = moedaParaCampo(value !== undefined ? value : interno, casas);

    const emitir = (decimal: string) => {
      setInterno(decimal);
      onValueChange?.(decimal);
    };

    const aoDigitar = (e: ChangeEvent<HTMLInputElement>) => {
      const decimal = campoParaDecimal(e.target.value, casas);
      // Sem isto, o backspace ficaria preso em "R$ 0,00" e o campo nunca esvaziaria.
      if (e.target.value.length < exibido.length && Number(decimal) === 0) {
        emitir("");
        return;
      }
      if (moedaCabeNoLimite(decimal)) emitir(decimal);
    };

    // Colar "1.500,00" ou "1500" é o valor em reais, não uma sequência de centavos.
    const aoColar = (e: ClipboardEvent<HTMLInputElement>) => {
      onPaste?.(e);
      const colado = e.clipboardData.getData("text");
      const numero = colado.trim() ? parseNumberBR(colado) : null;
      if (e.defaultPrevented || numero === null || numero < 0) return;
      const decimal = numero.toFixed(casas);
      if (!moedaCabeNoLimite(decimal)) return;
      e.preventDefault();
      emitir(decimal);
    };

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        {...props}
        value={exibido}
        onChange={aoDigitar}
        onPaste={aoColar}
      />
    );
  },
);
CurrencyInput.displayName = "CurrencyInput";
