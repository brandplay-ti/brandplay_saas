// Proposta multicanal do assistente de propostas (IA-18): conceito,
// ativações, itens, deck, WhatsApp e e-mail.
//
// Como no rascunho simples, a proposta nasce na organização ativa: ela vem
// do portal e é validada contra o usuário do JWT. Patrocinador e propriedade
// escolhidos precisam ser dela (senão 404), e os ativos do contexto também.

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

const FUNCIONALIDADE = "generate-proposal-wizard";

/** Linha do PostgREST (as funções não têm os tipos gerados do banco). */
type Linha = Record<string, unknown>;

const SISTEMA = `Você é especialista do método Scout em propriedades esportivas. Crie uma proposta de patrocínio completa e estruturada.
Padrão Scout: conceito inspirador (1 frase + storytelling curto), ativações concretas e mensuráveis, entregas formatadas como itens contratáveis.
Sempre escreva em português brasileiro, tom profissional e direto.

Responda com:
1. concept: conceito de marca de 2-4 parágrafos com storytelling
2. activations: array de 4-7 ativações táticas (título + descrição curta)
3. items: array de entregas estruturadas (name, description, quantity, unit_value) — usando os ativos disponíveis quando fizer sentido
4. deck: estrutura de slides como markdown (8-12 slides com título e bullets)
5. whatsapp: mensagem curta de 3-5 linhas com gancho + valor + CTA, máx 600 caracteres
6. email: { subject, body_html } — assunto curto + corpo HTML com saudação, conceito resumido, top 3 ativações, próximos passos, assinatura
7. title: título da proposta (curto, comercial)
8. summary_message: mensagem comercial de 2-3 parágrafos para o campo "mensagem" da proposta`;

const ESQUEMA: EsquemaJson = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary_message: { type: "string" },
    concept: { type: "string" },
    activations: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, description: { type: "string" } },
        required: ["title", "description"],
      },
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          quantity: { type: "number" },
          unit_value: { type: "number" },
        },
        required: ["name", "quantity", "unit_value"],
      },
    },
    deck: { type: "string", description: "Markdown com a estrutura dos slides" },
    whatsapp: { type: "string" },
    email: {
      type: "object",
      properties: { subject: { type: "string" }, body_html: { type: "string" } },
      required: ["subject", "body_html"],
    },
  },
  required: ["title", "summary_message", "concept", "activations", "items", "deck", "whatsapp", "email"],
};

const texto = (valor: unknown, max = 20_000) => (typeof valor === "string" ? valor.slice(0, max) : "");
const lista = (valor: unknown): Linha[] => (Array.isArray(valor) ? valor.filter((v) => v && typeof v === "object") : []);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { usuario, cliente } = await autenticar(req);
    const corpo = await req.json().catch(() => ({}));
    const org = organizacaoDoCorpo(corpo);
    const brand = texto(corpo?.brand, 200).trim();
    const objective = texto(corpo?.objective, 200).trim();
    const budget = Number(corpo?.budget) > 0 ? Number(corpo.budget) : null;
    const extra = texto(corpo?.extra_context, 4000).trim();
    const sponsorId = corpo?.sponsor_id ? uuidDoCorpo(corpo, "sponsor_id") : null;
    const propertyId = corpo?.property_id ? uuidDoCorpo(corpo, "property_id") : null;
    if (!brand || !objective) throw new ErroDaRequisicao(400, "brand e objective são obrigatórios");
    await exigirModulo(cliente, usuario.id, org, "crm");

    let propriedade: Linha | null = null;
    let ativos: Linha[] = [];
    if (propertyId) {
      const [{ data: p }, { data: alocacoes }] = await Promise.all([
        cliente
          .from("sports_properties")
          .select("name,category,description,public_about,audience_estimate")
          .eq("id", propertyId)
          .eq("organization_id", org)
          .maybeSingle(),
        cliente
          .from("asset_allocations")
          .select("asset:assets(id,name,category,unit_value,organization_id)")
          .eq("property_id", propertyId)
          .eq("organization_id", org),
      ]);
      if (!p) throw new ErroDaRequisicao(404, "Propriedade não encontrada");
      propriedade = p;
      ativos = (alocacoes ?? [])
        .map((a: Linha) => a.asset as Linha | null)
        .filter((a: Linha | null): a is Linha => a?.organization_id === org);
    }
    if (ativos.length === 0) {
      const { data } = await cliente.from("assets").select("id,name,category,unit_value").eq("organization_id", org).limit(40);
      ativos = data ?? [];
    }

    let patrocinador: Linha | null = null;
    if (sponsorId) {
      const { data } = await cliente
        .from("sponsors")
        .select("name,segment,tags,notes")
        .eq("id", sponsorId)
        .eq("organization_id", org)
        .maybeSingle();
      if (!data) throw new ErroDaRequisicao(404, "Patrocinador não encontrado");
      patrocinador = data;
    }

    const tags = Array.isArray(patrocinador?.tags) ? patrocinador.tags.join(", ") : "";
    const pedidoDoUsuario = `MARCA: ${brand}
OBJETIVO: ${objective}${budget ? `\nORÇAMENTO ALVO: R$ ${budget.toLocaleString("pt-BR")}` : ""}

${propriedade ? `PROPRIEDADE: ${propriedade.name} (${propriedade.category})
Sobre: ${propriedade.public_about ?? propriedade.description ?? "—"}
Público estimado: ${propriedade.audience_estimate ?? "n/d"}` : "Sem propriedade específica selecionada."}

${patrocinador ? `PATROCINADOR: ${patrocinador.name} | Segmento: ${patrocinador.segment ?? "n/d"} | Tags: ${tags}
Notas: ${patrocinador.notes ?? "—"}` : ""}

ATIVOS DISPONÍVEIS: ${ativos.map((a) => `${a.name} (${a.category}, R$ ${Number(a.unit_value).toLocaleString("pt-BR")})`).join("; ") || "nenhum cadastrado"}

${extra ? `CONTEXTO ADICIONAL: ${extra}` : ""}`;

    const resposta = await gerar({ organizacaoId: org, usuarioId: usuario.id }, {
      funcionalidade: FUNCIONALIDADE,
      nivel: "padrao",
      sistema: SISTEMA,
      mensagens: [{ papel: "usuario", conteudo: pedidoDoUsuario }],
      json: { nome: "proposta_multicanal", esquema: ESQUEMA },
      maxTokens: 8192,
    }, dependenciasDaCamada());
    const p = resposta.json ?? {};
    const email = (p.email && typeof p.email === "object" ? p.email : {}) as Linha;

    // A tela soma os itens e mostra cada campo: tudo volta no tipo esperado.
    return json({
      title: texto(p.title, 200),
      summary_message: texto(p.summary_message),
      concept: texto(p.concept),
      activations: lista(p.activations).map((a) => ({ title: texto(a.title, 300), description: texto(a.description, 2000) })),
      items: lista(p.items)
        .filter((i) => typeof i.name === "string" && i.name.trim())
        .map((i) => ({
          name: texto(i.name, 200),
          description: typeof i.description === "string" ? i.description : undefined,
          quantity: Math.max(1, Math.round(Number(i.quantity) || 1)),
          unit_value: Math.max(0, Number(i.unit_value) || 0),
        })),
      deck: texto(p.deck),
      whatsapp: texto(p.whatsapp, 2000),
      email: { subject: texto(email.subject, 300), body_html: texto(email.body_html) },
    });
  } catch (e) {
    return respostaDeFalha(e, FUNCIONALIDADE);
  }
});
