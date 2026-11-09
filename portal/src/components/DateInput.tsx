import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
  type FocusEvent,
} from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  dataParaIso,
  dateParaData,
  isoParaData,
  limiteDigitosData,
  mascararData,
  posicaoAposDigitos,
} from "@/lib/mascaras";
import { dataLocal } from "@/lib/datas";
import { cn } from "@/lib/utils";

type DateInputProps = Omit<
  ComponentProps<typeof Input>,
  "type" | "value" | "defaultValue" | "onChange" | "inputMode" | "min" | "max"
> & {
  /** ISO: aaaa-mm-dd, ou aaaa-mm-ddThh:mm com `withTime`. */
  value?: string | null;
  /** Valor inicial quando o campo não é controlado por `value`. */
  defaultValue?: string | null;
  /** Recebe o ISO, ou "" enquanto a data estiver vazia, incompleta ou inválida. */
  onValueChange?: (iso: string) => void;
  /** Fim da edição (saiu do campo ou escolheu no calendário). Não dispara com data inválida. */
  onCommit?: (iso: string) => void;
  withTime?: boolean;
  /** Limites em ISO. */
  min?: string;
  max?: string;
};

/**
 * Campo de data do portal: mostra dd/mm/aaaa (ou dd/mm/aaaa hh:mm) em qualquer
 * navegador, tem calendário em português e entrega ao formulário o mesmo ISO do
 * `<input type="date">`. Todo campo de data usa este componente
 * (`.claude/rules/frontend.md`, "Campos de valor e de data").
 */
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  (
    {
      value,
      defaultValue,
      onValueChange,
      onCommit,
      withTime = false,
      min,
      max,
      className,
      disabled,
      placeholder,
      title,
      onBlur,
      "aria-invalid": ariaInvalid,
      ...props
    },
    ref,
  ) => {
    const campo = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => campo.current as HTMLInputElement);

    const [texto, setTexto] = useState(() => isoParaData(value ?? defaultValue, withTime));
    const [saiuDoCampo, setSaiuDoCampo] = useState(false);
    const [calendarioAberto, setCalendarioAberto] = useState(false);
    const cursor = useRef<number | null>(null);

    const isoDe = (t: string) => {
      const iso = dataParaIso(t, withTime);
      return (min && iso && iso < min) || (max && iso && iso > max) ? "" : iso;
    };
    const iso = isoDe(texto);
    const invalido = texto !== "" && iso === "";

    // O valor mudou por fora (carregou o registro, limpou o formulário). Texto
    // incompleto corresponde a "", e por isso não é apagado enquanto se digita.
    const [valorAnterior, setValorAnterior] = useState(value);
    if (value !== valorAnterior) {
      setValorAnterior(value);
      if ((value ?? "") !== iso) setTexto(isoParaData(value, withTime));
    }

    useLayoutEffect(() => {
      if (cursor.current === null) return;
      campo.current?.setSelectionRange(cursor.current, cursor.current);
      cursor.current = null;
    });

    // Em `<form>`, data incompleta segura o envio, como o campo nativo fazia.
    useEffect(() => {
      campo.current?.setCustomValidity(invalido ? "Informe uma data válida." : "");
    }, [invalido]);

    const trocarTexto = (proximo: string) => {
      setTexto(proximo);
      const proximoIso = isoDe(proximo);
      if (proximoIso !== iso) onValueChange?.(proximoIso);
      return proximoIso;
    };

    const aoDigitar = (e: ChangeEvent<HTMLInputElement>) => {
      const bruto = e.target.value;
      const posicao = e.target.selectionStart ?? bruto.length;
      const noFim = posicao === bruto.length;
      if (!noFim && bruto.replace(/\D/g, "").length > limiteDigitosData(withTime)) {
        // Dígito a mais no meio do texto: recusa, em vez de empurrar os outros.
        e.target.value = texto;
        e.target.setSelectionRange(posicao - 1, posicao - 1);
        return;
      }
      const proximo = mascararData(bruto, withTime);
      const digitosAntes = bruto.slice(0, posicao).replace(/\D/g, "").length;
      cursor.current = noFim ? proximo.length : posicaoAposDigitos(proximo, digitosAntes);
      setSaiuDoCampo(false);
      trocarTexto(proximo);
    };

    const aoSair = (e: FocusEvent<HTMLInputElement>) => {
      setSaiuDoCampo(true);
      onBlur?.(e);
      if (!invalido) onCommit?.(iso);
    };

    const aoEscolher = (dia: Date | undefined) => {
      setCalendarioAberto(false);
      if (!dia) return;
      // O calendário só escolhe o dia: mantém a hora digitada ou usa a atual, como o nativo.
      const hora = /\d{2}:\d{2}$/.exec(texto)?.[0] ?? format(new Date(), "HH:mm");
      const proximoIso = trocarTexto(withTime ? `${dateParaData(dia)} ${hora}` : dateParaData(dia));
      setSaiuDoCampo(true);
      onCommit?.(proximoIso);
    };

    const mostrarErro = saiuDoCampo && invalido;
    const selecionado = iso ? dataLocal(iso) : undefined;
    const limites = [
      ...(min ? [{ before: dataLocal(min) }] : []),
      ...(max ? [{ after: dataLocal(max) }] : []),
    ];

    return (
      <div className={cn("relative h-10 w-full", className)}>
        <Input
          ref={campo}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          {...props}
          placeholder={placeholder ?? (withTime ? "dd/mm/aaaa hh:mm" : "dd/mm/aaaa")}
          disabled={disabled}
          value={texto}
          onChange={aoDigitar}
          onBlur={aoSair}
          aria-invalid={mostrarErro ? true : ariaInvalid}
          title={mostrarErro ? "Data inválida" : title}
          className={cn("h-full pr-10", mostrarErro && "border-destructive focus-visible:ring-destructive")}
        />
        <Popover open={calendarioAberto} onOpenChange={setCalendarioAberto}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label="Abrir calendário"
              className="absolute right-0 top-0 h-full rounded-l-none text-muted-foreground hover:bg-transparent hover:text-foreground"
            >
              <CalendarIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="pointer-events-auto w-auto p-0" align="end">
            <Calendar
              mode="single"
              required
              locale={ptBR}
              selected={selecionado}
              defaultMonth={selecionado}
              onSelect={aoEscolher}
              disabled={limites}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>
    );
  },
);
DateInput.displayName = "DateInput";
