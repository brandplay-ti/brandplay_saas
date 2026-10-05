import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { logBackendDbError } from "@/lib/backendErrorLogger";

export type OrgRole = "owner" | "admin" | "comercial" | "operacional" | "financeiro";

export type OrgSummary = {
  id: string;
  name: string;
  role: OrgRole;
  logo_path?: string | null;
};

const ACTIVE_ORG_KEY = "active_organization_id";

type OrganizationContextValue = {
  orgId: string | null;
  orgName: string;
  orgLogoPath: string | null;
  role: OrgRole | null;
  isAdmin: boolean;
  can: (module: "crm" | "operacional" | "financeiro" | "team") => boolean;
  loading: boolean;
  organizations: OrgSummary[];
  switchOrganization: (newOrgId: string) => void;
  refresh: () => Promise<void>;
};

type OrganizationMemberRow = {
  role: OrgRole;
  organization_id: string;
  organization: { name: string | null; logo_path: string | null } | null;
};

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

export const OrganizationProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [orgId, setOrgIdState] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string>("");
  const [orgLogoPath, setOrgLogoPath] = useState<string | null>(null);
  const [role, setRole] = useState<OrgRole | null>(null);
  const [organizations, setOrganizations] = useState<OrgSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrganizations = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("organization_members")
      .select("role, organization_id, organization:organizations(name, logo_path)")
      .eq("user_id", userId)
      .eq("status", "ativo")
      .order("created_at", { ascending: true });

    if (error) {
      await logBackendDbError({
        table: "organization_members",
        action: "SELECT",
        clientFile: "src/hooks/useOrganization.tsx",
        clientLine: 41,
        attemptedRowKeys: ["user_id", "status"],
        error,
      });
    }

    const list: OrgSummary[] = ((data ?? []) as OrganizationMemberRow[]).map((m) => ({
      id: m.organization_id,
      name: m.organization?.name ?? "",
      role: m.role as OrgRole,
      logo_path: m.organization?.logo_path ?? null,
    }));
    setOrganizations(list);
    return list;
  }, []);

  const applyActive = useCallback((list: OrgSummary[], desiredId?: string | null) => {
    if (list.length === 0) {
      setOrgIdState(null);
      setOrgName("");
      setRole(null);
      setOrgLogoPath(null);
      return;
    }
    const stored = desiredId ?? localStorage.getItem(ACTIVE_ORG_KEY);
    const found = list.find((o) => o.id === stored) ?? list[0];
    setOrgIdState(found.id);
    setOrgName(found.name);
    setRole(found.role);
    setOrgLogoPath(found.logo_path ?? null);
    localStorage.setItem(ACTIVE_ORG_KEY, found.id);
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      const list = await loadOrganizations(user.id);
      applyActive(list);
      setLoading(false);
    })();
  }, [user, loadOrganizations, applyActive]);

  const switchOrganization = useCallback(
    (newOrgId: string) => {
      const found = organizations.find((o) => o.id === newOrgId);
      localStorage.setItem(ACTIVE_ORG_KEY, newOrgId);
      if (found) {
        setOrgIdState(found.id);
        setOrgName(found.name);
        setRole(found.role);
        setOrgLogoPath(found.logo_path ?? null);
      }
      window.location.reload();
    },
    [organizations]
  );

  const refresh = useCallback(async () => {
    if (!user) return;
    const list = await loadOrganizations(user.id);
    applyActive(list, orgId);
  }, [user, loadOrganizations, applyActive, orgId]);

  const value = useMemo<OrganizationContextValue>(() => {
    const isAdmin = role === "owner" || role === "admin";
    const can = (module: "crm" | "operacional" | "financeiro" | "team") => {
      if (!role) return false;
      if (isAdmin) return true;
      if (module === "team") return false;
      if (module === "crm") return role === "comercial";
      if (module === "operacional") return role === "operacional";
      if (module === "financeiro") return role === "financeiro";
      return false;
    };
    return {
      orgId,
      orgName,
      orgLogoPath,
      role,
      isAdmin,
      can,
      loading,
      organizations,
      switchOrganization,
      refresh,
    };
  }, [orgId, orgName, orgLogoPath, role, loading, organizations, switchOrganization, refresh]);

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
};

export const useOrganization = (): OrganizationContextValue => {
  const ctx = useContext(OrganizationContext);
  if (ctx) return ctx;
  // Fallback: when no provider is mounted (e.g., public pages), return inert defaults
  // so that components don't crash during HMR or outside the dashboard tree.
  return {
    orgId: null,
    orgName: "",
    orgLogoPath: null,
    role: null,
    isAdmin: false,
    can: () => false,
    loading: false,
    organizations: [],
    switchOrganization: () => {},
    refresh: async () => {},
  };
};
