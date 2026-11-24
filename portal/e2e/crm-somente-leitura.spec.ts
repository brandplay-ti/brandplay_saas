import { expect, test } from "@playwright/test";

// BP-29: quem só lê "Patrocinadores e CRM" (na matriz padrão, operacional e
// financeiro) vê as contas, mas não ganha botão que leve a uma recusa da RLS.
// Mesmo usuário da propostas-somente-leitura: um membro com "Lê" em crm e em
// vendas na organização ativa, com ao menos um patrocinador cadastrado.
const email = process.env.E2E_READONLY_EMAIL;
const password = process.env.E2E_READONLY_PASSWORD;

test.describe("Patrocinadores / somente leitura", () => {
  test.skip(!email || !password, "Defina E2E_READONLY_EMAIL e E2E_READONLY_PASSWORD (membro que só lê crm).");

  test("quem só lê o CRM vê a lista e a conta sem os botões de criar e alterar", async ({ page }) => {
    const recusas: string[] = [];
    page.on("response", (response) => {
      if (!/\/rest\/v1\/(sponsor|crm_tasks)/.test(response.url())) return;
      if (response.status() === 403) recusas.push(`${response.request().method()} ${response.url()}`);
    });

    await page.goto("/auth");
    await page.getByLabel("E-mail").fill(email!);
    await page.getByLabel("Senha", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/dashboard/patrocinadores");
    await expect(page.getByRole("status").filter({ hasText: "Somente leitura" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Nova conta/ })).toHaveCount(0);

    // Abre a primeira conta da tabela (a visualização padrão).
    await page.locator("tbody tr").first().click();
    await expect(page).toHaveURL(/\/dashboard\/patrocinadores\/[0-9a-f-]{36}/);

    await expect(page.getByRole("status").filter({ hasText: "Somente leitura" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar dados da conta" })).toHaveCount(0);

    await page.getByRole("tab", { name: /Relacionamento/ }).click();
    await expect(page.getByRole("button", { name: /Adicionar tarefa/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Registrar interação/ })).toHaveCount(0);

    await page.getByRole("tab", { name: /Portal/ }).click();
    await expect(page.getByRole("button", { name: /Convidar/ })).toHaveCount(0);

    // Abrir pelo link de edição não abre o formulário para quem só lê.
    await page.goto(`${page.url().split("?")[0]}?edit=1`);
    await expect(page.getByRole("dialog", { name: "Editar dados da conta" })).toHaveCount(0);

    expect(recusas).toEqual([]);
  });
});
