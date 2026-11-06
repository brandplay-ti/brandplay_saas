import { describe, expect, it } from "vitest";
import { identificarLink, miniaturaDoPost, proporcaoDoEmbed, urlDeEmbed } from "./redesSociais";

describe("identificarLink", () => {
  it("reconhece o YouTube em todos os formatos de link", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=9e1ZiyuOXRc&t=3s",
      "https://youtu.be/9e1ZiyuOXRc",
      "http://m.youtube.com/watch?v=9e1ZiyuOXRc",
      "https://www.youtube.com/live/9e1ZiyuOXRc",
    ]) {
      expect(identificarLink(url)).toMatchObject({ rede: "youtube", idExterno: "9e1ZiyuOXRc" });
    }
    expect(identificarLink("https://youtube.com/shorts/9e1ZiyuOXRc")).toMatchObject({ tipo: "reel" });
  });

  it("reconhece Instagram, TikTok e matéria de site", () => {
    expect(identificarLink("https://www.instagram.com/reel/DdzSFlKFOtm/")).toMatchObject({
      rede: "instagram",
      idExterno: "DdzSFlKFOtm",
      tipo: "reel",
    });
    expect(identificarLink("https://www.instagram.com/scp/p/DdzKxiLFIXN/")).toMatchObject({ tipo: "post" });
    expect(identificarLink("https://www.tiktok.com/@scp/video/7412345678901234567")).toMatchObject({
      rede: "tiktok",
      idExterno: "7412345678901234567",
    });
    expect(identificarLink("https://ge.globo.com/sp/final.ghtml")).toMatchObject({ rede: "site", tipo: "materia" });
  });

  it("não se deixa enganar por domínio parecido", () => {
    expect(identificarLink("https://instagram.com.evil.com/p/abcdef/")?.rede).toBe("site");
  });

  it("recusa o que não é https", () => {
    expect(identificarLink("javascript:alert(1)")).toBeNull();
    expect(identificarLink("ftp://x.com/a")).toBeNull();
    expect(identificarLink("https://u:s@youtube.com/watch?v=9e1ZiyuOXRc")).toBeNull();
  });
});

describe("embed", () => {
  it("monta o iframe pelo id, nunca pela URL crua", () => {
    expect(urlDeEmbed({ rede: "youtube", tipo: "video", id_externo: "9e1ZiyuOXRc", url: "x" })).toBe(
      "https://www.youtube-nocookie.com/embed/9e1ZiyuOXRc?rel=0&modestbranding=1&autoplay=1",
    );
    expect(urlDeEmbed({ rede: "instagram", tipo: "reel", id_externo: "DdzSFlKFOtm", url: "x" })).toBe(
      "https://www.instagram.com/reel/DdzSFlKFOtm/embed/",
    );
    expect(urlDeEmbed({ rede: "youtube", tipo: "video", id_externo: '"><script>', url: "x" })).toBeNull();
    expect(urlDeEmbed({ rede: "site", tipo: "materia", id_externo: null, url: "https://ge.globo.com" })).toBeNull();
  });

  it("só passa para o plugin do Facebook link do Facebook", () => {
    expect(
      urlDeEmbed({ rede: "facebook", tipo: "video", id_externo: null, url: "https://www.facebook.com/scp/videos/1" }),
    ).toContain("plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Fscp%2Fvideos%2F1");
    expect(urlDeEmbed({ rede: "facebook", tipo: "post", id_externo: null, url: "https://evil.com" })).toBeNull();
  });

  it("miniatura e proporção", () => {
    expect(miniaturaDoPost({ rede: "youtube", id_externo: "9e1ZiyuOXRc" })).toBe(
      "https://i.ytimg.com/vi/9e1ZiyuOXRc/hqdefault.jpg",
    );
    expect(miniaturaDoPost({ rede: "instagram", id_externo: "DdzSFlKFOtm" })).toBeNull();
    expect(proporcaoDoEmbed({ rede: "youtube", tipo: "video" })).toBe("16/9");
    expect(proporcaoDoEmbed({ rede: "tiktok", tipo: "reel" })).toBe("9/16");
    expect(proporcaoDoEmbed({ rede: "instagram", tipo: "post" })).toBe("4/5");
  });
});
