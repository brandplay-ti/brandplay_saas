// Apoio às Edge Functions que usam a camada de IA (épico 3, plano §3 decisão 4).
//
// O mesmo começo e o mesmo fim em toda função de IA:
//
//   - `autenticar`: valida o JWT; o usuário vem do token, nunca do corpo;
//   - `exigirModulo`: confere que o usuário é membro ativo da organização e
//     pode ler o módulo. A organização vem do recurso lido sob RLS ou da
//     organização ativa enviada pelo portal (`organizacaoDoCorpo`) — nos dois
//     casos, só depois de passar por aqui;
//   - `dependenciasDaCamada`: o client da service role, só para a camada
//     (credenciais, guardas, medição). As consultas de dado da função usam o
//     client do usuário, sob RLS;
//   - `respostaDeFalha`: erro de IA vira `{ error, codigo }` (IA-13); o resto,
//     uma mensagem sem detalhe técnico. O log leva só a categoria e o
//     detalhe interno do erro — nunca prompt, resposta, chave ou dado da
//     organização.

import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { type DependenciasDaCamada, dependenciasSupabase } from "./camada.ts";
import { ErroDeIA, respostaDeErro } from "./erros.ts";
import { AcessoNegadoAIA } from "./guardas.ts";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

/** Falha da requisição com mensagem para o usuário (400, 401, 403, 404). */
export class ErroDaRequisicao extends Error {
  constructor(readonly status: number, mensagem: string) {
    super(mensagem);
    this.name = "ErroDaRequisicao";
  }
}

export const MODULOS = ["crm", "operacional", "financeiro"] as const;
export type Modulo = typeof MODULOS[number];

export interface Requisicao {
  usuario: User;
  /** Client com o JWT do usuário: toda leitura de dado passa pelo RLS. */
  cliente: SupabaseClient;
}

function ambiente(nome: string): string {
  const valor = Deno.env.get(nome);
  if (!valor) throw new ErroDeIA("indisponivel", `${nome} ausente no ambiente da função`, false, "plataforma");
  return valor;
}

export async function autenticar(req: Request): Promise<Requisicao> {
  const autorizacao = req.headers.get("Authorization");
  if (!autorizacao) throw new ErroDaRequisicao(401, "Não autorizado");
  const cliente = createClient(ambiente("SUPABASE_URL"), ambiente("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: autorizacao } },
  });
  const { data: { user } } = await cliente.auth.getUser();
  if (!user) throw new ErroDaRequisicao(401, "Não autorizado");
  return { usuario: user, cliente };
}

/** Dependências reais da camada, com o client da service role. */
export function dependenciasDaCamada(): DependenciasDaCamada {
  return dependenciasSupabase(createClient(ambiente("SUPABASE_URL"), ambiente("SUPABASE_SERVICE_ROLE_KEY")));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lê um uuid obrigatório do corpo. Não valida acesso: isso é do RLS ou de `exigirModulo`. */
export function uuidDoCorpo(corpo: unknown, campo: string): string {
  const valor = corpo && typeof corpo === "object" ? (corpo as Record<string, unknown>)[campo] : undefined;
  if (typeof valor !== "string" || !UUID.test(valor)) throw new ErroDaRequisicao(400, `${campo} obrigatório`);
  return valor;
}

/** A organização ativa do portal, ainda não validada: passe por `exigirModulo` antes de usar. */
export function organizacaoDoCorpo(corpo: unknown): string {
  return uuidDoCorpo(corpo, "organization_id");
}

/** Só a parte das RPCs que a validação usa (isolada para teste). */
export interface ClienteDeRpc {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
}

/**
 * Membro ativo da organização e com acesso de leitura (ou escrita) ao
 * módulo, pelas mesmas funções das policies. Falha da consulta barra: sem
 * confirmar o acesso, a função não segue.
 */
export async function exigirModulo(
  cliente: ClienteDeRpc,
  usuarioId: string,
  organizacaoId: string,
  modulo: Modulo,
  escrita = false,
): Promise<void> {
  const [membro, modulos] = await Promise.all([
    cliente.rpc("is_org_member", { _user_id: usuarioId, _org_id: organizacaoId }),
    cliente.rpc("can_access_module", { _user_id: usuarioId, _org_id: organizacaoId, _module: modulo, _write: escrita }),
  ]);
  if (membro.error || modulos.error) {
    throw new Error(`validação de acesso falhou: ${membro.error?.code ?? modulos.error?.code ?? "?"}`);
  }
  if (membro.data !== true) throw new ErroDaRequisicao(403, "Acesso restrito à equipe da organização");
  if (modulos.data !== true) throw new ErroDaRequisicao(403, "Sem permissão neste módulo");
}

/** Converte a falha em resposta; o log nunca leva conteúdo. */
export function respostaDeFalha(e: unknown, funcionalidade: string): Response {
  if (e instanceof ErroDeIA) {
    console.error(`${funcionalidade}: ${e.message}`);
    return respostaDeErro(e, CORS);
  }
  if (e instanceof AcessoNegadoAIA) return json({ error: "Acesso restrito à equipe da organização" }, e.status);
  if (e instanceof ErroDaRequisicao) return json({ error: e.message }, e.status);
  console.error(`${funcionalidade}: falha inesperada (${e instanceof Error ? `${e.name}: ${e.message}` : "desconhecida"})`);
  return json({ error: "Não foi possível concluir a solicitação. Tente novamente em instantes." }, 500);
}
