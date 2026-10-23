import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import errosDaCamada from "../../../supabase/functions/_shared/ai/erros.ts?raw";
import {
  avisarErroDeIA,
  avisarIAParcial,
  CODIGOS_DE_ERRO_DE_IA,
  ehCodigoDeErroDeIA,
  lerErroDeIA,
  traduzirErroDeIA,
} from "./erroDeIA";

const { toastError, toastWarning } = vi.hoisted(() => ({ toastError: vi.fn(), toastWarning: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: toastError, warning: toastWarning } }));

function erroHttp(corpo: string, status = 402): FunctionsHttpError {
  return new FunctionsHttpError(new Response(corpo, { status, headers: { "Content-Type": "application/json" } }));
}

describe("códigos de erro de IA", () => {
  it("são os mesmos da camada de IA (_shared/ai/erros.ts)", () => {
    const lista = (nome: string) => {
      const bloco = errosDaCamada.match(new RegExp(`export const ${nome} = \\[([^\\]]*)\\]`));
      return [...(bloco?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    };
    const daCamada = [...lista("ERROS_DO_FORNECEDOR"), ...lista("BLOQUEIOS")];
    expect(daCamada.length).toBeGreaterThan(0);
    expect([...CODIGOS_DE_ERRO_DE_IA].sort()).toEqual(daCamada.sort());
  });

  it("reconhece só os códigos conhecidos", () => {
    expect(ehCodigoDeErroDeIA("orcamento_esgotado")).toBe(true);
    expect(ehCodigoDeErroDeIA("outro")).toBe(false);
    expect(ehCodigoDeErroDeIA(undefined)).toBe(false);
  });
});

describe("traduzirErroDeIA", () => {
  it("dá o título do caso e mantém a mensagem da função", () => {
    expect(
      traduzirErroDeIA({ error: "Os recursos de IA estão desativados para a sua organização.", codigo: "ia_desabilitada" }, "Erro ao gerar resumo"),
    ).toEqual({
      titulo: "IA desativada",
      descricao: "Os recursos de IA estão desativados para a sua organização.",
      codigo: "ia_desabilitada",
    });
  });

  it("chave do cliente com falha pede o suporte, sem citar fornecedor", () => {
    for (const codigo of ["chave_invalida", "sem_saldo"] as const) {
      const m = traduzirErroDeIA({ codigo }, "Erro");
      expect(m.titulo).toBe("IA indisponível para a sua organização");
      expect(m.descricao).toMatch(/suporte/);
      expect(m.descricao).not.toMatch(/openai|gemini|anthropic/i);
    }
  });

  it("cobre orçamento esgotado e limite de taxa mesmo sem a mensagem da função", () => {
    expect(traduzirErroDeIA({ codigo: "orcamento_esgotado" }, "Erro").titulo).toBe("Limite de IA atingido");
    expect(traduzirErroDeIA({ codigo: "limite_taxa" }, "Erro").descricao).toMatch(/Tente novamente/);
  });

  it("sem código conhecido, não é erro da camada: título da tela e mensagem da função", () => {
    expect(traduzirErroDeIA({ error: "Conta não encontrada" }, "Erro ao preparar")).toEqual({
      titulo: "Erro ao preparar",
      descricao: "Conta não encontrada",
      codigo: null,
    });
    expect(traduzirErroDeIA({ error: "x", codigo: "desconhecido" }, "Erro").codigo).toBeNull();
    expect(traduzirErroDeIA({}, "Erro").descricao).toMatch(/erro inesperado/);
  });
});

describe("lerErroDeIA", () => {
  it("lê o corpo da resposta fora de 2xx", async () => {
    const erro = erroHttp(JSON.stringify({ error: "O limite mensal foi atingido.", codigo: "orcamento_esgotado" }));
    expect(await lerErroDeIA(erro, null, "Erro")).toEqual({
      titulo: "Limite de IA atingido",
      descricao: "O limite mensal foi atingido.",
      codigo: "orcamento_esgotado",
    });
  });

  it("lê o erro devolvido em data com status 2xx", async () => {
    expect((await lerErroDeIA(null, { error: "Tarefa não encontrada" }, "Erro")).descricao).toBe("Tarefa não encontrada");
  });

  it("não mostra a mensagem técnica do invoke quando o corpo não é JSON", async () => {
    const m = await lerErroDeIA(erroHttp("<html>bad gateway</html>", 502), null, "Erro ao gerar");
    expect(m.titulo).toBe("Erro ao gerar");
    expect(m.descricao).not.toMatch(/non-2xx|Edge Function/);
  });

  it("falha de rede vira mensagem de conexão", async () => {
    const m = await lerErroDeIA(new FunctionsFetchError(new TypeError("Failed to fetch")), null, "Erro");
    expect(m.descricao).toMatch(/conexão/);
  });
});

describe("avisarErroDeIA", () => {
  it("mostra o toast com título e descrição traduzidos", async () => {
    await avisarErroDeIA(erroHttp(JSON.stringify({ error: "Aguarde.", codigo: "limite_taxa" }), 429), null, "Erro");
    expect(toastError).toHaveBeenCalledWith("Muitas solicitações de IA", { description: "Aguarde." });
  });
});

describe("avisarIAParcial", () => {
  it("avisa sem erro quando só a parte de IA falhou, e não faz nada sem aviso", () => {
    avisarIAParcial(undefined, "Recomendações indisponíveis");
    expect(toastWarning).not.toHaveBeenCalled();
    avisarIAParcial({ error: "O limite mensal foi atingido.", codigo: "orcamento_esgotado" }, "Recomendações indisponíveis");
    expect(toastWarning).toHaveBeenCalledWith("Limite de IA atingido", { description: "O limite mensal foi atingido." });
  });
});
