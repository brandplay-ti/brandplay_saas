// Rascunho de proposta a partir de um briefing (IA-18).
//
// A proposta é criada na organização ativa (o portal grava com o `orgId`),
// então é ela que a função recebe e valida contra o usuário do JWT. O
// patrocinador e a propriedade, quando escolhidos, precisam ser dela (senão
// 404); cotas e ativos do contexto também. Antes, os ativos vinham de todas
// as organizações do usuário.

import { gerar } from "../_shared/ai/camada.ts";
import {
  autenticar,
  CORS,
  dependenciasDaCamada,
  ErroDaRequisicao,
  exigirModulo,
  json,
  organizacaoDoCorpo,
  respostaDeFalha,
  uuidDoCorpo,
} from "../_shared/ai/funcao.ts";
import type { EsquemaJson } from "../_shared/ai/tipos.ts";

const FUNCIONALIDADE = "generate-proposal-ai";

/** Linha do PostgREST (as funções não têm os tipos gerados do banco). */
type Linha = Record<string, unknown>;

const SISTEMA = `Você é um especialista em propostas comerciais para patrocínio esportivo no Brasil.
Receba o contexto do patrocinador, da propriedade esportiva, dos ativos disponíveis e o briefing do usuário.
Gere uma proposta enxuta e persuasiva em português do Brasil, conectando os objetivos do patrocinador aos ativos disponíveis.
- title: título curto (máx 80 chars), incluindo a marca quando souber.
- message: mensagem comercial em 2-4 parágrafos, tom profissional e direto.
- items: 3 a 8 itens; cada um com name (obrigatório), description (curta), quantity (int >=1), unit_value (R$ em number, sem símbolo).
- Se houver ativos sugeridos no contexto, priorize usá-los e mantenha valores compatíveis.`;

const ESQUEMA: EsquemaJson = {
  type: "object",
  properties: {
    title: { type: "string" },
    message: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          quantity: { type: "integer", minimum: 1 },
          unit_value: { type: "number", minimum: 0 },
        },
        required: ["name", "quantity", "unit_value"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "message", "items"],
  additionalProperties: false,
};

const texto = (valor: unknown, max = 4000) => (valor ?? "").toString().slice(0, max);

/** Itens no formato que a tela grava; descarta o que vier sem nome. */
function itensDaProposta(bruto: unknown) {
  return (Array.isArray(bruto) ? bruto as Linha[] : [])
    .filter((i) => typeof i?.name === "string" && i.name.trim())
    .slice(0, 20)
    .map((i) => ({
      name: String(i.name).slice(0, 200),
      description: typeof i.description === "string" ? i.description : undefined,
      quantity: Math.max(1, Math.round(Number(i.quantity) || 1)),
      unit_value: Math.max(0, Number(i.unit_value) || 0),
    }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { usuario, cliente } = await autenticar(req);
    const corpo = await req.json().catch(() => ({}));
    const org = organizacaoDoCorpo(corpo);
    const briefing = texto(corpo?.briefing).trim();
    const objective = texto(corpo?.objective, 500).trim();
    const sponsorId = corpo?.sponsor_id ? uuidDoCorpo(corpo, "sponsor_id") : null;
    const propertyId = corpo?.property_id ? uuidDoCorpo(corpo, "property_id") : null;
    if (!briefing && !objective) throw new ErroDaRequisicao(400, "Briefing ou objetivo é obrigatório");
    await exigirModulo(cliente, usuario.id, org, "crm");

    const ctx: string[] = [];

    if (sponsorId) {
      const { data: s } = await cliente
        .from("sponsors")
        .select("name, segment, notes, tags, score")
        .eq("id", sponsorId)
        .eq("organization_id", org)
        .maybeSingle();
      if (!s) throw new ErroDaRequisicao(404, "Patrocinador não encontrado");
      ctx.push(`PATROCINADOR: ${s.name}${s.segment ? ` (${s.segment})` : ""}${s.notes ? `\nNotas: ${s.notes}` : ""}${s.tags?.length ? `\nTags: ${s.tags.join(", ")}` : ""}`);
    }

    if (propertyId) {
      const [{ data: p }, { data: tiers }] = await Promise.all([
        cliente
          .from("sports_properties")
          .select("name, category, description, audience_estimate, season_year")
          .eq("id", propertyId)
          .eq("organization_id", org)
          .maybeSingle(),
        cliente
          .from("sponsorship_tiers")
          .select("name, level, value, benefits")
          .eq("property_id", propertyId)
          .eq("organization_id", org)
          .order("position"),
      ]);
      if (!p) throw new ErroDaRequisicao(404, "Propriedade não encontrada");
      ctx.push(`PROPRIEDADE: ${p.name} (${p.category})${p.audience_estimate ? `\nAudiência estimada: ${p.audience_estimate}` : ""}${p.description ? `\nSobre: ${p.description}` : ""}`);
      if (tiers?.length) {
        ctx.push(`COTAS DISPONÍVEIS:\n${(tiers as Linha[]).map((t) => `- ${t.name} (${t.level}) — R$ ${t.value}${t.benefits ? ` | ${t.benefits}` : ""}`).join("\n")}`);
      }
    }

    const { data: assets } = await cliente
      .from("assets")
      .select("name, category, unit_value, quantity")
      .eq("organization_id", org)
      .eq("status", "ativo")
      .limit(20);
    if (assets?.length) {
      ctx.push(`ATIVOS DISPONÍVEIS:\n${(assets as Linha[]).map((a) => `- ${a.name} (${a.category}) — R$ ${a.unit_value} x ${a.quantity}`).join("\n")}`);
    }

    const pedidoDoUsuario = [
      objective ? `OBJETIVO: ${objective}` : null,
      briefing ? `BRIEFING:\n${briefing}` : null,
      ctx.length ? `CONTEXTO:\n${ctx.join("\n\n")}` : null,
    ].filter(Boolean).join("\n\n");

    const resposta = await gerar({ organizacaoId: org, usuarioId: usuario.id }, {
      funcionalidade: FUNCIONALIDADE,
      nivel: "padrao",
      sistema: SISTEMA,
      mensagens: [{ papel: "usuario", conteudo: pedidoDoUsuario }],
      json: { nome: "proposta_comercial", esquema: ESQUEMA },
      maxTokens: 4096,
    }, dependenciasDaCamada());
    const proposta = resposta.json ?? {};

    return json({
      title: texto(proposta.title, 200),
      message: texto(proposta.message, 8000),
      items: itensDaProposta(proposta.items),
    });
  } catch (e) {
    return respostaDeFalha(e, FUNCIONALIDADE);
  }
});
