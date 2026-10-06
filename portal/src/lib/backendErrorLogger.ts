import { supabase } from "@/integrations/supabase/client";

type BackendErrorLogPayload = {
  table: string;
  action: string;
  clientFile: string;
  clientLine: number;
  organizationId?: string | null;
  attemptedRowKeys?: string[];
  error: {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  };
};

export const logBackendDbError = async (payload: BackendErrorLogPayload) => {
  try {
    const { error } = await supabase.functions.invoke("log-db-error", {
      body: payload,
    });
    if (error) console.warn("Falha ao registrar log backend", error.message);
  } catch (err) {
    console.warn("Falha ao chamar logger backend", err);
  }
};