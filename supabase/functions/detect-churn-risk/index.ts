// Risco de churn dos contratos ativos da organização ativa (IA-15).
//
// O portal envia a organização ativa; ela é validada contra o usuário do JWT
// (`exigirModulo`) e filtra todas as consultas. Antes, a função varria tudo
// o que o RLS deixava ver — para quem está em várias organizações, misturava
// clientes diferentes no mesmo prompt.
//
// O risco é calculado aqui; a IA só escreve a recomendação dos 5 maiores.
// Se a IA falhar, os riscos voltam sem recomendação e com `aviso_ia`.

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

const FUNCIONALIDADE = "detect-churn-risk";

interface Contrato {
  id: string;
  title: string;
  brand: string | null;
  sponsor_id: string | null;
  end_date: string | null;
  total_value: number | null;
}

interface Risco {
  contract_id: string;
  contract_title: string;
  sponsor_name: string | null;
  sponsor_id: string | null;
  risk_level: "baixo" | "medio" | "alto" | "critico";
  risk_score: number;
  signals: string[];
  total_value: number | null;
  recommendation?: string;
}

const DIA_MS = 86_400_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { usuario, cliente } = await autenticar(req);
    const org = organizacaoDoCorpo(await req.json().catch(() => ({})));
    await exigirModulo(cliente, usuario.id, org, "crm");

    const { data } = await cliente
      .from("contracts")
      .select("id,title,brand,sponsor_id,end_date,total_value")
      .eq("organization_id", org)
      .eq("status", "ativo");
    const contratos: Contrato[] = data ?? [];
    if (contratos.length === 0) return json({ risks: [] });

    const contractIds = contratos.map((c) => c.id);
    const marcas = [...new Set(contratos.map((c) => c.brand).filter((m): m is string => Boolean(m)))];
    const sponsorIds = [...new Set(contratos.map((c) => c.sponsor_id).filter((s): s is string => Boolean(s)))];

    const [parcelasR, entregasR, patrocinadoresR] = await Promise.all([
      cliente.from("installments").select("contract_id,status").in("contract_id", contractIds).eq("organization_id", org),
      marcas.length
        ? cliente.from("deliveries").select("brand,status,approval,due_date").in("brand", marcas).eq("organization_id", org)
        : Promise.resolve({ data: [] }),
      sponsorIds.length
        ? cliente.from("sponsors").select("id,last_contact_at,name").in("id", sponsorIds).eq("organization_id", org)
        : Promise.resolve({ data: [] }),
    ]);
    const parcelas: { contract_id: string; status: string }[] = parcelasR.data ?? [];
    const entregas: { brand: string; status: string; approval: string | null; due_date: string | null }[] = entregasR.data ?? [];
    const patrocinadores: { id: string; last_contact_at: string | null; name: string }[] = patrocinadoresR.data ?? [];

    const hoje = new Date();
    const riscos: Risco[] = [];

    for (const c of contratos) {
      const atrasadas = parcelas.filter((i) => i.contract_id === c.id && i.status === "atrasado").length;
      const dels = entregas.filter((d) => d.brand === c.brand);
      const reprovadas = dels.filter((d) => d.approval === "reprovada").length;
      const entregasAtrasadas = dels.filter((d) =>
        d.status === "atrasada" || (d.due_date && new Date(d.due_date) < hoje && d.status !== "entregue" && d.status !== "aprovada")
      ).length;
      const sp = patrocinadores.find((s) => s.id === c.sponsor_id);
      const diasSemContato = sp?.last_contact_at ? Math.floor((hoje.getTime() - new Date(sp.last_contact_at).getTime()) / DIA_MS) : 999;
      const diasParaFim = c.end_date ? Math.floor((new Date(c.end_date).getTime() - hoje.getTime()) / DIA_MS) : null;

      let score = 0;
      const signals: string[] = [];
      if (atrasadas > 0) { score += atrasadas * 20; signals.push(`${atrasadas} parcela(s) em atraso`); }
      if (reprovadas > 0) { score += reprovadas * 15; signals.push(`${reprovadas} entrega(s) reprovada(s)`); }
      if (entregasAtrasadas > 0) { score += entregasAtrasadas * 10; signals.push(`${entregasAtrasadas} entrega(s) atrasada(s)`); }
      if (diasSemContato > 30) { score += 15; signals.push(`${diasSemContato}d sem contato`); }
      if (diasSemContato > 60) score += 10;
      if (diasParaFim !== null && diasParaFim < 60 && diasParaFim > 0) { score += 20; signals.push(`Vence em ${diasParaFim}d`); }

      if (score === 0) continue;

      riscos.push({
        contract_id: c.id,
        contract_title: c.title,
        sponsor_name: sp?.name ?? c.brand,
        sponsor_id: c.sponsor_id,
        risk_level: score >= 60 ? "critico" : score >= 40 ? "alto" : score >= 20 ? "medio" : "baixo",
        risk_score: score,
        signals,
        total_value: c.total_value,
      });
    }

    riscos.sort((a, b) => b.risk_score - a.risk_score);
    if (riscos.length === 0) return json({ risks: [] });

    // Recomendação da IA para os 5 maiores riscos.
    const maiores = riscos.slice(0, 5);
    const ia = await tentarIA(FUNCIONALIDADE, () =>
      gerar({ organizacaoId: org, usuarioId: usuario.id }, {
        funcionalidade: FUNCIONALIDADE,
        nivel: "rapido",
        sistema:
          "Você é consultor de retenção de patrocinadores. Para cada contrato, gere 1 recomendação curta (máx 15 palavras) em português brasileiro.",
        mensagens: [{ papel: "usuario", conteudo: `Contratos em risco:\n${JSON.stringify(maiores, null, 2)}` }],
        json: {
          nome: "recomendacoes_de_retencao",
          esquema: {
            type: "object",
            properties: {
              recommendations: {
                type: "array",
                items: {
                  type: "object",
                  properties: { contract_id: { type: "string" }, recommendation: { type: "string" } },
                  required: ["contract_id", "recommendation"],
                },
              },
            },
            required: ["recommendations"],
          },
        },
        maxTokens: 1024,
      }, dependenciasDaCamada())
    );

    const recomendacoes = Array.isArray(ia.valor?.json?.recommendations) ? ia.valor.json.recommendations : [];
    for (const rec of recomendacoes as { contract_id?: unknown; recommendation?: unknown }[]) {
      const r = maiores.find((m) => m.contract_id === rec.contract_id);
      if (r && typeof rec.recommendation === "string") r.recommendation = rec.recommendation;
    }

    // Cache auxiliar, uma linha por contrato (uma que falhe não leva as
    // outras); se não gravar, os riscos voltam mesmo assim.
    const geradoEm = new Date().toISOString();
    const gravacoes = await Promise.all(riscos.map((r) =>
      cliente.from("contract_churn_risk").upsert({
        contract_id: r.contract_id,
        organization_id: org,
        owner_id: usuario.id,
        risk_level: r.risk_level,
        risk_score: r.risk_score,
        signals: r.signals,
        recommendation: r.recommendation ?? null,
        model: r.recommendation ? ia.valor?.modelo ?? null : null,
        generated_at: geradoEm,
      })
    ));
    const falhas = gravacoes.filter((g) => g.error).length;
    if (falhas) console.error(`${FUNCIONALIDADE}: ${falhas} de ${riscos.length} linhas do cache não gravadas`);

    return json({ risks: riscos, ...(ia.aviso ? { aviso_ia: ia.aviso } : {}) });
  } catch (e) {
    return respostaDeFalha(e, FUNCIONALIDADE);
  }
});
