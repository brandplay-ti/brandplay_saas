import { expect, test } from "@playwright/test";

// BP-29: entregas, projetos e ativos gravam com escrita em Entregas ou CRM
// (0017). Quem não edita nenhum dos dois (na matriz padrão, o financeiro) vê as
// telas sem botão que leve a uma recusa da RLS. Use um membro financeiro com
// "Lê" em operacional e crm: o operacional e o comercial editam estas telas.
const email = process.env.E2E_READONLY_FINANCEIRO_EMAIL;
const password = process.env.E2E_READONLY_FINANCEIRO_PASSWORD;

test.describe("Operacional / somente leitura", () => {
  test.skip(!email || !password, "Defina E2E_READONLY_FINANCEIRO_EMAIL e E2E_READONLY_FINANCEIRO_PASSWORD (membro financeiro).");

  test("quem não edita Entregas nem CRM vê entregas, projetos e ativos sem criar nem alterar", async ({ page }) => {
    const recusas: string[] = [];
    page.on("response", (response) => {
      if (!/\/rest\/v1\/(deliver|assets|asset_|sports_properties|property_)/.test(response.url())) return;
      if (response.status() === 403) recusas.push(`${response.request().method()} ${response.url()}`);
    });

    await page.goto("/auth");
    await page.getByLabel("E-mail").fill(email!);
    await page.getByLabel("Senha", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/dashboard/entregas");
    await expect(page.getByRole("status").filter({ hasText: "Somente leitura" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Nova entrega/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Arrastar" })).toHaveCount(0);

    await page.goto("/dashboard/propriedades");
    await expect(page.getByRole("status").filter({ hasText: "Somente leitura" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Novo projeto/ })).toHaveCount(0);

    await page.goto("/dashboard/ativos");
    await expect(page.getByRole("status").filter({ hasText: "Somente leitura" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Novo ativo/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Importar CSV/ })).toHaveCount(0);

    expect(recusas).toEqual([]);
  });
});
