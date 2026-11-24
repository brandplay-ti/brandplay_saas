import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { conteudoParaArquivar, conteudoParaDesarquivar } from "@/lib/pastasDaEdicao";

// Pastas e arquivos da mídia da edição (BP-7.04, 0049). A organização de cada
// linha nova vem do projeto, por gatilho no banco; data e autor do
// arquivamento também. Quem pode escrever é decidido pela RLS (padrão 7).

export type PastaDaEdicaoRow = Pick<
  Tables<"edition_folders">,
  "id" | "name" | "parent_folder_id" | "archived_at" | "created_at"
>;
export type MidiaDaEdicaoRow = Pick<
  Tables<"edition_media">,
  "id" | "folder_id" | "kind" | "file_name" | "status" | "declared_size_bytes" | "archived_at" | "created_at"
>;

/**
 * O tipo gerado exige `organization_id` no insert, mas o gatilho
 * `tg_midia_edicao_regras` sempre o troca pela organização do projeto. O uuid
 * nulo não existe em `organizations`: se o gatilho sumir, o insert falha em
 * vez de gravar a pasta na organização errada.
 */
const ORGANIZACAO_DO_GATILHO = "00000000-0000-0000-0000-000000000000";

export const pastasKeys = {
  pastas: (propertyId: string | undefined) => ["midia-da-edicao", "pastas", propertyId] as const,
  midias: (propertyId: string | undefined) => ["midia-da-edicao", "midias", propertyId] as const,
};

/** Todas as pastas da edição, ativas e arquivadas: a tela filtra. */
export function usePastasDaEdicao(propertyId: string | undefined) {
  return useQuery({
    queryKey: pastasKeys.pastas(propertyId),
    enabled: !!propertyId,
    queryFn: async (): Promise<PastaDaEdicaoRow[]> => {
      const { data, error } = await supabase
        .from("edition_folders")
        .select("id, name, parent_folder_id, archived_at, created_at")
        .eq("property_id", propertyId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Todos os arquivos da edição, ativos e arquivados. */
export function useMidiasDaEdicao(propertyId: string | undefined) {
  return useQuery({
    queryKey: pastasKeys.midias(propertyId),
    enabled: !!propertyId,
    queryFn: async (): Promise<MidiaDaEdicaoRow[]> => {
      const { data, error } = await supabase
        .from("edition_media")
        .select("id, folder_id, kind, file_name, status, declared_size_bytes, archived_at, created_at")
        .eq("property_id", propertyId!)
        .order("file_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Update barrado pela RLS não dá erro: só não altera nada. Sem linha de
 * volta, a pessoa não pode mexer naquilo (ou a linha sumiu).
 */
function exigirLinhas(data: unknown[] | null) {
  if (!data || data.length === 0) throw Object.assign(new Error("Sem permissão"), { code: "42501" });
}

function useInvalidar(propertyId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: pastasKeys.pastas(propertyId) });
    qc.invalidateQueries({ queryKey: pastasKeys.midias(propertyId) });
  };
}

export function useCriarPasta(propertyId: string) {
  const invalidar = useInvalidar(propertyId);
  return useMutation({
    mutationFn: async ({ name, parentFolderId }: { name: string; parentFolderId: string | null }) => {
      const { error } = await supabase.from("edition_folders").insert({
        organization_id: ORGANIZACAO_DO_GATILHO,
        property_id: propertyId,
        parent_folder_id: parentFolderId,
        name: name.trim(),
      });
      if (error) throw error;
    },
    onSettled: invalidar,
  });
}

export function useRenomearPasta(propertyId: string) {
  const invalidar = useInvalidar(propertyId);
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { data, error } = await supabase.from("edition_folders").update({ name: name.trim() }).eq("id", id).select("id");
      if (error) throw error;
      exigirLinhas(data);
    },
    onSettled: invalidar,
  });
}

export function useMoverPasta(propertyId: string) {
  const invalidar = useInvalidar(propertyId);
  return useMutation({
    mutationFn: async ({ id, parentFolderId }: { id: string; parentFolderId: string | null }) => {
      const { data, error } = await supabase.from("edition_folders").update({ parent_folder_id: parentFolderId }).eq("id", id).select("id");
      if (error) throw error;
      exigirLinhas(data);
    },
    onSettled: invalidar,
  });
}

export function useMoverMidia(propertyId: string) {
  const invalidar = useInvalidar(propertyId);
  return useMutation({
    mutationFn: async ({ id, folderId }: { id: string; folderId: string | null }) => {
      const { data, error } = await supabase.from("edition_media").update({ folder_id: folderId }).eq("id", id).select("id");
      if (error) throw error;
      exigirLinhas(data);
    },
    onSettled: invalidar,
  });
}

/** Arquiva (`true`) ou tira do arquivo (`false`) um arquivo da edição. */
export function useArquivarMidia(propertyId: string) {
  const invalidar = useInvalidar(propertyId);
  return useMutation({
    mutationFn: async ({ id, arquivar }: { id: string; arquivar: boolean }) => {
      // A data é do banco: o gatilho troca este valor por now().
      const { data, error } = await supabase
        .from("edition_media")
        .update({ archived_at: arquivar ? new Date().toISOString() : null })
        .eq("id", id).select("id");
      if (error) throw error;
      exigirLinhas(data);
    },
    onSettled: invalidar,
  });
}

/**
 * Arquiva a pasta com tudo o que está dentro. O banco só arquiva pasta vazia,
 * então vão primeiro os arquivos e depois as pastas, de baixo para cima. Não
 * é uma transação: se uma etapa falhar, o que já foi arquivado fica
 * arquivado e pode voltar pelo "Desarquivar".
 */
export function useArquivarPasta(propertyId: string) {
  const invalidar = useInvalidar(propertyId);
  return useMutation({
    mutationFn: async ({ id, pastas, midias }: { id: string; pastas: PastaDaEdicaoRow[]; midias: MidiaDaEdicaoRow[] }) => {
      const conteudo = conteudoParaArquivar(pastas, midias, id);
      const agora = new Date().toISOString();
      if (conteudo.midias.length > 0) {
        const { data, error } = await supabase.from("edition_media").update({ archived_at: agora }).in("id", conteudo.midias).select("id");
        if (error) throw error;
        exigirLinhas(data);
      }
      for (const pastaId of conteudo.pastas) {
        const { data, error } = await supabase.from("edition_folders").update({ archived_at: agora }).eq("id", pastaId).select("id");
        if (error) throw error;
        exigirLinhas(data);
      }
    },
    onSettled: invalidar,
  });
}

/** Tira a pasta do arquivo com tudo o que está dentro, de cima para baixo. */
export function useDesarquivarPasta(propertyId: string) {
  const invalidar = useInvalidar(propertyId);
  return useMutation({
    mutationFn: async ({ id, pastas, midias }: { id: string; pastas: PastaDaEdicaoRow[]; midias: MidiaDaEdicaoRow[] }) => {
      const conteudo = conteudoParaDesarquivar(pastas, midias, id);
      for (const pastaId of conteudo.pastas) {
        const { data, error } = await supabase.from("edition_folders").update({ archived_at: null }).eq("id", pastaId).select("id");
        if (error) throw error;
        exigirLinhas(data);
      }
      if (conteudo.midias.length > 0) {
        const { data, error } = await supabase.from("edition_media").update({ archived_at: null }).in("id", conteudo.midias).select("id");
        if (error) throw error;
        exigirLinhas(data);
      }
    },
    onSettled: invalidar,
  });
}

/** Mensagem do banco traduzida para a tela, sem detalhe técnico. */
export function mensagemDoErroDePasta(erro: unknown): string {
  const e = erro as { code?: string; message?: string } | null;
  if (e?.code === "23505") return "Já existe uma pasta com esse nome aqui.";
  if (e?.code === "42501") return "Você não tem permissão para alterar a mídia deste projeto.";
  if (e?.code === "23514" && e.message) return e.message;
  return "Não foi possível salvar. Tente de novo.";
}
