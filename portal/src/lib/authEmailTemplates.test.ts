import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GOTRUE_MAILER_SUBJECTS } from "./gotrueMailerLinks";

/** Raiz do monorepo (portal/src/lib → ../../../). */
const repoRoot = join(import.meta.dirname, "../../..");
const templatesDir = join(repoRoot, "docker/files/volumes/auth/templates");

const ENGLISH_GOTRUE_MARKERS = [/Reset Your Password/i, /Confirm your signup/i, /Magic Link/i];

describe("templates HTML de autenticação (GoTrue)", () => {
  const arquivos = readdirSync(templatesDir).filter((f) => f.endsWith(".html"));

  it("lista os seis templates versionados", () => {
    expect(arquivos.sort()).toEqual(
      ["confirmacao.html", "convite.html", "link-de-acesso.html", "reautenticacao.html", "recuperacao.html", "troca-de-email.html"].sort(),
    );
  });

  it("assuntos batem com GOTRUE_MAILER_SUBJECTS_* do docker-compose", () => {
    const compose = readFileSync(join(repoRoot, "docker/supabase/docker-compose.yml"), "utf8");
    for (const assunto of Object.values(GOTRUE_MAILER_SUBJECTS)) {
      expect(compose).toContain(assunto);
    }
  });

  for (const nome of arquivos) {
    it(`${nome} está em PT-BR com layout Brandplay e placeholders do GoTrue`, () => {
      const html = readFileSync(join(templatesDir, nome), "utf8");
      expect(html).toContain('lang="pt-BR"');
      expect(html).toContain("Brandplay");
      expect(html).toContain("#6206C8");

      for (const re of ENGLISH_GOTRUE_MARKERS) {
        expect(html).not.toMatch(re);
      }

      if (nome === "reautenticacao.html") {
        expect(html).toContain("{{ .Token }}");
        expect(html).toContain("{{ .Email }}");
      } else {
        expect(html).toContain("{{ .ConfirmationURL }}");
      }
    });
  }
});
