// Teste de ponta a ponta da Edge Function `midia-r2` (BP-7.05) contra um
// stack LOCAL: MinIO (`npm run supabase:midia`) ou o bucket de
// desenvolvimento do R2 (docs/runbooks/armazenamento-r2.md). Usa só o seed
// local: cria e apaga o próprio projeto e um usuário financeiro de teste.
//
//   node supabase/tools/testar-midia-r2.mjs [--env docker/supabase/.env] [--api http://localhost:8010]
//
// Nunca rode contra homologação ou produção: o script usa a service role do
// .env local para criar o usuário de teste.
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";

function argumento(nome) {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const env = Object.fromEntries(
  readFileSync(argumento("--env") ?? "docker/supabase/.env", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
// Sem barra no fim; o `.env` vale pela última ocorrência de cada chave, como no compose.
const API = (argumento("--api") ?? `http://localhost:${env.KONG_HTTP_PORT_HOST || 8010}`).replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API)) {
  console.error("Só roda contra o stack local (http://localhost:<porta>).");
  process.exit(2);
}
const ENDPOINT_PUBLICO = new URL(env.R2_PUBLIC_ENDPOINT || env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`).host;
const ANON = env.ANON_KEY;
const SERVICE = env.SERVICE_ROLE_KEY;

let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALHA"} ${msg}`);
  if (!cond) falhas++;
};

async function login(email, senha) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`login ${email}: ${r.status}`);
  return { token: j.access_token, id: j.user.id };
}

const rest = (token, chave = ANON) => async (metodo, caminho, corpo, prefer = "return=representation") => {
  const r = await fetch(`${API}/rest/v1/${caminho}`, {
    method: metodo,
    headers: { apikey: chave, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: prefer },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await r.text();
  return { status: r.status, dados: texto ? JSON.parse(texto) : null };
};

const fn = (token) => async (corpo) => {
  const r = await fetch(`${API}/functions/v1/midia-r2`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  return { status: r.status, dados: await r.json().catch(() => null) };
};

const owner = await login("owner@brandplay.local", "brandplay-dev");
const restOwner = rest(owner.token);
const chamar = fn(owner.token);
const servico = rest(SERVICE, SERVICE);

const [membro] = (await restOwner("GET", `organization_members?select=organization_id&user_id=eq.${owner.id}&status=eq.ativo`)).dados;
const org = membro.organization_id;

// Projeto, edição e mídia de teste (o owner cria; a organização vem do gatilho).
const [raiz] = (await restOwner("POST", "sports_properties", { organization_id: org, owner_id: owner.id, name: "E2E R2 Copa", category: "campeonato" })).dados;
const [edicao] = (await restOwner("POST", "sports_properties", {
  organization_id: org, owner_id: owner.id, name: "E2E R2 Copa 2026", category: "campeonato", parent_property_id: raiz.id, season_year: 2026,
})).dados;
const [midia] = (await restOwner("POST", "edition_media", {
  organization_id: "00000000-0000-0000-0000-000000000000", property_id: edicao.id, kind: "video", file_name: "Gol da final é aqui.mp4",
  mime_type: "video/mp4", declared_size_bytes: 1,
})).dados;
ok(midia?.status === "aguardando_envio", "mídia criada aguardando envio");

// 1. Iniciar o original.
const ini = await chamar({ acao: "iniciar", media_id: midia.id, variante: "original", organization_id: "x", object_key: "outra/coisa" });
ok(ini.status === 200 && ini.dados?.objeto_id, `iniciar → ${ini.status}`);
const objetoId = ini.dados.objeto_id;
const [obj0] = (await servico("GET", `edition_media_objects?id=eq.${objetoId}&select=object_key,status,upload_id,organization_id`)).dados;
ok(obj0.object_key === `${midia.storage_prefix}/original`, "chave do objeto é a do banco, não a do corpo");
ok(obj0.organization_id === org && obj0.status === "enviando" && !!obj0.upload_id, "objeto enviando, com upload_id, na organização da mídia");

// 2. Assinar e enviar duas partes (6 MiB + 1 MiB).
const parte1 = randomBytes(6 * 1024 * 1024);
const parte2 = randomBytes(1024 * 1024);
const ass = await chamar({ acao: "assinar_partes", objeto_id: objetoId, partes: [1, 2] });
ok(ass.status === 200 && ass.dados.partes.length === 2, `assinar_partes → ${ass.status}`);
ok(new URL(ass.dados.partes[0].url).host === ENDPOINT_PUBLICO, "URL de envio aponta para o endpoint público");
const etags = [];
for (const [i, corpo] of [parte1, parte2].entries()) {
  const r = await fetch(ass.dados.partes[i].url, { method: "PUT", body: corpo });
  etags.push(r.headers.get("etag"));
  ok(r.ok && !!etags[i], `PUT da parte ${i + 1} → ${r.status}`);
}

// 3. Retomada: o servidor diz o que já está no armazenamento.
const lista = await chamar({ acao: "listar_partes", objeto_id: objetoId });
ok(lista.status === 200 && lista.dados.partes.map((p) => p.numero).join(",") === "1,2", "listar_partes devolve as 2 partes");

// 4. Concluir: tamanho real pelo HEAD.
const fim = await chamar({ acao: "concluir", objeto_id: objetoId, partes: [{ numero: 2, etag: etags[1] }, { numero: 1, etag: etags[0] }] });
ok(fim.status === 200 && fim.dados.tamanho_bytes === parte1.length + parte2.length, `concluir → ${fim.status}, ${fim.dados?.tamanho_bytes} bytes`);
const [obj1] = (await servico("GET", `edition_media_objects?id=eq.${objetoId}&select=status,size_bytes,upload_id,completed_at`)).dados;
ok(obj1.status === "enviado" && obj1.size_bytes === 7 * 1024 * 1024 && obj1.upload_id === null && !!obj1.completed_at, "objeto enviado com o tamanho real");
const [mid1] = (await servico("GET", `edition_media?id=eq.${midia.id}&select=status,declared_size_bytes`)).dados;
ok(mid1.status === "enviado" && mid1.declared_size_bytes === 1, "mídia enviada; tamanho declarado não foi trocado");
const uso = (await restOwner("GET", `edition_storage_usage?property_id=eq.${edicao.id}`)).dados;
ok(uso[0]?.total_bytes === 7 * 1024 * 1024, "uso de armazenamento conta o tamanho real");

// 5. Ler e baixar.
const ler = await chamar({ acao: "ler", media_id: midia.id, variante: "original" });
const baixado = Buffer.from(await (await fetch(ler.dados.url)).arrayBuffer());
ok(ler.status === 200 && baixado.equals(Buffer.concat([parte1, parte2])), "ler devolve URL e o conteúdo é o enviado");
const baixar = await chamar({ acao: "ler", media_id: midia.id, variante: "original", baixar: true });
const disp = (await fetch(baixar.dados.url, { method: "GET", headers: { Range: "bytes=0-0" } })).headers.get("content-disposition") ?? "";
ok(/attachment/.test(disp) && /filename\*=UTF-8''Gol%20da%20final%20%C3%A9%20aqui\.mp4/.test(disp), `baixar com nome do arquivo (${disp})`);

// 6. Não reenvia o que já está enviado.
const de_novo = await chamar({ acao: "iniciar", media_id: midia.id, variante: "original" });
ok(de_novo.status === 409, `iniciar de novo o original enviado → ${de_novo.status}`);

// 7. Abortar e recomeçar outra variante.
const mini = await chamar({ acao: "iniciar", media_id: midia.id, variante: "miniatura", mime: "image/jpeg" });
const abort = await chamar({ acao: "abortar", objeto_id: mini.dados.objeto_id });
ok(abort.status === 200, `abortar → ${abort.status}`);
const parteDepois = await chamar({ acao: "assinar_partes", objeto_id: mini.dados.objeto_id, partes: [1] });
ok(parteDepois.status === 409, "envio abortado não assina mais partes");
const mini2 = await chamar({ acao: "iniciar", media_id: midia.id, variante: "miniatura", mime: "image/jpeg" });
ok(mini2.status === 200 && mini2.dados.objeto_id === mini.dados.objeto_id, "recomeça a mesma variante na mesma linha");
const mimeRuim = await chamar({ acao: "iniciar", media_id: midia.id, variante: "analise", mime: "text/html" });
ok(mimeRuim.status === 400, `variante com tipo fora da lista → ${mimeRuim.status}`);

// 8. Quem não é membro não recebe URL (nem sabe se a mídia existe).
const intruso = await login("superadmin@brandplay.local", "brandplay-dev");
const chamarIntruso = fn(intruso.token);
ok((await chamarIntruso({ acao: "ler", media_id: midia.id, variante: "original" })).status === 404, "não membro: ler → 404");
ok((await chamarIntruso({ acao: "iniciar", media_id: midia.id, variante: "analise", mime: "video/mp4" })).status === 404, "não membro: iniciar → 404");
ok((await chamarIntruso({ acao: "assinar_partes", objeto_id: mini2.dados.objeto_id, partes: [1] })).status === 404, "não membro: assinar_partes → 404");

// 9. Financeiro da organização: lê, mas não envia.
const emailFin = `e2e-financeiro-${randomUUID().slice(0, 8)}@teste.local`;
const criado = await fetch(`${API}/auth/v1/admin/users`, {
  method: "POST",
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
  body: JSON.stringify({ email: emailFin, password: "senha-e2e-123456", email_confirm: true }),
}).then((r) => r.json());
await servico("POST", "organization_members", { organization_id: org, user_id: criado.id, role: "financeiro", status: "ativo" }, "return=minimal");
const fin = fn((await login(emailFin, "senha-e2e-123456")).token);
ok((await fin({ acao: "ler", media_id: midia.id, variante: "original" })).status === 200, "financeiro: ler → 200");
ok((await fin({ acao: "iniciar", media_id: midia.id, variante: "analise", mime: "video/mp4" })).status === 403, "financeiro: iniciar → 403");
ok((await fin({ acao: "assinar_partes", objeto_id: mini2.dados.objeto_id, partes: [1] })).status === 403, "financeiro: assinar_partes → 403");

// 10. Mídia arquivada não recebe envio.
await restOwner("PATCH", `edition_media?id=eq.${midia.id}`, { archived_at: new Date().toISOString() });
ok((await chamar({ acao: "assinar_partes", objeto_id: mini2.dados.objeto_id, partes: [1] })).status === 409, "mídia arquivada: assinar_partes → 409");

// 11. Sem login e pedido inválido.
const semLogin = await fetch(`${API}/functions/v1/midia-r2`, { method: "POST", headers: { apikey: ANON }, body: "{}" });
ok(semLogin.status === 401, `sem login → ${semLogin.status}`);
ok((await chamar({ acao: "apagar" })).status === 400, "ação desconhecida → 400");

// Limpeza: edição primeiro (a raiz solta a edição em vez de apagar).
await restOwner("DELETE", `sports_properties?id=eq.${edicao.id}`, null, "return=minimal");
await restOwner("DELETE", `sports_properties?id=eq.${raiz.id}`, null, "return=minimal");
await fetch(`${API}/auth/v1/admin/users/${criado.id}`, { method: "DELETE", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });

console.log(falhas === 0 ? "\nTUDO OK" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
