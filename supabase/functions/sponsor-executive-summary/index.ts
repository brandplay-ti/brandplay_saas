// Resumo executivo de um patrocinador (IA-14). A organização é a do
// patrocinador, lido sob RLS; todas as consultas e o cache ficam nela.

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

const FUNCIONALIDADE = "sponsor-executive-summary";
const VALIDADE_DO_CACHE_MS = 24 * 3600 * 1000;

interface Valor {
  total_value?: number | string | null;
  amount?: number | string | null;
}

const numero = (v: number | string | null | undefined) => Number(v || 0);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { usuario, cliente } = await autenticar(req);
    const corpo = await req.json().catch(() => ({}));
    const sponsorId = uuidDoCorpo(corpo, "sponsor_id");
    const force = corpo?.force === true;

    const { data: sponsor } = await cliente
      .from("sponsors")
      .select("id,organization_id,name,segment,score,last_contact_at")
      .eq("id", sponsorId)
      .maybeSingle();
    if (!sponsor?.organization_id) throw new ErroDaRequisicao(404, "Patrocinador não encontrado");
    const org: string = sponsor.organization_id;
    await exigirModulo(cliente, usuario.id, org, "crm");

    if (!force) {
      const { data: cached } = await cliente
        .from("sponsor_executive_summaries")
        .select("summary,highlights,generated_at")
        .eq("sponsor_id", sponsorId)
        .eq("organization_id", org)
        .maybeSingle();
      if (cached && Date.now() - new Date(cached.generated_at).getTime() < VALIDADE_DO_CACHE_MS) {
        return json({ summary: cached.summary, highlights: cached.highlights, generated_at: cached.generated_at, cached: true });
      }
    }

    const [contratosR, oportunidadesR, interacoesR, entregasR] = await Promise.all([
      cliente.from("contracts").select("id,total_value").eq("sponsor_id", sponsorId).eq("organization_id", org),
      cliente.from("opportunities").select("stage").eq("sponsor_id", sponsorId).eq("organization_id", org),
      cliente.from("sponsor_interactions").select("title,occurred_at").eq("sponsor_id", sponsorId).eq("organization_id", org)
        .order("occurred_at", { ascending: false }).limit(8),
      // Entregas são ligadas ao patrocinador pelo nome da marca — só nesta organização.
      cliente.from("deliveries").select("status").eq("brand", sponsor.name).eq("organization_id", org),
    ]);

    const contratos: (Valor & { id: string })[] = contratosR.data ?? [];
    const contractIds = contratos.map((c) => c.id);
    const parcelas: (Valor & { status: string })[] = contractIds.length
      ? (await cliente.from("installments").select("amount,status").in("contract_id", contractIds).eq("organization_id", org)).data ?? []
      : [];
    const entregas: { status: string }[] = entregasR.data ?? [];

    const totalContratado = contratos.reduce((s, c) => s + numero(c.total_value), 0);
    const totalPago = parcelas.filter((i) => i.status === "pago").reduce((s, i) => s + numero(i.amount), 0);
    const atrasadas = parcelas.filter((i) => i.status === "atrasado").length;
    const entregues = entregas.filter((d) => d.status === "entregue" || d.status === "aprovada").length;
    const pendentes = entregas.filter((d) => d.status === "pendente" || d.status === "em_producao").length;

    const ctx = {
      patrocinador: sponsor.name,
      segmento: sponsor.segment,
      score: sponsor.score,
      ultimo_contato: sponsor.last_contact_at,
      contratos: contratos.length,
      valor_total_contratado: totalContratado,
      valor_pago: totalPago,
      parcelas_atrasadas: atrasadas,
      entregas_realizadas: entregues,
      entregas_pendentes: pendentes,
      oportunidades_ativas: (oportunidadesR.data ?? []).filter((o: { stage: string }) => o.stage !== "fechado" && o.stage !== "perdido").length,
      ultimas_interacoes: (interacoesR.data ?? []).map((i: { title: string; occurred_at: string | null }) =>
        `${i.occurred_at?.slice(0, 10)}: ${i.title}`
      ),
    };

    const resposta = await gerar({ organizacaoId: org, usuarioId: usuario.id }, {
      funcionalidade: FUNCIONALIDADE,
      nivel: "padrao",
      sistema: "Responda apenas com o parágrafo executivo, sem títulos ou markdown.",
      mensagens: [{
        papel: "usuario",
        conteudo:
          `Você é um analista de patrocínios esportivos. Gere um resumo executivo conciso (máx 4 linhas, em português brasileiro) sobre a relação com este patrocinador, destacando saúde do relacionamento, situação financeira e próximos passos. Use linguagem direta de C-level.\n\nDados:\n${JSON.stringify(ctx, null, 2)}`,
      }],
      maxTokens: 1024,
    }, dependenciasDaCamada());

    const summary = resposta.texto.trim();
    const highlights = [
      { label: "Contratado", value: `R$ ${totalContratado.toLocaleString("pt-BR")}` },
      { label: "Pago", value: `R$ ${totalPago.toLocaleString("pt-BR")}` },
      { label: "Entregas OK", value: `${entregues}/${entregas.length}` },
      { label: "Atrasos", value: `${atrasadas}` },
    ];
    const generatedAt = new Date().toISOString();

    // O cache é auxiliar: se não gravar, o resumo volta mesmo assim.
    const { error: erroDoCache } = await cliente.from("sponsor_executive_summaries").upsert({
      sponsor_id: sponsorId,
      organization_id: org,
      owner_id: usuario.id,
      summary,
      highlights,
      model: resposta.modelo,
      generated_at: generatedAt,
    });
    if (erroDoCache) console.error(`${FUNCIONALIDADE}: cache não gravado (${erroDoCache.code ?? "?"})`);

    return json({ summary, highlights, generated_at: generatedAt, cached: false });
  } catch (e) {
    return respostaDeFalha(e, FUNCIONALIDADE);
  }
});
