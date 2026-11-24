import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ORGANIZACAO_DO_GATILHO, pastasKeys } from "@/hooks/usePastasDaEdicao";
import { readEdgeFunctionError } from "@/lib/edgeFunctionError";
import {
  enviarArquivo,
  enviarParteXhr,
  EnvioCancelado,
  erroNoNomeDoArquivo,
  impressaoDoArquivo,
  mimeAceito,
  tipoDaMidia,
  type ApiDeEnvio,
} from "@/lib/envioMultipart";
import { chaveDosEnvios, lerEnviosSalvos, serializarEnvios, type EnvioSalvo, type StatusDoEnvio } from "@/lib/enviosSalvos";

// Fila de envios da mídia da edição (BP-7.07). Fica acima das telas, no
// layout do painel: trocar de aba ou de página não para o envio. Um arquivo
// por vez, com as partes em paralelo; as versões geradas no navegador
// (análise, miniatura, relatório, BP-7.08) passam na frente do original, que
// sobe em segundo plano.

export type Envio = EnvioSalvo & {
  /** O arquivo escolhido. Depois de recarregar a página, `null` até a pessoa escolher de novo. */
  arquivo: File | null;
};

export type ResultadoDaSelecao = { adicionados: number; retomados: number; recusados: Array<{ nome: string; motivo: string }> };

type ContextoDeEnvio = {
  envios: Envio[];
  adicionar: (arquivos: File[], destino: { propertyId: string; folderId: string | null }) => Promise<ResultadoDaSelecao>;
  pausar: (id: string) => void;
  continuar: (id: string) => void;
  /** Para o envio, descarta o que subiu e tira da lista. A mídia fica aguardando envio. */
  cancelar: (id: string) => Promise<void>;
  remover: (id: string) => void;
  emAndamento: boolean;
};

const Contexto = createContext<ContextoDeEnvio | null>(null);

export class ErroDaApi extends Error {
  constructor(readonly status: number, mensagem: string) {
    super(mensagem);
  }
}

async function chamar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("midia-r2", { body });
  if (error) {
    const corpo = await readEdgeFunctionError(error, data);
    const status = error instanceof FunctionsHttpError ? (error.context as Response).status : 0;
    throw new ErroDaApi(status, corpo.error ?? "Não foi possível falar com o armazenamento.");
  }
  return data as T;
}

/** A Edge Function `midia-r2` no formato que o motor espera. */
export const apiDeEnvio: ApiDeEnvio = {
  iniciar: async ({ mediaId, variante, mime }) => {
    const r = await chamar<{ objeto_id: string }>({ acao: "iniciar", media_id: mediaId, variante, mime });
    return { objetoId: r.objeto_id };
  },
  assinarPartes: async (objetoId, partes) =>
    (await chamar<{ partes: Array<{ numero: number; url: string }> }>({ acao: "assinar_partes", objeto_id: objetoId, partes })).partes,
  listarPartes: async (objetoId) =>
    (await chamar<{ partes: Array<{ numero: number; etag: string; tamanho: number }> }>({ acao: "listar_partes", objeto_id: objetoId }))
      .partes,
  concluir: async (objetoId, partes) => {
    const r = await chamar<{ tamanho_bytes: number }>({ acao: "concluir", objeto_id: objetoId, partes });
    return { tamanhoBytes: r.tamanho_bytes };
  },
  abortar: async (objetoId) => {
    await chamar({ acao: "abortar", objeto_id: objetoId });
  },
};

const ordemDeEnvio = (a: Envio, b: Envio) => Number(a.variante === "original") - Number(b.variante === "original");

function lerDoNavegador(chave: string): Envio[] {
  try {
    return lerEnviosSalvos(localStorage.getItem(chave)).map((e) => ({ ...e, arquivo: null }));
  } catch {
    return [];
  }
}

function gravarNoNavegador(chave: string, envios: Envio[]) {
  try {
    // O arquivo não vai: `arquivo` não é campo de EnvioSalvo.
    localStorage.setItem(chave, serializarEnvios(envios.map(({ arquivo: _arquivo, ...salvo }) => salvo)));
  } catch {
    // Sem storage (aba privada, cota): o envio segue, só não retoma depois de recarregar.
  }
}

export const EnvioDeMidiaProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const chave = user ? chaveDosEnvios(user.id) : null;
  const [envios, setEnvios] = useState<Envio[]>([]);
  // Cópia síncrona da lista, para decisões fora do render (retomada, cancelar).
  const enviosRef = useRef(envios);
  enviosRef.current = envios;
  const controles = useRef(new Map<string, { controle: AbortController; motivo: "pausa" | "cancelar" | null }>());
  const ultimoAviso = useRef(new Map<string, number>());

  // Troca de usuário: carrega os envios salvos dele.
  useEffect(() => {
    setEnvios(chave ? lerDoNavegador(chave) : []);
  }, [chave]);

  useEffect(() => {
    if (chave) gravarNoNavegador(chave, envios);
  }, [chave, envios]);

  const atualizar = useCallback((id: string, mudanca: Partial<Envio>) => {
    setEnvios((lista) => lista.map((e) => (e.id === id ? { ...e, ...mudanca } : e)));
  }, []);

  const emAndamento = envios.some((e) => e.arquivo && (e.status === "na_fila" || e.status === "enviando"));

  // Aviso ao fechar a aba com envio em andamento (D4).
  useEffect(() => {
    if (!emAndamento) return;
    const avisar = (ev: BeforeUnloadEvent) => {
      ev.preventDefault();
      ev.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [emAndamento]);

  const executar = useCallback(
    async (envio: Envio) => {
      const controle = new AbortController();
      controles.current.set(envio.id, { controle, motivo: null });
      atualizar(envio.id, { status: "enviando", erro: null });
      const opcoesBase = {
        arquivo: envio.arquivo!,
        mediaId: envio.mediaId,
        variante: envio.variante,
        mime: envio.mime,
        api: apiDeEnvio,
        enviarParte: enviarParteXhr,
        sinal: controle.signal,
        aoIniciar: ({ objetoId, parteBytes }: { objetoId: string; parteBytes: number }) =>
          atualizar(envio.id, { objetoId, parteBytes }),
        aoProgresso: (enviados: number, total: number) => {
          const agora = Date.now();
          if (enviados < total && agora - (ultimoAviso.current.get(envio.id) ?? 0) < 250) return;
          ultimoAviso.current.set(envio.id, agora);
          atualizar(envio.id, { enviados });
        },
      };
      try {
        try {
          await enviarArquivo({ ...opcoesBase, objetoId: envio.objetoId, parteBytes: envio.parteBytes ?? undefined });
        } catch (erro) {
          // Envio que o servidor já não reconhece (abortado, expirado): começa de novo.
          if (envio.objetoId && erro instanceof ErroDaApi && erro.status === 409) {
            atualizar(envio.id, { objetoId: null, parteBytes: null, enviados: 0 });
            await enviarArquivo({ ...opcoesBase, objetoId: null });
          } else {
            throw erro;
          }
        }
        atualizar(envio.id, { status: "concluido", enviados: envio.tamanho, erro: null });
        qc.invalidateQueries({ queryKey: pastasKeys.midias(envio.propertyId) });
        qc.invalidateQueries({ queryKey: ["armazenamento"] });
      } catch (erro) {
        const motivo = controles.current.get(envio.id)?.motivo;
        if (erro instanceof EnvioCancelado || motivo) {
          if (motivo !== "cancelar") atualizar(envio.id, { status: "pausado" });
        } else {
          atualizar(envio.id, {
            status: "erro",
            erro: erro instanceof Error ? erro.message : "Falha no envio.",
          });
        }
      } finally {
        controles.current.delete(envio.id);
      }
    },
    [atualizar, qc],
  );

  // Um por vez: com nada enviando, começa o próximo da fila que tem arquivo.
  useEffect(() => {
    // A trava é a ref, não o estado: o modo estrito roda o efeito duas vezes
    // antes de o status "enviando" chegar à lista.
    if (controles.current.size > 0 || envios.some((e) => e.status === "enviando")) return;
    const proximo = envios.filter((e) => e.status === "na_fila" && e.arquivo).sort(ordemDeEnvio)[0];
    if (proximo) void executar(proximo);
  }, [envios, executar]);

  const adicionar = useCallback<ContextoDeEnvio["adicionar"]>(
    async (arquivos, destino) => {
      const resultado: ResultadoDaSelecao = { adicionados: 0, retomados: 0, recusados: [] };
      const jaRetomados = new Set<string>();
      for (const arquivo of arquivos) {
        const impressao = impressaoDoArquivo(arquivo);
        // Mesmo arquivo de um envio interrompido no mesmo projeto: retoma de onde parou.
        const interrompido = enviosRef.current.find(
          (e) =>
            !jaRetomados.has(e.id) &&
            !e.arquivo &&
            e.impressao === impressao &&
            e.propertyId === destino.propertyId &&
            (["interrompido", "pausado", "erro"] as StatusDoEnvio[]).includes(e.status),
        );
        if (interrompido) {
          jaRetomados.add(interrompido.id);
          atualizar(interrompido.id, { arquivo, status: "na_fila", erro: null });
          resultado.retomados++;
          continue;
        }

        const kind = tipoDaMidia(arquivo);
        const erroNoNome = erroNoNomeDoArquivo(arquivo.name);
        if (!kind || erroNoNome) {
          resultado.recusados.push({ nome: arquivo.name, motivo: erroNoNome ?? "Não é vídeo nem foto." });
          continue;
        }
        const mime = mimeAceito(arquivo.type);
        const { data, error } = await supabase
          .from("edition_media")
          .insert({
            organization_id: ORGANIZACAO_DO_GATILHO,
            property_id: destino.propertyId,
            folder_id: destino.folderId,
            kind,
            file_name: arquivo.name,
            mime_type: mime,
            declared_size_bytes: arquivo.size,
          })
          .select("id, organization_id")
          .single();
        if (error || !data) {
          resultado.recusados.push({
            nome: arquivo.name,
            motivo: error?.code === "42501" ? "Sem permissão para enviar material neste projeto." : "Não foi possível registrar o arquivo.",
          });
          continue;
        }
        const novo: Envio = {
          id: crypto.randomUUID(),
          organizationId: data.organization_id,
          propertyId: destino.propertyId,
          mediaId: data.id,
          objetoId: null,
          parteBytes: null,
          variante: "original",
          mime,
          nome: arquivo.name,
          tamanho: arquivo.size,
          impressao,
          status: "na_fila",
          enviados: 0,
          erro: null,
          arquivo,
        };
        setEnvios((lista) => [...lista, novo]);
        resultado.adicionados++;
      }
      if (resultado.adicionados > 0) qc.invalidateQueries({ queryKey: pastasKeys.midias(destino.propertyId) });
      return resultado;
    },
    [atualizar, qc],
  );

  const pausar = useCallback((id: string) => {
    const atual = controles.current.get(id);
    if (atual) {
      atual.motivo = "pausa";
      atual.controle.abort();
    } else {
      setEnvios((lista) => lista.map((e) => (e.id === id && e.status === "na_fila" ? { ...e, status: "pausado" } : e)));
    }
  }, []);

  const continuar = useCallback((id: string) => {
    setEnvios((lista) =>
      lista.map((e) => (e.id === id && e.arquivo && ["pausado", "erro"].includes(e.status) ? { ...e, status: "na_fila", erro: null } : e)),
    );
  }, []);

  const remover = useCallback((id: string) => {
    setEnvios((lista) => lista.filter((e) => e.id !== id));
  }, []);

  const cancelar = useCallback(
    async (id: string) => {
      const envio = enviosRef.current.find((e) => e.id === id);
      const atual = controles.current.get(id);
      if (atual) {
        atual.motivo = "cancelar";
        atual.controle.abort();
      }
      remover(id);
      if (envio?.objetoId) {
        await apiDeEnvio.abortar(envio.objetoId).catch(() => undefined);
      }
      if (envio) qc.invalidateQueries({ queryKey: pastasKeys.midias(envio.propertyId) });
    },
    [qc, remover],
  );

  const valor = useMemo(
    () => ({ envios, adicionar, pausar, continuar, cancelar, remover, emAndamento }),
    [envios, adicionar, pausar, continuar, cancelar, remover, emAndamento],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
};

export function useEnvioDeMidia(): ContextoDeEnvio {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useEnvioDeMidia fora do EnvioDeMidiaProvider");
  return ctx;
}
