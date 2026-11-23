// Sugestão de valor para as ativações de uma proposta (BP-9).
//
// Opcional: o valor da ativação é manual por padrão, e o portal só chama esta
// função quando o usuário pede. A base é a da própria organização — projetos,
// propostas enviadas e aceitas e o catálogo de ativos —, nunca preço de
// mercado; o portal mostra isso ao usuário e exige que ele confirme cada valor.
//
// Mesmo começo das outras funções de IA: usuário do JWT, organização ativa
// validada por `exigirModulo` (vendas) e toda leitura com o client do usuário,
// sob RLS e filtrada pela organização. Proposta e projeto informados precisam
// ser dela (senão 404).

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
import { logContexto } from "../_shared/observabilidade.ts";
import {
  type ContextoDaEstimativa,
  ESQUEMA,
  LIMITE_ATIVOS,
  LIMITE_ITENS,
  LIMITE_PROJETOS,
  LIMITE_PROPOSTAS,
  lerAtivacoesDoCorpo,
  lerAtivo,
  lerItens,
  lerProjeto,
  lerProposta,
  MAX_ATIVACOES,
  montarPedido,
  normalizarSugestoes,
  semBase,
  SISTEMA,
  temBase,
} from "./contexto.ts";

const FUNCIONALIDADE = "estimate-activation-values";
/** Rascunho ainda não foi negociado; recusada puxaria a referência para um valor que não fechou. */
const STATUS_DE_REFERENCIA = ["enviada", "aceita"];

/** Linha do PostgREST (as funções não têm os tipos gerados do banco). */
type Linha = Record<string, unknown>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { usuario, cliente } = await autenticar(req);
    const corpo = await req.json().catch(() => ({}));
    const org = organizacaoDoCorpo(corpo);
    await exigirModulo(cliente, usuario.id, org, "vendas");
    logContexto(req, { user_id: usuario.id, organization_id: org, code: "estimar_ativacoes" });

    const ativacoes = lerAtivacoesDoCorpo(corpo?.activations);
    if (!ativacoes) throw new ErroDaRequisicao(400, `Envie de 1 a ${MAX_ATIVACOES} ativações com título ou descrição`);
    const proposalId = corpo?.proposal_id ? uuidDoCorpo(corpo, "proposal_id") : null;
    let propertyId = corpo?.property_id ? uuidDoCorpo(corpo, "property_id") : null;

    // Itens da proposta atual: do banco quando ela existe; na proposta que o
    // assistente ainda não gravou, os do corpo (só texto de contexto).
    let itensDaProposta = lerItens(corpo?.items);
    if (proposalId) {
      const [{ data: proposta }, { data: itens }] = await Promise.all([
        cliente.from("proposals").select("id,property_id").eq("id", proposalId).eq("organization_id", org).maybeSingle(),
        cliente
          .from("proposal_items")
          .select("name,description,quantity,unit_value")
          .eq("proposal_id", proposalId)
          .eq("organization_id", org)
          .order("position")
          .limit(LIMITE_ITENS),
      ]);
      if (!proposta) throw new ErroDaRequisicao(404, "Proposta não encontrada");
      propertyId = (proposta.property_id as string | null) ?? propertyId;
      itensDaProposta = lerItens(itens);
    }

    let consultaPropostas = cliente
      .from("proposals")
      .select("id,title,status,total_value,use_flat_value,property_id,proposal_items(name,description,quantity,unit_value)")
      .eq("organization_id", org)
      .in("status", STATUS_DE_REFERENCIA)
      .order("created_at", { ascending: false })
      .limit(LIMITE_PROPOSTAS);
    if (proposalId) consultaPropostas = consultaPropostas.neq("id", proposalId);

    const [projetoAtual, projetos, propostas, ativos] = await Promise.all([
      propertyId
        ? cliente.from("sports_properties").select("id,name,category,audience_estimate").eq("id", propertyId).eq("organization_id", org).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      cliente.from("sports_properties").select("id,name,category,audience_estimate").eq("organization_id", org).order("name").limit(LIMITE_PROJETOS),
      consultaPropostas,
      cliente.from("assets").select("name,category,unit_value").eq("organization_id", org).order("name").limit(LIMITE_ATIVOS),
    ]);
    const falha = projetoAtual.error ?? projetos.error ?? propostas.error ?? ativos.error;
    if (falha) throw new Error(`leitura da base falhou: ${falha.code ?? "?"}`);
    if (propertyId && !projetoAtual.data) throw new ErroDaRequisicao(404, "Projeto não encontrado");

    const linhasDeProjeto = (projetos.data ?? []) as Linha[];
    const nomes = new Map(linhasDeProjeto.map((p) => [p.id, typeof p.name === "string" ? p.name : null]));
    if (projetoAtual.data) nomes.set(projetoAtual.data.id, projetoAtual.data.name as string);

    const contexto: ContextoDaEstimativa = {
      ativacoes,
      itensDaProposta,
      projetoAtual: projetoAtual.data ? lerProjeto(projetoAtual.data as Linha) : null,
      projetos: linhasDeProjeto.filter((p) => p.id !== propertyId).map(lerProjeto),
      propostas: ((propostas.data ?? []) as Linha[]).map((p) => lerProposta(p, (id) => nomes.get(id) ?? null)),
      ativos: ((ativos.data ?? []) as Linha[]).map(lerAtivo),
    };

    if (!temBase(contexto)) {
      return json({ suggestions: semBase(ativacoes.length), modelo: null, sem_base: true });
    }

    const resposta = await gerar({ organizacaoId: org, usuarioId: usuario.id }, {
      funcionalidade: FUNCIONALIDADE,
      nivel: "padrao",
      sistema: SISTEMA,
      mensagens: [{ papel: "usuario", conteudo: montarPedido(contexto) }],
      json: { nome: "valores_das_ativacoes", esquema: ESQUEMA },
      maxTokens: 4096,
    }, dependenciasDaCamada());

    return json({
      suggestions: normalizarSugestoes(resposta.json ?? {}, ativacoes.length, itensDaProposta.map((i) => i.name)),
      modelo: `${resposta.fornecedor}/${resposta.modelo}`,
      sem_base: false,
    });
  } catch (e) {
    return respostaDeFalha(e, FUNCIONALIDADE);
  }
});
