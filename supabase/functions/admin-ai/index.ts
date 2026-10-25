// Gestão de credenciais de IA pelo superadmin (backlog IA-23, plano §4 F1).
//
//   POST { action: "testar", provider, api_key, model_rapido, model_padrao, model_visao? }
//   POST { action: "definir_padrao", ..., comment }   → grava chave padrão da plataforma
//   POST { action: "definir_cliente", organization_id, ..., comment }
//   POST { action: "revogar_cliente", organization_id, comment }
//
// Ordem: JWT → superadmin ativo → valida → testa a chave no fornecedor (exceto
// revogar) → cifra → grava → audita. A chave nunca volta na resposta nem na
// auditoria (só key_hint e metadados).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { cifrarChave, ErroDeCifra, finalDaChave } from "../_shared/ai-crypto.ts";
import { chamarAnthropic } from "../_shared/ai/anthropic.ts";
import { ErroDeIA } from "../_shared/ai/erros.ts";
import { MODELOS_PADRAO } from "../_shared/ai/modelos.ts";
import { chamarOpenAICompat } from "../_shared/ai/openai.ts";
import {
  FORNECEDORES,
  type Fornecedor,
  type PedidoDeIA,
} from "../_shared/ai/tipos.ts";
import { adminClient, corsHeaders, json } from "../_shared/billing.ts";

type Acao =
  | "testar"
  | "definir_padrao"
  | "definir_cliente"
  | "revogar_cliente"
  | "configurar_cliente"
  | "definir_preco";
const ACOES: Acao[] = [
  "testar",
  "definir_padrao",
  "definir_cliente",
  "revogar_cliente",
  "configurar_cliente",
  "definir_preco",
];

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Corpo {
  action?: string;
  organization_id?: string;
  provider?: string;
  api_key?: string;
  model_rapido?: string;
  model_padrao?: string;
  model_visao?: string | null;
  model?: string;
  ai_enabled?: boolean;
  monthly_budget_cents?: number | null;
  alert_threshold_pct?: number;
  hard_limit?: boolean | null;
  input_brl_per_mtok?: number;
  output_brl_per_mtok?: number;
  cached_input_brl_per_mtok?: number | null;
  cache_write_input_brl_per_mtok?: number | null;
  valid_from?: string;
  comment?: string;
}

export interface ConfiguracaoCliente {
  organization_id: string;
  ai_enabled: boolean;
  monthly_budget_cents: number | null;
  alert_threshold_pct: number;
  hard_limit: boolean | null;
}

export interface ModelosInformados {
  rapido: string;
  padrao: string;
  visao: string | null;
}

/** Metadados expostos ao superadmin — nunca a cifra nem a chave. */
export interface MetadadosCredencial {
  id: string;
  organization_id: string | null;
  provider: Fornecedor;
  model_rapido: string;
  model_padrao: string;
  model_visao: string | null;
  key_hint: string;
  status: string;
  last_validated_at: string | null;
  last_error: string | null;
}

class ErroDeNegocio extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

export function exigeComentario(acao: Acao, comentario: string | undefined): string {
  if (acao === "testar") return "";
  const texto = comentario?.trim() ?? "";
  if (texto.length < 3) {
    throw new ErroDeNegocio("Informe um comentário de pelo menos 3 caracteres.", 400, "comentario_obrigatorio");
  }
  return texto;
}

export function parseFornecedor(valor: unknown): Fornecedor {
  const p = typeof valor === "string" ? valor.trim() : "";
  if (!(FORNECEDORES as readonly string[]).includes(p)) {
    throw new ErroDeNegocio("Fornecedor inválido. Use openai, gemini ou anthropic.", 400);
  }
  return p as Fornecedor;
}

function parseModelo(valor: unknown, campo: string, obrigatorio: boolean): string | null {
  if (valor === null || valor === undefined || valor === "") {
    if (obrigatorio) throw new ErroDeNegocio(`${campo}: informe o modelo.`, 400);
    return null;
  }
  if (typeof valor !== "string" || !valor.trim()) {
    throw new ErroDeNegocio(`${campo}: modelo inválido.`, 400);
  }
  return valor.trim();
}

export function parseModelos(corpo: Corpo, fornecedor: Fornecedor): ModelosInformados {
  const padraoFornecedor = MODELOS_PADRAO[fornecedor];
  return {
    rapido: parseModelo(corpo.model_rapido, "model_rapido", false) ?? padraoFornecedor.rapido,
    padrao: parseModelo(corpo.model_padrao, "model_padrao", false) ?? padraoFornecedor.padrao,
    visao: parseModelo(corpo.model_visao, "model_visao", false) ?? padraoFornecedor.visao,
  };
}

export function parseChaveApi(valor: unknown): string {
  const chave = typeof valor === "string" ? valor.trim() : "";
  if (chave.length < 12) {
    throw new ErroDeNegocio("Chave de API inválida ou curta demais.", 400);
  }
  return chave;
}

function pedidoDeTeste(): PedidoDeIA {
  return {
    funcionalidade: "admin_ai_teste",
    nivel: "rapido",
    sistema: "Responda com uma única palavra em português.",
    mensagens: [{ papel: "usuario", conteudo: "Diga: ok" }],
    maxTokens: 32,
  };
}

/** Chamada mínima ao fornecedor; não grava nada. */
export async function testarConexao(
  fornecedor: Fornecedor,
  chave: string,
  modelos: ModelosInformados,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const pedido = pedidoDeTeste();
  const modelo = modelos.rapido;
  try {
    if (fornecedor === "anthropic") {
      await chamarAnthropic({ fornecedor, chave, modelo, pedido, fetch: fetchImpl, timeoutMs: 45_000 });
    } else {
      await chamarOpenAICompat({ fornecedor, chave, modelo, pedido, fetch: fetchImpl, timeoutMs: 45_000 });
    }
  } catch (e) {
    if (e instanceof ErroDeIA) {
      throw new ErroDeNegocio(
        `Teste de conexão falhou: ${e.mensagemAoUsuario}`,
        400,
        e.codigo,
      );
    }
    throw e;
  }
}

function metadadosDeLinha(row: Record<string, unknown>): MetadadosCredencial {
  return {
    id: String(row.id),
    organization_id: row.organization_id == null ? null : String(row.organization_id),
    provider: row.provider as Fornecedor,
    model_rapido: String(row.model_rapido),
    model_padrao: String(row.model_padrao),
    model_visao: row.model_visao == null ? null : String(row.model_visao),
    key_hint: String(row.key_hint),
    status: String(row.status),
    last_validated_at: row.last_validated_at == null ? null : String(row.last_validated_at),
    last_error: row.last_error == null ? null : String(row.last_error),
  };
}

async function auditar(
  db: SupabaseClient,
  adminId: string,
  acao: string,
  orgId: string | null,
  targetType: string,
  targetId: string | null,
  antes: unknown,
  depois: unknown,
  comentario: string,
) {
  const { error } = await db.from("platform_admin_audit_log").insert({
    admin_user_id: adminId,
    action: acao,
    organization_id: orgId,
    target_type: targetType,
    target_id: targetId,
    before: antes,
    after: depois,
    comment: comentario || null,
  });
  if (error) console.error(`[admin-ai] auditoria de ${acao} falhou: ${error.message}`);
}

async function lerAtiva(db: SupabaseClient, orgId: string | null): Promise<MetadadosCredencial | null> {
  let q = db.from("ai_credentials").select("*").eq("status", "ativa");
  if (orgId === null) q = q.is("organization_id", null);
  else q = q.eq("organization_id", orgId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`ai_credentials: ${error.message}`);
  return data ? metadadosDeLinha(data as Record<string, unknown>) : null;
}

async function revogarAtivas(db: SupabaseClient, orgId: string | null, adminId: string) {
  let q = db
    .from("ai_credentials")
    .update({ status: "revogada", revoked_at: new Date().toISOString(), revoked_by: adminId })
    .eq("status", "ativa");
  if (orgId === null) q = q.is("organization_id", null);
  else q = q.eq("organization_id", orgId);
  const { error } = await q;
  if (error) throw new Error(`ai_credentials (revogar): ${error.message}`);
}

async function garantirOrganizacao(db: SupabaseClient, orgId: string) {
  const { data, error } = await db.from("organizations").select("id").eq("id", orgId).maybeSingle();
  if (error) throw new Error(`organizations: ${error.message}`);
  if (!data) throw new ErroDeNegocio("Organização não encontrada.", 404);
}

async function gravarCredencial(
  db: SupabaseClient,
  adminId: string,
  orgId: string | null,
  fornecedor: Fornecedor,
  chave: string,
  modelos: ModelosInformados,
): Promise<MetadadosCredencial> {
  const cifrada = await cifrarChave(chave, orgId);
  const agora = new Date().toISOString();
  const { data, error } = await db
    .from("ai_credentials")
    .insert({
      organization_id: orgId,
      provider: fornecedor,
      key_ciphertext: cifrada.ciphertext,
      key_iv: cifrada.iv,
      key_version: cifrada.version,
      key_hint: cifrada.hint,
      model_rapido: modelos.rapido,
      model_padrao: modelos.padrao,
      model_visao: modelos.visao,
      status: "ativa",
      last_validated_at: agora,
      last_error: null,
      last_error_at: null,
      created_by: adminId,
    })
    .select("*")
    .single();
  if (error) throw new Error(`ai_credentials (insert): ${error.message}`);
  return metadadosDeLinha(data as Record<string, unknown>);
}

async function acaoTestar(corpo: Corpo) {
  const fornecedor = parseFornecedor(corpo.provider);
  const chave = parseChaveApi(corpo.api_key);
  const modelos = parseModelos(corpo, fornecedor);
  await testarConexao(fornecedor, chave, modelos);
  return {
    ok: true,
    provider: fornecedor,
    key_hint: finalDaChave(chave),
    model_rapido: modelos.rapido,
    model_padrao: modelos.padrao,
    model_visao: modelos.visao,
  };
}

async function acaoDefinir(
  db: SupabaseClient,
  adminId: string,
  orgId: string | null,
  acaoAudit: string,
  corpo: Corpo,
  comentario: string,
) {
  const fornecedor = parseFornecedor(corpo.provider);
  const chave = parseChaveApi(corpo.api_key);
  const modelos = parseModelos(corpo, fornecedor);
  await testarConexao(fornecedor, chave, modelos);

  const antes = await lerAtiva(db, orgId);
  await revogarAtivas(db, orgId, adminId);
  const depois = await gravarCredencial(db, adminId, orgId, fornecedor, chave, modelos);
  await auditar(db, adminId, acaoAudit, orgId, "ai_credential", depois.id, antes, depois, comentario);
  return { credential: depois };
}

export function parseConfiguracaoCliente(corpo: Corpo): ConfiguracaoCliente {
  const orgId = corpo.organization_id?.trim() ?? "";
  if (!UUID.test(orgId)) throw new ErroDeNegocio("Informe a organização.", 400);

  const cfg: ConfiguracaoCliente = {
    organization_id: orgId,
    ai_enabled: corpo.ai_enabled ?? true,
    monthly_budget_cents: corpo.monthly_budget_cents ?? null,
    alert_threshold_pct: corpo.alert_threshold_pct ?? 80,
    hard_limit: corpo.hard_limit ?? null,
  };

  if (typeof cfg.ai_enabled !== "boolean") {
    throw new ErroDeNegocio("ai_enabled: verdadeiro ou falso.", 400);
  }
  if (
    cfg.monthly_budget_cents !== null &&
    (typeof cfg.monthly_budget_cents !== "number" || !Number.isInteger(cfg.monthly_budget_cents) ||
      cfg.monthly_budget_cents < 0)
  ) {
    throw new ErroDeNegocio("Orçamento mensal: inteiro >= 0 ou vazio para sem teto.", 400);
  }
  if (
    typeof cfg.alert_threshold_pct !== "number" || !Number.isInteger(cfg.alert_threshold_pct) ||
    cfg.alert_threshold_pct < 1 || cfg.alert_threshold_pct > 100
  ) {
    throw new ErroDeNegocio("alert_threshold_pct: inteiro entre 1 e 100.", 400);
  }
  if (cfg.hard_limit !== null && typeof cfg.hard_limit !== "boolean") {
    throw new ErroDeNegocio("hard_limit: verdadeiro, falso ou vazio.", 400);
  }
  return cfg;
}

export interface PrecoModelo {
  provider: Fornecedor;
  model: string;
  input_brl_per_mtok: number;
  output_brl_per_mtok: number;
  cached_input_brl_per_mtok: number | null;
  cache_write_input_brl_per_mtok: number | null;
  valid_from: string;
}

export function parsePrecoModelo(corpo: Corpo): PrecoModelo {
  const provider = parseFornecedor(corpo.provider);
  const model = typeof corpo.model === "string" ? corpo.model.trim() : "";
  if (!model) throw new ErroDeNegocio("Informe o modelo.", 400);

  const input = corpo.input_brl_per_mtok;
  const output = corpo.output_brl_per_mtok;
  if (typeof input !== "number" || input < 0 || typeof output !== "number" || output < 0) {
    throw new ErroDeNegocio("Preços de entrada e saída: números >= 0.", 400);
  }

  const validFrom = corpo.valid_from?.trim() || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) {
    throw new ErroDeNegocio("valid_from: use AAAA-MM-DD.", 400);
  }

  const cached = corpo.cached_input_brl_per_mtok;
  const cacheWrite = corpo.cache_write_input_brl_per_mtok;
  if (cached !== undefined && cached !== null && (typeof cached !== "number" || cached < 0)) {
    throw new ErroDeNegocio("cached_input_brl_per_mtok inválido.", 400);
  }
  if (cacheWrite !== undefined && cacheWrite !== null && (typeof cacheWrite !== "number" || cacheWrite < 0)) {
    throw new ErroDeNegocio("cache_write_input_brl_per_mtok inválido.", 400);
  }

  return {
    provider,
    model,
    input_brl_per_mtok: input,
    output_brl_per_mtok: output,
    cached_input_brl_per_mtok: cached ?? null,
    cache_write_input_brl_per_mtok: cacheWrite ?? null,
    valid_from: validFrom,
  };
}

async function lerConfiguracao(db: SupabaseClient, orgId: string): Promise<ConfiguracaoCliente | null> {
  const { data, error } = await db.from("ai_org_settings").select("*").eq("organization_id", orgId).maybeSingle();
  if (error) throw new Error(`ai_org_settings: ${error.message}`);
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    organization_id: orgId,
    ai_enabled: Boolean(row.ai_enabled),
    monthly_budget_cents: row.monthly_budget_cents == null ? null : Number(row.monthly_budget_cents),
    alert_threshold_pct: Number(row.alert_threshold_pct),
    hard_limit: row.hard_limit == null ? null : Boolean(row.hard_limit),
  };
}

async function acaoConfigurarCliente(
  db: SupabaseClient,
  adminId: string,
  corpo: Corpo,
  comentario: string,
) {
  const cfg = parseConfiguracaoCliente(corpo);
  await garantirOrganizacao(db, cfg.organization_id);
  const antes = await lerConfiguracao(db, cfg.organization_id);

  const { data, error } = await db
    .from("ai_org_settings")
    .upsert({
      organization_id: cfg.organization_id,
      ai_enabled: cfg.ai_enabled,
      monthly_budget_cents: cfg.monthly_budget_cents,
      alert_threshold_pct: cfg.alert_threshold_pct,
      hard_limit: cfg.hard_limit,
    })
    .select("*")
    .single();
  if (error) throw new Error(`ai_org_settings: ${error.message}`);

  const depois = parseConfiguracaoCliente({ ...corpo, organization_id: cfg.organization_id });
  await auditar(
    db,
    adminId,
    "ia_config_cliente",
    cfg.organization_id,
    "ai_org_settings",
    cfg.organization_id,
    antes,
    depois,
    comentario,
  );
  return { settings: data };
}

async function acaoDefinirPreco(db: SupabaseClient, adminId: string, corpo: Corpo, comentario: string) {
  const preco = parsePrecoModelo(corpo);
  const { data: antesRow } = await db
    .from("ai_model_prices")
    .select("*")
    .eq("provider", preco.provider)
    .eq("model", preco.model)
    .eq("valid_from", preco.valid_from)
    .maybeSingle();

  const { data, error } = await db
    .from("ai_model_prices")
    .upsert({
      provider: preco.provider,
      model: preco.model,
      input_brl_per_mtok: preco.input_brl_per_mtok,
      output_brl_per_mtok: preco.output_brl_per_mtok,
      cached_input_brl_per_mtok: preco.cached_input_brl_per_mtok,
      cache_write_input_brl_per_mtok: preco.cache_write_input_brl_per_mtok,
      valid_from: preco.valid_from,
    }, { onConflict: "provider,model,valid_from" })
    .select("*")
    .single();
  if (error) throw new Error(`ai_model_prices: ${error.message}`);

  await auditar(
    db,
    adminId,
    "ia_preco_modelo",
    null,
    "ai_model_price",
    String(data.id),
    antesRow ?? null,
    data,
    comentario,
  );
  return { price: data };
}

async function acaoRevogarCliente(db: SupabaseClient, adminId: string, corpo: Corpo, comentario: string) {
  const orgId = corpo.organization_id?.trim() ?? "";
  if (!UUID.test(orgId)) throw new ErroDeNegocio("Informe a organização.", 400);
  await garantirOrganizacao(db, orgId);

  const antes = await lerAtiva(db, orgId);
  if (!antes) throw new ErroDeNegocio("Esta organização não tem chave exclusiva ativa.", 404);

  await revogarAtivas(db, orgId, adminId);
  await auditar(
    db,
    adminId,
    "ia_credencial_cliente_revogada",
    orgId,
    "ai_credential",
    antes.id,
    antes,
    null,
    comentario,
  );
  return { revoked: true, organization_id: orgId, previous: antes };
}

// ─── Entrada ─────────────────────────────────────────────────────────
if (import.meta.main) {
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Não autenticado." }, 401);

  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Não autenticado." }, 401);
  const user = userData.user;

  const db = adminClient();
  const { data: vinculo } = await db
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (!vinculo) return json({ error: "Acesso restrito ao superadmin da plataforma." }, 403);

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return json({ error: "Corpo inválido." }, 400);
  }

  const acao = corpo.action as Acao;
  if (!ACOES.includes(acao)) return json({ error: "Ação inválida." }, 400);

  try {
    const comentario = exigeComentario(acao, corpo.comment);
    let resultado: unknown;
    switch (acao) {
      case "testar":
        resultado = await acaoTestar(corpo);
        break;
      case "definir_padrao":
        resultado = await acaoDefinir(db, user.id, null, "ia_credencial_padrao_definida", corpo, comentario);
        break;
      case "definir_cliente": {
        const orgId = corpo.organization_id?.trim() ?? "";
        if (!UUID.test(orgId)) throw new ErroDeNegocio("Informe a organização.", 400);
        await garantirOrganizacao(db, orgId);
        resultado = await acaoDefinir(db, user.id, orgId, "ia_credencial_cliente_definida", corpo, comentario);
        break;
      }
      case "revogar_cliente":
        resultado = await acaoRevogarCliente(db, user.id, corpo, comentario);
        break;
      case "configurar_cliente":
        resultado = await acaoConfigurarCliente(db, user.id, corpo, comentario);
        break;
      case "definir_preco":
        resultado = await acaoDefinirPreco(db, user.id, corpo, comentario);
        break;
    }
    console.log(`[admin-ai] ${acao} ok — superadmin ${user.id}`);
    return json(resultado);
  } catch (e) {
    if (e instanceof ErroDeNegocio) return json({ error: e.message, code: e.code }, e.status);
    if (e instanceof ErroDeCifra) {
      console.error(`[admin-ai] ${acao} falhou (cifra):`, e.codigo);
      return json({ error: "Não foi possível proteger a chave. Verifique AI_KEYS_MASTER_KEY no ambiente." }, 500);
    }
    const mensagem = e instanceof Error ? e.message : String(e);
    console.error(`[admin-ai] ${acao} falhou:`, mensagem);
    return json({ error: "Não foi possível concluir a operação. Tente de novo em instantes." }, 500);
  }
});
}
