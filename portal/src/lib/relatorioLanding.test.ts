import { describe, expect, it } from "vitest";
import {
  blocosVisiveis,
  contrasteEntre,
  formatarIndicador,
  gruposDePublico,
  numeroCompacto,
  numerosPrincipais,
  resumoDasContrapartidas,
  somaDosPosts,
  temaDoRelatorio,
  videoEmDestaque,
  type PaginaRelatorio,
  type PostDaPagina,
} from "./relatorioLanding";

const post = (p: Partial<PostDaPagina>): PostDaPagina => ({
  id: crypto.randomUUID(),
  rede: "instagram",
  tipo: "post",
  url: "https://www.instagram.com/p/abcde/",
  id_externo: "abcde",
  titulo: null,
  fonte: null,
  publicado_em: null,
  destaque: false,
  momento_id: null,
  views: null,
  likes: null,
  comentarios: null,
  compartilhamentos: null,
  metricas_origem: "manual",
  metricas_em: null,
  do_patrocinador: false,
  ...p,
});

const pagina = (p: Partial<PaginaRelatorio> = {}): PaginaRelatorio => ({
  relatorio: {
    titulo: "SCP 2026",
    subtitulo: null,
    resumo: null,
    estilo: "escuro",
    modo: "organizacao",
    status: "publicado",
    blocos_ocultos: [],
    cta_rotulo: null,
    cta_url: null,
    download_url: null,
    publicado_em: null,
    atualizado_em: null,
  },
  organizacao: null,
  propriedade: null,
  patrocinador: null,
  patrocinadores: [],
  momentos: [],
  fotos: [],
  posts: [],
  indicadores: [],
  contrapartidas: [],
  acesso: { tipo: "organizacao", previa: false },
  ...p,
});

describe("números", () => {
  it("escreve números grandes como nos relatórios de referência", () => {
    expect(numeroCompacto(189_210_000)).toBe("189,2 mi");
    expect(numeroCompacto(410_157)).toBe("410 mil");
    expect(numeroCompacto(12_500)).toBe("12,5 mil");
    expect(numeroCompacto(9_000)).toBe("9.000");
    expect(numeroCompacto(1_420_000)).toBe("1,4 mi");
  });

  it("formata indicador com prefixo, sufixo e percentual", () => {
    expect(formatarIndicador({ valor: 44.7, formato: "percentual", prefixo: null, sufixo: null })).toBe("44,7%");
    expect(formatarIndicador({ valor: 250000, formato: "compacto", prefixo: "R$", sufixo: null })).toBe("R$ 250 mil");
    expect(formatarIndicador({ valor: 9748, formato: "inteiro", prefixo: "+", sufixo: null })).toBe("+9.748");
    expect(formatarIndicador({ valor: 96231.98, formato: "compacto", prefixo: null, sufixo: "h" })).toBe("96,2 mil h");
  });

  it("zero do projeto conta como em branco (D8)", () => {
    const p = pagina({
      propriedade: {
        nome: "SCP",
        categoria: "campeonato",
        chamada: null,
        sobre: null,
        capa_url: null,
        temporada: 2026,
        inicio: null,
        fim: null,
        locais: [],
        local_final: null,
        publico_estimado: 410_157,
        torcedores: 0,
        participantes: null,
        times: 83,
        premiacao: 0,
      },
    });
    expect(numerosPrincipais(p).map((n) => n.rotulo)).toEqual(["Equipes", "Público estimado"]);
  });
});

describe("blocos", () => {
  it("bloco sem o dado mínimo não aparece", () => {
    expect(blocosVisiveis(pagina())).toEqual([]);
  });

  it("aparece com dado e some quando ocultado", () => {
    const p = pagina({
      posts: [post({ rede: "youtube", tipo: "video", id_externo: "9e1ZiyuOXRc", views: 10 }), post({ tipo: "materia" })],
      relatorio: { ...pagina().relatorio, resumo: "Uma década em campo." },
    });
    expect(blocosVisiveis(p)).toEqual(["resumo", "video", "digital", "conteudos", "imprensa"]);
    p.relatorio.blocos_ocultos = ["imprensa"];
    expect(blocosVisiveis(p)).not.toContain("imprensa");
  });

  it("patrocinadores só no relatório do projeto; contrapartidas só no do patrocinador", () => {
    const entrega = {
      id: "1",
      titulo: "Placa",
      categoria: null,
      quantidade: 1,
      status: "entregue",
      aprovacao: "aprovada",
      vencimento: null,
      entregue_em: null,
      evidencias: [],
    };
    const patrocinadores = [{ id: "s", nome: "Claro", logo_url: null, cota: "Master", nivel: "master" }];
    expect(blocosVisiveis(pagina({ patrocinadores, contrapartidas: [entrega] }))).toEqual(["patrocinadores"]);
    expect(
      blocosVisiveis(pagina({ patrocinadores, contrapartidas: [entrega], patrocinador: { id: "s", nome: "Claro", logo_url: null } })),
    ).toEqual(["contrapartidas"]);
  });
});

describe("conteúdo", () => {
  it("soma os posts e recorta o patrocinador", () => {
    const posts = [
      post({ views: 100, likes: 10, comentarios: 2, do_patrocinador: true }),
      post({ views: 50, likes: 5, compartilhamentos: 1 }),
      post({ tipo: "materia", views: 999 }),
    ];
    expect(somaDosPosts(posts)).toEqual({ conteudos: 2, views: 150, likes: 15, interacoes: 18 });
    expect(somaDosPosts(posts, true)).toEqual({ conteudos: 1, views: 100, likes: 10, interacoes: 12 });
  });

  it("vídeo em destaque: o marcado, senão o mais visto", () => {
    const a = post({ rede: "youtube", tipo: "video", id_externo: "aaaaaaaaaaa", views: 10 });
    const b = post({ rede: "youtube", tipo: "video", id_externo: "bbbbbbbbbbb", views: 99 });
    expect(videoEmDestaque(pagina({ posts: [a, b] }))?.id).toBe(b.id);
    expect(videoEmDestaque(pagina({ posts: [{ ...a, destaque: true }, b] }))?.id).toBe(a.id);
  });

  it("agrupa o público pelo grupo cadastrado", () => {
    const ind = (grupo: string | null, rotulo: string) => ({
      id: rotulo,
      categoria: "publico" as const,
      grupo,
      rotulo,
      valor: 10,
      formato: "percentual" as const,
      prefixo: null,
      sufixo: null,
      fonte: null,
      data_referencia: null,
      do_patrocinador: false,
    });
    const grupos = gruposDePublico(pagina({ indicadores: [ind("Idade", "18–24"), ind("Gênero", "Homens"), ind("Idade", "25–34"), ind(null, "Classe C")] }));
    expect(grupos.map((g) => [g.grupo, g.itens.length])).toEqual([
      ["Idade", 2],
      ["Gênero", 1],
      ["Perfil do público", 1],
    ]);
  });

  it("entrega reprovada não conta como concluída", () => {
    const base = { id: "", titulo: "", categoria: null, quantidade: 1, vencimento: null, entregue_em: null, evidencias: [] };
    expect(
      resumoDasContrapartidas([
        { ...base, status: "entregue", aprovacao: "aprovada" },
        { ...base, status: "entregue", aprovacao: "reprovada" },
        { ...base, status: "pendente", aprovacao: "pendente" },
        { ...base, status: "aprovada", aprovacao: "pendente" },
      ]),
    ).toEqual({ total: 4, concluidas: 2, percentual: 50 });
  });
});

describe("tema", () => {
  it("destaque como texto precisa de contraste com o fundo", () => {
    // Azul-marinho some no fundo escuro: o destaque passa para a secundária.
    const escuro = temaDoRelatorio("escuro", "#0B1E3F", "#F2C230");
    expect(escuro["--rl-primaria"]).toBe("#0B1E3F");
    expect(escuro["--rl-destaque"]).toBe("#F2C230");
    expect(contrasteEntre(escuro["--rl-destaque"], escuro["--rl-bg"])).toBeGreaterThanOrEqual(3);
    // Nenhuma das duas serve: usa o próprio texto.
    expect(temaDoRelatorio("claro", "#FFF7D6", "#FFFFFF")["--rl-destaque"]).toBe("#0F1221");
  });

  it("cor fora do padrão cai na paleta BrandPlay", () => {
    const t = temaDoRelatorio("claro", "red; background:url(x)", null);
    expect(t["--rl-primaria"]).toBe("#6206C8");
    expect(t["--rl-secundaria"]).toBe("#2962FF");
  });
});
