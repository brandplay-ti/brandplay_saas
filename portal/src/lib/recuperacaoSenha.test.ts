import { describe, expect, it } from "vitest";
import {
  lerErroDoLink,
  lerOrigem,
  linkParaEsqueciSenha,
  mensagemErroPedido,
  mensagemErroRedefinicao,
  novaSenhaSchema,
  pedidoRecuperacaoSchema,
  urlDeRedefinicao,
} from "./recuperacaoSenha";

describe("pedidoRecuperacaoSchema", () => {
  it("normaliza o e-mail", () => {
    expect(pedidoRecuperacaoSchema.parse({ email: "  Fulano@Empresa.COM " })).toEqual({
      email: "fulano@empresa.com",
    });
  });

  it("recusa vazio e e-mail inválido com mensagens próprias", () => {
    const vazio = pedidoRecuperacaoSchema.safeParse({ email: "   " });
    expect(vazio.success).toBe(false);
    expect(vazio.error?.issues[0].message).toBe("Informe seu e-mail.");

    const invalido = pedidoRecuperacaoSchema.safeParse({ email: "fulano@" });
    expect(invalido.error?.issues[0].message).toBe("Informe um e-mail válido.");
  });
});

describe("novaSenhaSchema", () => {
  it("aceita senha com o mínimo e confirmação igual", () => {
    expect(novaSenhaSchema.safeParse({ senha: "123456", confirmacao: "123456" }).success).toBe(true);
  });

  it("recusa senha curta, longa demais ou confirmação diferente", () => {
    expect(novaSenhaSchema.safeParse({ senha: "12345", confirmacao: "12345" }).success).toBe(false);
    expect(novaSenhaSchema.safeParse({ senha: "a".repeat(73), confirmacao: "a".repeat(73) }).success).toBe(false);

    const diferente = novaSenhaSchema.safeParse({ senha: "1234567", confirmacao: "7654321" });
    expect(diferente.error?.issues[0]).toMatchObject({ path: ["confirmacao"], message: "As senhas não coincidem." });
  });
});

describe("origem do login", () => {
  it("só reconhece o portal; qualquer outro valor volta ao painel", () => {
    expect(lerOrigem("portal")).toBe("portal");
    expect(lerOrigem(null)).toBe("painel");
    expect(lerOrigem("https://malicioso.example")).toBe("painel");
  });

  it("monta o retorno do e-mail e o link da tela de pedido", () => {
    expect(urlDeRedefinicao("https://brandplay.com.br", "painel")).toBe("https://brandplay.com.br/resetar-senha");
    expect(urlDeRedefinicao("http://localhost:8080", "portal")).toBe(
      "http://localhost:8080/resetar-senha?destino=portal",
    );
    expect(linkParaEsqueciSenha("painel")).toBe("/esqueci-senha");
    expect(linkParaEsqueciSenha("portal")).toBe("/esqueci-senha?destino=portal");
  });
});

describe("lerErroDoLink", () => {
  it("não vê erro num link com sessão ou sem parâmetros", () => {
    expect(lerErroDoLink("http://localhost:8080/resetar-senha")).toBeNull();
    expect(
      lerErroDoLink("http://localhost:8080/resetar-senha#access_token=x&type=recovery&refresh_token=y"),
    ).toBeNull();
  });

  it("reconhece link vencido no fragmento", () => {
    const url =
      "http://localhost:8080/resetar-senha?destino=portal#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";
    expect(lerErroDoLink(url)).toMatch(/expirou ou já foi usado/);
  });

  it("reconhece erro genérico também na query", () => {
    expect(lerErroDoLink("http://localhost:8080/resetar-senha?error=server_error")).toMatch(/não é válido/);
  });
});

describe("mensagens de erro", () => {
  it("pedido: limite de envio e falha genérica", () => {
    expect(mensagemErroPedido({ status: 429, code: "over_email_send_rate_limit" })).toMatch(/Aguarde um minuto/);
    expect(mensagemErroPedido({ status: 500 })).toMatch(/Não foi possível enviar/);
  });

  it("redefinição: mesma senha, senha fraca, sessão vencida e genérico", () => {
    expect(mensagemErroRedefinicao({ status: 422, code: "same_password" })).toMatch(/diferente da atual/);
    expect(mensagemErroRedefinicao({ status: 422, code: "weak_password" })).toMatch(/fraca/);
    expect(mensagemErroRedefinicao({ status: 403, code: "session_not_found" })).toMatch(/Peça um novo link/);
    expect(mensagemErroRedefinicao({ status: 500 })).toMatch(/Não foi possível redefinir/);
  });
});
