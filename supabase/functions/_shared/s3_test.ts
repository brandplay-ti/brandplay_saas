import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assinarQuery, codificar, codificarCaminho, configDoAmbiente, urlAssinada, type ConfigS3 } from "./s3.ts";

// Exemplo de URL pré-assinada da documentação da AWS ("Authenticating
// Requests: Using Query Parameters"): GET de examplebucket/test.txt em
// 24/05/2013, válida por 86400 s, com as credenciais de exemplo.
Deno.test("assinatura bate com o exemplo de URL pré-assinada da AWS", async () => {
  const query = await assinarQuery({
    metodo: "GET",
    host: "examplebucket.s3.amazonaws.com",
    caminho: "/test.txt",
    regiao: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    expiraEmSegundos: 86400,
    agora: new Date("2013-05-24T00:00:00Z"),
  });
  assertEquals(
    query,
    "X-Amz-Algorithm=AWS4-HMAC-SHA256" +
      "&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request" +
      "&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host" +
      "&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
  );
});

Deno.test("codificação RFC 3986 e caminho com barras preservadas", () => {
  assertEquals(codificar("a b+c/d*(e)!'"), "a%20b%2Bc%2Fd%2A%28e%29%21%27");
  assertEquals(codificar("~._-"), "~._-");
  assertEquals(codificarCaminho("org/projeto/edição 1/original"), "org/projeto/edi%C3%A7%C3%A3o%201/original");
});

const CFG: ConfigS3 = {
  endpoint: "http://minio:9000",
  endpointPublico: "http://localhost:9010",
  regiao: "us-east-1",
  bucket: "brandplay-midia-dev",
  accessKeyId: "AKID",
  secretAccessKey: "SEGREDO",
};

Deno.test("URL pública usa o endpoint do navegador; a do servidor, o interno", async () => {
  const agora = new Date("2026-11-24T12:00:00Z");
  const publica = await urlAssinada(CFG, {
    metodo: "PUT",
    chave: "a/b/c/d/original",
    query: { partNumber: "3", uploadId: "u-1" },
    expiraEmSegundos: 900,
    publica: true,
    agora,
  });
  const u = new URL(publica);
  assertEquals(u.host, "localhost:9010");
  assertEquals(u.pathname, "/brandplay-midia-dev/a/b/c/d/original");
  assertEquals(u.searchParams.get("partNumber"), "3");
  assertEquals(u.searchParams.get("uploadId"), "u-1");
  assertEquals(u.searchParams.get("X-Amz-Expires"), "900");
  assert(/^[0-9a-f]{64}$/.test(u.searchParams.get("X-Amz-Signature") ?? ""));

  const interna = await urlAssinada(CFG, { metodo: "HEAD", chave: "a/b/c/d/original", expiraEmSegundos: 60, publica: false, agora });
  assertEquals(new URL(interna).host, "minio:9000");
  // O host entra na assinatura: as duas URLs não podem ter a mesma.
  assert(new URL(interna).searchParams.get("X-Amz-Signature") !== u.searchParams.get("X-Amz-Signature"));
});

Deno.test("recusa chave de objeto que sai do bucket e validade absurda", async () => {
  for (const chave of ["", "/a", "a/../b"]) {
    await assertRejects(() => urlAssinada(CFG, { metodo: "GET", chave, expiraEmSegundos: 60, publica: true }));
  }
  await assertRejects(() => urlAssinada(CFG, { metodo: "GET", chave: "a", expiraEmSegundos: 0, publica: true }));
  await assertRejects(() => urlAssinada(CFG, { metodo: "GET", chave: "a", expiraEmSegundos: 700_000, publica: true }));
});

Deno.test("configuração do ambiente: R2 por conta, MinIO por endpoint, nada sem chave", () => {
  const env = (valores: Record<string, string>) => (nome: string) => valores[nome];
  const r2 = configDoAmbiente(env({
    R2_ACCOUNT_ID: "abc123",
    R2_ACCESS_KEY_ID: "k",
    R2_SECRET_ACCESS_KEY: "s",
    R2_BUCKET: "brandplay-midia-hml",
  }));
  assertEquals(r2, {
    endpoint: "https://abc123.r2.cloudflarestorage.com",
    endpointPublico: "https://abc123.r2.cloudflarestorage.com",
    regiao: "auto",
    bucket: "brandplay-midia-hml",
    accessKeyId: "k",
    secretAccessKey: "s",
  });

  const minio = configDoAmbiente(env({
    R2_ENDPOINT: "http://minio:9000",
    R2_PUBLIC_ENDPOINT: "http://localhost:9010",
    R2_REGION: "us-east-1",
    R2_ACCESS_KEY_ID: "k",
    R2_SECRET_ACCESS_KEY: "s",
    R2_BUCKET: "brandplay-midia-dev",
  }));
  assertEquals(minio?.endpointPublico, "http://localhost:9010");
  assertEquals(minio?.regiao, "us-east-1");

  assertEquals(configDoAmbiente(env({ R2_ACCOUNT_ID: "abc", R2_BUCKET: "b" })), null);
  assertEquals(configDoAmbiente(env({ R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s", R2_BUCKET: "b" })), null);
});
