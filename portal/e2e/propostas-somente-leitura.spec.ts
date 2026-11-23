import { expect, test } from "@playwright/test";

// BP-2: quem só lê "Funil e captação" (na matriz padrão, operacional e
// financeiro) vê as propostas, mas não ganha botão que leve a um 403 da RLS.
// Use um membro com "Lê" em vendas na organização ativa.
const email = process.env.E2E_READONLY_EMAIL;
const password = process.env.E2E_READONLY_PASSWORD;

test.describe("Propostas / somente leitura", () => {
  test.skip(!email || !password, "Defina E2E_READONLY_EMAIL e E2E_READONLY_PASSWORD (membro que só lê vendas).");

  test("quem só lê o funil vê as propostas sem os botões de criar, gerar e excluir", async ({ page }) => {
    const recusas: string[] = [];
    page.on("response", async (response) => {
      if (!response.url().includes("/rest/v1/proposal")) return;
      if (response.status() === 403) recusas.push(`${response.request().method()} ${response.url()}`);
    });

    await page.goto("/auth");
    await page.getByLabel("E-mail").fill(email!);
    await page.getByLabel("Senha", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/dashboard/propostas");
    await expect(page.getByRole("heading", { name: "Propostas", exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Somente leitura" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Proposta Inteligente/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Gerar com IA/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Nova proposta/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Excluir/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Funil/ })).toHaveCount(0);

    expect(recusas).toEqual([]);
  });
});
