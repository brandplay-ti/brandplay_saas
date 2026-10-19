import { expect, test, type Page } from "@playwright/test";

// Área administrativa da plataforma (ADR-0008). Usa os usuários do seed local
// (supabase/seed/00-seed.sql): o superadmin, sem organização, e o owner comum.
const superadmin = { email: process.env.E2E_SUPERADMIN_EMAIL, password: process.env.E2E_SUPERADMIN_PASSWORD };
const owner = { email: process.env.E2E_USER_EMAIL, password: process.env.E2E_USER_PASSWORD };

async function entrar(page: Page, email: string, password: string) {
  await page.goto("/auth");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

/** Falha o teste em qualquer resposta >= 400 da API do Supabase. */
function vigiarErros(page: Page) {
  const erros: string[] = [];
  page.on("response", (r) => {
    if (/\/(rest|functions|auth)\/v1\//.test(r.url()) && r.status() >= 400) erros.push(`${r.status()} ${r.url()}`);
  });
  return erros;
}

test.describe("Superadmin da plataforma", () => {
  test("superadmin sem organização entra direto na administração", async ({ page }) => {
    test.skip(!superadmin.email || !superadmin.password, "Defina E2E_SUPERADMIN_EMAIL e E2E_SUPERADMIN_PASSWORD.");
    const erros = vigiarErros(page);

    await entrar(page, superadmin.email!, superadmin.password!);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();

    await page.getByRole("link", { name: "Clientes" }).first().click();
    await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();

    await page.getByRole("link", { name: "Planos" }).click();
    await expect(page.getByRole("button", { name: "Editar Starter" })).toBeVisible();

    await page.getByRole("link", { name: "Faturamento" }).click();
    await expect(page.getByText("Receita recebida por mês")).toBeVisible();

    expect(erros).toEqual([]);
  });

  test("owner comum não vê a administração", async ({ page }) => {
    test.skip(!owner.email || !owner.password, "Defina E2E_USER_EMAIL e E2E_USER_PASSWORD.");
    const erros = vigiarErros(page);

    await entrar(page, owner.email!, owner.password!);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("link", { name: "Administração" })).toHaveCount(0);

    await page.goto("/admin/clientes");
    await expect(page.getByText("Acesso restrito")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);

    expect(erros).toEqual([]);
  });
});
