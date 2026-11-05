import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  comOrigemPublica,
  emLotes,
  identificarLink,
  lerOembed,
  lerVideosYoutube,
  precisaAtualizar,
  slugValido,
  urlOembed,
  urlPublica,
  urlVideosYoutube,
} from "./relatorio.ts";

Deno.test("slug: aceita o formato gerado e recusa o resto", () => {
  assert(slugValido("copa-2026-claro-a1b2c3"));
  assert(!slugValido("Copa"));
  assert(!slugValido("../etc"));
  assert(!slugValido("ab"));
  assert(!slugValido(42));
});

Deno.test("urlPublica: codifica o caminho e redimensiona pelo imgproxy", () => {
  assertEquals(
    urlPublica("https://db.exemplo.com/", "property-media", "u/p/foto 1.jpg"),
    "https://db.exemplo.com/storage/v1/object/public/property-media/u/p/foto%201.jpg",
  );
  assertEquals(
    urlPublica("https://db.exemplo.com", "org-logos", "/o/logo.png", 640),
    "https://db.exemplo.com/storage/v1/render/image/public/org-logos/o/logo.png?width=640&quality=75&resize=contain",
  );
});

Deno.test("comOrigemPublica: troca a origem interna pela pública", () => {
  assertEquals(
    comOrigemPublica("http://kong:8000/storage/v1/object/sign/delivery-evidence/a.jpg?token=x", "https://db.exemplo.com"),
    "https://db.exemplo.com/storage/v1/object/sign/delivery-evidence/a.jpg?token=x",
  );
});

Deno.test("identificarLink: YouTube em todos os formatos", () => {
  for (const url of [
    "https://www.youtube.com/watch?v=9e1ZiyuOXRc&t=3s",
    "https://youtu.be/9e1ZiyuOXRc",
    "https://youtube.com/shorts/9e1ZiyuOXRc",
    "https://www.youtube.com/live/9e1ZiyuOXRc",
    "http://m.youtube.com/watch?v=9e1ZiyuOXRc",
  ]) {
    const l = identificarLink(url);
    assertEquals(l?.rede, "youtube", url);
    assertEquals(l?.idExterno, "9e1ZiyuOXRc", url);
  }
  assertEquals(identificarLink("https://www.youtube.com/@canal")?.idExterno, null);
});

Deno.test("identificarLink: Instagram, TikTok e demais", () => {
  assertEquals(identificarLink("https://www.instagram.com/reel/DdzSFlKFOtm/")?.idExterno, "DdzSFlKFOtm");
  assertEquals(identificarLink("https://www.instagram.com/scp/p/DdzKxiLFIXN/?img_index=1")?.idExterno, "DdzKxiLFIXN");
  const tt = identificarLink("https://www.tiktok.com/@scp/video/7412345678901234567");
  assertEquals([tt?.rede, tt?.idExterno], ["tiktok", "7412345678901234567"]);
  assertEquals(identificarLink("https://vm.tiktok.com/ZMabc/")?.idExterno, null);
  assertEquals(identificarLink("https://ge.globo.com/sp/noticia/final.ghtml")?.rede, "site");
  assertEquals(identificarLink("https://x.com/scp/status/1")?.rede, "x");
  assertEquals(identificarLink("https://instagram.com.evil.com/p/abcdef/")?.rede, "site");
});

Deno.test("identificarLink: recusa o que não é https", () => {
  assertEquals(identificarLink("javascript:alert(1)"), null);
  assertEquals(identificarLink("ftp://x.com/a"), null);
  assertEquals(identificarLink("https://user:senha@youtube.com/watch?v=9e1ZiyuOXRc"), null);
  assertEquals(identificarLink("nao é url"), null);
});

Deno.test("precisaAtualizar: respeita o cache de uma hora", () => {
  const agora = Date.parse("2026-10-28T12:00:00Z");
  assert(precisaAtualizar(null, agora));
  assert(!precisaAtualizar("2026-10-28T11:30:00Z", agora));
  assert(precisaAtualizar("2026-10-28T10:59:00Z", agora));
  assert(precisaAtualizar("lixo", agora));
});

Deno.test("emLotes: 50 ids por chamada", () => {
  const ids = Array.from({ length: 120 }, (_, i) => String(i));
  assertEquals(emLotes(ids).map((l) => l.length), [50, 50, 20]);
});

Deno.test("YouTube: monta a chamada e lê só o que reconhece", () => {
  const url = new URL(urlVideosYoutube(["9e1ZiyuOXRc", "NTNQ1bZZxfc"], "CHAVE"));
  assertEquals(url.host, "www.googleapis.com");
  assertEquals(url.searchParams.get("id"), "9e1ZiyuOXRc,NTNQ1bZZxfc");
  const lidos = lerVideosYoutube({
    items: [
      {
        id: "9e1ZiyuOXRc",
        snippet: { title: "Final SCP", publishedAt: "2026-09-27T21:00:00Z" },
        statistics: { viewCount: "1420000", likeCount: "52000", commentCount: "870" },
      },
      { id: "<script>", statistics: { viewCount: "1" } },
      { id: "NTNQ1bZZxfc", statistics: { viewCount: "-5", likeCount: "x" } },
    ],
  });
  assertEquals(lidos.size, 2);
  assertEquals(lidos.get("9e1ZiyuOXRc"), {
    views: 1420000,
    likes: 52000,
    comentarios: 870,
    titulo: "Final SCP",
    publicadoEm: "2026-09-27",
  });
  assertEquals(lidos.get("NTNQ1bZZxfc")?.views, null);
  assertEquals(lerVideosYoutube({ error: { code: 403 } }).size, 0);
});

Deno.test("oEmbed: host fixo e miniatura só https", () => {
  const yt = identificarLink("https://youtu.be/9e1ZiyuOXRc")!;
  assert(urlOembed(yt)!.startsWith("https://www.youtube.com/oembed?"));
  assertEquals(urlOembed(identificarLink("https://www.instagram.com/p/DdzKxiLFIXN/")!), null);
  assertEquals(lerOembed({ title: " Final ", author_name: "SCP", thumbnail_url: "http://x/a.jpg" }), {
    titulo: "Final",
    autor: "SCP",
    miniatura: null,
  });
});
