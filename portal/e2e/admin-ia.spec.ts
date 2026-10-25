import { expect, test, type Page } from "@playwright/test";

const superadmin = {
  email: process.env.E2E_SUPERADMIN_EMAIL ?? "superadmin@brandplay.local",
  password: process.env.E2E_SUPERADMIN_PASSWORD ?? "brandplay-dev",
};
const owner = {
  email: process.env.E2E_USER_EMAIL ?? "owner@brandplay.local",
  password: process.env.E2E_USER_PASSWORD ?? "brandplay-dev",
};

async function entrar(page: Page, email: string, password: string) {
  await page.goto("/auth");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function irParaIaAdmin(page: Page) {
  await page.getByRole("navigation", { name: "Administração" }).getByRole("link", { name: "IA" }).click();
  await expect(page).toHaveURL(/\/admin\/ia$/);
}

test.describe("Administração — IA (IA-29)", () => {
  test("superadmin acessa a lista de IA", async ({ page }) => {
    await entrar(page, superadmin.email, superadmin.password);
    await expect(page).toHaveURL(/\/admin$/);

    await irParaIaAdmin(page);
    await expect(page.getByRole("heading", { name: "IA dos clientes" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Chave padrão da plataforma" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("owner comum não acessa /admin/ia", async ({ page }) => {
    await entrar(page, owner.email, owner.password);
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/admin/ia");
    await expect(page.getByText("Acesso restrito")).toBeVisible();
  });

  test("chave inválida no testar conexão mostra erro e não fecha o diálogo", async ({ page }) => {
    await entrar(page, superadmin.email, superadmin.password);
    await irParaIaAdmin(page);

    await page.getByRole("button", { name: /Cadastrar chave padrão|Trocar chave padrão/ }).click();
    const dialogo = page.getByRole("dialog", { name: "Chave padrão da plataforma" });
    await expect(dialogo).toBeVisible();
    await dialogo.getByLabel("Chave de API").fill("chave-invalida-smoke-e2e-0123456789");
    await dialogo.getByRole("button", { name: "Testar conexão" }).click();
    await expect(page.getByText(/Teste de conexão falhou|falhou|indisponível/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("orçamento salvo no detalhe aparece na lista", async ({ page }) => {
    const org = "Brandplay Demo";
    const valor = "1500";

    await entrar(page, superadmin.email, superadmin.password);
    await irParaIaAdmin(page);

    await page.getByRole("row", { name: new RegExp(org) }).getByRole("link", { name: "Detalhe" }).click();
    await expect(page).toHaveURL(/\/admin\/ia\/clientes\//);

    await page.getByLabel("Orçamento mensal (R$)").fill(valor);
    await page.getByLabel("Comentário (auditoria)").fill("e2e orcamento ia admin");
    await page.getByRole("button", { name: "Salvar configuração" }).click();

    await expect(page.getByText("Configuração de IA salva.")).toBeVisible({ timeout: 15_000 });

    await irParaIaAdmin(page);

    const linha = page.getByRole("row", { name: new RegExp(org) });
    await expect(linha).toContainText("R$ 1.500,00");
    await expect(linha).toContainText(/0%|—/);
  });
});
