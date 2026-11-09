import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
} from "react";
import { Input } from "@/components/ui/input";
import { campoParaNumero, formatarNumero, mascararNumero, mesmoNumero, posicaoAposDigitos } from "@/lib/mascaras";

type NumberInputProps = Omit<
  ComponentProps<typeof Input>,
  "type" | "value" | "defaultValue" | "onChange" | "inputMode" | "step"
> & {
  /** Número do formulário: 1234, "1234" ou vazio. */
  value: string | number | null | undefined;
  /** Recebe só dígitos ("1234"), com ponto se houver decimais ("1234.5"), ou "". */
  onValueChange?: (numero: string) => void;
  /** Casas decimais aceitas. Sem isto, o campo é inteiro. */
  casas?: number;
  /** Aceita sinal de menos. Só indicadores de relatório precisam. */
  permitirNegativo?: boolean;
};

/**
 * Campo de número do portal: mostra o marcador de milhar ("1.234"). Todo número
 * sem teto usa este componente (`.claude/rules/frontend.md`, "Campos de valor e
 * de data"); dinheiro é `CurrencyInput`.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onValueChange, casas = 0, permitirNegativo = false, min, max, ...props }, ref) => {
    const campo = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => campo.current as HTMLInputElement);

    const [texto, setTexto] = useState(() => formatarNumero(value, casas));
    const cursor = useRef<number | null>(null);
    const numero = campoParaNumero(texto);

    // O valor mudou por fora (carregou o registro, limpou o formulário). "12," e
    // "12" são o mesmo número, e por isso a vírgula não some enquanto se digita.
    const [valorAnterior, setValorAnterior] = useState(value);
    if (value !== valorAnterior) {
      setValorAnterior(value);
      if (!mesmoNumero(value, numero)) setTexto(formatarNumero(value, casas));
    }

    useLayoutEffect(() => {
      if (cursor.current === null) return;
      campo.current?.setSelectionRange(cursor.current, cursor.current);
      cursor.current = null;
    });

    // Em `<form>`, número fora da faixa segura o envio, como o campo nativo fazia.
    const erro =
      numero === ""
        ? ""
        : min !== undefined && Number(numero) < Number(min)
          ? `O mínimo é ${formatarNumero(min)}.`
          : max !== undefined && Number(numero) > Number(max)
            ? `O máximo é ${formatarNumero(max)}.`
            : "";
    useEffect(() => {
      campo.current?.setCustomValidity(erro);
    }, [erro]);

    const aoDigitar = (e: ChangeEvent<HTMLInputElement>) => {
      const bruto = e.target.value;
      const posicao = e.target.selectionStart ?? bruto.length;
      const proximo = mascararNumero(bruto, casas, permitirNegativo);
      const digitosAntes = bruto.slice(0, posicao).replace(/\D/g, "").length;
      cursor.current = posicao === bruto.length ? proximo.length : posicaoAposDigitos(proximo, digitosAntes);
      setTexto(proximo);
      const proximoNumero = campoParaNumero(proximo);
      if (proximoNumero !== numero) onValueChange?.(proximoNumero);
    };

    return (
      <Input
        ref={campo}
        type="text"
        inputMode={casas > 0 ? "decimal" : "numeric"}
        autoComplete="off"
        {...props}
        value={texto}
        onChange={aoDigitar}
      />
    );
  },
);
NumberInput.displayName = "NumberInput";
