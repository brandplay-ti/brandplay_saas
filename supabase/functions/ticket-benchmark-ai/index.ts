// Benchmark de ticket médio por segmento: média interna vs. estimativa de
// mercado pela IA (IA-15).
//
// O portal envia a organização ativa; ela é validada contra o usuário do JWT
// (`exigirModulo`) e filtra contratos, patrocinadores e o cache. Antes, a
// média interna misturava todas as organizações do usuário e o cache ia para
// a organização de `get_user_org` — uma só, ambígua para quem está em várias.
//
// A média interna vale sem a IA: se a estimativa falhar, ela volta sem os
// números de mercado e com `aviso_ia`.

import { gerar } from "../_shared/ai/camada.ts";
import {
  autenticar,
  CORS,
  dependenciasDaCamada,
  exigirModulo,
  json,
  organizacaoDoCorpo,
  respostaDeFalha,
  tentarIA,
} from "../_shared/ai/funcao.ts";

const FUNCIONALIDADE = "ticket-benchmark-ai";
const VALIDADE_DO_CACHE_MS = 7 * 24 * 3600 * 1000;

interface Mercado {
  segment: string;
  market_avg: number | null;
  market_min: number | null;
  market_max: number | null;
  notes: string | null;
}

const numeroOuNulo = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { usuario, cliente } = await autenticar(req);
    const corpo = await req.json().catch(() => ({}));
    const org = organizacaoDoCorpo(corpo);
    const force = corpo?.force === true;
    await exigirModulo(cliente, usuario.id, org, "crm");

    const { data: contratosR } = await cliente
      .from("contracts")
      .select("total_value,sponsor_id")
      .eq("organization_id", org)
      .gt("total_value", 0)
      .in("status", ["ativo", "vencendo", "encerrado"]);
    const contratos: { total_value: number; sponsor_id: string | null }[] = contratosR ?? [];

    const sponsorIds = [...new Set(contratos.map((c) => c.sponsor_id).filter((s): s is string => Boolean(s)))];
    const { data: patrocinadores } = sponsorIds.length
      ? await cliente.from("sponsors").select("id,segment").in("id", sponsorIds).eq("organization_id", org)
      : { data: [] };
    const segmentoDe: Record<string, string> = {};
    for (const s of (patrocinadores ?? []) as { id: string; segment: string | null }[]) segmentoDe[s.id] = s.segment || "Outros";

    const grupos: Record<string, number[]> = {};
    for (const c of contratos) {
      const seg = (c.sponsor_id && segmentoDe[c.sponsor_id]) || "Outros";
      (grupos[seg] ??= []).push(Number(c.total_value || 0));
    }
    const interno = Object.entries(grupos).map(([segment, valores]) => ({
      segment,
      internal_avg: Math.round(valores.reduce((s, v) => s + v, 0) / valores.length),
      contract_count: valores.length,
      min: Math.round(Math.min(...valores)),
      max: Math.round(Math.max(...valores)),
    })).sort((a, b) => b.internal_avg - a.internal_avg);

    let mercado: Mercado[] = [];
    let avisoIA: unknown = undefined;
    if (interno.length > 0) {
      if (!force) {
        const { data: cache } = await cliente
          .from("market_benchmarks")
          .select("segment,market_avg_ticket,market_min,market_max,notes,generated_at")
          .eq("organization_id", org);
        const recentes = (cache ?? []).filter((c: { generated_at: string }) => Date.now() - new Date(c.generated_at).getTime() < VALIDADE_DO_CACHE_MS);
        if (recentes.length === interno.length) {
          mercado = recentes.map((c: { segment: string; market_avg_ticket: unknown; market_min: unknown; market_max: unknown; notes: string | null }) => ({
            segment: c.segment,
            market_avg: numeroOuNulo(c.market_avg_ticket),
            market_min: numeroOuNulo(c.market_min),
            market_max: numeroOuNulo(c.market_max),
            notes: c.notes,
          }));
        }
      }

      if (mercado.length === 0) {
        const ia = await tentarIA(FUNCIONALIDADE, () =>
          gerar({ organizacaoId: org, usuarioId: usuario.id }, {
            funcionalidade: FUNCIONALIDADE,
            nivel: "padrao",
            mensagens: [{
              papel: "usuario",
              conteudo:
                `Você é um analista do mercado brasileiro de patrocínio esportivo. Para cada segmento abaixo, estime o ticket médio anual realista de uma cota de patrocínio (em BRL) no mercado brasileiro de propriedades esportivas regionais/nacionais, com mínimo, máximo e uma breve justificativa.\n\nSegmentos: ${interno.map((i) => i.segment).join(", ")}`,
            }],
            json: {
              nome: "benchmark_de_ticket",
              esquema: {
                type: "object",
                properties: {
                  segments: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        segment: { type: "string" },
                        market_avg: { type: "number" },
                        market_min: { type: "number" },
                        market_max: { type: "number" },
                        notes: { type: "string" },
                      },
                      required: ["segment", "market_avg", "market_min", "market_max", "notes"],
                    },
                  },
                },
                required: ["segments"],
              },
            },
            maxTokens: 2048,
          }, dependenciasDaCamada())
        );
        avisoIA = ia.aviso;

        const segmentos = Array.isArray(ia.valor?.json?.segments) ? ia.valor.json.segments as Record<string, unknown>[] : [];
        mercado = segmentos
          .filter((s) => typeof s.segment === "string")
          .map((s) => ({
            segment: s.segment as string,
            market_avg: numeroOuNulo(s.market_avg),
            market_min: numeroOuNulo(s.market_min),
            market_max: numeroOuNulo(s.market_max),
            notes: typeof s.notes === "string" ? s.notes : null,
          }));

        if (mercado.length > 0) {
          const geradoEm = new Date().toISOString();
          const gravacoes = await Promise.all(mercado.map((m) =>
            cliente.from("market_benchmarks").upsert({
              organization_id: org,
              segment: m.segment,
              market_avg_ticket: m.market_avg ?? 0,
              market_min: m.market_min,
              market_max: m.market_max,
              notes: m.notes,
              model: ia.valor?.modelo ?? null,
              generated_at: geradoEm,
            }, { onConflict: "organization_id,segment" })
          ));
          const falhas = gravacoes.filter((g) => g.error).length;
          if (falhas) console.error(`${FUNCIONALIDADE}: ${falhas} de ${mercado.length} linhas do cache não gravadas`);
        }
      }
    }

    const items = interno.map((i) => {
      const m = mercado.find((x) => x.segment === i.segment);
      const marketAvg = m?.market_avg ?? null;
      return {
        ...i,
        market_avg: marketAvg,
        market_min: m?.market_min ?? null,
        market_max: m?.market_max ?? null,
        market_notes: m?.notes ?? null,
        variance_percent: marketAvg ? Math.round(((i.internal_avg - marketAvg) / marketAvg) * 100) : null,
      };
    });

    return json({ items, ...(avisoIA ? { aviso_ia: avisoIA } : {}) });
  } catch (e) {
    return respostaDeFalha(e, FUNCIONALIDADE);
  }
});
