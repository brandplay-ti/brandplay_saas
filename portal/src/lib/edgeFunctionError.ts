import { FunctionsHttpError } from "@supabase/supabase-js";

/** Corpo de erro que as Edge Functions do projeto devolvem. */
export interface EdgeFunctionErrorBody {
  error?: string;
  code?: string;
  hint?: string;
  details?: string | null;
}

/**
 * Lê o corpo de erro de uma chamada `supabase.functions.invoke`.
 *
 * Com resposta fora de 2xx, o `invoke` devolve só "Edge Function returned a
 * non-2xx status code" em `error.message`; a mensagem da função e campos como
 * `code` e `hint` ficam no corpo da resposta, em `error.context`.
 */
export async function readEdgeFunctionError(error: unknown, data?: unknown): Promise<EdgeFunctionErrorBody> {
  if (data && typeof data === "object" && "error" in data) {
    return data as EdgeFunctionErrorBody;
  }
  if (error instanceof FunctionsHttpError) {
    try {
      return (await error.context.json()) as EdgeFunctionErrorBody;
    } catch {
      // corpo que não é JSON: cai na mensagem genérica abaixo
    }
  }
  return { error: error instanceof Error ? error.message : undefined };
}
