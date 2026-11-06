import { describe, expect, it } from "vitest";
import { mensagemDeErroDoConvite } from "@/lib/convites";

describe("mensagemDeErroDoConvite", () => {
  it("transforma o limite de usuários em aviso para quem convidou", () => {
    const erro = { message: "Limite de usuários do plano Starter atingido.", hint: "limite_plano:usuarios", details: "pro" };
    expect(mensagemDeErroDoConvite(erro, "Clube X")).toBe(
      "Clube X atingiu o limite de usuários do plano. Avise quem enviou o convite.",
    );
  });

  it("organização sem plano", () => {
    const erro = { message: "Sem plano", hint: "limite_plano:sem_plano", details: null };
    expect(mensagemDeErroDoConvite(erro, "Clube X")).toBe("Clube X está sem plano ativo. Avise quem enviou o convite.");
  });

  it("repassa a mensagem do banco", () => {
    expect(mensagemDeErroDoConvite({ message: "Convite inválido ou expirado" }, "Clube X")).toBe(
      "Convite inválido ou expirado",
    );
  });

  it("erro sem mensagem", () => {
    expect(mensagemDeErroDoConvite(null, "Clube X")).toBe("Não foi possível concluir. Tente de novo.");
    expect(mensagemDeErroDoConvite({ message: "  " }, "Clube X")).toBe("Não foi possível concluir. Tente de novo.");
  });
});
