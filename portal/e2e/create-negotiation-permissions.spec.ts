import { expect, test } from "@playwright/test";

const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

const uniqueBrand = () => `E2E Permissão ${Date.now()}`;

test.describe("Pipeline / Nova negociação", () => {
  test.skip(!email || !password, "Defina E2E_USER_EMAIL e E2E_USER_PASSWORD para executar este E2E autenticado.");

  test("cria uma nova negociação na organização ativa sem erro de permissão", async ({ page }) => {
    const permissionErrors: string[] = [];

    page.on("response", async (response) => {
      const url = response.url();
      if (!url.includes("/rest/v1/opportunities") && !url.includes("/functions/v1/log-db-error")) return;
      const body = await response.text().catch(() => "");
      if (response.status() >= 400 || body.includes("row-level security") || body.includes("permission denied")) {
        permissionErrors.push(`${response.status()} ${url} ${body}`);
      }
    });

    await page.goto("/auth");
    await page.getByLabel("E-mail").fill(email!);
    await page.getByLabel("Senha").fill(password!);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/dashboard/pipeline");
    await expect(page.getByRole("heading", { name: "Pipeline comercial" })).toBeVisible();

    const brand = uniqueBrand();
    await page.getByRole("button", { name: /Nova oportunidade|Nova negociação/ }).click();
    await page.getByLabel("Marca *").fill(brand);
    await page.getByLabel("Valor (R$)").fill("1234");
    await page.getByRole("button", { name: "Criar" }).click();

    await expect(page.getByText("Oportunidade criada")).toBeVisible();
    await expect(page.getByText(brand)).toBeVisible();
    expect(permissionErrors).toEqual([]);
  });
});
