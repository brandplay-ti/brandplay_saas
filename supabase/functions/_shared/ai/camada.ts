// Entrada única da camada de IA (plano §3 decisão 1; fecha o épico 2 com a
// IA-11). As Edge Functions chamam só `gerar`:
//
//   1. valida o pedido;
//   2. guardas (`ia_situacao`): IA habilitada, cobrança, orçamento, taxa;
//   3. escolhe e decifra a credencial da organização;
//   4. chama o fornecedor (nova tentativa só em falha transitória);
//   5. registra o uso — sucesso, erro ou bloqueio — e devolve a resposta.
//
// Quem chama precisa ter validado a organização contra o JWT antes (CLAUDE.md
// §7): `contexto.organizacaoId` nunca vem cru do corpo da requisição.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { ChavesMestras } from "../ai-crypto.ts";
import {
  chamarComCredencial,
  type CredencialResolvida,
  type RepositorioDeCredenciais,
  repositorioSupabase,
  resolverCredencial,
} from "./credencial.ts";
import { ErroDeIA } from "./erros.ts";
import { type ConsultaDeSituacao, consultaSupabase, verificarGuardas } from "./guardas.ts";
import { processarAlertasPosUso } from "./alertas.ts";
import {
  custoEstimado,
  type EventoDeUso,
  precosSupabase,
  type RegistroDeUso,
  registroSupabase,
  type TabelaDePrecos,
  USO_ZERADO,
} from "./medicao.ts";
import {
  type Adaptador,
  type ContextoDeIA,
  exigeVisao,
  type Fornecedor,
  type PedidoDeIA,
  type RespostaDeIA,
  type UsoDeTokens,
  validarPedido,
} from "./tipos.ts";

export interface DependenciasDaCamada {
  /** Client service role — alertas de orçamento e chave exclusiva (IA-30/31). */
  admin?: SupabaseClient;
  credenciais: RepositorioDeCredenciais;
  situacao: ConsultaDeSituacao;
  registro: RegistroDeUso;
  precos: TabelaDePrecos;
  // Injetáveis nos testes:
  adaptadores?: Record<Fornecedor, Adaptador>;
  fetch?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  chavesMestras?: () => ChavesMestras;
  lerAmbiente?: (nome: string) => string | undefined;
  agora?: () => number;
  timeoutMs?: number;
}

/** Dependências reais, todas pelo client da service role. */
export function dependenciasSupabase(admin: SupabaseClient): DependenciasDaCamada {
  return {
    admin,
    credenciais: repositorioSupabase(admin),
    situacao: consultaSupabase(admin),
    registro: registroSupabase(admin),
    precos: precosSupabase(admin),
  };
}

function evento(
  contexto: ContextoDeIA,
  pedido: PedidoDeIA,
  credencial: CredencialResolvida,
  resultado: { status: EventoDeUso["status"]; erro?: ErroDeIA; uso?: UsoDeTokens; custo?: number | null; latenciaMs?: number | null },
): EventoDeUso {
  const uso = resultado.uso ?? USO_ZERADO;
  return {
    organization_id: contexto.organizacaoId,
    user_id: contexto.usuarioId,
    feature: pedido.funcionalidade,
    tier: exigeVisao(pedido) ? "visao" : pedido.nivel,
    provider: credencial.fornecedor,
    model: credencial.modelo,
    credential_id: credencial.credencialId,
    credential_scope: credencial.escopo,
    input_tokens: uso.entrada,
    output_tokens: uso.saida,
    cached_input_tokens: uso.entradaCache,
    cache_write_input_tokens: uso.escritaCache,
    estimated_cost_brl: resultado.custo ?? null,
    latency_ms: resultado.latenciaMs ?? null,
    status: resultado.status,
    error_code: resultado.erro?.codigo ?? null,
  };
}

async function registrarSemQuebrar(
  deps: DependenciasDaCamada,
  e: EventoDeUso,
): Promise<void> {
  try {
    await deps.registro.registrar(e);
    processarAlertasPosUso(deps.admin, e.organization_id, e);
  } catch {
    console.error("ai_usage_events: falha ao registrar uso", e.feature);
  }
}

export async function gerar(contexto: ContextoDeIA, pedido: PedidoDeIA, deps: DependenciasDaCamada): Promise<RespostaDeIA> {
  validarPedido(pedido);
  const resolucao = {
    repositorio: deps.credenciais,
    chavesMestras: deps.chavesMestras,
    lerAmbiente: deps.lerAmbiente,
  };

  try {
    await verificarGuardas(contexto, deps.situacao);
  } catch (e) {
    // Barrada: registra a tentativa com a chave que seria usada, quando há
    // uma (fornecedor e modelo são obrigatórios na tabela). Sem chave, só o erro.
    if (e instanceof ErroDeIA) {
      const credencial = await resolverCredencial(contexto.organizacaoId, pedido, resolucao).catch(() => null);
      if (credencial) await registrarSemQuebrar(deps, evento(contexto, pedido, credencial, { status: "bloqueado", erro: e }));
    }
    throw e;
  }

  // Falha aqui (nenhuma chave, chave que não decifra) não tem fornecedor e
  // modelo para registrar: sobe para quem chamou e para o log.
  const credencial = await resolverCredencial(contexto.organizacaoId, pedido, resolucao);

  const agora = deps.agora ?? (() => Date.now());
  const inicio = agora();
  try {
    const resposta = await chamarComCredencial(credencial, pedido, {
      repositorio: deps.credenciais,
      adaptadores: deps.adaptadores,
      fetch: deps.fetch,
      esperar: deps.esperar,
      timeoutMs: deps.timeoutMs,
    });
    // Preço pelo nome do modelo como está na credencial — o mesmo que o
    // superadmin cadastra em ai_model_prices.
    const preco = await deps.precos.vigente(credencial.fornecedor, credencial.modelo).catch(() => null);
    await registrarSemQuebrar(
      deps,
      evento(contexto, pedido, credencial, {
        status: "sucesso",
        uso: resposta.uso,
        custo: custoEstimado(resposta.uso, preco),
        latenciaMs: agora() - inicio,
      }),
    );
    return resposta;
  } catch (e) {
    if (e instanceof ErroDeIA) {
      await registrarSemQuebrar(deps, evento(contexto, pedido, credencial, { status: "erro", erro: e, latenciaMs: agora() - inicio }));
    }
    throw e;
  }
}
