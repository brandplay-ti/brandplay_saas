import { expect, test, type Page } from "@playwright/test";

// Plano mobile (MOB-19, docs/architecture/plano-versao-mobile.md): fumaça das
// páginas abertas a qualquer visitante, nos projetos mobile-android e
// mobile-ios. Não depende de usuário nem de dado do seed: confere que a página
// cabe na largura do celular, que nenhum campo faz o iOS dar zoom e que os
// botões têm tamanho de toque (MOB-08).
const PAGINAS = [
  { nome: "início", rota: "/" },
  { nome: "login", rota: "/auth" },
  { nome: "cadastro", rota: "/auth?mode=signup" },
  { nome: "esqueci a senha", rota: "/esqueci-senha" },
  { nome: "login do portal do patrocinador", rota: "/portal/login" },
];

/** Largura que passa da tela, em px (0 quando cabe). */
async function excessoHorizontal(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/** Campos visíveis com fonte menor que 16px: o Safari do iOS dá zoom ao focá-los. */
async function camposQueDaoZoom(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("input, textarea, select, [role='combobox']"))
      .filter((el) => {
        const caixa = el.getBoundingClientRect();
        const tipo = el.getAttribute("type");
        return caixa.width > 0 && caixa.height > 0 && tipo !== "checkbox" && tipo !== "radio" && tipo !== "hidden";
      })
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => {
        const rotulo = el.getAttribute("aria-label") ?? el.getAttribute("name") ?? el.id ?? "";
        return `${el.tagName.toLowerCase()}${rotulo ? ` "${rotulo}"` : ""} (${getComputedStyle(el).fontSize})`;
      }),
  );
}

/**
 * Botões visíveis com altura abaixo de 40px (MOB-08). O `Button` tem 44px no
 * celular e o `size="sm"` tem 40px, que é o piso aceito aqui. Fica de fora o
 * `<button>` com outro papel (o Checkbox do Radix é `role="checkbox"`): o
 * alvo de toque dele é o rótulo.
 */
async function botoesPequenos(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("button:not([role]), [role='button']"))
      .filter((el) => {
        const caixa = el.getBoundingClientRect();
        const estilo = getComputedStyle(el);
        return caixa.width > 0 && caixa.height > 0 && estilo.visibility !== "hidden" && estilo.opacity !== "0";
      })
      .filter((el) => el.getBoundingClientRect().height < 40)
      .map((el) => {
        const nome = el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "";
        return `"${nome}" (${Math.round(el.getBoundingClientRect().height)}px)`;
      }),
  );
}

test.describe("Páginas públicas no celular @mobile", () => {
  for (const { nome, rota } of PAGINAS) {
    test(`${nome} cabe na largura da tela, não dá zoom nos campos e tem botões tocáveis`, async ({ page }) => {
      await page.goto(rota);
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      // Página que quebrou ao montar também "cabe na tela": exige conteúdo.
      // getByRole ignora os títulos escondidos no celular (painel lateral só do desktop).
      await expect(page.getByRole("heading").first(), `título visível em ${rota}`).toBeVisible();

      expect(await excessoHorizontal(page), `rolagem horizontal em ${rota}`).toBeLessThanOrEqual(0);
      expect(await camposQueDaoZoom(page), `campos com fonte abaixo de 16px em ${rota}`).toEqual([]);
      expect(await botoesPequenos(page), `botões abaixo de 40px em ${rota}`).toEqual([]);
    });
  }
});
