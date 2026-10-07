import { supabase } from "@/integrations/supabase/client";

type ComPerfil<T> = T & { profiles: { full_name: string | null } | null };

/**
 * Anexa `profiles.full_name` a linhas que têm `user_id`.
 *
 * Não existe FK de organization_members/sponsor_portal_access para profiles
 * (nem no banco original do Lovable), então o embed do PostgREST
 * `profiles(full_name)` falha com PGRST200 e a tela inteira fica sem dados.
 * Esta função faz a segunda consulta e devolve as linhas no mesmo formato que
 * o embed devolveria.
 */
export async function withProfileNames<T extends { user_id: string | null }>(rows: T[]): Promise<ComPerfil<T>[]> {
  const ids = [...new Set(rows.map((r) => r.user_id).filter((id): id is string => !!id))];
  if (!ids.length) return rows.map((r) => ({ ...r, profiles: null }));
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  const nomes = new Map((data ?? []).map((p) => [p.id, p.full_name]));
  return rows.map((r) => ({
    ...r,
    profiles: r.user_id && nomes.has(r.user_id) ? { full_name: nomes.get(r.user_id) ?? null } : null,
  }));
}
