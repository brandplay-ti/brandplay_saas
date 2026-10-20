import { expect, test, type Page } from "@playwright/test";

// Recuperação de senha de ponta a ponta: o GoTrue do stack local entrega o
// e-mail no Mailpit (docker/supabase), de onde o teste tira o link. Usa uma
// conta nova por execução para não mexer na senha dos usuários do seed.
// O onboarding segue sozinho para o painel quando não há o que configurar.
const DEPOIS_DO_LOGIN = /\/(onboarding\/organizacao|dashboard)/;
const mailpit = (process.env.E2E_MAILPIT_URL ?? "http://localhost:8026").replace(/\/$/, "");

interface MensagemMailpit {
  ID: string;
}

async function linkDeRecuperacao(page: Page, email: string): Promise<string> {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const r = await page.request.get(`${mailpit}/api/v1/search`, { params: { query: `to:"${email}"` } });
        const corpo = (await r.json()) as { messages: MensagemMailpit[] };
        id = corpo.messages[0]?.ID;
        return id;
      },
      { message: `e-mail de recuperação para ${email} no Mailpit (${mailpit})`, timeout: 20_000 },
    )
    .toBeTruthy();

  const r = await page.request.get(`${mailpit}/api/v1/message/${id}`);
  const { HTML, Text } = (await r.json()) as { HTML: string; Text: string };
  const link = (HTML.match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)?.[1] ?? Text.match(/https?:\/\/\S*\/auth\/v1\/verify\S*/)?.[0])
    ?.replace(/&amp;/g, "&");
  expect(link, "link de verificação no corpo do e-mail").toBeTruthy();
  return link!;
}

async function criarConta(page: Page, email: string, senha: string) {
  await page.goto("/auth?mode=signup");
  await page.getByLabel("Nome completo").fill("E2E Recuperação");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(senha);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(DEPOIS_DO_LOGIN);
}

test.describe("Recuperação de senha", () => {
  test("pede o link, define nova senha e entra com ela", async ({ browser }) => {
    const email = `e2e-recuperacao-${Date.now()}@brandplay.local`;
    const senhaAntiga = "senha-antiga-e2e";
    const senhaNova = "senha-nova-e2e";

    const cadastro = await browser.newContext();
    await criarConta(await cadastro.newPage(), email, senhaAntiga);
    await cadastro.close();

    // Sessão limpa: quem esqueceu a senha não está logado.
    const contexto = await browser.newContext();
    const page = await contexto.newPage();

    await page.goto("/auth");
    await page.getByRole("link", { name: "Esqueci minha senha" }).click();
    await expect(page).toHaveURL(/\/esqueci-senha$/);
    await page.getByLabel("E-mail").fill(email);
    await page.getByRole("button", { name: "Enviar link de recuperação" }).click();
    await expect(page.getByText(/enviamos um link para criar uma nova senha/)).toBeVisible();

    await page.goto(await linkDeRecuperacao(page, email));
    await expect(page).toHaveURL(/\/resetar-senha/);
    await expect(page.getByText(email)).toBeVisible();

    await page.getByLabel("Nova senha", { exact: true }).fill(senhaNova);
    await page.getByLabel("Confirmar nova senha").fill(senhaNova);
    await page.getByRole("button", { name: "Redefinir senha" }).click();
    await expect(page.getByRole("heading", { name: "Senha redefinida" })).toBeVisible();
    await contexto.close();

    // A senha antiga deixa de valer; a nova entra.
    const login = await browser.newContext();
    const tela = await login.newPage();
    await tela.goto("/auth");
    await tela.getByLabel("E-mail").fill(email);
    await tela.getByLabel("Senha", { exact: true }).fill(senhaAntiga);
    await tela.getByRole("button", { name: "Entrar" }).click();
    await expect(tela.getByText("E-mail ou senha incorretos.")).toBeVisible();

    await tela.getByLabel("Senha", { exact: true }).fill(senhaNova);
    await tela.getByRole("button", { name: "Entrar" }).click();
    await expect(tela).toHaveURL(DEPOIS_DO_LOGIN);
    await login.close();
  });

  test("link usado ou vencido leva a pedir um novo", async ({ page }) => {
    await page.goto("/resetar-senha?destino=portal#error=access_denied&error_code=otp_expired");
    await expect(page.getByRole("heading", { name: "Link inválido" })).toBeVisible();
    await page.getByRole("link", { name: "Pedir um novo link" }).click();
    await expect(page).toHaveURL(/\/esqueci-senha\?destino=portal$/);
    await expect(page.getByRole("link", { name: /Voltar para o login/ })).toHaveAttribute("href", "/portal/login");
  });
});
