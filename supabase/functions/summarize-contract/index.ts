// Resumo de contrato e perguntas sobre ele (IA-19). A organização é a do
// contrato, lido sob RLS; cláusulas e ativos ficam nela.

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
import { ErroDeIA } from "../_shared/ai/erros.ts";

const FUNCIONALIDADE = "summarize-contract";

/** Linha do PostgREST (as funções não têm os tipos gerados do banco). */
type Linha = Record<string, unknown>;

const SISTEMA_RESUMO = `Você é um analista jurídico-comercial. Resuma contratos de patrocínio em português do Brasil de forma estruturada e objetiva.
Use markdown com as seções:
## Partes
## Objeto
## Valor e pagamento
## Vigência e prazos
## Obrigações principais
## Multas e rescisão
## Pontos de atenção

Seja conciso, factual e destaque cláusulas atípicas ou riscos.`;

const SISTEMA_PERGUNTA = `Você é um assistente que responde perguntas sobre o contrato fornecido. Responda em português do Brasil, citando trechos quando útil. Se não houver informação no contrato, diga claramente.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { usuario, cliente } = await autenticar(req);
    const corpo = await req.json().catch(() => ({}));
    const contractId = uuidDoCorpo(corpo, "contract_id");
    const modo = corpo?.mode === "chat" ? "chat" : "summarize";
    const pergunta = typeof corpo?.question === "string" ? corpo.question.trim().slice(0, 2000) : "";
    if (modo === "chat" && !pergunta) throw new ErroDaRequisicao(400, "question é obrigatório");

    const { data: contrato } = await cliente
      .from("contracts")
      .select("id, organization_id, title, brand, total_value, start_date, end_date, signatories, notes, ai_summary")
      .eq("id", contractId)
      .maybeSingle();
    if (!contrato?.organization_id) throw new ErroDaRequisicao(404, "Contrato não encontrado");
    const org: string = contrato.organization_id;
    await exigirModulo(cliente, usuario.id, org, "crm");

    // Contexto em texto: campos estruturados, ativos e cláusulas (sem ler o arquivo binário).
    const [{ data: clausulas }, { data: ativos }] = await Promise.all([
      cliente.from("contract_clauses").select("title, content, position").eq("contract_id", contractId).eq("organization_id", org).order("position"),
      cliente.from("contract_assets").select("name, quantity, unit_value, notes").eq("contract_id", contractId).eq("organization_id", org),
    ]);

    const partes: string[] = [`Título: ${contrato.title}`, `Marca: ${contrato.brand}`];
    if (contrato.total_value) partes.push(`Valor total: R$ ${contrato.total_value}`);
    if (contrato.start_date || contrato.end_date) partes.push(`Vigência: ${contrato.start_date ?? "?"} → ${contrato.end_date ?? "?"}`);
    if (contrato.signatories) partes.push(`Signatários: ${contrato.signatories}`);
    if (contrato.notes) partes.push(`Notas: ${contrato.notes}`);
    if (ativos?.length) {
      partes.push(`Ativos:\n${(ativos as Linha[]).map((a) => `- ${a.name} x${a.quantity} (R$ ${a.unit_value})${a.notes ? ` — ${a.notes}` : ""}`).join("\n")}`);
    }
    if (clausulas?.length) {
      partes.push(`Cláusulas:\n${(clausulas as Linha[]).map((c) => `### ${c.title}\n${c.content ?? ""}`).join("\n\n")}`);
    }
    const contexto = partes.join("\n");

    const resposta = await gerar({ organizacaoId: org, usuarioId: usuario.id }, {
      funcionalidade: FUNCIONALIDADE,
      nivel: "padrao",
      sistema: modo === "chat" ? SISTEMA_PERGUNTA : SISTEMA_RESUMO,
      mensagens: [{
        papel: "usuario",
        conteudo: modo === "chat"
          ? `CONTRATO:\n${contexto}\n\nRESUMO PRÉVIO:\n${contrato.ai_summary ?? "(sem resumo)"}\n\nPERGUNTA: ${pergunta}`
          : `Resuma este contrato:\n\n${contexto}`,
      }],
      maxTokens: 4096,
    }, dependenciasDaCamada());
    const texto = resposta.texto.trim();

    if (modo === "chat") return json({ answer: texto });

    // Resposta vazia não apaga o resumo que já existe.
    if (!texto) throw new ErroDeIA("resposta_invalida", `${resposta.fornecedor}/${resposta.modelo}: resumo vazio`);
    // Quem só lê contratos tem o UPDATE filtrado pelo RLS (zero linhas, sem erro).
    const { data: gravado, error } = await cliente
      .from("contracts")
      .update({ ai_summary: texto })
      .eq("id", contractId)
      .eq("organization_id", org)
      .select("id");
    const saved = !error && (gravado?.length ?? 0) > 0;
    if (!saved) console.error(`${FUNCIONALIDADE}: resumo não gravado (${error?.code ?? "sem permissão"})`);

    return json({ summary: texto, saved });
  } catch (e) {
    return respostaDeFalha(e, FUNCIONALIDADE);
  }
});
