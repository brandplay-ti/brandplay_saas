import { useEffect } from "react";
import { toast } from "sonner";
import { reportPlatformError } from "@/lib/errorReporter";

const getReasonMessage = (reason: unknown) => {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason;
  return "Erro inesperado na plataforma.";
};

const getReasonStack = (reason: unknown) => (reason instanceof Error ? reason.stack : null);

export const GlobalErrorReporter = () => {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      toast.error("Algo deu errado", { description: "Enviamos um report automático para análise." });
      void reportPlatformError({
        message: event.message || "Erro inesperado na plataforma.",
        stack: event.error instanceof Error ? event.error.stack : null,
        source: "frontend",
        severity: "error",
        metadata: {
          filename: event.filename,
          line: event.lineno,
          column: event.colno,
        },
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      toast.error("Falha ao concluir a ação", { description: "Enviamos um report automático para análise." });
      void reportPlatformError({
        message: getReasonMessage(event.reason),
        stack: getReasonStack(event.reason),
        source: "unhandledrejection",
        severity: "error",
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
};