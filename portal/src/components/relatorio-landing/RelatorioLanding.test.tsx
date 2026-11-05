import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { PaginaRelatorio, PostDaPagina } from "@/lib/relatorioLanding";
import { RelatorioLanding } from "./RelatorioLanding";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const post = (p: Partial<PostDaPagina>): PostDaPagina => ({
  id: crypto.randomUUID(),
  rede: "instagram",
  tipo: "reel",
  url: "https://www.instagram.com/reel/DdzSFlKFOtm/",
  id_externo: "DdzSFlKFOtm",
  titulo: "Desafio do travessão",
  fonte: "@scp",
  publicado_em: "2026-09-26",
  destaque: false,
  momento_id: null,
  views: 1_491_217,
  likes: 98_000,
  comentarios: 1_200,
  compartilhamentos: null,
  metricas_origem: "manual",
  metricas_em: null,
  do_patrocinador: true,
  ...p,
});

const foto = (id: string, legenda: string, extra: Partial<PaginaRelatorio["fotos"][number]> = {}) => ({
  id,
  url: `https://db.exemplo.com/${id}.jpg`,
  miniatura: `https://db.exemplo.com/${id}-m.jpg`,
  legenda,
  momento_id: null,
  etiquetas: [] as string[],
  capa: false,
  do_patrocinador: false,
  ...extra,
});

const pagina = (estilo: "escuro" | "claro", patrocinador = false): PaginaRelatorio => ({
  relatorio: {
    titulo: "O jogo ganhou escala",
    subtitulo: "10 anos de competição",
    resumo: "Uma década em campo.\n\nO salto de escala esportiva.",
    estilo,
    modo: "publico",
    status: "publicado",
    blocos_ocultos: [],
    cta_rotulo: "Quero ser patrocinador",
    cta_url: "https://wa.me/5511900000000",
    download_url: null,
    publicado_em: "2026-10-10T12:00:00Z",
    atualizado_em: "2026-10-28T12:00:00Z",
  },
  organizacao: { nome: "Scout", primaria: "#E8461E", secundaria: "#9BE15D", logo_url: null, logos: {} },
  propriedade: {
    nome: "Super Copa 2026",
    categoria: "campeonato",
    chamada: null,
    sobre: null,
    capa_url: null,
    temporada: 2026,
    inicio: "2026-03-14",
    fim: "2026-09-27",
    locais: ["São Paulo"],
    local_final: "Arena Inamar",
    publico_estimado: 410_157,
    torcedores: 9_000,
    participantes: null,
    times: 83,
    premiacao: null,
  },
  patrocinador: patrocinador ? { id: "s1", nome: "Claro", logo_url: null } : null,
  patrocinadores: [{ id: "s1", nome: "Claro", logo_url: null, cota: "Master", nivel: "master" }],
  momentos: [
    { id: "m1", titulo: "Abertura", tipo: "jogo", local: "Arena", inicio: "2026-04-03T23:00:00Z" },
    { id: "m2", titulo: "Final", tipo: "jogo", local: "Arena", inicio: "2026-09-27T18:00:00Z" },
  ],
  fotos: [
    foto("f1", "Placa de campo", { momento_id: "m2", etiquetas: ["Placas"], do_patrocinador: true }),
    foto("f2", "Torcida", { momento_id: "m2" }),
    foto("f3", "Abertura", { momento_id: "m1", etiquetas: ["Placas"] }),
  ],
  posts: [
    post({}),
    post({ rede: "youtube", tipo: "video", id_externo: "9e1ZiyuOXRc", url: "https://youtu.be/9e1ZiyuOXRc", titulo: "Final completa", views: 1_420_000, destaque: true }),
    post({ rede: "site", tipo: "materia", id_externo: null, url: "https://ge.globo.com/x", titulo: "Final vira notícia", fonte: "ge", views: null }),
  ],
  indicadores: [
    { id: "i1", categoria: "numeros", grupo: null, rotulo: "Jogos realizados", valor: 198, formato: "inteiro", prefixo: null, sufixo: null, fonte: null, data_referencia: null, do_patrocinador: false },
    { id: "i2", categoria: "publico", grupo: "Faixa etária", rotulo: "25–34 anos", valor: 44.7, formato: "percentual", prefixo: null, sufixo: null, fonte: "Instagram", data_referencia: null, do_patrocinador: false },
  ],
  contrapartidas: patrocinador
    ? [
        { id: "d1", titulo: "Placas de campo", categoria: "Visibilidade", quantidade: 12, status: "entregue", aprovacao: "aprovada", vencimento: null, entregue_em: "2026-04-03", evidencias: [] },
        { id: "d2", titulo: "Banner 3 x 3 m", categoria: "Visibilidade", quantidade: 1, status: "pendente", aprovacao: "pendente", vencimento: null, entregue_em: null, evidencias: [] },
      ]
    : [],
  acesso: { tipo: "publico", previa: false },
});

describe("RelatorioLanding", () => {
  it("monta a página da propriedade no estilo escuro, com as seções que têm dado", () => {
    render(<RelatorioLanding pagina={pagina("escuro")} />);
    expect(screen.getByRole("heading", { level: 1, name: "O jogo ganhou escala" })).toBeInTheDocument();
    const menu = screen.getByRole("navigation", { name: "Seções do relatório" });
    for (const secao of ["Números", "Resumo", "Marcas", "Jornada", "Vídeo", "Digital", "Conteúdos", "Público", "Acervo", "Imprensa"]) {
      expect(within(menu).getByRole("link", { name: secao })).toBeInTheDocument();
    }
    // Sem patrocinador, não há contrapartidas.
    expect(within(menu).queryByRole("link", { name: "Entregas" })).not.toBeInTheDocument();
    expect(screen.getByText("410 mil")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Quero ser patrocinador/ })).toHaveAttribute("href", "https://wa.me/5511900000000");
  });

  it("não carrega conteúdo de terceiros antes do clique", () => {
    const { container } = render(<RelatorioLanding pagina={pagina("escuro")} />);
    expect(container.querySelector("iframe")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /Carregar Final completa/ })[0]);
    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/9e1ZiyuOXRc?rel=0&modestbranding=1&autoplay=1");
  });

  it("relatório do patrocinador no estilo claro mostra contrapartidas e filtra o acervo", () => {
    render(<RelatorioLanding pagina={pagina("claro", true)} />);
    expect(screen.getByText("1 de 2 contrapartidas concluídas")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Marcas" })).not.toBeInTheDocument();
    const filtros = screen.getByRole("group", { name: "Filtrar fotos" });
    fireEvent.click(within(filtros).getByRole("button", { name: /Abertura/ }));
    expect(screen.getAllByRole("button", { name: /^Ampliar F\d+/ })).toHaveLength(1);
  });
});
