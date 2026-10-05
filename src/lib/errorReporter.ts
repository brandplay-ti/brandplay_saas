import { supabase } from "@/integrations/supabase/client";

type ErrorReportPayload = {
  message: string;
  stack?: string | null;
  componentStack?: string | null;
  route?: string | null;
  organizationId?: string | null;
  source?: "frontend" | "react-boundary" | "unhandledrejection";
  severity?: "error" | "warning" | "fatal";
  metadata?: Record<string, unknown>;
};

const getActiveOrganizationId = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("active_organization_id");
};

export const reportPlatformError = async (payload: ErrorReportPayload) => {
  try {
    await supabase.functions.invoke("report-error", {
      body: {
        source: "frontend",
        severity: "error",
        route: typeof window !== "undefined" ? window.location.href : null,
        organizationId: getActiveOrganizationId(),
        ...payload,
      },
    });
  } catch (error) {
    console.warn("Falha ao enviar report de erro", error);
  }
};