// Pontuação de leads da organização ativa (IA-17).
//
// O portal envia a organização ativa; ela é validada contra o usuário do JWT
// (`exigirModulo`) e filtra patrocinadores, oportunidades, propriedades,
// histórico de propostas e as pontuações gravadas. Antes, a função lia tudo
// o que o RLS deixava ver — para quem está em várias organizações, misturava
// leads de clientes diferentes no mesmo prompt e gravava as notas na
// organização errada (gatilho com get_user_org).
//
// O resultado só vale gravado em `lead_scores`: por isso exige escrita no
// CRM antes de gastar a chamada (o RLS recusaria a gravação de qualquer jeito).

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

const FUNCIONALIDADE = "score-leads";

/** Linha do PostgREST (as funções não têm os tipos gerados do banco). */
type Linha = Record<string, unknown>;

type TipoDeAlvo = "sponsor" | "opportunity";
const CLASSIFICACOES = ["quente", "morno", "frio"] as const;
type Classificacao = typeof CLASSIFICACOES[number];

interface Pontuacao {
  target_type: TipoDeAlvo;
  target_id: string;
  score: number;
  classification: Classificacao;
  fit_segment: number | null;
  fit_audience: number | null;
  fit_history: number | null;
  reasons: string[];
  approach_argument: string | null;
}

const ESQUEMA: EsquemaJson = {
  type: "object",
  properties: {
    scored: {
      type: "array",
      items: {
        type: "object",
        properties: {
          target_type: { type: "string", enum: ["sponsor", "opportunity"] },
          target_id: { type: "string" },
          score: { type: "number" },
          classification: { type: "string", enum: [...CLASSIFICACOES] },
          fit_segment: { type: "number" },
          fit_audience: { type: "number" },
          fit_history: { type: "number" },
          reasons: { type: "array", items: { type: "string" } },
          approach_argument: { type: "string" },
        },
        required: ["target_type", "target_id", "score", "classification", "reasons", "approach_argument"],
      },
    },
  },
  required: ["scored"],
};

const SISTEMA = `Você é um especialista em prospecção de patrocínio esportivo no Brasil. Avalie cada lead e atribua nota de 0 a 100 baseada em:
- Fit de SEGMENTO: aderência da categoria do patrocinador com o público da propriedade (ex: bebidas, fintech, telco, varejo, automotivo, ESG-friendly)
- Fit de AUDIÊNCIA: tamanho/perfil da audiência vs orçamento típico do segmento
- HISTÓRICO: propostas anteriores aceitas (positivo), recusadas (negativo), engajamento recente
Para cada lead retorne: target_type e target_id exatamente como recebidos, score (0-100), classificação (quente >=70, morno 40-69, frio <40), 3 razões curtas, e um argumento de abordagem personalizado de 2-3 frases mencionando ângulo concreto (ex: "ESG via Kids League", "share-of-voice em jogos do estadual").`;

const nota = (valor: unknown): number | null => {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
};

const classificar = (score: number): Classificacao => (score >= 70 ? "quente" : score >= 40 ? "morno" : "frio");

/** Só aceita alvos que estavam no prompt: id inventado pela IA não vira linha. */
function pontuacoesValidas(bruto: unknown, alvos: Map<string, TipoDeAlvo>): Pontuacao[] {
  const vistos = new Set<string>();
  const saida: Pontuacao[] = [];
  for (const item of Array.isArray(bruto) ? bruto as Linha[] : []) {
    const id = typeof item?.target_id === "string" ? item.target_id : "";
    const tipo = alvos.get(id);
    if (!tipo || vistos.has(id)) continue;
    vistos.add(id);
    const score = Math.round(nota(item.score) ?? 0);
    const classificacao = (CLASSIFICACOES as readonly unknown[]).includes(item.classification)
      ? item.classification as Classificacao
      : classificar(score);
    saida.push({
      target_type: tipo,
      target_id: id,
      score,
      classification: classificacao,
      fit_segment: nota(item.fit_segment),
      fit_audience: nota(item.fit_audience),
      fit_history: nota(item.fit_history),
      reasons: Array.isArray(item.reasons) ? item.reasons.filter((r): r is string => typeof r === "string").slice(0, 5) : [],
      approach_argument: typeof item.approach_argument === "string" ? item.approach_argument : null,
    });
  }
  return saida;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { usuario, cliente } = await autenticar(req);
    const corpo = await req.json().catch(() => ({}));
    const org = organizacaoDoCorpo(corpo);
    const propertyId = corpo?.property_id ? uuidDoCorpo(corpo, "property_id") : null;
    await exigirModulo(cliente, usuario.id, org, "crm", true);

    let propriedade: Linha | null = null;
    if (propertyId) {
      const { data } = await cliente
        .from("sports_properties")
        .select("id,name,category,description,audience_estimate,public_about,public_headline")
        .eq("id", propertyId)
        .eq("organization_id", org)
        .maybeSingle();
      if (!data) throw new ErroDaRequisicao(404, "Propriedade não encontrada");
      propriedade = data;
    }

    const [sponsorsR, oppsR, propsR] = await Promise.all([
      cliente.from("sponsors").select("id,name,segment,score,tags,notes,last_contact_at").eq("organization_id", org).limit(100),
      cliente
        .from("opportunities")
        .select("id,brand,value,stage,sponsor_id,property_id,notes")
        .eq("organization_id", org)
        .in("stage", ["prospect", "reuniao"])
        .limit(100),
      propriedade
        ? Promise.resolve({ data: [] })
        : cliente.from("sports_properties").select("id,name,category,audience_estimate").eq("organization_id", org).limit(20),
    ]);
    const sponsors: Linha[] = sponsorsR.data ?? [];
    const opps: Linha[] = oppsR.data ?? [];
    const propriedades: Linha[] = propsR.data ?? [];

    const sponsorIds = sponsors.map((s) => s.id);
    const { data: historico } = sponsorIds.length
      ? await cliente.from("proposals").select("sponsor_id,status").in("sponsor_id", sponsorIds).eq("organization_id", org)
      : { data: [] };

    const historicoPorSponsor: Record<string, { sent: number; accepted: number; refused: number }> = {};
    for (const h of (historico ?? []) as Linha[]) {
      if (typeof h.sponsor_id !== "string") continue;
      const contagem = historicoPorSponsor[h.sponsor_id] ??= { sent: 0, accepted: 0, refused: 0 };
      if (h.status === "enviada") contagem.sent++;
      if (h.status === "aceita") contagem.accepted++;
      if (h.status === "recusada") contagem.refused++;
    }

    const alvosDoPrompt = [
      ...sponsors.map((s) => ({
        target_type: "sponsor" as const,
        target_id: s.id,
        name: s.name,
        segment: s.segment,
        current_score: s.score,
        tags: s.tags,
        notes: s.notes,
        history: historicoPorSponsor[String(s.id)] ?? { sent: 0, accepted: 0, refused: 0 },
      })),
      ...opps.map((o) => ({
        target_type: "opportunity" as const,
        target_id: o.id,
        name: o.brand,
        stage: o.stage,
        value: Number(o.value),
        notes: o.notes,
      })),
    ];
    if (alvosDoPrompt.length === 0) return json({ scored: [], count: 0, saved: true });

    const alvos = new Map(alvosDoPrompt.map((a) => [String(a.target_id), a.target_type]));

    const contextoDaPropriedade = propriedade
      ? `Propriedade-foco: ${propriedade.name} (${propriedade.category}). Público: ${propriedade.audience_estimate ?? "n/d"}. ${propriedade.public_about ?? propriedade.description ?? ""}`
      : `Propriedades disponíveis: ${propriedades.map((p) => `${p.name} (${p.category}, audiência ${p.audience_estimate ?? "n/d"})`).join("; ")}`;

    const resposta = await gerar({ organizacaoId: org, usuarioId: usuario.id }, {
      funcionalidade: FUNCIONALIDADE,
      nivel: "rapido",
      sistema: SISTEMA,
      mensagens: [{
        papel: "usuario",
        conteudo: `${contextoDaPropriedade}\n\nLeads a avaliar (JSON):\n${JSON.stringify(alvosDoPrompt, null, 2)}`,
      }],
      json: { nome: "pontuacao_de_leads", esquema: ESQUEMA },
      // Até 200 leads com razões e argumento: o limite antigo (4.096) cortava a saída.
      maxTokens: 16_000,
    }, dependenciasDaCamada());

    const scored = pontuacoesValidas(resposta.json?.scored, alvos);
    if (scored.length === 0) return json({ scored, count: 0, saved: true });

    // Substitui a nota anterior do mesmo usuário para os mesmos alvos e escopo.
    let apagar = cliente
      .from("lead_scores")
      .delete()
      .eq("organization_id", org)
      .eq("owner_id", usuario.id)
      .in("target_id", scored.map((s) => s.target_id));
    apagar = propertyId ? apagar.eq("property_id", propertyId) : apagar.is("property_id", null);
    const { error: erroApagar } = await apagar;

    const { error: erroGravar } = erroApagar ? { error: erroApagar } : await cliente.from("lead_scores").insert(
      scored.map((s) => ({ ...s, organization_id: org, owner_id: usuario.id, property_id: propertyId, model: resposta.modelo })),
    );
    if (erroGravar) console.error(`${FUNCIONALIDADE}: notas não gravadas (${erroGravar.code ?? "?"})`);

    return json({ scored, count: scored.length, saved: !erroGravar });
  } catch (e) {
    return respostaDeFalha(e, FUNCIONALIDADE);
  }
});
