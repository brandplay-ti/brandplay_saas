import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { baseUrlSupabasePublica } from "../src/lib/gotrueMailerLinks";

// Pastas do material da edição (BP-7.04, 0049) contra o Supabase local.
// O teste cria um projeto e uma edição próprios pela API, com a sessão do
// owner do seed, e apaga os dois no fim (a exclusão do projeto leva as
// pastas junto).

const owner = {
  email: process.env.E2E_USER_EMAIL ?? "owner@brandplay.local",
  password: process.env.E2E_USER_PASSWORD ?? "brandplay-dev",
};
const supabaseUrl = baseUrlSupabasePublica();
const anonKey = process.env.E2E_SUPABASE_ANON_KEY ?? process.env.VITE_PUBLIC_SUPABASE_ANON_KEY ?? "";

type Sessao = { token: string; orgId: string; userId: string };

async function sessaoDoOwner(request: APIRequestContext): Promise<Sessao> {
  const login = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey },
    data: { email: owner.email, password: owner.password },
  });
  expect(login.ok(), "login do owner pela API").toBeTruthy();
  const { access_token: token, user } = (await login.json()) as { access_token: string; user: { id: string } };
  const membros = await request.get(`${supabaseUrl}/rest/v1/organization_members`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    params: { select: "organization_id", user_id: `eq.${user.id}`, status: "eq.ativo", limit: "1" },
  });
  const [membro] = (await membros.json()) as Array<{ organization_id: string }>;
  return { token, orgId: membro.organization_id, userId: user.id };
}

async function criarProjeto(request: APIRequestContext, s: Sessao, dados: Record<string, unknown>): Promise<string> {
  const r = await request.post(`${supabaseUrl}/rest/v1/sports_properties`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${s.token}`, Prefer: "return=representation" },
    data: { organization_id: s.orgId, owner_id: s.userId, category: "campeonato", ...dados },
  });
  expect(r.ok(), `criar ${String(dados.name)}: ${await r.text()}`).toBeTruthy();
  const [linha] = (await r.json()) as Array<{ id: string }>;
  return linha.id;
}

async function apagarProjeto(request: APIRequestContext, s: Sessao, id: string) {
  await request.delete(`${supabaseUrl}/rest/v1/sports_properties`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${s.token}` },
    params: { id: `eq.${id}` },
  });
}

async function entrar(page: Page) {
  await page.goto("/auth");
  await page.getByLabel("E-mail").fill(owner.email);
  await page.getByLabel("Senha", { exact: true }).fill(owner.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("Material da edição — pastas (BP-7.04)", () => {
  test.skip(!anonKey, "precisa de E2E_SUPABASE_ANON_KEY (ou VITE_PUBLIC_SUPABASE_ANON_KEY) do stack local");

  let sessao: Sessao;
  let raiz: string;
  let edicao: string;
  const sufixo = Date.now().toString(36);

  test.beforeEach(async ({ request }) => {
    sessao = await sessaoDoOwner(request);
    raiz = await criarProjeto(request, sessao, { name: `E2E Copa ${sufixo}` });
    edicao = await criarProjeto(request, sessao, {
      name: `E2E Copa ${sufixo} 2026`,
      parent_property_id: raiz,
      season_year: 2026,
    });
  });

  test.afterEach(async ({ request }) => {
    // A edição primeiro: apagar a raiz só solta a edição (on delete set null).
    if (edicao) await apagarProjeto(request, sessao, edicao);
    if (raiz) await apagarProjeto(request, sessao, raiz);
  });

  test("cria, renomeia, move, arquiva e desarquiva pastas", async ({ page }) => {
    await entrar(page);
    await page.goto(`/dashboard/propriedades/${edicao}`);
    await page.getByRole("tab", { name: "Material" }).click();

    const card = page.getByRole("tabpanel", { name: "Material" });
    await expect(card.getByText(`E2E Copa ${sufixo}`, { exact: true })).toBeVisible();
    await expect(card.getByText("Nenhuma pasta ainda")).toBeVisible();

    const criarPasta = async (nome: string) => {
      await card.getByRole("button", { name: "Nova pasta" }).first().click();
      const dialogo = page.getByRole("dialog", { name: "Nova pasta" });
      await dialogo.getByLabel("Nome").fill(nome);
      await dialogo.getByRole("button", { name: "Criar pasta" }).click();
      await expect(dialogo).toBeHidden();
    };

    await criarPasta("Jogo 1");
    await criarPasta("Jogo 2");

    // Nome repetido no mesmo nível, sem diferença de maiúsculas.
    await card.getByRole("button", { name: "Nova pasta" }).first().click();
    const repetida = page.getByRole("dialog", { name: "Nova pasta" });
    await repetida.getByLabel("Nome").fill("jogo 1");
    await expect(repetida.getByText("Já existe uma pasta com esse nome aqui.")).toBeVisible();
    await expect(repetida.getByRole("button", { name: "Criar pasta" })).toBeDisabled();
    await repetida.getByRole("button", { name: "Cancelar" }).click();

    // Subpasta dentro de Jogo 1, e volta pela trilha.
    await card.getByRole("button", { name: /^Jogo 1/ }).click();
    await criarPasta("Câmera 1");
    await expect(card.getByRole("button", { name: /^Câmera 1/ })).toBeVisible();
    await card.getByRole("button", { name: "Material", exact: true }).click();
    await expect(card.getByText("1 item")).toBeVisible();

    // Renomear Jogo 2.
    await card.getByRole("button", { name: "Ações da pasta Jogo 2" }).click();
    await page.getByRole("menuitem", { name: "Renomear" }).click();
    const renomear = page.getByRole("dialog", { name: "Renomear pasta" });
    await renomear.getByLabel("Nome").fill("Final");
    await renomear.getByRole("button", { name: "Salvar" }).click();
    await expect(card.getByRole("button", { name: /^Final/ })).toBeVisible();

    // Mover Final para dentro de Jogo 1.
    await card.getByRole("button", { name: "Ações da pasta Final" }).click();
    await page.getByRole("menuitem", { name: "Mover" }).click();
    const mover = page.getByRole("dialog", { name: /Mover/ });
    await mover.getByRole("combobox", { name: "Para" }).click();
    await page.getByRole("option", { name: "Jogo 1" }).click();
    await mover.getByRole("button", { name: "Mover" }).click();
    await expect(card.getByRole("button", { name: /^Final/ })).toBeHidden();
    await expect(card.getByText("2 itens")).toBeVisible();

    // Arquivar Jogo 1 leva o conteúdo junto; desarquivar devolve tudo.
    await card.getByRole("button", { name: "Ações da pasta Jogo 1" }).click();
    await page.getByRole("menuitem", { name: "Arquivar" }).click();
    const confirmar = page.getByRole("alertdialog");
    await expect(confirmar.getByText(/2 subpastas/)).toBeVisible();
    await confirmar.getByRole("button", { name: "Arquivar" }).click();
    await expect(card.getByText("Nenhuma pasta ainda")).toBeVisible();

    await card.getByRole("switch", { name: "Mostrar arquivados" }).click();
    await expect(card.getByText("Arquivada")).toBeVisible();
    await card.getByRole("button", { name: "Ações da pasta Jogo 1" }).click();
    await page.getByRole("menuitem", { name: "Desarquivar" }).click();
    // Com o filtro ainda ligado: o selo some e as subpastas voltam a contar.
    await expect(card.getByText("Arquivada")).toBeHidden();
    await expect(card.getByRole("button", { name: /^Jogo 1/ })).toBeVisible();
    await expect(card.getByText("2 itens")).toBeVisible();
  });
});
