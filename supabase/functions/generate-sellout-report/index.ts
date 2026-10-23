// Relatório de sell-out de uma propriedade, opcionalmente de um evento dela
// (IA-14). A organização é a da propriedade, lida sob RLS; o evento, as
// cotas, as vendas, as entregas e o relatório gravado ficam nela.

import { gerar } from "../_shared/ai/camada.ts";
import {
  autenticar,
  CORS,
  dependenciasDaCamada,
  ErroDaRequisicao,
  exigirModulo,
  json,
  respostaDeFalha,
  uuidDoCorpo,
} from "../_shared/ai/funcao.ts";

const FUNCIONALIDADE = "generate-sellout-report";

interface Cota {
  id: string;
  name: string;
  level: string | null;
  total_slots: number;
  value: number | string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { usuario, cliente } = await autenticar(req);
    const corpo = await req.json().catch(() => ({}));
    const propertyId = uuidDoCorpo(corpo, "property_id");
    const eventId = corpo?.event_id ? uuidDoCorpo(corpo, "event_id") : null;

    const { data: propriedade } = await cliente
      .from("sports_properties")
      .select("id,organization_id,name,category,audience_estimate")
      .eq("id", propertyId)
      .maybeSingle();
    if (!propriedade?.organization_id) throw new ErroDaRequisicao(404, "Propriedade não encontrada");
    const org: string = propriedade.organization_id;
    await exigirModulo(cliente, usuario.id, org, "crm");

    const [entregasR, cotasR, eventoR] = await Promise.all([
      cliente.from("deliveries").select("status").eq("property_id", propertyId).eq("organization_id", org),
      cliente.from("sponsorship_tiers").select("id,name,level,total_slots,value").eq("property_id", propertyId).eq("organization_id", org),
      eventId
        ? cliente.from("property_events").select("title").eq("id", eventId).eq("property_id", propertyId).eq("organization_id", org).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (eventId && !eventoR.data) throw new ErroDaRequisicao(404, "Evento não encontrado nesta propriedade");
    const tituloDoEvento: string | null = eventoR.data?.title ?? null;

    const cotasDaPropriedade: Cota[] = cotasR.data ?? [];
    const tierIds = cotasDaPropriedade.map((t) => t.id);
    const vendas: { tier_id: string; brand: string | null; status: string }[] = tierIds.length
      ? (await cliente.from("tier_sales").select("tier_id,brand,status").in("tier_id", tierIds).eq("organization_id", org)).data ?? []
      : [];

    const cotas = cotasDaPropriedade.map((t) => {
      const vendidas = vendas.filter((s) => s.tier_id === t.id && s.status !== "cancelada").length;
      return {
        nome: t.name,
        nivel: t.level,
        cotas_vendidas: vendidas,
        cotas_totais: t.total_slots,
        sellout_pct: t.total_slots > 0 ? Math.round((vendidas / t.total_slots) * 100) : 0,
        receita: vendidas * Number(t.value || 0),
      };
    });

    const entregas: { status: string }[] = entregasR.data ?? [];
    const cotasVendidas = cotas.reduce((s, t) => s + t.cotas_vendidas, 0);
    const cotasTotais = cotas.reduce((s, t) => s + t.cotas_totais, 0);

    const metrics = {
      sellout_pct: cotasTotais > 0 ? Math.round((cotasVendidas / cotasTotais) * 100) : 0,
      cotas_vendidas: cotasVendidas,
      cotas_totais: cotasTotais,
      receita_total: cotas.reduce((s, t) => s + t.receita, 0),
      tiers: cotas,
      entregas: {
        entregue: entregas.filter((d) => d.status === "entregue" || d.status === "aprovada").length,
        pendente: entregas.filter((d) => d.status === "pendente").length,
        atrasada: entregas.filter((d) => d.status === "atrasada").length,
      },
      audiencia_estimada: propriedade.audience_estimate,
    };

    const ctx = {
      propriedade: propriedade.name,
      categoria: propriedade.category,
      evento: tituloDoEvento,
      ...metrics,
      patrocinadores: [...new Set(vendas.map((s) => s.brand).filter(Boolean))],
    };

    const resposta = await gerar({ organizacaoId: org, usuarioId: usuario.id }, {
      funcionalidade: FUNCIONALIDADE,
      nivel: "padrao",
      sistema: "Responda em markdown limpo, sem ```markdown wrappers.",
      mensagens: [{
        papel: "usuario",
        conteudo:
          `Você é um especialista em marketing esportivo. Gere um relatório executivo de sell-out pós-temporada/evento (300-500 palavras, em português brasileiro, formato markdown com seções: Resumo Executivo, Performance Comercial, Performance Operacional, Insights e Recomendações). Use os dados:\n\n${JSON.stringify(ctx, null, 2)}`,
      }],
      maxTokens: 4096,
    }, dependenciasDaCamada());

    const relatorio = {
      organization_id: org,
      property_id: propertyId,
      event_id: eventId,
      title: `Sell-out Report — ${propriedade.name}${tituloDoEvento ? ` · ${tituloDoEvento}` : ""}`,
      content: resposta.texto,
      metrics,
      model: resposta.modelo,
      owner_id: usuario.id,
    };
    const { data: report, error } = await cliente.from("sellout_reports").insert(relatorio).select().single();
    if (error) {
      // A chamada já foi feita e medida: devolve o relatório, mesmo sem salvar.
      console.error(`${FUNCIONALIDADE}: relatório não gravado (${error.code ?? "?"})`);
      return json({ report: { ...relatorio, id: null, created_at: new Date().toISOString() }, saved: false });
    }

    return json({ report, saved: true });
  } catch (e) {
    return respostaDeFalha(e, FUNCIONALIDADE);
  }
});
