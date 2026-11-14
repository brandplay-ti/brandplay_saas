import { describe, expect, it } from "vitest";
import type { NavModule } from "@/lib/navegacao";
import { montarGuia, passosVisiveis, type ContagensDosPassos } from "./primeirosPassos";

const vazio: ContagensDosPassos = {
  kitDeMarca: 0,
  projetos: 0,
  cotas: 0,
  patrocinadores: 0,
  oportunidades: 0,
  propostas: 0,
  contratos: 0,
  entregas: 0,
  membros: 1,
  acessosAoPortal: 0,
};

const tudo = (): boolean => true;
const so = (...modulos: NavModule[]) => (m: NavModule) => modulos.includes(m);
const ids = (acesso: Parameters<typeof passosVisiveis>[0]) => passosVisiveis(acesso).map((p) => p.id);

describe("passosVisiveis", () => {
  it("agência owner: projeto antes do patrocinador, funil antes do contrato", () => {
    expect(ids({ clientType: "agencia", isAdmin: true, can: tudo })).toEqual([
      "marca",
      "projeto",
      "cotas",
      "patrocinador",
      "oportunidade",
      "proposta",
      "contrato",
      "entregas",
      "equipe",
      "portal",
    ]);
  });

  it("marca: cadastra a si mesma primeiro e não tem funil, proposta nem portal", () => {
    // `can` da marca já nega vendas; o guia não depende disso para esconder.
    expect(ids({ clientType: "marca", isAdmin: true, can: tudo })).toEqual([
      "marca",
      "patrocinador",
      "projeto",
      "cotas",
      "contrato",
      "entregas",
      "equipe",
    ]);
  });

  it("comercial sem módulo team não vê cores, equipe nem portal", () => {
    expect(ids({ clientType: "agencia", isAdmin: false, can: so("crm", "vendas") })).toEqual([
      "projeto",
      "cotas",
      "patrocinador",
      "oportunidade",
      "proposta",
      "contrato",
      "entregas",
    ]);
  });

  it("financeiro vê só o contrato", () => {
    expect(ids({ clientType: "agencia", isAdmin: false, can: so("financeiro") })).toEqual(["contrato"]);
  });

  it("operacional vê projeto, cotas e entregas", () => {
    expect(ids({ clientType: "agencia", isAdmin: false, can: so("operacional") })).toEqual([
      "projeto",
      "cotas",
      "entregas",
    ]);
  });
});

describe("montarGuia", () => {
  const owner = { clientType: "agencia" as const, isAdmin: true, can: tudo };

  it("organização nova: nada feito, opcionais fora da conta", () => {
    const guia = montarGuia(owner, vazio);
    expect(guia.total).toBe(8);
    expect(guia.concluidos).toBe(0);
    expect(guia.terminado).toBe(false);
  });

  it("conclui cada passo pela contagem do cadastro", () => {
    const guia = montarGuia(owner, { ...vazio, kitDeMarca: 1, projetos: 2, cotas: 1 });
    const feitos = guia.passos.filter((p) => p.concluido).map((p) => p.id);
    expect(feitos).toEqual(["marca", "projeto", "cotas"]);
    expect(guia.concluidos).toBe(3);
  });

  it("equipe conta a partir do segundo membro", () => {
    const sozinho = montarGuia(owner, vazio).passos.find((p) => p.id === "equipe");
    const comEquipe = montarGuia(owner, { ...vazio, membros: 2 }).passos.find((p) => p.id === "equipe");
    expect(sozinho?.concluido).toBe(false);
    expect(comEquipe?.concluido).toBe(true);
  });

  it("termina com os obrigatórios feitos, mesmo sem os opcionais", () => {
    const guia = montarGuia(owner, {
      ...vazio,
      kitDeMarca: 1,
      projetos: 1,
      cotas: 1,
      patrocinadores: 1,
      oportunidades: 1,
      propostas: 1,
      contratos: 1,
      entregas: 1,
    });
    expect(guia.terminado).toBe(true);
    expect(guia.passos.find((p) => p.id === "portal")?.concluido).toBe(false);
  });

  it("o progresso de cada membro olha só os passos dele", () => {
    const financeiro = { clientType: "agencia" as const, isAdmin: false, can: so("financeiro") };
    expect(montarGuia(financeiro, vazio).terminado).toBe(false);
    expect(montarGuia(financeiro, { ...vazio, contratos: 1 }).terminado).toBe(true);
  });

  it("sem nenhum passo visível o guia já está terminado", () => {
    const semModulo = { clientType: "agencia" as const, isAdmin: false, can: () => false };
    const guia = montarGuia(semModulo, vazio);
    expect(guia.passos).toEqual([]);
    expect(guia.terminado).toBe(true);
  });
});
