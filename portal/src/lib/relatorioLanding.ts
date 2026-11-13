// Regras puras da landing page do relatório (ADR-0011,
// docs/business/relatorios.md): o formato que a `report-view` devolve, quais
// blocos aparecem, como os números são escritos e o tema com as cores da
// organização.

import { componentesRgb, corSegura, PRIMARIA_PADRAO, SECUNDARIA_PADRAO, textoSobrePrimaria } from "@/lib/marca";
import type { StatusTone } from "@/lib/statusTone";

export type EstiloDoRelatorio = "escuro" | "claro";
export type ModoDeAcesso = "organizacao" | "publico";
export type StatusDoRelatorio = "rascunho" | "publicado" | "excluido";
export type CategoriaDeIndicador = "numeros" | "digital" | "transmissao" | "publico";
export type FormatoDeIndicador = "inteiro" | "compacto" | "decimal" | "percentual";

export interface PostDaPagina {
  id: string;
  rede: string;
  tipo: string;
  url: string;
  id_externo: string | null;
  titulo: string | null;
  fonte: string | null;
  publicado_em: string | null;
  destaque: boolean;
  momento_id: string | null;
  views: number | null;
  likes: number | null;
  comentarios: number | null;
  compartilhamentos: number | null;
  metricas_origem: "manual" | "api";
  metricas_em: string | null;
  do_patrocinador: boolean;
}

export interface IndicadorDaPagina {
  id: string;
  categoria: CategoriaDeIndicador;
  grupo: string | null;
  rotulo: string;
  valor: number;
  formato: FormatoDeIndicador;
  prefixo: string | null;
  sufixo: string | null;
  fonte: string | null;
  data_referencia: string | null;
  do_patrocinador: boolean;
}

export interface FotoDaPagina {
  id: string;
  url: string;
  miniatura: string;
  legenda: string | null;
  momento_id: string | null;
  etiquetas: string[];
  capa: boolean;
  do_patrocinador: boolean;
}

export interface MomentoDaPagina {
  id: string;
  titulo: string;
  tipo: string;
  local: string | null;
  inicio: string;
}

export interface ContrapartidaDaPagina {
  id: string;
  titulo: string;
  categoria: string | null;
  quantidade: number;
  status: string;
  aprovacao: string;
  vencimento: string | null;
  entregue_em: string | null;
  evidencias: { url: string; registrado_em: string | null }[];
}

export interface PaginaRelatorio {
  relatorio: {
    titulo: string;
    subtitulo: string | null;
    resumo: string | null;
    estilo: EstiloDoRelatorio;
    modo: ModoDeAcesso;
    status: StatusDoRelatorio;
    blocos_ocultos: string[];
    cta_rotulo: string | null;
    cta_url: string | null;
    download_url: string | null;
    publicado_em: string | null;
    atualizado_em: string | null;
  };
  organizacao: {
    nome: string;
    primaria: string | null;
    secundaria: string | null;
    logo_url: string | null;
    logos: Record<string, string>;
  } | null;
  propriedade: {
    nome: string;
    categoria: string;
    chamada: string | null;
    sobre: string | null;
    capa_url: string | null;
    temporada: number | null;
    inicio: string | null;
    fim: string | null;
    locais: string[] | null;
    local_final: string | null;
    publico_estimado: number | null;
    torcedores: number | null;
    participantes: number | null;
    times: number | null;
    premiacao: number | null;
  } | null;
  patrocinador: { id: string; nome: string; logo_url: string | null } | null;
  patrocinadores: { id: string; nome: string; logo_url: string | null; cota: string | null; nivel: string | null }[];
  momentos: MomentoDaPagina[];
  fotos: FotoDaPagina[];
  posts: PostDaPagina[];
  indicadores: IndicadorDaPagina[];
  contrapartidas: ContrapartidaDaPagina[];
  acesso: { tipo: "organizacao" | "patrocinador" | "publico"; previa: boolean };
}

// ─── Números ────────────────────────────────────────────────────────────────

const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/** 189.210.000 → "189,2 mi"; 410.157 → "410 mil"; 9.000 → "9.000". */
export function numeroCompacto(n: number): string {
  const abs = Math.abs(n);
  const escalas: [number, string][] = [
    [1e9, "bi"],
    [1e6, "mi"],
    [1e3, "mil"],
  ];
  for (const [base, sufixo] of escalas) {
    if (abs >= base && (base > 1e3 || abs >= 1e4)) {
      const v = n / base;
      const casas = base === 1e3 && Math.abs(v) >= 100 ? 0 : 1;
      return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(v)} ${sufixo}`;
    }
  }
  return inteiro.format(n);
}

export function formatarIndicador(i: Pick<IndicadorDaPagina, "valor" | "formato" | "prefixo" | "sufixo">): string {
  const v = Number(i.valor);
  let texto: string;
  if (i.formato === "compacto") texto = numeroCompacto(v);
  else if (i.formato === "decimal") texto = decimal.format(v);
  else if (i.formato === "percentual") texto = `${decimal.format(v)}%`;
  else texto = inteiro.format(v);
  const prefixo = i.prefixo ? `${i.prefixo}${/[\p{L}$]$/u.test(i.prefixo) ? " " : ""}` : "";
  const sufixo = i.sufixo ? `${i.sufixo.startsWith("%") ? "" : " "}${i.sufixo}` : "";
  return `${prefixo}${texto}${sufixo}`;
}

/** Zero conta como em branco nas contagens do cadastro (decisão D8). */
const preenchido = (n: number | null | undefined): n is number => typeof n === "number" && n > 0;

export interface Numero {
  rotulo: string;
  valor: string;
  fonte?: string | null;
}

/** Faixa de números: o que o projeto já tem mais os indicadores "numeros". */
export function numerosPrincipais(p: PaginaRelatorio): Numero[] {
  const saida: Numero[] = [];
  const prop = p.propriedade;
  if (prop) {
    if (preenchido(prop.times)) saida.push({ rotulo: "Equipes", valor: inteiro.format(prop.times) });
    if (preenchido(prop.participantes)) saida.push({ rotulo: "Participantes", valor: inteiro.format(prop.participantes) });
    if (preenchido(prop.publico_estimado)) {
      saida.push({ rotulo: "Público estimado", valor: numeroCompacto(prop.publico_estimado) });
    }
    if (preenchido(prop.torcedores)) saida.push({ rotulo: "Torcedores", valor: numeroCompacto(prop.torcedores) });
    if (preenchido(prop.premiacao)) {
      saida.push({ rotulo: "Premiação", valor: `R$ ${numeroCompacto(prop.premiacao)}` });
    }
  }
  if (p.momentos.length >= 2) saida.push({ rotulo: "Momentos registrados", valor: inteiro.format(p.momentos.length) });
  for (const i of p.indicadores.filter((x) => x.categoria === "numeros")) {
    saida.push({ rotulo: i.rotulo, valor: formatarIndicador(i), fonte: i.fonte });
  }
  return saida;
}

export const indicadoresDa = (p: PaginaRelatorio, categoria: CategoriaDeIndicador) =>
  p.indicadores.filter((i) => i.categoria === categoria);

/** Distribuições do público, na ordem de cadastro dos grupos. */
export function gruposDePublico(p: PaginaRelatorio): { grupo: string; itens: IndicadorDaPagina[] }[] {
  const grupos = new Map<string, IndicadorDaPagina[]>();
  for (const i of indicadoresDa(p, "publico")) {
    const g = i.grupo?.trim() || "Perfil do público";
    grupos.set(g, [...(grupos.get(g) ?? []), i]);
  }
  return [...grupos].map(([grupo, itens]) => ({ grupo, itens }));
}

export const ehMateria = (post: Pick<PostDaPagina, "tipo">) => post.tipo === "materia";

/** Soma das métricas dos posts. `soDoPatrocinador` recorta o relatório de patrocinador. */
export function somaDosPosts(posts: PostDaPagina[], soDoPatrocinador = false) {
  const base = posts.filter((p) => !ehMateria(p) && (!soDoPatrocinador || p.do_patrocinador));
  const soma = (campo: "views" | "likes" | "comentarios" | "compartilhamentos") =>
    base.reduce((s, p) => s + (p[campo] ?? 0), 0);
  return {
    conteudos: base.length,
    views: soma("views"),
    likes: soma("likes"),
    interacoes: soma("likes") + soma("comentarios") + soma("compartilhamentos"),
  };
}

/** Vídeo do YouTube que abre a página: o destacado, senão o mais visto. */
export function videoEmDestaque(p: PaginaRelatorio): PostDaPagina | null {
  const videos = p.posts.filter((x) => x.rede === "youtube" && x.id_externo && x.tipo !== "reel");
  if (videos.length === 0) return null;
  return (
    videos.find((v) => v.destaque) ??
    [...videos].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0]
  );
}

// ─── Blocos ─────────────────────────────────────────────────────────────────

export type BlocoId =
  | "numeros"
  | "resumo"
  | "patrocinadores"
  | "jornada"
  | "video"
  | "digital"
  | "transmissao"
  | "conteudos"
  | "publico"
  | "acervo"
  | "imprensa"
  | "contrapartidas"
  | "contato";

export interface Bloco {
  id: BlocoId;
  titulo: string;
  /** O dado mínimo para o bloco aparecer, dito para quem edita. */
  exige: string;
}

/** Ordem da página. A capa e o rodapé aparecem sempre e não entram aqui. */
export const BLOCOS: Bloco[] = [
  { id: "numeros", titulo: "Números principais", exige: "2 números (dados do projeto ou indicadores da categoria Números)" },
  { id: "resumo", titulo: "Resumo executivo", exige: "resumo do relatório ou texto público do projeto" },
  { id: "patrocinadores", titulo: "Patrocinadores", exige: "relatório do projeto com 1 patrocinador com cota vendida ou contrato" },
  { id: "jornada", titulo: "Jornada da temporada", exige: "2 momentos cadastrados no projeto" },
  { id: "video", titulo: "Vídeo em destaque", exige: "1 vídeo do YouTube cadastrado" },
  { id: "digital", titulo: "Resultados digitais", exige: "1 indicador Digital ou 1 post com visualizações" },
  { id: "transmissao", titulo: "Transmissão", exige: "1 indicador da categoria Transmissão" },
  { id: "conteudos", titulo: "Conteúdos e posts", exige: "1 post ou vídeo cadastrado" },
  { id: "publico", titulo: "Perfil do público", exige: "1 indicador da categoria Público" },
  { id: "acervo", titulo: "Acervo de fotos", exige: "1 foto na galeria do projeto" },
  { id: "imprensa", titulo: "Na imprensa", exige: "1 matéria cadastrada" },
  { id: "contrapartidas", titulo: "Contrapartidas", exige: "relatório de patrocinador com 1 entrega" },
  { id: "contato", titulo: "Contato e download", exige: "botão de contato ou link do relatório completo" },
];

/** Se o bloco tem o dado mínimo, independente de estar oculto. */
export function blocoTemDados(id: BlocoId, p: PaginaRelatorio): boolean {
  switch (id) {
    case "numeros":
      return numerosPrincipais(p).length >= 2;
    case "resumo":
      return Boolean(p.relatorio.resumo?.trim() || p.propriedade?.sobre?.trim());
    case "patrocinadores":
      return !p.patrocinador && p.patrocinadores.length > 0;
    case "jornada":
      return p.momentos.length >= 2;
    case "video":
      return videoEmDestaque(p) !== null;
    case "digital":
      return indicadoresDa(p, "digital").length > 0 || p.posts.some((x) => !ehMateria(x) && (x.views ?? 0) > 0);
    case "transmissao":
      return indicadoresDa(p, "transmissao").length > 0;
    case "conteudos":
      return p.posts.some((x) => !ehMateria(x));
    case "publico":
      return indicadoresDa(p, "publico").length > 0;
    case "acervo":
      return p.fotos.length > 0;
    case "imprensa":
      return p.posts.some(ehMateria);
    case "contrapartidas":
      return Boolean(p.patrocinador) && p.contrapartidas.length > 0;
    case "contato":
      return Boolean(p.relatorio.cta_url || p.relatorio.download_url);
  }
}

/** Blocos que a página mostra, na ordem: com dado e não ocultos. */
export function blocosVisiveis(p: PaginaRelatorio): BlocoId[] {
  const ocultos = new Set(p.relatorio.blocos_ocultos);
  return BLOCOS.map((b) => b.id).filter((id) => !ocultos.has(id) && blocoTemDados(id, p));
}

// ─── Status das entregas ────────────────────────────────────────────────────

export const STATUS_DA_ENTREGA: Record<string, { rotulo: string; tom: "ok" | "andamento" | "pendente" | "alerta" }> = {
  aprovada: { rotulo: "Aprovada", tom: "ok" },
  entregue: { rotulo: "Concluída", tom: "ok" },
  em_producao: { rotulo: "Em produção", tom: "andamento" },
  pendente: { rotulo: "Pendente", tom: "pendente" },
  atrasada: { rotulo: "Atrasada", tom: "alerta" },
};

/** Concluídas: entregues ou aprovadas, e nunca reprovadas pelo patrocinador. */
export function resumoDasContrapartidas(itens: ContrapartidaDaPagina[]) {
  const concluidas = itens.filter(
    (c) => (c.status === "entregue" || c.status === "aprovada") && c.aprovacao !== "reprovada",
  ).length;
  return {
    total: itens.length,
    concluidas,
    percentual: itens.length ? Math.round((concluidas / itens.length) * 100) : 0,
  };
}

// ─── Tema ───────────────────────────────────────────────────────────────────

function luminanciaRelativa(hex: string): number {
  const { r, g, b } = componentesRgb(hex);
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrasteEntre(a: string, b: string): number {
  const [la, lb] = [luminanciaRelativa(a), luminanciaRelativa(b)].sort((x, y) => y - x);
  return (la + 0.05) / (lb + 0.05);
}

const FUNDOS: Record<EstiloDoRelatorio, Record<string, string>> = {
  escuro: {
    "--rl-bg": "#08090C",
    "--rl-surface": "#111318",
    "--rl-surface-2": "#191C24",
    "--rl-fg": "#F5F6F8",
    "--rl-muted": "#9CA2B0",
    "--rl-border": "rgba(255,255,255,0.09)",
  },
  claro: {
    "--rl-bg": "#FFFFFF",
    "--rl-surface": "#F5F6F9",
    "--rl-surface-2": "#ECEEF3",
    "--rl-fg": "#0F1221",
    "--rl-muted": "#5B6275",
    "--rl-border": "#E2E5EC",
  },
};

/**
 * Variáveis CSS da página: fundo do estilo e cores da organização. A cor de
 * destaque usada como texto precisa de contraste 3:1 sobre o fundo; se a
 * primária não tem, tenta a secundária e, por fim, o próprio texto.
 */
export function temaDoRelatorio(
  estilo: EstiloDoRelatorio,
  primaria: string | null | undefined,
  secundaria: string | null | undefined,
): Record<string, string> {
  const p = corSegura(primaria, PRIMARIA_PADRAO);
  const s = corSegura(secundaria, SECUNDARIA_PADRAO);
  const fundo = FUNDOS[estilo];
  const bg = fundo["--rl-bg"];
  const destaqueTexto = [p, s].find((c) => contrasteEntre(c, bg) >= 3) ?? fundo["--rl-fg"];
  return {
    ...fundo,
    "--rl-primaria": p,
    "--rl-secundaria": s,
    "--rl-sobre-primaria": `hsl(${textoSobrePrimaria(p)})`,
    "--rl-sobre-secundaria": `hsl(${textoSobrePrimaria(s)})`,
    "--rl-destaque": destaqueTexto,
  };
}

// ─── Rótulos do painel ──────────────────────────────────────────────────────

export const ROTULO_DO_STATUS: Record<string, string> = {
  rascunho: "Rascunho",
  publicado: "Publicado",
  excluido: "Excluído",
};

export const TOM_DO_STATUS: Record<string, StatusTone> = {
  rascunho: "neutral",
  publicado: "success",
  excluido: "danger",
};

export const ROTULO_DO_MODO: Record<string, string> = {
  organizacao: "Só a organização",
  publico: "Público com link",
};

/** Endereço permanente do relatório (decisão D6, só o caminho). */
export function enderecoDoRelatorio(slug: string, origem = window.location.origin): string {
  return `${origem}/r/${slug}`;
}
