// Guia "Primeiros passos" do Dashboard (docs/business/primeiros-passos.md):
// a ordem sugerida de cadastros para quem acabou de entrar.
//
// Um passo está concluído quando o cadastro existe na organização (contagem
// no banco), não quando alguém o marca. Cada membro vê só os passos dos
// módulos que acessa; o guia some sozinho quando os passos dele acabam.

import type { NavModule } from "@/lib/navegacao";
import type { TipoDeCliente } from "@/lib/permissoes";

/** O que o guia conta na organização ativa. */
export type ContagensDosPassos = {
  kitDeMarca: number;
  projetos: number;
  cotas: number;
  patrocinadores: number;
  oportunidades: number;
  propostas: number;
  contratos: number;
  entregas: number;
  membros: number;
  acessosAoPortal: number;
};

export type IdDoPasso =
  | "marca"
  | "projeto"
  | "cotas"
  | "patrocinador"
  | "oportunidade"
  | "proposta"
  | "contrato"
  | "entregas"
  | "equipe"
  | "portal";

export type Passo = {
  id: IdDoPasso;
  titulo: string;
  descricao: string;
  /** Tela onde o passo se resolve. */
  url: string;
  rotuloDaAcao: string;
  /** Opcional não conta no progresso nem segura o guia aberto. */
  opcional: boolean;
};

type DefinicaoDoPasso = {
  id: IdDoPasso;
  /** Basta um dos módulos; sem módulos, só owner/admin. */
  modulos: NavModule[] | "admin";
  opcional?: boolean;
  url: string;
  concluido: (c: ContagensDosPassos) => boolean;
  texto: Record<TipoDeCliente, { titulo: string; descricao: string; rotuloDaAcao: string } | null>;
};

// A ordem do array é a ordem do guia. Agência: monta o que vende antes de
// vender (projeto → cotas → patrocinador → funil → contrato → entregas). Marca:
// cadastra a si mesma, o que patrocina e o que comprou.
const DEFINICOES: DefinicaoDoPasso[] = [
  {
    id: "marca",
    modulos: "admin",
    url: "/dashboard/configuracoes",
    concluido: (c) => c.kitDeMarca > 0,
    texto: {
      agencia: {
        titulo: "Defina as cores e o logo",
        descricao: "Propostas, contratos e relatórios saem com a identidade da sua organização.",
        rotuloDaAcao: "Abrir configurações",
      },
      marca: {
        titulo: "Defina as cores e o logo",
        descricao: "Relatórios e documentos saem com a identidade da sua organização.",
        rotuloDaAcao: "Abrir configurações",
      },
    },
  },
  {
    id: "patrocinador",
    modulos: ["crm"],
    url: "/dashboard/patrocinadores",
    concluido: (c) => c.patrocinadores > 0,
    texto: {
      agencia: null,
      marca: {
        titulo: "Cadastre sua marca",
        descricao: "A própria marca, ou as marcas do grupo, que vão aparecer nos contratos e relatórios.",
        rotuloDaAcao: "Ir para Marcas",
      },
    },
  },
  {
    id: "projeto",
    modulos: ["crm", "operacional"],
    url: "/dashboard/propriedades",
    concluido: (c) => c.projetos > 0,
    texto: {
      agencia: {
        titulo: "Cadastre seu primeiro projeto",
        descricao: "O time, evento ou atleta que você vai oferecer aos patrocinadores. Tudo parte dele.",
        rotuloDaAcao: "Ir para Projetos",
      },
      marca: {
        titulo: "Cadastre o projeto que você patrocina",
        descricao: "O time, evento ou atleta em que a sua marca aparece.",
        rotuloDaAcao: "Ir para Projetos",
      },
    },
  },
  {
    id: "cotas",
    modulos: ["crm", "operacional"],
    url: "/dashboard/propriedades",
    concluido: (c) => c.cotas > 0,
    texto: {
      agencia: {
        titulo: "Crie as cotas de patrocínio",
        descricao: "Dentro do projeto, monte as cotas com o preço e as contrapartidas de cada uma.",
        rotuloDaAcao: "Abrir um projeto",
      },
      marca: {
        titulo: "Registre a cota comprada",
        descricao: "Dentro do projeto, indique a cota e as contrapartidas que a sua marca comprou.",
        rotuloDaAcao: "Abrir um projeto",
      },
    },
  },
  {
    id: "patrocinador",
    modulos: ["crm"],
    url: "/dashboard/patrocinadores",
    concluido: (c) => c.patrocinadores > 0,
    texto: {
      agencia: {
        titulo: "Cadastre um patrocinador",
        descricao: "A empresa que você quer captar, com os contatos de quem decide.",
        rotuloDaAcao: "Ir para Patrocinadores",
      },
      marca: null,
    },
  },
  {
    id: "oportunidade",
    modulos: ["vendas"],
    url: "/dashboard/pipeline",
    concluido: (c) => c.oportunidades > 0,
    texto: {
      agencia: {
        titulo: "Abra uma oportunidade no pipeline",
        descricao: "Acompanhe a negociação com o patrocinador, do primeiro contato ao fechamento.",
        rotuloDaAcao: "Ir para o Pipeline",
      },
      marca: null,
    },
  },
  {
    id: "proposta",
    modulos: ["vendas"],
    url: "/dashboard/propostas",
    concluido: (c) => c.propostas > 0,
    texto: {
      agencia: {
        titulo: "Gere uma proposta",
        descricao: "Monte a proposta com as cotas do projeto e envie ao patrocinador.",
        rotuloDaAcao: "Ir para Propostas",
      },
      marca: null,
    },
  },
  {
    id: "contrato",
    modulos: ["crm", "financeiro"],
    url: "/dashboard/contratos",
    concluido: (c) => c.contratos > 0,
    texto: {
      agencia: {
        titulo: "Feche o contrato",
        descricao: "O contrato gera as parcelas a receber. Ele também nasce da oportunidade ganha ou da proposta aceita.",
        rotuloDaAcao: "Ir para Contratos",
      },
      marca: {
        titulo: "Registre o contrato",
        descricao: "O contrato gera as parcelas a pagar e organiza as contrapartidas a cobrar.",
        rotuloDaAcao: "Ir para Contratos",
      },
    },
  },
  {
    id: "entregas",
    modulos: ["operacional", "crm"],
    url: "/dashboard/entregas",
    concluido: (c) => c.entregas > 0,
    texto: {
      agencia: {
        titulo: "Acompanhe as entregas",
        descricao: "Registre as contrapartidas do contrato e comprove cada uma ao patrocinador.",
        rotuloDaAcao: "Ir para Entregas",
      },
      marca: {
        titulo: "Acompanhe as entregas",
        descricao: "Confira as contrapartidas do contrato e aprove o que foi entregue.",
        rotuloDaAcao: "Ir para Entregas",
      },
    },
  },
  {
    id: "equipe",
    modulos: ["team"],
    opcional: true,
    url: "/dashboard/equipe",
    concluido: (c) => c.membros > 1,
    texto: {
      agencia: {
        titulo: "Convide sua equipe",
        descricao: "Comercial, operacional e financeiro, cada um com o acesso do seu papel.",
        rotuloDaAcao: "Ir para Equipe",
      },
      marca: {
        titulo: "Convide sua equipe",
        descricao: "Marketing, operacional e financeiro, cada um com o acesso do seu papel.",
        rotuloDaAcao: "Ir para Equipe",
      },
    },
  },
  {
    id: "portal",
    modulos: ["team"],
    opcional: true,
    url: "/dashboard/portal-access",
    concluido: (c) => c.acessosAoPortal > 0,
    texto: {
      agencia: {
        titulo: "Abra o portal ao patrocinador",
        descricao: "O patrocinador acompanha contratos, entregas e relatórios sem entrar no seu painel.",
        rotuloDaAcao: "Ir para Acessos ao Portal",
      },
      marca: null,
    },
  },
];

export type Acesso = {
  clientType: TipoDeCliente;
  isAdmin: boolean;
  /** `can` do useOrganization: já aplica o teto do tipo de cliente. */
  can: (modulo: NavModule) => boolean;
};

export type PassoComSituacao = Passo & { concluido: boolean };

export type GuiaDePrimeirosPassos = {
  passos: PassoComSituacao[];
  /** Só os obrigatórios. */
  concluidos: number;
  total: number;
  /** Todo passo obrigatório visível já está feito (ou não há nenhum). */
  terminado: boolean;
};

const definicoesVisiveis = ({ clientType, isAdmin, can }: Acesso) =>
  DEFINICOES.flatMap((d) => {
    const texto = d.texto[clientType];
    if (!texto) return [];
    const pode = d.modulos === "admin" ? isAdmin : d.modulos.some((m) => can(m));
    if (!pode) return [];
    const passo: Passo = { id: d.id, url: d.url, opcional: d.opcional === true, ...texto };
    return [{ passo, concluido: d.concluido }];
  });

/** Passos que este membro vê, na ordem do guia. */
export function passosVisiveis(acesso: Acesso): Passo[] {
  return definicoesVisiveis(acesso).map((v) => v.passo);
}

/** Situação de cada passo visível e o progresso dos obrigatórios. */
export function montarGuia(acesso: Acesso, contagens: ContagensDosPassos): GuiaDePrimeirosPassos {
  const passos = definicoesVisiveis(acesso).map((v) => ({ ...v.passo, concluido: v.concluido(contagens) }));
  const obrigatorios = passos.filter((p) => !p.opcional);
  const concluidos = obrigatorios.filter((p) => p.concluido).length;
  return {
    passos,
    concluidos,
    total: obrigatorios.length,
    terminado: concluidos === obrigatorios.length,
  };
}
