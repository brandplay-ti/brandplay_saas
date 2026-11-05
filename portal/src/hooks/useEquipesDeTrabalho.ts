import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { AcessoAoProjeto, PapelNaEquipe, Projeto } from "@/lib/equipes";
import type { PapelDePermissao } from "@/lib/permissoes";

export type Equipe = Tables<"work_teams">;
export type MembroDeEquipe = Tables<"work_team_members">;
export type ProjetoDeEquipe = Tables<"work_team_properties">;

export type EquipesDaOrganizacao = {
  equipes: Equipe[];
  membros: MembroDeEquipe[];
  projetos: ProjetoDeEquipe[];
};

export type PessoaDaOrganizacao = {
  user_id: string;
  role: PapelDePermissao;
  status: string;
  nome: string;
};

export type ProjetoAlcancado = {
  property_id: string;
  property_name: string;
  parent_property_id: string | null;
  access: AcessoAoProjeto;
  team_names: string[];
};

const chaveDasEquipes = (orgId: string | null) => ["equipes-de-trabalho", orgId] as const;

/**
 * Equipes da organização com membros e projetos (0042). Quem lê é qualquer
 * membro; quem escreve é o banco que decide (owner/admin, e o líder nos
 * membros da própria equipe).
 */
export function useEquipesDeTrabalho(orgId: string | null) {
  return useQuery({
    queryKey: chaveDasEquipes(orgId),
    enabled: !!orgId,
    queryFn: async (): Promise<EquipesDaOrganizacao> => {
      const [equipes, membros, projetos] = await Promise.all([
        supabase.from("work_teams").select("*").eq("organization_id", orgId!).order("name"),
        supabase.from("work_team_members").select("*").eq("organization_id", orgId!),
        supabase.from("work_team_properties").select("*").eq("organization_id", orgId!),
      ]);
      if (equipes.error) throw equipes.error;
      if (membros.error) throw membros.error;
      if (projetos.error) throw projetos.error;
      return { equipes: equipes.data ?? [], membros: membros.data ?? [], projetos: projetos.data ?? [] };
    },
  });
}

/** Membros da organização com o nome do perfil, para escolher quem entra na equipe. */
export function usePessoasDaOrganizacao(orgId: string | null) {
  return useQuery({
    queryKey: ["pessoas-da-organizacao", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<PessoaDaOrganizacao[]> => {
      const { data: membros, error } = await supabase
        .from("organization_members")
        .select("user_id, role, status")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const ids = (membros ?? []).map((m) => m.user_id);
      const nomes = new Map<string, string>();
      if (ids.length) {
        const { data: perfis, error: erroPerfis } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        if (erroPerfis) throw erroPerfis;
        for (const p of perfis ?? []) nomes.set(p.id, p.full_name ?? "");
      }
      return (membros ?? []).map((m) => ({
        user_id: m.user_id,
        role: m.role,
        status: m.status,
        nome: nomes.get(m.user_id) || "Sem nome",
      }));
    },
  });
}

/** Propriedades da organização: os "projetos" que as equipes recebem. */
export function useProjetosDaOrganizacao(orgId: string | null) {
  return useQuery({
    queryKey: ["projetos-da-organizacao", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Projeto[]> => {
      const { data, error } = await supabase
        .from("sports_properties")
        .select("id, name, parent_property_id")
        .eq("organization_id", orgId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** "Ver como": projetos que a pessoa alcança pelas equipes. Só owner/admin (o banco recusa os demais). */
export function useAcessoDoMembro(orgId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ["acesso-do-membro", orgId, userId],
    enabled: !!orgId && !!userId,
    queryFn: async (): Promise<ProjetoAlcancado[]> => {
      const { data, error } = await supabase.rpc("acesso_do_membro", { _org_id: orgId!, _user_id: userId! });
      if (error) throw error;
      return (data ?? []).map((p) => ({ ...p, access: p.access as AcessoAoProjeto }));
    },
  });
}

export type OperacaoDeEquipe =
  | { tipo: "criar"; name: string; description: string }
  | { tipo: "editar"; id: string; name: string; description: string }
  | { tipo: "arquivar"; id: string }
  | { tipo: "restaurar"; id: string }
  | { tipo: "incluir_membro"; team_id: string; user_id: string; team_role: PapelNaEquipe; expires_at: string | null }
  | { tipo: "alterar_membro"; team_id: string; user_id: string; team_role: PapelNaEquipe; expires_at: string | null }
  | { tipo: "tirar_membro"; team_id: string; user_id: string }
  | { tipo: "vincular_projeto"; team_id: string; property_id: string; access: AcessoAoProjeto; include_children: boolean }
  | { tipo: "alterar_projeto"; team_id: string; property_id: string; access: AcessoAoProjeto; include_children: boolean }
  | { tipo: "desvincular_projeto"; team_id: string; property_id: string };

// O organization_id enviado nos vínculos é descartado pelo banco, que usa o
// da equipe (tg_membro_de_equipe / tg_projeto_de_equipe).
async function executar(orgId: string, op: OperacaoDeEquipe) {
  switch (op.tipo) {
    case "criar":
      return supabase
        .from("work_teams")
        .insert({ organization_id: orgId, name: op.name, description: op.description || null });
    case "editar":
      return supabase
        .from("work_teams")
        .update({ name: op.name, description: op.description || null })
        .eq("id", op.id)
        .eq("organization_id", orgId);
    case "arquivar":
    case "restaurar":
      return supabase
        .from("work_teams")
        .update({ status: op.tipo === "arquivar" ? "arquivado" : "ativo" })
        .eq("id", op.id)
        .eq("organization_id", orgId);
    case "incluir_membro":
      return supabase.from("work_team_members").upsert(
        {
          team_id: op.team_id,
          organization_id: orgId,
          user_id: op.user_id,
          team_role: op.team_role,
          expires_at: op.expires_at,
          status: "ativo",
        },
        { onConflict: "team_id,user_id" },
      );
    case "alterar_membro":
      return supabase
        .from("work_team_members")
        .update({ team_role: op.team_role, expires_at: op.expires_at })
        .eq("team_id", op.team_id)
        .eq("user_id", op.user_id);
    case "tirar_membro":
      return supabase
        .from("work_team_members")
        .update({ status: "revogado" })
        .eq("team_id", op.team_id)
        .eq("user_id", op.user_id);
    case "vincular_projeto":
      return supabase.from("work_team_properties").insert({
        team_id: op.team_id,
        organization_id: orgId,
        property_id: op.property_id,
        access: op.access,
        include_children: op.include_children,
      });
    case "alterar_projeto":
      return supabase
        .from("work_team_properties")
        .update({ access: op.access, include_children: op.include_children })
        .eq("team_id", op.team_id)
        .eq("property_id", op.property_id);
    case "desvincular_projeto":
      return supabase
        .from("work_team_properties")
        .delete()
        .eq("team_id", op.team_id)
        .eq("property_id", op.property_id);
  }
}

/** Grava uma alteração de equipe e recarrega a lista. */
export function useAlterarEquipe(orgId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (op: OperacaoDeEquipe) => {
      if (!orgId) throw new Error("Nenhuma organização ativa.");
      const { error } = await executar(orgId, op);
      if (error) throw error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: chaveDasEquipes(orgId) });
      queryClient.invalidateQueries({ queryKey: ["acesso-do-membro", orgId] });
    },
  });
}

/** Mensagem do banco para quem usa a tela (gatilhos e unicidade da 0042). */
export function mensagemDeErroDeEquipe(erro: unknown): string {
  const e = erro as { code?: string; message?: string } | null;
  if (e?.code === "23505") return "Já existe uma equipe ativa com esse nome.";
  if (e?.code === "42501") return "Você não tem permissão para esta alteração.";
  if (e?.code === "23514" && e.message) return e.message;
  return e?.message || "Não foi possível salvar.";
}
