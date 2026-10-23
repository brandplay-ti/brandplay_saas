import { matchPath } from "react-router-dom";

/** Título da landing, igual ao do `index.html`. */
export const TITULO_PADRAO = "Brandplay — Transformando patrocínio em resultado";

/**
 * Título da aba por rota. A ordem importa: o primeiro padrão que casa vence,
 * então rotas com parâmetro vêm antes das listas que as contêm.
 *
 * `null` = a própria página define o título (o media kit público usa o nome
 * da propriedade, que só existe depois de carregar).
 */
const TITULOS: [padrao: string, titulo: string | null][] = [
  ["/", TITULO_PADRAO],
  ["/auth", "Entrar"],
  ["/esqueci-senha", "Esqueci minha senha"],
  ["/resetar-senha", "Definir nova senha"],
  ["/onboarding/organizacao", "Criar organização"],
  ["/p/:slug", null],

  ["/portal/login", "Entrar no Portal do Patrocinador"],
  ["/portal", "Entregas · Portal do Patrocinador"],
  ["/portal/contratos", "Contratos · Portal do Patrocinador"],
  ["/portal/relatorios", "Relatórios · Portal do Patrocinador"],

  ["/dashboard", "Dashboard"],
  ["/dashboard/calendario", "Calendário"],
  ["/dashboard/notificacoes", "Notificações"],
  ["/dashboard/pipeline", "Pipeline"],
  ["/dashboard/propostas", "Propostas"],
  ["/dashboard/patrocinadores/:id", "Patrocinador"],
  ["/dashboard/patrocinadores", "Patrocinadores"],
  ["/dashboard/lead-scoring", "Lead Scoring IA"],
  ["/dashboard/contratos", "Contratos"],
  ["/dashboard/financeiro", "Financeiro"],
  ["/dashboard/propriedades/:id", "Propriedade"],
  ["/dashboard/propriedades", "Propriedades"],
  ["/dashboard/ativos", "Ativos"],
  ["/dashboard/entregas", "Entregas"],
  ["/dashboard/relatorios", "Relatórios"],
  ["/dashboard/equipe", "Equipe"],
  ["/dashboard/portal-access", "Acessos ao Portal"],
  ["/dashboard/logs-falhas", "Logs de Falhas"],
  ["/dashboard/configuracoes", "Configurações"],
  ["/dashboard/plano", "Plano e cobrança"],
  ["/dashboard/brandtrack", "BrandTrack"],
  ["/dashboard/brandtrack/uploads", "Uploads · BrandTrack"],
  ["/dashboard/brandtrack/marcas-esperadas", "Marcas esperadas · BrandTrack"],
  ["/dashboard/brandtrack/marcas/:brand", "Patrocinador · BrandTrack"],
  ["/dashboard/brandtrack/marcas", "Análise por patrocinador · BrandTrack"],
  ["/dashboard/brandtrack/evidencias", "Evidências · BrandTrack"],
  ["/dashboard/brandtrack/relatorios", "Relatórios · BrandTrack"],

  ["/admin", "Visão geral · Admin da plataforma"],
  ["/admin/clientes/:id", "Cliente · Admin da plataforma"],
  ["/admin/clientes", "Clientes · Admin da plataforma"],
  ["/admin/planos", "Planos · Admin da plataforma"],
  ["/admin/faturamento", "Faturamento · Admin da plataforma"],

  ["/campo", "Entregas · App de Campo"],
  ["/campo/entregas/:id", "Entrega · App de Campo"],
  ["/campo/eventos/:id", "Checklist do evento · App de Campo"],
  ["/campo/eventos", "Eventos · App de Campo"],
];

/**
 * Título completo da aba para `pathname`, com a marca no fim. Rota sem
 * cadastro (404) vira "Página não encontrada"; `null` quando a página cuida do
 * próprio título.
 */
export function tituloDaPagina(pathname: string): string | null {
  const encontrado = TITULOS.find(([padrao]) => matchPath({ path: padrao, end: true }, pathname));
  if (!encontrado) return "Página não encontrada · Brandplay";
  const [, titulo] = encontrado;
  if (titulo === null || titulo === TITULO_PADRAO) return titulo;
  return `${titulo} · Brandplay`;
}
