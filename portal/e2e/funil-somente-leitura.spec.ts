import { expect, test } from "@playwright/test";

// BP-29: quem só lê "Funil e captação" (na matriz padrão, operacional e
// financeiro) vê o pipeline e o ranking de leads, mas não ganha botão que leve
// a uma recusa da RLS. Mesmo usuário da propostas-somente-leitura.
const email = process.env.E2E_READONLY_EMAIL;
const password = process.env.E2E_READONLY_PASSWORD;

test.describe("Funil / somente leitura", () => {
  test.skip(!email || !password, "Defina E2E_READONLY_EMAIL e E2E_READONLY_PASSWORD (membro que só lê vendas).");

  test("quem só lê o funil vê o pipeline e o lead scoring sem criar, mover nem gerar", async ({ page }) => {
    const recusas: string[] = [];
    page.on("response", (response) => {
      if (!/\/rest\/v1\/(opportunit|lead_scores)/.test(response.url())) return;
      if (response.status() === 403) recusas.push(`${response.request().method()} ${response.url()}`);
    });

    await page.goto("/auth");
    await page.getByLabel("E-mail").fill(email!);
    await page.getByLabel("Senha", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/dashboard/pipeline");
    await expect(page.getByRole("status").filter({ hasText: "Somente leitura" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Nova oportunidade/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Arrastar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Excluir/ })).toHaveCount(0);

    await page.goto("/dashboard/lead-scoring");
    await expect(page.getByRole("status").filter({ hasText: "Somente leitura" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Gerar \/ Atualizar com IA/ })).toHaveCount(0);

    expect(recusas).toEqual([]);
  });
});
