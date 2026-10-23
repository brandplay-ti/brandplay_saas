// Resolução da credencial de IA e chamada ao fornecedor (backlog IA-09,
// plano §3 decisão 3).
//
// Ordem, sempre no servidor e sempre por organização:
//
//   1. chave exclusiva ativa da organização;
//   2. chave padrão ativa do banco (`organization_id` nulo);
//   3. semente do ambiente (`AI_DEFAULT_PROVIDER` + `AI_DEFAULT_API_KEY`), só
//      enquanto não houver chave padrão no banco (decisão Q2).
//
// Sem fallback silencioso (decisão Q3): se a chave exclusiva falha, a
// chamada falha — não cai na padrão, que esconderia o problema e jogaria o
// custo do cliente na plataforma. A falha fica em `ai_credentials.last_error`
// para o superadmin. A única passagem para a chave padrão é a da decisão Q4:
// o modelo da chave exclusiva não tem a capacidade pedida (hoje, visão).
//
// Nova tentativa só em falha transitória (`limite_taxa`, `indisponivel`) e
// sempre com a MESMA credencial.
//
// A chave decifrada vive só na memória desta chamada: não é registrada, não
// volta para quem chamou e não entra em mensagem de erro.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { type ChavesMestras, chavesMestrasDoAmbiente, decifrarChave, ErroDeCifra } from "../ai-crypto.ts";
import { type ErroDoFornecedor, ErroDeIA } from "./erros.ts";
import { MODELOS_PADRAO, modeloDoNivel, type ModelosPorNivel } from "./modelos.ts";
import { chamarOpenAICompat } from "./openai.ts";
import { chamarAnthropic } from "./anthropic.ts";
import {
  type Adaptador,
  type EscopoDaCredencial,
  exigeVisao,
  FORNECEDORES,
  type Fornecedor,
  type PedidoDeIA,
  type RespostaDeIA,
} from "./tipos.ts";

/** Linha de `ai_credentials` com o que a resolução precisa. */
export interface LinhaDeCredencial {
  id: string;
  organization_id: string | null;
  provider: Fornecedor;
  key_ciphertext: string;
  key_iv: string;
  key_version: number;
  model_rapido: string;
  model_padrao: string;
  model_visao: string | null;
  last_error: string | null;
}

/** Acesso ao banco, isolado para teste. Sempre com a service role. */
export interface RepositorioDeCredenciais {
  ativaDaOrganizacao(organizacaoId: string): Promise<LinhaDeCredencial | null>;
  padraoAtiva(): Promise<LinhaDeCredencial | null>;
  /** Grava (ou limpa, com nulo) a última falha da credencial. */
  registrarErro(credencialId: string, codigo: ErroDoFornecedor | null): Promise<void>;
}

/** O que a camada usa para chamar: nunca sai do servidor. */
export interface CredencialResolvida {
  fornecedor: Fornecedor;
  chave: string;
  modelo: string;
  escopo: EscopoDaCredencial;
  /** Nulo na semente do ambiente (não há linha). */
  credencialId: string | null;
  /** Falha registrada antes desta chamada, para limpar quando a chave volta a funcionar. */
  ultimoErro: string | null;
}

const COLUNAS =
  "id, organization_id, provider, key_ciphertext, key_iv, key_version, model_rapido, model_padrao, model_visao, last_error";

export function repositorioSupabase(admin: SupabaseClient): RepositorioDeCredenciais {
  const consulta = () => admin.from("ai_credentials").select(COLUNAS).eq("status", "ativa");
  const primeira = async (filtro: (q: ReturnType<typeof consulta>) => ReturnType<typeof consulta>) => {
    const { data, error } = await filtro(consulta()).limit(1).maybeSingle();
    if (error) throw new ErroDeIA("indisponivel", `leitura de ai_credentials falhou: ${error.code ?? "?"}`, true, "plataforma");
    return (data ?? null) as LinhaDeCredencial | null;
  };

  return {
    ativaDaOrganizacao: (organizacaoId) => primeira((q) => q.eq("organization_id", organizacaoId)),
    padraoAtiva: () => primeira((q) => q.is("organization_id", null)),
    async registrarErro(credencialId, codigo) {
      const { error } = await admin
        .from("ai_credentials")
        .update({ last_error: codigo, last_error_at: codigo ? new Date().toISOString() : null })
        .eq("id", credencialId);
      // Registrar a falha é auxiliar: não derruba a resposta ao usuário.
      if (error) console.error("ai_credentials: falha ao registrar erro da credencial", error.code ?? "?");
    },
  };
}

function modelosDaLinha(linha: LinhaDeCredencial): ModelosPorNivel {
  return { rapido: linha.model_rapido, padrao: linha.model_padrao, visao: linha.model_visao };
}

async function chaveDaLinha(linha: LinhaDeCredencial, dono: string | null, chaves: () => ChavesMestras): Promise<string> {
  try {
    return await decifrarChave(
      { ciphertext: linha.key_ciphertext, iv: linha.key_iv, version: linha.key_version },
      dono,
      chaves(),
    );
  } catch (e) {
    // Chave mestra errada, versão não configurada ou linha adulterada:
    // problema de configuração da plataforma, tratado como chave inválida.
    const codigo = e instanceof ErroDeCifra ? e.codigo : "desconhecido";
    throw new ErroDeIA("chave_invalida", `credencial ${linha.id} não decifra (${codigo})`, false, "plataforma");
  }
}

function sementeDoAmbiente(ler: (nome: string) => string | undefined): { fornecedor: Fornecedor; chave: string; modelos: ModelosPorNivel } | null {
  const fornecedor = ler("AI_DEFAULT_PROVIDER")?.trim();
  const chave = ler("AI_DEFAULT_API_KEY")?.trim();
  if (!fornecedor || !chave) return null;
  if (!(FORNECEDORES as readonly string[]).includes(fornecedor)) {
    throw new ErroDeIA("indisponivel", `AI_DEFAULT_PROVIDER inválido: ${fornecedor}`, false, "plataforma");
  }
  const padrao = MODELOS_PADRAO[fornecedor as Fornecedor];
  return {
    fornecedor: fornecedor as Fornecedor,
    chave,
    modelos: {
      rapido: ler("AI_DEFAULT_MODEL_RAPIDO")?.trim() || padrao.rapido,
      padrao: ler("AI_DEFAULT_MODEL_PADRAO")?.trim() || padrao.padrao,
      visao: ler("AI_DEFAULT_MODEL_VISAO")?.trim() || padrao.visao,
    },
  };
}

export interface DependenciasDaResolucao {
  repositorio: RepositorioDeCredenciais;
  /** Padrão: `chavesMestrasDoAmbiente()`, lido só quando há linha para decifrar. */
  chavesMestras?: () => ChavesMestras;
  lerAmbiente?: (nome: string) => string | undefined;
}

/** Escolhe a credencial e o modelo para o pedido da organização. */
export async function resolverCredencial(
  organizacaoId: string,
  pedido: PedidoDeIA,
  deps: DependenciasDaResolucao,
): Promise<CredencialResolvida> {
  const chaves = deps.chavesMestras ?? (() => chavesMestrasDoAmbiente());
  const ler = deps.lerAmbiente ?? ((nome: string) => Deno.env.get(nome));
  const nivel = exigeVisao(pedido) ? "visao" : pedido.nivel;

  const exclusiva = await deps.repositorio.ativaDaOrganizacao(organizacaoId);
  // Defesa em profundidade: a consulta já filtra, a cifra também amarra.
  if (exclusiva && exclusiva.organization_id !== organizacaoId) {
    throw new ErroDeIA("chave_invalida", `credencial ${exclusiva.id} não pertence à organização`, false, "plataforma");
  }
  let escopoDaPadrao: EscopoDaCredencial = "padrao";
  if (exclusiva) {
    const modelo = modeloDoNivel(modelosDaLinha(exclusiva), nivel);
    if (modelo) {
      return {
        fornecedor: exclusiva.provider,
        chave: await chaveDaLinha(exclusiva, organizacaoId, chaves),
        modelo,
        escopo: "exclusiva",
        credencialId: exclusiva.id,
        ultimoErro: exclusiva.last_error,
      };
    }
    // Decisão Q4: falta a capacidade na exclusiva → esta chamada vai pela padrão.
    escopoDaPadrao = "via_padrao";
  }

  const padrao = await deps.repositorio.padraoAtiva();
  if (padrao) {
    if (padrao.organization_id !== null) {
      throw new ErroDeIA("chave_invalida", `credencial ${padrao.id} não é a padrão da plataforma`, false, "plataforma");
    }
    const modelo = modeloDoNivel(modelosDaLinha(padrao), nivel);
    if (!modelo) throw new ErroDeIA("indisponivel", `chave padrão sem modelo para o nível ${nivel}`, false, "plataforma");
    return {
      fornecedor: padrao.provider,
      chave: await chaveDaLinha(padrao, null, chaves),
      modelo,
      escopo: escopoDaPadrao,
      credencialId: padrao.id,
      ultimoErro: padrao.last_error,
    };
  }

  const semente = sementeDoAmbiente(ler);
  if (semente) {
    const modelo = modeloDoNivel(semente.modelos, nivel);
    if (!modelo) throw new ErroDeIA("indisponivel", `semente sem modelo para o nível ${nivel}`, false, "plataforma");
    return {
      fornecedor: semente.fornecedor,
      chave: semente.chave,
      modelo,
      // A passagem da Q4 continua marcada como tal, mesmo vinda da semente.
      escopo: escopoDaPadrao === "via_padrao" ? "via_padrao" : "semente",
      credencialId: null,
      ultimoErro: null,
    };
  }

  throw new ErroDeIA("indisponivel", "nenhuma credencial de IA configurada (banco nem ambiente)", false, "plataforma");
}

// ─── Chamada com nova tentativa ──────────────────────────────────────

export const ADAPTADORES: Record<Fornecedor, Adaptador> = {
  openai: chamarOpenAICompat,
  gemini: chamarOpenAICompat,
  anthropic: chamarAnthropic,
};

/** Espera antes de cada nova tentativa (ms). Duas tentativas a mais, no máximo. */
export const ESPERAS_ENTRE_TENTATIVAS = [800, 2_000];

export interface DependenciasDaChamada {
  repositorio: RepositorioDeCredenciais;
  adaptadores?: Record<Fornecedor, Adaptador>;
  fetch?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

/**
 * Chama o fornecedor com a credencial resolvida. Falha transitória tenta de
 * novo com a mesma credencial; falha da credencial vai para `last_error`; e,
 * quando volta a funcionar, a falha antiga é limpa.
 */
export async function chamarComCredencial(
  credencial: CredencialResolvida,
  pedido: PedidoDeIA,
  deps: DependenciasDaChamada,
): Promise<RespostaDeIA> {
  const adaptador = (deps.adaptadores ?? ADAPTADORES)[credencial.fornecedor];
  const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));

  for (let tentativa = 0;; tentativa++) {
    try {
      const resposta = await adaptador({
        fornecedor: credencial.fornecedor,
        chave: credencial.chave,
        modelo: credencial.modelo,
        pedido,
        fetch: deps.fetch,
        timeoutMs: deps.timeoutMs,
      });
      if (credencial.credencialId && credencial.ultimoErro) {
        await deps.repositorio.registrarErro(credencial.credencialId, null);
      }
      return resposta;
    } catch (e) {
      if (!(e instanceof ErroDeIA)) throw e;
      if (e.tentarDeNovo && tentativa < ESPERAS_ENTRE_TENTATIVAS.length) {
        await esperar(ESPERAS_ENTRE_TENTATIVAS[tentativa]);
        continue;
      }
      if (e.daCredencial && credencial.credencialId) {
        await deps.repositorio.registrarErro(credencial.credencialId, e.codigo as ErroDoFornecedor);
      }
      throw e;
    }
  }
}
