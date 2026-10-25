import { describe, expect, it } from "vitest";
import { GOTRUE_MAILER_SUBJECTS, linkDeVerificacaoGotrue, normalizarLinkApiGotrue } from "./gotrueMailerLinks";

describe("gotrueMailerLinks", () => {
  it("normaliza localhost sem porta para o Kong local", () => {
    const link =
      "http://localhost/auth/v1/verify?token=abc&type=recovery&redirect_to=http://localhost:8080/resetar-senha";
    expect(normalizarLinkApiGotrue(link, "http://localhost:8010")).toBe(
      "http://localhost:8010/auth/v1/verify?token=abc&type=recovery&redirect_to=http://localhost:8080/resetar-senha",
    );
  });

  it("extrai link de verificação do HTML do Mailpit", () => {
    const html = '<a href="http://localhost/auth/v1/verify?token=x&amp;type=recovery">ok</a>';
    expect(linkDeVerificacaoGotrue(html, "", "http://localhost:8010")).toContain("http://localhost:8010/auth/v1/verify");
  });

  it("expõe assuntos alinhados ao compose (sanity)", () => {
    expect(GOTRUE_MAILER_SUBJECTS.recuperacao).toBe("Redefina sua senha do Brandplay");
    expect(Object.values(GOTRUE_MAILER_SUBJECTS).every((s) => s.includes("Brandplay"))).toBe(true);
  });
});
