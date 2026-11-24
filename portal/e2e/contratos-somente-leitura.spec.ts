import { expect, test } from "@playwright/test";

// BP-29: contrato grava com escrita em CRM ou Financeiro (0017). Quem não edita
// nenhum dos dois (na matriz padrão, o operacional) vê os contratos sem botão
// que leve a uma recusa da RLS. Use um membro operacional com "Lê" em crm e
// financeiro: o financeiro edita contratos e não serve para este teste.
const email = process.env.E2E_READONLY_EMAIL;
const password = process.env.E2E_READONLY_PASSWORD;

test.describe("Contratos / somente leitura", () => {
  test.skip(!email || !password, "Defina E2E_READONLY_EMAIL e E2E_READONLY_PASSWORD (membro operacional).");

  test("quem não edita CRM nem Financeiro vê os contratos sem criar, alterar nem excluir", async ({ page }) => {
    const recusas: string[] = [];
    page.on("response", (response) => {
      if (!/\/rest\/v1\/(contract|installments)/.test(response.url())) return;
      if (response.status() === 403) recusas.push(`${response.request().method()} ${response.url()}`);
    });

    await page.goto("/auth");
    await page.getByLabel("E-mail").fill(email!);
    await page.getByLabel("Senha", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/dashboard/contratos");
    await expect(page.getByRole("status").filter({ hasText: "Somente leitura" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Novo contrato/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Excluir contrato" })).toHaveCount(0);

    const linhas = page.locator("tbody tr");
    if (await linhas.count()) {
      await linhas.first().click();
      const detalhe = page.getByRole("dialog");
      await expect(detalhe.getByRole("button", { name: /^Editar$/ })).toHaveCount(0);
      await expect(detalhe.getByRole("button", { name: /Marcar como assinado/ })).toHaveCount(0);
      await expect(detalhe.getByRole("button", { name: "Remover arquivo" })).toHaveCount(0);
    }

    expect(recusas).toEqual([]);
  });
});
