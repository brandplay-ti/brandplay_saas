import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  erroNoXml,
  lerPartes,
  lerPedido,
  lerUploadId,
  mimeDoObjeto,
  normalizarEtag,
  PedidoInvalido,
  xmlDeConclusao,
} from "./midia_r2.ts";

const MIDIA = "e4000000-0000-4000-8000-000000000001";
const OBJETO = "0b000000-0000-4000-8000-000000000001";

Deno.test("iniciar: só mídia, variante e tipo; nada de organização ou caminho", () => {
  const pedido = lerPedido({
    acao: "iniciar",
    media_id: MIDIA.toUpperCase(),
    variante: "analise",
    mime: "video/mp4",
    organization_id: "b4000000-0000-4000-8000-000000000002",
    object_key: "outra-org/x",
  });
  assertEquals(pedido, { acao: "iniciar", mediaId: MIDIA, variante: "analise", mime: "video/mp4" });
  assertThrows(() => lerPedido({ acao: "iniciar", media_id: "x", variante: "original" }), PedidoInvalido);
  assertThrows(() => lerPedido({ acao: "iniciar", media_id: MIDIA, variante: "corte-9x16" }), PedidoInvalido);
  assertThrows(() => lerPedido({ acao: "iniciar", media_id: MIDIA, variante: "original", mime: "text/html<script>" }), PedidoInvalido);
});

Deno.test("assinar_partes: lote de 1 a 100, números de 1 a 10.000, sem repetição", () => {
  assertEquals(lerPedido({ acao: "assinar_partes", objeto_id: OBJETO, partes: [3, 1, 3, 2] }), {
    acao: "assinar_partes",
    objetoId: OBJETO,
    partes: [1, 2, 3],
  });
  for (const partes of [[], [0], [10_001], [1.5], ["1"], Array.from({ length: 101 }, (_, i) => i + 1)]) {
    assertThrows(() => lerPedido({ acao: "assinar_partes", objeto_id: OBJETO, partes }), PedidoInvalido);
  }
});

Deno.test("concluir: ETag normalizado, partes em ordem e sem repetição", () => {
  const pedido = lerPedido({
    acao: "concluir",
    objeto_id: OBJETO,
    partes: [
      { numero: 2, etag: "\"BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB\"" },
      { numero: 1, etag: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    ],
  });
  assertEquals(pedido, {
    acao: "concluir",
    objetoId: OBJETO,
    partes: [
      { numero: 1, etag: "\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"" },
      { numero: 2, etag: "\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"" },
    ],
  });
  assertThrows(
    () => lerPedido({ acao: "concluir", objeto_id: OBJETO, partes: [{ numero: 1, etag: "aa" }, { numero: 1, etag: "bb" }] }),
    PedidoInvalido,
  );
  assertThrows(() => lerPedido({ acao: "concluir", objeto_id: OBJETO, partes: [{ numero: 1, etag: "<x>" }] }), PedidoInvalido);
});

Deno.test("ler: baixar opcional e booleano", () => {
  assertEquals(lerPedido({ acao: "ler", media_id: MIDIA, variante: "original" }), {
    acao: "ler",
    mediaId: MIDIA,
    variante: "original",
    baixar: false,
  });
  assertEquals((lerPedido({ acao: "ler", media_id: MIDIA, variante: "original", baixar: true }) as { baixar: boolean }).baixar, true);
  assertThrows(() => lerPedido({ acao: "ler", media_id: MIDIA, variante: "original", baixar: "sim" }), PedidoInvalido);
  assertThrows(() => lerPedido({ acao: "apagar", media_id: MIDIA }), PedidoInvalido);
  assertThrows(() => lerPedido(null), PedidoInvalido);
});

Deno.test("tipo do objeto: original segue a mídia, demais só da lista", () => {
  assertEquals(mimeDoObjeto("original", "video/quicktime", null), "video/quicktime");
  assertEquals(mimeDoObjeto("original", null, null), "application/octet-stream");
  assertEquals(mimeDoObjeto("original", "lixo", null), "application/octet-stream");
  assertEquals(mimeDoObjeto("analise", null, "video/mp4"), "video/mp4");
  assertEquals(mimeDoObjeto("relatorio", null, "image/webp"), "image/webp");
  assertThrows(() => mimeDoObjeto("analise", null, "video/quicktime"), PedidoInvalido);
  assertThrows(() => mimeDoObjeto("miniatura", null, null), PedidoInvalido);
});

Deno.test("ETag: aspas, hexadecimal e sufixo de multipart", () => {
  assertEquals(normalizarEtag("ABCDEF0123456789abcdef0123456789"), "\"abcdef0123456789abcdef0123456789\"");
  assertEquals(normalizarEtag("\"abcdef0123456789abcdef0123456789-12\""), "\"abcdef0123456789abcdef0123456789-12\"");
  assertEquals(normalizarEtag("xyz"), null);
  assertEquals(normalizarEtag(42), null);
});

Deno.test("XML do multipart: conclusão, UploadId, erro em 200 e página do ListParts", () => {
  assertEquals(
    xmlDeConclusao([{ numero: 1, etag: "\"aa\"" }, { numero: 2, etag: "\"bb\"" }]),
    "<CompleteMultipartUpload xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\">" +
      "<Part><PartNumber>1</PartNumber><ETag>&quot;aa&quot;</ETag></Part>" +
      "<Part><PartNumber>2</PartNumber><ETag>&quot;bb&quot;</ETag></Part>" +
      "</CompleteMultipartUpload>",
  );
  assertEquals(
    lerUploadId("<InitiateMultipartUploadResult><Bucket>b</Bucket><Key>k</Key><UploadId>abc&amp;123</UploadId></InitiateMultipartUploadResult>"),
    "abc&123",
  );
  assertEquals(lerUploadId("<Error><Code>AccessDenied</Code></Error>"), null);
  assertEquals(erroNoXml("<Error><Code>InvalidPart</Code><Message>x</Message></Error>"), "InvalidPart");
  assertEquals(erroNoXml("<CompleteMultipartUploadResult><ETag>&quot;x-2&quot;</ETag></CompleteMultipartUploadResult>"), null);

  const pagina = lerPartes(
    "<ListPartsResult><IsTruncated>true</IsTruncated><NextPartNumberMarker>2</NextPartNumberMarker>" +
      "<Part><PartNumber>1</PartNumber><ETag>&quot;aa&quot;</ETag><Size>5242880</Size></Part>" +
      "<Part><PartNumber>2</PartNumber><ETag>\"bb\"</ETag><Size>100</Size></Part>" +
      "</ListPartsResult>",
  );
  assertEquals(pagina, {
    partes: [
      { numero: 1, etag: "\"aa\"", tamanho: 5242880 },
      { numero: 2, etag: "\"bb\"", tamanho: 100 },
    ],
    proximoMarcador: 2,
  });
  assertEquals(lerPartes("<ListPartsResult><IsTruncated>false</IsTruncated></ListPartsResult>").proximoMarcador, null);
});
