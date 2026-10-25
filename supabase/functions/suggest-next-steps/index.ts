// Próximos passos sugeridos pela IA em seis contextos (IA-19):
// opportunity | sponsor | contract | proposal | delivery | dashboard.
//
// Contexto de um registro: a organização é a dele, lido sob RLS. Contexto
// de lista (painel do dia, entregas sem `target_id`): a organização ativa
// enviada pelo portal. Nos dois casos ela passa por `exigirModulo` e filtra
// todas as consultas — antes, o painel e as entregas varriam todas as
// organizações do usuário.

import { gerar } from "../_shared/ai/camada.ts";
import {
  autenticar,
  CORS,
  dependenciasDaCamada,
  ErroDaRequisicao,
  exigirModulo,
  json,
  type Modulo,
  organizacaoDoCorpo,
  type Requisicao,
  respostaDeFalha,
  uuidDoCorpo,
} from "../_shared/ai/funcao.ts";
import type { EsquemaJson } from "../_shared/ai/tipos.ts";

const FUNCIONALIDADE = "suggest-next-steps";

/** Linha do PostgREST (as funções não têm os tipos gerados do banco). */
type Linha = Record<string, unknown>;

const SISTEMA = `Você é um coach comercial sênior em patrocínio esportivo. Receba um contexto e sugira 3 a 5 próximos passos PRÁTICOS, específicos e acionáveis em português do Brasil.
Cada passo:
- title: ação curta no imperativo (máx 60 chars)
- description: 1-2 frases sobre por que e como
- activity_type: um de "ligacao" | "email" | "reuniao" | "tarefa" | "nota"
- priority: "alta" | "media" | "baixa"
- due_in_days: int 0-30`;

const TIPOS = ["ligacao", "email", "reuniao", "tarefa", "nota"] as const;
const PRIORIDADES = ["alta", "media", "baixa"] as const;

const ESQUEMA: EsquemaJson = {
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          activity_type: { type: "string", enum: [...TIPOS] },
          priority: { type: "string", enum: [...PRIORIDADES] },
          due_in_days: { type: "integer", minimum: 0, maximum: 30 },
        },
        required: ["title", "description", "activity_type", "priority", "due_in_days"],
        additionalProperties: false,
      },
    },
  },
  required: ["steps"],
  additionalProperties: false,
};

const CONTEXTOS = ["opportunity", "sponsor", "contract", "dashboard", "delivery", "proposal"] as const;
type Contexto = typeof CONTEXTOS[number];

const hojeISO = () => new Date().toISOString().slice(0, 10);
const diasDesde = (d: unknown) =>
  typeof d === "string" && d ? Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000) : null;
const linhas = (r: { data: unknown }): Linha[] => (Array.isArray(r.data) ? r.data : []);

/** Lê o registro de contexto sob RLS e devolve a organização dele, já validada. */
async function registro(
  { usuario, cliente }: Requisicao,
  tabela: string,
  colunas: string,
  id: string,
  modulo: Modulo,
  naoEncontrado: string,
): Promise<{ linha: Linha; org: string }> {
  const selecao: string = `organization_id, ${colunas}`;
  const { data } = await cliente.from(tabela).select(selecao).eq("id", id).maybeSingle<Linha>();
  const org = typeof data?.organization_id === "string" ? data.organization_id : null;
  if (!data || !org) throw new ErroDaRequisicao(404, naoEncontrado);
  await exigirModulo(cliente, usuario.id, org, modulo);
  return { linha: data, org };
}

async function contextoDaOportunidade(r: Requisicao, id: string) {
  const { linha: opp, org } = await registro(
    r,
    "opportunities",
    "id, brand, value, stage, expected_close_date, last_stage_change_at, notes, sponsor_id, property_id",
    id,
    "crm",
    "Oportunidade não encontrada",
  );
  const c = r.cliente;
  const [sponsorR, propertyR, activitiesR] = await Promise.all([
    opp.sponsor_id
      ? c.from("sponsors").select("name, segment, score, last_contact_at").eq("id", opp.sponsor_id).eq("organization_id", org).maybeSingle()
      : Promise.resolve({ data: null }),
    opp.property_id
      ? c.from("sports_properties").select("name, category").eq("id", opp.property_id).eq("organization_id", org).maybeSingle()
      : Promise.resolve({ data: null }),
    c.from("opportunity_activities")
      .select("activity_type, title, status, due_date, completed_at, created_at")
      .eq("opportunity_id", id)
      .eq("organization_id", org)
      .order("created_at", { ascending: false }).limit(10),
  ]);
  const sponsor = sponsorR.data as Linha | null;
  const property = propertyR.data as Linha | null;
  const activities = linhas(activitiesR);

  const texto = [
    `CONTEXTO: Oportunidade comercial`,
    `Marca: ${opp.brand} | Estágio: ${opp.stage} (há ${diasDesde(opp.last_stage_change_at) ?? 0} dias) | Valor: R$ ${opp.value}`,
    opp.expected_close_date ? `Fechamento esperado: ${opp.expected_close_date}` : null,
    opp.notes ? `Notas: ${opp.notes}` : null,
    sponsor ? `Patrocinador: ${sponsor.name}${sponsor.segment ? ` (${sponsor.segment})` : ""} | Score: ${sponsor.score}${sponsor.last_contact_at ? ` | Último contato: ${sponsor.last_contact_at}` : ""}` : null,
    property ? `Propriedade: ${property.name} (${property.category})` : null,
    activities.length
      ? `Atividades recentes:\n${activities.map((a) => `- [${a.status}] ${a.activity_type}: ${a.title}${a.due_date ? ` (vence ${a.due_date})` : ""}`).join("\n")}`
      : `Nenhuma atividade registrada.`,
  ].filter(Boolean).join("\n");
  return { org, texto };
}

async function contextoDoPatrocinador(r: Requisicao, id: string) {
  const { linha: sp, org } = await registro(
    r,
    "sponsors",
    "id, name, segment, score, tags, last_contact_at, notes",
    id,
    "crm",
    "Patrocinador não encontrado",
  );
  const c = r.cliente;
  const [contractsR, oppsR, contactsR] = await Promise.all([
    c.from("contracts")
      .select("title, status, total_value, end_date").eq("sponsor_id", id).eq("organization_id", org)
      .order("created_at", { ascending: false }).limit(5),
    c.from("opportunities")
      .select("brand, stage, value, last_stage_change_at").eq("sponsor_id", id).eq("organization_id", org)
      .order("last_stage_change_at", { ascending: false }).limit(5),
    c.from("sponsor_contacts")
      .select("name, role, is_primary").eq("sponsor_id", id).eq("organization_id", org).limit(5),
  ]);
  const contracts = linhas(contractsR);
  const opps = linhas(oppsR);
  const contacts = linhas(contactsR);
  const tags = Array.isArray(sp.tags) ? sp.tags : [];

  const texto = [
    `CONTEXTO: Reativação/relacionamento de patrocinador`,
    `Patrocinador: ${sp.name}${sp.segment ? ` (${sp.segment})` : ""} | Score: ${sp.score}`,
    sp.last_contact_at ? `Último contato: ${sp.last_contact_at} (há ${diasDesde(sp.last_contact_at)} dias)` : `Sem registro de último contato.`,
    tags.length ? `Tags: ${tags.join(", ")}` : null,
    sp.notes ? `Notas: ${sp.notes}` : null,
    contacts.length
      ? `Contatos: ${contacts.map((ct) => `${ct.name}${ct.role ? ` (${ct.role})` : ""}${ct.is_primary ? " [principal]" : ""}`).join("; ")}`
      : `Nenhum contato cadastrado.`,
    contracts.length
      ? `Contratos:\n${contracts.map((ct) => `- ${ct.title} | ${ct.status} | R$ ${ct.total_value}${ct.end_date ? ` | fim ${ct.end_date}` : ""}`).join("\n")}`
      : `Nenhum contrato registrado.`,
    opps.length
      ? `Oportunidades:\n${opps.map((o) => `- ${o.brand} | ${o.stage} | R$ ${o.value}`).join("\n")}`
      : `Nenhuma oportunidade aberta.`,
  ].filter(Boolean).join("\n");
  return { org, texto };
}

async function contextoDoContrato(r: Requisicao, id: string) {
  const { linha: ct, org } = await registro(
    r,
    "contracts",
    "id, title, brand, status, total_value, start_date, end_date, payment_method, installments, sponsor_id, notes",
    id,
    "crm",
    "Contrato não encontrado",
  );
  const c = r.cliente;
  // Entregas do contrato e, como antes, as da mesma marca (geração antiga sem contract_id).
  const [insR, delContratoR, delMarcaR, clausesR] = await Promise.all([
    c.from("installments")
      .select("installment_number, due_date, amount, status, paid_at").eq("contract_id", id).eq("organization_id", org)
      .order("due_date").limit(10),
    c.from("deliveries").select("id, title, status, due_date, approval").eq("contract_id", id).eq("organization_id", org).limit(10),
    ct.brand
      ? c.from("deliveries").select("id, title, status, due_date, approval").eq("brand", ct.brand).eq("organization_id", org).limit(10)
      : Promise.resolve({ data: [] }),
    c.from("contract_clauses").select("title").eq("contract_id", id).eq("organization_id", org).limit(10),
  ]);
  const ins = linhas(insR);
  const del = [...new Map([...linhas(delContratoR), ...linhas(delMarcaR)].map((d) => [d.id, d])).values()].slice(0, 10);
  const clauses = linhas(clausesR);

  const hoje = hojeISO();
  const overdue = ins.filter((i) => i.status === "atrasado" || (i.status === "pendente" && String(i.due_date) < hoje));
  const nextDue = ins.find((i) => i.status === "pendente" && String(i.due_date) >= hoje);
  const lateDel = del.filter((d) => d.due_date && String(d.due_date) < hoje && d.status !== "entregue" && d.status !== "aprovada");

  const texto = [
    `CONTEXTO: Gestão de ciclo de vida de contrato`,
    `Contrato: ${ct.title} | Marca: ${ct.brand} | Status: ${ct.status}`,
    `Valor: R$ ${ct.total_value} | Pagamento: ${ct.payment_method} | Parcelas: ${ct.installments}`,
    ct.start_date ? `Vigência: ${ct.start_date} → ${ct.end_date ?? "indefinido"}` : null,
    ct.end_date ? `Dias até fim: ${Math.ceil((new Date(String(ct.end_date)).getTime() - Date.now()) / 86_400_000)}` : null,
    ct.notes ? `Notas: ${ct.notes}` : null,
    overdue.length ? `Parcelas em atraso: ${overdue.length}` : `Nenhuma parcela atrasada.`,
    nextDue ? `Próxima parcela: #${nextDue.installment_number} R$ ${nextDue.amount} em ${nextDue.due_date}` : null,
    lateDel.length ? `Entregas atrasadas (${lateDel.length}):\n${lateDel.map((d) => `- ${d.title} (vencia ${d.due_date})`).join("\n")}` : `Entregas em dia.`,
    clauses.length ? `Cláusulas registradas: ${clauses.length}` : `Sem cláusulas estruturadas.`,
  ].filter(Boolean).join("\n");
  return { org, texto };
}

async function contextoDoPainel({ usuario, cliente: c }: Requisicao, org: string) {
  const uid = usuario.id;
  const hoje = hojeISO();
  const parada = new Date(); parada.setDate(parada.getDate() - 7);
  const vencendo = new Date(); vencendo.setDate(vencendo.getDate() + 30);

  const [stalledR, expiringR, pendingR, lateR, overdueR] = await Promise.all([
    c.from("opportunities")
      .select("brand, stage, value, last_stage_change_at")
      .eq("organization_id", org).eq("owner_id", uid)
      .not("stage", "in", "(fechado,perdido)")
      .lt("last_stage_change_at", parada.toISOString())
      .order("last_stage_change_at").limit(5),
    c.from("contracts")
      .select("title, brand, end_date, status")
      .eq("organization_id", org).eq("owner_id", uid).in("status", ["ativo", "vencendo"])
      .gte("end_date", hoje).lte("end_date", vencendo.toISOString().slice(0, 10))
      .order("end_date").limit(5),
    c.from("proposals")
      .select("title, brand, status, sent_at, total_value")
      .eq("organization_id", org).eq("owner_id", uid).eq("status", "enviada")
      .order("sent_at").limit(5),
    c.from("deliveries")
      .select("title, brand, due_date, status")
      .eq("organization_id", org).eq("owner_id", uid).neq("status", "entregue").neq("status", "aprovada")
      .lt("due_date", hoje).order("due_date").limit(5),
    c.from("installments")
      .select("amount, due_date, status").eq("organization_id", org).eq("owner_id", uid).eq("status", "atrasado")
      .order("due_date").limit(10),
  ]);
  const stalled = linhas(stalledR);
  const expiring = linhas(expiringR);
  const pending = linhas(pendingR);
  const late = linhas(lateR);
  const overdue = linhas(overdueR);

  return [
    `CONTEXTO: Painel de ações prioritárias do dia. Sugira passos cobrindo os itens mais urgentes abaixo.`,
    stalled.length
      ? `Oportunidades paradas há +7 dias:\n${stalled.map((o) => `- ${o.brand} (${o.stage}) parada há ${diasDesde(o.last_stage_change_at)}d, R$ ${o.value}`).join("\n")}`
      : `Sem oportunidades paradas.`,
    expiring.length
      ? `Contratos vencendo em 30d:\n${expiring.map((ct) => `- ${ct.title} (${ct.brand}) fim ${ct.end_date}`).join("\n")}`
      : `Nenhum contrato perto do fim.`,
    pending.length
      ? `Propostas enviadas sem resposta:\n${pending.map((p) => `- ${p.title}${p.brand ? ` (${p.brand})` : ""}${p.sent_at ? ` enviada ${String(p.sent_at).slice(0, 10)}` : ""} R$ ${p.total_value}`).join("\n")}`
      : `Sem propostas pendentes de resposta.`,
    late.length
      ? `Entregas atrasadas:\n${late.map((d) => `- ${d.title} (${d.brand}) vencia ${d.due_date}`).join("\n")}`
      : `Entregas em dia.`,
    overdue.length
      ? `Parcelas atrasadas: ${overdue.length} (total R$ ${overdue.reduce((s, i) => s + Number(i.amount), 0)})`
      : `Sem parcelas atrasadas.`,
  ].join("\n\n");
}

async function contextoDaEntrega(r: Requisicao, id: string) {
  const { linha: d, org } = await registro(
    r,
    "deliveries",
    "id, title, description, brand, asset_type, quantity, due_date, delivered_at, status, approval, approval_comment, notes, property_id, opportunity_id",
    id,
    "operacional",
    "Entrega não encontrada",
  );
  const c = r.cliente;
  const [propertyR, oppR] = await Promise.all([
    d.property_id
      ? c.from("sports_properties").select("name, category").eq("id", d.property_id).eq("organization_id", org).maybeSingle()
      : Promise.resolve({ data: null }),
    d.opportunity_id
      ? c.from("opportunities").select("brand, stage").eq("id", d.opportunity_id).eq("organization_id", org).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const property = propertyR.data as Linha | null;
  const opp = oppR.data as Linha | null;

  const hoje = hojeISO();
  const diasAtePrazo = d.due_date ? Math.ceil((new Date(String(d.due_date)).getTime() - Date.now()) / 86_400_000) : null;
  const atrasada = d.due_date && String(d.due_date) < hoje && d.status !== "entregue" && d.status !== "aprovada";

  const texto = [
    `CONTEXTO: Destravar entrega contratual (cobrar arte, agendar produção, alinhar com patrocinador).`,
    `Entrega: ${d.title} | Marca: ${d.brand} | Tipo: ${d.asset_type ?? "—"} | Qtd: ${d.quantity}`,
    `Status: ${d.status} | Aprovação: ${d.approval}`,
    d.due_date
      ? `Prazo: ${d.due_date} ${atrasada ? `(ATRASADA há ${Math.abs(diasAtePrazo ?? 0)} dias)` : diasAtePrazo !== null && diasAtePrazo <= 7 ? `(vence em ${diasAtePrazo} dias)` : ""}`
      : `Sem prazo definido.`,
    d.description ? `Descrição: ${d.description}` : null,
    d.approval_comment ? `Comentário de aprovação: ${d.approval_comment}` : null,
    d.notes ? `Notas: ${d.notes}` : null,
    property ? `Propriedade: ${property.name} (${property.category})` : null,
    opp ? `Oportunidade vinculada: ${opp.brand} (${opp.stage})` : null,
  ].filter(Boolean).join("\n");
  return { org, texto };
}

async function contextoDasEntregas({ usuario, cliente: c }: Requisicao, org: string) {
  const hoje = hojeISO();
  const logo = new Date(); logo.setDate(logo.getDate() + 7);
  const colunas = "title, brand, due_date, status, approval, asset_type";
  const [lateR, upcomingR] = await Promise.all([
    c.from("deliveries").select(colunas)
      .eq("organization_id", org).eq("owner_id", usuario.id).neq("status", "entregue").neq("status", "aprovada")
      .lt("due_date", hoje).order("due_date").limit(10),
    c.from("deliveries").select(colunas)
      .eq("organization_id", org).eq("owner_id", usuario.id).neq("status", "entregue").neq("status", "aprovada")
      .gte("due_date", hoje).lte("due_date", logo.toISOString().slice(0, 10)).order("due_date").limit(10),
  ]);
  const late = linhas(lateR);
  const upcoming = linhas(upcomingR);

  return [
    `CONTEXTO: Destravar entregas (cobrar arte, agendar produção, alinhar com patrocinador). Foque nas mais críticas.`,
    late.length
      ? `ATRASADAS (${late.length}):\n${late.map((d) => `- ${d.title} (${d.brand}) — ${d.asset_type ?? "—"} | status ${d.status} | vencia ${d.due_date}`).join("\n")}`
      : `Nenhuma entrega atrasada.`,
    upcoming.length
      ? `PRÓXIMAS 7 DIAS (${upcoming.length}):\n${upcoming.map((d) => `- ${d.title} (${d.brand}) — ${d.asset_type ?? "—"} | status ${d.status} | vence ${d.due_date}`).join("\n")}`
      : `Nada vencendo nos próximos 7 dias.`,
  ].join("\n\n");
}

async function contextoDaProposta(r: Requisicao, id: string) {
  const { linha: p, org } = await registro(
    r,
    "proposals",
    "id, title, brand, status, total_value, sent_at, valid_until, message, sponsor_id, property_id, created_at",
    id,
    "crm",
    "Proposta não encontrada",
  );
  const c = r.cliente;
  const [itemsR, sponsorR, propertyR] = await Promise.all([
    c.from("proposal_items").select("name, quantity, unit_value").eq("proposal_id", id).eq("organization_id", org).limit(20),
    p.sponsor_id
      ? c.from("sponsors").select("name, segment, score, last_contact_at").eq("id", p.sponsor_id).eq("organization_id", org).maybeSingle()
      : Promise.resolve({ data: null }),
    p.property_id
      ? c.from("sports_properties").select("name, category").eq("id", p.property_id).eq("organization_id", org).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const items = linhas(itemsR);
  const sponsor = sponsorR.data as Linha | null;
  const property = propertyR.data as Linha | null;

  const diasDoEnvio = diasDesde(p.sent_at);
  const expirada = p.valid_until && String(p.valid_until) < hojeISO();
  const foco = p.status === "rascunho"
    ? "Rascunho — diga objetivamente o que falta para ENVIAR (itens, valor, validade, mensagem, contato, anexos)."
    : p.status === "enviada"
    ? `Enviada há ${diasDoEnvio ?? "?"} dias sem resposta — sugira follow-up (canal/timing), ajuste de escopo ou desconto graduado, e gatilhos de urgência (validade).`
    : `Status ${p.status} — sugira ações de fechamento ou aprendizado.`;

  const texto = [
    `CONTEXTO: Acelerar proposta comercial. ${foco}`,
    `Proposta: ${p.title}${p.brand ? ` | Marca: ${p.brand}` : ""}`,
    `Status: ${p.status} | Valor: R$ ${p.total_value}`,
    p.sent_at ? `Enviada em: ${String(p.sent_at).slice(0, 10)} (há ${diasDoEnvio}d)` : `Ainda não enviada.`,
    p.valid_until ? `Válida até: ${p.valid_until}${expirada ? " (EXPIRADA)" : ""}` : `Sem validade definida.`,
    p.message ? `Mensagem: ${p.message}` : `Sem mensagem personalizada.`,
    items.length
      ? `Itens (${items.length}):\n${items.map((i) => `- ${i.name} x${i.quantity} @ R$ ${i.unit_value}`).join("\n")}`
      : `SEM ITENS cadastrados.`,
    sponsor ? `Patrocinador: ${sponsor.name}${sponsor.segment ? ` (${sponsor.segment})` : ""} | Score: ${sponsor.score}${sponsor.last_contact_at ? ` | Último contato: ${sponsor.last_contact_at}` : ""}` : `Sem patrocinador vinculado.`,
    property ? `Propriedade: ${property.name} (${property.category})` : null,
  ].filter(Boolean).join("\n");
  return { org, texto };
}

/** Organização ativa para os contextos de lista, validada antes de qualquer consulta. */
async function organizacaoDaLista(r: Requisicao, corpo: unknown, modulo: Modulo): Promise<string> {
  const org = organizacaoDoCorpo(corpo);
  await exigirModulo(r.cliente, r.usuario.id, org, modulo);
  return org;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const requisicao = await autenticar(req);
    const corpo = await req.json().catch(() => ({}));
    // Chamada antiga do pipeline: só `opportunity_id`, sem `context`.
    const bruto = corpo?.context ?? (corpo?.opportunity_id ? "opportunity" : "");
    if (!(CONTEXTOS as readonly unknown[]).includes(bruto)) throw new ErroDaRequisicao(400, "context inválido");
    const contexto = bruto as Contexto;
    const alvo = corpo?.target_id ?? corpo?.opportunity_id;
    const idDoAlvo = () => uuidDoCorpo({ target_id: alvo }, "target_id");

    let org: string;
    let texto: string;
    if (contexto === "opportunity") ({ org, texto } = await contextoDaOportunidade(requisicao, idDoAlvo()));
    else if (contexto === "sponsor") ({ org, texto } = await contextoDoPatrocinador(requisicao, idDoAlvo()));
    else if (contexto === "contract") ({ org, texto } = await contextoDoContrato(requisicao, idDoAlvo()));
    else if (contexto === "proposal") ({ org, texto } = await contextoDaProposta(requisicao, idDoAlvo()));
    else if (contexto === "delivery" && alvo) ({ org, texto } = await contextoDaEntrega(requisicao, idDoAlvo()));
    else if (contexto === "delivery") {
      org = await organizacaoDaLista(requisicao, corpo, "operacional");
      texto = await contextoDasEntregas(requisicao, org);
    } else {
      org = await organizacaoDaLista(requisicao, corpo, "crm");
      texto = await contextoDoPainel(requisicao, org);
    }

    const resposta = await gerar({ organizacaoId: org, usuarioId: requisicao.usuario.id }, {
      funcionalidade: FUNCIONALIDADE,
      nivel: "padrao",
      sistema: SISTEMA,
      mensagens: [{ papel: "usuario", conteudo: texto }],
      json: { nome: "proximos_passos", esquema: ESQUEMA },
      maxTokens: 4096,
    }, dependenciasDaCamada());

    const passos = Array.isArray(resposta.json?.steps) ? resposta.json.steps as Linha[] : [];
    const steps = passos
      .filter((p) => typeof p?.title === "string" && p.title.trim())
      .slice(0, 5)
      .map((p) => ({
        title: String(p.title).slice(0, 120),
        description: typeof p.description === "string" ? p.description : "",
        activity_type: (TIPOS as readonly unknown[]).includes(p.activity_type) ? p.activity_type : "tarefa",
        priority: (PRIORIDADES as readonly unknown[]).includes(p.priority) ? p.priority : "media",
        due_in_days: Math.max(0, Math.min(30, Math.round(Number(p.due_in_days) || 0))),
      }));

    return json({ steps });
  } catch (e) {
    return respostaDeFalha(e, FUNCIONALIDADE);
  }
});
