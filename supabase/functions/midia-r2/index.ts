// Acesso ao Cloudflare R2 para a mídia da edição (BP-7.05, D2, seção 6.1).
// O vídeo vai e volta direto entre o navegador e o R2 por URL pré-assinada;
// esta função só confere a permissão, assina e registra o que o R2 guardou.
//
//   POST { acao: "iniciar", media_id, variante, mime? }   → objeto_id
//   POST { acao: "assinar_partes", objeto_id, partes }     → URLs de PUT por parte
//   POST { acao: "listar_partes", objeto_id }              → partes já no R2 (retomada)
//   POST { acao: "concluir", objeto_id, partes }           → fecha o envio, grava o tamanho real
//   POST { acao: "abortar", objeto_id }                    → descarta o envio em andamento
//   POST { acao: "ler", media_id, variante, baixar? }      → URL de GET
//
// Regras:
//   - o usuário vem do JWT; a organização, da linha da mídia no banco;
//   - a linha da mídia é lida com o token do usuário: sem linha visível pela
//     RLS (outra organização, cobrança bloqueada, portal do patrocinador),
//     não há URL nenhuma;
//   - enviar exige escrita no módulo crm ou operacional da organização da
//     mídia, e mídia não arquivada;
//   - o caminho do objeto é o do banco (`storage_prefix`, `object_key`),
//     nunca do corpo;
//   - o tamanho gravado é o do HEAD no R2, nunca o informado pelo navegador.
//
// Leitura pelo patrocinador, só de mídia em relatório publicado da marca dele
// (D11), entra com a integração do relatório (BP-7.16). Até lá ele não recebe
// URL: as tabelas da 0049 não têm policy para o portal.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.103.3";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.103.3/cors";
import { logContexto } from "../_shared/observabilidade.ts";
import { configDoAmbiente, urlAssinada, type ConfigS3 } from "../_shared/s3.ts";
import {
  erroNoXml,
  lerPartes,
  lerPedido,
  lerUploadId,
  mimeDoObjeto,
  PedidoInvalido,
  VALIDADE_ENVIO,
  VALIDADE_LEITURA,
  VALIDADE_SERVIDOR,
  xmlDeConclusao,
  type Variante,
} from "../_shared/midia_r2.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

class Falha extends Error {
  constructor(readonly status: number, mensagem: string) {
    super(mensagem);
  }
}

type Midia = {
  id: string;
  organization_id: string;
  kind: string;
  file_name: string;
  mime_type: string | null;
  status: string;
  storage_prefix: string;
  archived_at: string | null;
};

type Objeto = {
  id: string;
  media_id: string;
  variant: Variante;
  object_key: string;
  status: string;
  upload_id: string | null;
};

const COLUNAS_DA_MIDIA = "id, organization_id, kind, file_name, mime_type, status, storage_prefix, archived_at";
const COLUNAS_DO_OBJETO = "id, media_id, variant, object_key, status, upload_id";

/** Mídia vista pela RLS do usuário: sem linha, 404 (não diz se existe em outra organização). */
async function carregarMidia(usuario: SupabaseClient, id: string): Promise<Midia> {
  const { data } = await usuario.from("edition_media").select(COLUNAS_DA_MIDIA).eq("id", id).maybeSingle();
  if (!data) throw new Falha(404, "Mídia não encontrada.");
  return data as Midia;
}

async function carregarObjeto(usuario: SupabaseClient, id: string): Promise<Objeto> {
  const { data } = await usuario.from("edition_media_objects").select(COLUNAS_DO_OBJETO).eq("id", id).maybeSingle();
  if (!data) throw new Falha(404, "Envio não encontrado.");
  return data as Objeto;
}

/** Escrita no módulo crm ou operacional (padrão 7), pelo usuário do JWT. */
async function exigirEscrita(usuario: SupabaseClient, userId: string, midia: Midia) {
  const [crm, operacional] = await Promise.all([
    usuario.rpc("can_access_module", { _user_id: userId, _org_id: midia.organization_id, _module: "crm", _write: true }),
    usuario.rpc("can_access_module", { _user_id: userId, _org_id: midia.organization_id, _module: "operacional", _write: true }),
  ]);
  if (crm.data !== true && operacional.data !== true) {
    throw new Falha(403, "Sem permissão para enviar material deste projeto.");
  }
  if (midia.archived_at) throw new Falha(409, "A mídia está arquivada.");
}

/** Chamada do servidor à API S3, com URL assinada para o endpoint interno. */
async function s3(
  cfg: ConfigS3,
  metodo: "GET" | "POST" | "DELETE" | "HEAD",
  chave: string,
  query: Record<string, string>,
  init: { body?: string; headers?: Record<string, string> } = {},
): Promise<Response> {
  const url = await urlAssinada(cfg, { metodo, chave, query, expiraEmSegundos: VALIDADE_SERVIDOR, publica: false });
  try {
    return await fetch(url, { method: metodo, body: init.body, headers: init.headers, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new Falha(502, "O armazenamento não respondeu. Tente de novo.");
  }
}

async function abortarNoR2(cfg: ConfigS3, chave: string, uploadId: string) {
  const res = await s3(cfg, "DELETE", chave, { uploadId });
  await res.body?.cancel();
  // 404: o R2 já não tem esse envio (expirado ou abortado antes).
  if (!res.ok && res.status !== 404) throw new Falha(502, "Não foi possível descartar o envio no armazenamento.");
}

function nomeParaDownload(nome: string): string {
  const ascii = nome.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "").trim() || "arquivo";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado." }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const usuario = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData } = await usuario.auth.getUser();
    const user = userData.user;
    if (!user) return json({ error: "Não autenticado." }, 401);

    const cfg = configDoAmbiente((nome) => Deno.env.get(nome));
    if (!cfg) return json({ error: "Armazenamento de mídia não configurado neste ambiente." }, 503);

    const pedido = lerPedido(await req.json().catch(() => null));
    const servidor = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (pedido.acao === "iniciar") {
      const midia = await carregarMidia(usuario, pedido.mediaId);
      await exigirEscrita(usuario, user.id, midia);
      logContexto(req, { user_id: user.id, organization_id: midia.organization_id, code: "midia_r2_iniciar" });
      const mime = mimeDoObjeto(pedido.variante, midia.mime_type, pedido.mime);
      const chave = `${midia.storage_prefix}/${pedido.variante}`;

      const { data: existente } = await servidor
        .from("edition_media_objects")
        .select(COLUNAS_DO_OBJETO)
        .eq("media_id", midia.id)
        .eq("variant", pedido.variante)
        .maybeSingle();
      if (existente?.status === "enviado") throw new Falha(409, "Esta versão do arquivo já foi enviada.");
      if (existente?.upload_id) await abortarNoR2(cfg, existente.object_key, existente.upload_id);

      const criado = await s3(cfg, "POST", chave, { uploads: "" }, { headers: { "Content-Type": mime } });
      const uploadId = lerUploadId(await criado.text());
      if (!criado.ok || !uploadId) throw new Falha(502, "O armazenamento recusou o início do envio.");

      const valores = { status: "enviando", upload_id: uploadId, mime_type: mime, size_bytes: null, completed_at: null };
      const gravado = existente
        ? await servidor.from("edition_media_objects").update(valores).eq("id", existente.id).select("id").single()
        : await servidor
          .from("edition_media_objects")
          .insert({
            ...valores,
            media_id: midia.id,
            variant: pedido.variante,
            // Os dois são trocados pelo gatilho `tg_midia_edicao_objetos` pelos da mídia.
            organization_id: midia.organization_id,
            object_key: chave,
          })
          .select("id")
          .single();
      if (gravado.error || !gravado.data) {
        await abortarNoR2(cfg, chave, uploadId).catch(() => undefined);
        // 23505: outro envio da mesma variante começou ao mesmo tempo.
        throw new Falha(gravado.error?.code === "23505" ? 409 : 500, "Não foi possível registrar o envio.");
      }

      if (pedido.variante === "original" && ["aguardando_envio", "erro"].includes(midia.status)) {
        await servidor.from("edition_media").update({ status: "enviando", error_message: null }).eq("id", midia.id);
      }
      return json({ objeto_id: gravado.data.id, parte_minima_bytes: 5 * 1024 * 1024, max_partes: 10_000 });
    }

    if (pedido.acao === "ler") {
      const midia = await carregarMidia(usuario, pedido.mediaId);
      const { data: objeto } = await usuario
        .from("edition_media_objects")
        .select(COLUNAS_DO_OBJETO)
        .eq("media_id", midia.id)
        .eq("variant", pedido.variante)
        .eq("status", "enviado")
        .maybeSingle();
      if (!objeto) throw new Falha(404, "Esta versão do arquivo ainda não foi enviada.");
      logContexto(req, { user_id: user.id, organization_id: midia.organization_id, code: "midia_r2_ler" });
      const query: Record<string, string> = pedido.baixar ? { "response-content-disposition": nomeParaDownload(midia.file_name) } : {};
      const url = await urlAssinada(cfg, {
        metodo: "GET",
        chave: (objeto as Objeto).object_key,
        query,
        expiraEmSegundos: VALIDADE_LEITURA,
        publica: true,
      });
      return json({ url, expira_em_segundos: VALIDADE_LEITURA });
    }

    // As ações abaixo continuam um envio: objeto visível, mídia com escrita.
    const objeto = await carregarObjeto(usuario, pedido.objetoId);
    const midia = await carregarMidia(usuario, objeto.media_id);
    await exigirEscrita(usuario, user.id, midia);
    logContexto(req, { user_id: user.id, organization_id: midia.organization_id, code: `midia_r2_${pedido.acao}` });
    if (objeto.status !== "enviando" || !objeto.upload_id) throw new Falha(409, "Este envio não está em andamento.");
    const uploadId = objeto.upload_id;

    if (pedido.acao === "assinar_partes") {
      const partes = await Promise.all(
        pedido.partes.map(async (numero) => ({
          numero,
          url: await urlAssinada(cfg, {
            metodo: "PUT",
            chave: objeto.object_key,
            query: { partNumber: String(numero), uploadId },
            expiraEmSegundos: VALIDADE_ENVIO,
            publica: true,
          }),
        })),
      );
      return json({ partes, expira_em_segundos: VALIDADE_ENVIO });
    }

    if (pedido.acao === "listar_partes") {
      const partes: Array<{ numero: number; etag: string; tamanho: number }> = [];
      let marcador: number | null = 0;
      // Teto de páginas: 10.000 partes em páginas de 1.000.
      for (let pagina = 0; marcador !== null && pagina < 11; pagina++) {
        const query: Record<string, string> = { uploadId };
        if (marcador > 0) query["part-number-marker"] = String(marcador);
        const res = await s3(cfg, "GET", objeto.object_key, query);
        const xml = await res.text();
        if (res.status === 404) throw new Falha(409, "O armazenamento já não tem este envio. Comece de novo.");
        if (!res.ok) throw new Falha(502, "Não foi possível ler as partes enviadas.");
        const lida = lerPartes(xml);
        partes.push(...lida.partes);
        marcador = lida.proximoMarcador;
      }
      return json({ partes });
    }

    if (pedido.acao === "concluir") {
      const res = await s3(cfg, "POST", objeto.object_key, { uploadId }, {
        body: xmlDeConclusao(pedido.partes),
        headers: { "Content-Type": "application/xml" },
      });
      const xml = await res.text();
      const codigo = erroNoXml(xml);
      if (!res.ok || codigo) {
        // InvalidPart / InvalidPartOrder / EntityTooSmall: a lista do navegador não bate com o R2.
        const doCliente = res.status === 400 || (codigo !== null && /^(InvalidPart|InvalidPartOrder|EntityTooSmall)$/.test(codigo));
        throw new Falha(doCliente ? 409 : 502, `O armazenamento não aceitou concluir o envio${codigo ? ` (${codigo})` : ""}.`);
      }

      const cabeca = await s3(cfg, "HEAD", objeto.object_key, {});
      await cabeca.body?.cancel();
      const tamanho = Number(cabeca.headers.get("content-length"));
      if (!cabeca.ok || !Number.isSafeInteger(tamanho) || tamanho < 0) {
        throw new Falha(502, "Envio concluído, mas o armazenamento não informou o tamanho. Tente concluir de novo.");
      }

      const { error } = await servidor
        .from("edition_media_objects")
        .update({ status: "enviado", size_bytes: tamanho, completed_at: new Date().toISOString(), upload_id: null })
        .eq("id", objeto.id);
      if (error) throw new Falha(500, "Envio concluído, mas não foi possível registrá-lo.");
      if (objeto.variant === "original" && ["aguardando_envio", "enviando", "erro"].includes(midia.status)) {
        await servidor.from("edition_media").update({ status: "enviado", error_message: null }).eq("id", midia.id);
      }
      return json({ tamanho_bytes: tamanho });
    }

    // abortar
    await abortarNoR2(cfg, objeto.object_key, uploadId);
    await servidor.from("edition_media_objects").update({ status: "erro", upload_id: null }).eq("id", objeto.id);
    if (objeto.variant === "original" && midia.status === "enviando") {
      await servidor.from("edition_media").update({ status: "aguardando_envio" }).eq("id", midia.id);
    }
    return json({ ok: true });
  } catch (e) {
    if (e instanceof PedidoInvalido) return json({ error: e.message }, 400);
    if (e instanceof Falha) return json({ error: e.message }, e.status);
    return json({ error: "erro interno" }, 500);
  }
});
