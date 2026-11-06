import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { readEdgeFunctionError } from "@/lib/edgeFunctionError";
import type { PaginaRelatorio } from "@/lib/relatorioLanding";

// Dados do relatório em landing page (ADR-0011). A organização de cada linha
// nova vem da propriedade, por gatilho no banco (0040), e não do portal.

export type Relatorio = Tables<"reports">;
export type PostDaPropriedade = Tables<"property_posts">;
export type IndicadorDaPropriedade = Tables<"property_indicators">;
export type FotoDaPropriedade = Tables<"property_media">;

/**
 * O tipo gerado exige `organization_id` no insert, mas o gatilho
 * `tg_relatorio_vinculos` sempre o troca pela organização da propriedade. O
 * uuid nulo não existe em `organizations`: se o gatilho sumir, o insert falha
 * em vez de gravar a linha na organização errada.
 */
const ORGANIZACAO_DO_GATILHO = "00000000-0000-0000-0000-000000000000";

export const relatorioKeys = {
  lista: (orgId: string | null) => ["relatorios", "lista", orgId] as const,
  um: (id: string | undefined) => ["relatorios", "um", id] as const,
  pagina: (slug: string | undefined) => ["relatorios", "pagina", slug] as const,
  posts: (propertyId: string | undefined) => ["relatorios", "posts", propertyId] as const,
  indicadores: (propertyId: string | undefined) => ["relatorios", "indicadores", propertyId] as const,
  fotos: (propertyId: string | undefined) => ["relatorios", "fotos", propertyId] as const,
  apoio: (orgId: string | null, propertyId?: string) => ["relatorios", "apoio", orgId, propertyId] as const,
};

/** Relatórios da organização ativa, sem os excluídos. */
/** Conteúdo da propriedade mudou: a lista dele e as páginas abertas no editor. */
function invalidarConteudo(qc: ReturnType<typeof useQueryClient>, chave: readonly unknown[]) {
  qc.invalidateQueries({ queryKey: chave });
  qc.invalidateQueries({ queryKey: ["relatorios", "pagina"] });
}

export function useRelatorios(orgId: string | null) {
  return useQuery({
    queryKey: relatorioKeys.lista(orgId),
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("*, propriedade:sports_properties(name), patrocinador:sponsors(name)")
        .eq("organization_id", orgId!)
        .neq("status", "excluido")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useRelatorio(id: string | undefined) {
  return useQuery({
    queryKey: relatorioKeys.um(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("*, propriedade:sports_properties(id, name, owner_id), patrocinador:sponsors(id, name)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCriarRelatorio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (novo: Omit<TablesInsert<"reports">, "organization_id" | "slug">) => {
      // Endereço vazio: o banco gera (título + sufixo aleatório).
      const { data, error } = await supabase
        .from("reports")
        .insert({ ...novo, organization_id: ORGANIZACAO_DO_GATILHO, slug: "" })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["relatorios", "lista"] }),
  });
}

export function useSalvarRelatorio(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alteracao: TablesUpdate<"reports">) => {
      const { error } = await supabase.from("reports").update(alteracao).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: relatorioKeys.um(id) });
      qc.invalidateQueries({ queryKey: ["relatorios", "lista"] });
      qc.invalidateQueries({ queryKey: ["relatorios", "pagina"] });
    },
  });
}

/** Propriedades, patrocinadores, contratos e momentos para os seletores do editor. */
export function useApoioDoRelatorio(orgId: string | null, propertyId?: string) {
  return useQuery({
    queryKey: relatorioKeys.apoio(orgId, propertyId),
    enabled: !!orgId,
    queryFn: async () => {
      const [props, sponsors, contratos, momentos] = await Promise.all([
        supabase.from("sports_properties").select("id, name").eq("organization_id", orgId!).order("name"),
        supabase.from("sponsors").select("id, name").eq("organization_id", orgId!).is("archived_at", null).order("name"),
        supabase
          .from("contracts")
          .select("id, title, sponsor_id, property_id")
          .eq("organization_id", orgId!)
          .not("sponsor_id", "is", null)
          .order("created_at", { ascending: false }),
        propertyId
          ? supabase
              .from("property_events")
              .select("id, title, starts_at")
              .eq("property_id", propertyId)
              .order("starts_at")
          : Promise.resolve({ data: [], error: null }),
      ]);
      const erro = props.error ?? sponsors.error ?? contratos.error ?? momentos.error;
      if (erro) throw erro;
      return {
        propriedades: props.data ?? [],
        patrocinadores: sponsors.data ?? [],
        contratos: contratos.data ?? [],
        momentos: momentos.data ?? [],
      };
    },
  });
}

// ─── Posts ──────────────────────────────────────────────────────────────────

export function usePostsDaPropriedade(propertyId: string | undefined) {
  return useQuery({
    queryKey: relatorioKeys.posts(propertyId),
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_posts")
        .select("*")
        .eq("property_id", propertyId!)
        .order("is_highlight", { ascending: false })
        .order("position")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useSalvarPost(propertyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...campos }: Partial<PostDaPropriedade> & { id?: string }) => {
      if (id) {
        const { error } = await supabase.from("property_posts").update(campos).eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("property_posts").insert({
        ...(campos as Omit<TablesInsert<"property_posts">, "organization_id">),
        property_id: propertyId!,
        organization_id: ORGANIZACAO_DO_GATILHO,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidarConteudo(qc, relatorioKeys.posts(propertyId)),
  });
}

export function useExcluirPost(propertyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("property_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidarConteudo(qc, relatorioKeys.posts(propertyId)),
  });
}

export interface PreviaDoLink {
  rede: string;
  id_externo: string | null;
  url: string;
  titulo: string | null;
  autor: string | null;
  miniatura: string | null;
}

/** Rede, id e, quando há oEmbed público (YouTube, TikTok), título do link. */
export async function buscarPreviaDoLink(url: string): Promise<PreviaDoLink> {
  const { data, error } = await supabase.functions.invoke("social-posts", { body: { acao: "previa", url } });
  if (error) {
    const corpo = await readEdgeFunctionError(error, data);
    throw new Error(corpo.error ?? "Não foi possível ler o link.");
  }
  return data as PreviaDoLink;
}

export interface ResultadoDaAtualizacao {
  youtube: { configurado: boolean; consultados: number; atualizados: number; falhou: boolean };
  sem_integracao: Record<string, number>;
}

export function useAtualizarMetricas(propertyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ResultadoDaAtualizacao> => {
      const { data, error } = await supabase.functions.invoke("social-posts", {
        body: { acao: "atualizar", property_id: propertyId },
      });
      if (error) {
        const corpo = await readEdgeFunctionError(error, data);
        throw new Error(corpo.error ?? "Não foi possível atualizar as métricas.");
      }
      return data as ResultadoDaAtualizacao;
    },
    onSuccess: () => invalidarConteudo(qc, relatorioKeys.posts(propertyId)),
  });
}

// ─── Indicadores ────────────────────────────────────────────────────────────

export function useIndicadoresDaPropriedade(propertyId: string | undefined) {
  return useQuery({
    queryKey: relatorioKeys.indicadores(propertyId),
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_indicators")
        .select("*")
        .eq("property_id", propertyId!)
        .order("category")
        .order("group_name", { nullsFirst: true })
        .order("position")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useSalvarIndicador(propertyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...campos }: Partial<IndicadorDaPropriedade> & { id?: string }) => {
      if (id) {
        const { error } = await supabase.from("property_indicators").update(campos).eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("property_indicators").insert({
        ...(campos as Omit<TablesInsert<"property_indicators">, "organization_id">),
        property_id: propertyId!,
        organization_id: ORGANIZACAO_DO_GATILHO,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidarConteudo(qc, relatorioKeys.indicadores(propertyId)),
  });
}

export function useExcluirIndicador(propertyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("property_indicators").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidarConteudo(qc, relatorioKeys.indicadores(propertyId)),
  });
}

// ─── Fotos ──────────────────────────────────────────────────────────────────

export function useFotosDaPropriedade(propertyId: string | undefined) {
  return useQuery({
    queryKey: relatorioKeys.fotos(propertyId),
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_media")
        .select("*")
        .eq("property_id", propertyId!)
        .in("media_type", ["photo", "foto"])
        .not("storage_path", "is", null)
        .order("position")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useSalvarFoto(propertyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...campos }: TablesUpdate<"property_media"> & { id: string }) => {
      const { error } = await supabase.from("property_media").update(campos).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidarConteudo(qc, relatorioKeys.fotos(propertyId)),
  });
}

/** Envia fotos para a galeria da propriedade (mesmo caminho do `PropertyMediaGallery`). */
export function useEnviarFotos(propertyId: string | undefined, userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (arquivos: File[]) => {
      let enviadas = 0;
      const falhas: string[] = [];
      for (const arquivo of arquivos) {
        const ext = (arquivo.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${userId}/${propertyId}/${crypto.randomUUID()}.${ext || "jpg"}`;
        const { error: erroUpload } = await supabase.storage
          .from("property-media")
          .upload(path, arquivo, { upsert: false, contentType: arquivo.type });
        if (erroUpload) {
          falhas.push(arquivo.name);
          continue;
        }
        const { error } = await supabase.from("property_media").insert({
          property_id: propertyId!,
          owner_id: userId!,
          media_type: "photo",
          storage_path: path,
        });
        if (error) {
          await supabase.storage.from("property-media").remove([path]);
          falhas.push(arquivo.name);
          continue;
        }
        enviadas++;
      }
      return { enviadas, falhas };
    },
    onSuccess: () => invalidarConteudo(qc, relatorioKeys.fotos(propertyId)),
  });
}

// ─── Página ─────────────────────────────────────────────────────────────────

export type ErroDaPagina = { tipo: "nao_encontrado"; login: boolean } | { tipo: "excluido"; mensagem: string } | { tipo: "suspenso" };

export class ErroAoAbrirRelatorio extends Error {
  constructor(public readonly detalhe: ErroDaPagina) {
    super(detalhe.tipo);
  }
}

/** A página pela `report-view`: anônimo, membro ou portal do patrocinador. */
export function usePaginaDoRelatorio(slug: string | undefined) {
  return useQuery({
    queryKey: relatorioKeys.pagina(slug),
    enabled: !!slug,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<PaginaRelatorio> => {
      const { data, error } = await supabase.functions.invoke("report-view", { body: { slug } });
      if (error) {
        const corpo = (await readEdgeFunctionError(error, data)) as {
          error?: string;
          mensagem?: string;
          login?: boolean;
        };
        if (corpo.error === "excluido") {
          throw new ErroAoAbrirRelatorio({ tipo: "excluido", mensagem: corpo.mensagem ?? "" });
        }
        if (corpo.error === "suspenso") throw new ErroAoAbrirRelatorio({ tipo: "suspenso" });
        if (corpo.error === "nao_encontrado") {
          throw new ErroAoAbrirRelatorio({ tipo: "nao_encontrado", login: corpo.login === true });
        }
        throw new Error(corpo.error ?? "Não foi possível abrir o relatório.");
      }
      return data as PaginaRelatorio;
    },
  });
}
