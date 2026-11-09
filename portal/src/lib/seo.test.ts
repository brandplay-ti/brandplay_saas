import { describe, expect, it } from "vitest";
import { AREAS_PRIVADAS, conferirAmbiente, gerarRobots, gerarSitemap, lerSiteUrl } from "./seo";

describe("lerSiteUrl", () => {
  it("ausente ou vazia devolve null", () => {
    expect(lerSiteUrl(undefined)).toBeNull();
    expect(lerSiteUrl("")).toBeNull();
    expect(lerSiteUrl("   ")).toBeNull();
  });

  it("normaliza para a origem, sem barra no fim", () => {
    expect(lerSiteUrl("https://brandplay.com.br")).toBe("https://brandplay.com.br");
    expect(lerSiteUrl(" https://Brandplay.com.br/ ")).toBe("https://brandplay.com.br");
    expect(lerSiteUrl("http://localhost:8080")).toBe("http://localhost:8080");
  });

  it("recusa valor sem esquema", () => {
    expect(() => lerSiteUrl("brandplay.com.br")).toThrow(/https:\/\/brandplay\.com\.br/);
    expect(() => lerSiteUrl("localhost:8080")).toThrow(/esquema/);
    expect(() => lerSiteUrl("ftp://brandplay.com.br")).toThrow(/esquema/);
  });

  it("recusa caminho, query e fragmento", () => {
    expect(() => lerSiteUrl("https://brandplay.com.br/app")).toThrow(/sem caminho/);
    expect(() => lerSiteUrl("https://brandplay.com.br/?utm=x")).toThrow(/sem caminho/);
    expect(() => lerSiteUrl("https://brandplay.com.br/#topo")).toThrow(/sem caminho/);
  });
});

describe("conferirAmbiente", () => {
  const PRODUCAO = "https://db.brandplay.com.br";
  const HOMOLOGACAO = "https://teste.db.brandplay.com.br";

  it("aceita produção com a URL de produção", () => {
    expect(() => conferirAmbiente(PRODUCAO, "https://brandplay.com.br")).not.toThrow();
  });

  it("recusa produção sem a variável", () => {
    expect(() => conferirAmbiente(PRODUCAO, null)).toThrow(
      /sem VITE_PUBLIC_SITE_URL\. Declare VITE_PUBLIC_SITE_URL=https:\/\/brandplay\.com\.br/,
    );
  });

  it("recusa produção com a URL de outro ambiente", () => {
    expect(() => conferirAmbiente(PRODUCAO, "https://teste.brandplay.com.br")).toThrow(
      /O valor deste ambiente é "https:\/\/brandplay\.com\.br"/,
    );
  });

  it("aceita homologação sem a variável", () => {
    expect(() => conferirAmbiente(HOMOLOGACAO, null)).not.toThrow();
  });

  it("recusa homologação com qualquer URL do site", () => {
    expect(() => conferirAmbiente(HOMOLOGACAO, "https://brandplay.com.br")).toThrow(/Remova a variável/);
    expect(() => conferirAmbiente(HOMOLOGACAO, "https://teste.brandplay.com.br")).toThrow(/Remova a variável/);
  });

  it("não confere hosts desconhecidos nem valores ausentes", () => {
    expect(() => conferirAmbiente("http://localhost:8010", null)).not.toThrow();
    expect(() => conferirAmbiente("http://localhost:8010", "https://brandplay.example")).not.toThrow();
    expect(() => conferirAmbiente(undefined, null)).not.toThrow();
    expect(() => conferirAmbiente("db.brandplay.com.br", null)).not.toThrow();
  });
});

describe("gerarRobots", () => {
  it("sem URL do site bloqueia tudo e não anuncia sitemap", () => {
    const robots = gerarRobots(null);
    expect(robots).toMatch(/^User-agent: \*\nDisallow: \/$/m);
    expect(robots).not.toMatch(/Sitemap:/);
  });

  it("com URL do site bloqueia só as áreas logadas e aponta para o sitemap", () => {
    const robots = gerarRobots("https://brandplay.com.br");
    for (const area of AREAS_PRIVADAS) expect(robots).toContain(`Disallow: ${area}\n`);
    expect(robots).not.toMatch(/^Disallow: \/$/m);
    expect(robots).toContain("Sitemap: https://brandplay.com.br/sitemap.xml\n");
  });

  it("tem um único grupo de User-agent", () => {
    expect(gerarRobots("https://brandplay.com.br").match(/User-agent:/g)).toHaveLength(1);
    expect(gerarRobots(null).match(/User-agent:/g)).toHaveLength(1);
  });

  // `/r/` fica rastreável de propósito: é assim que o buscador lê o `noindex`
  // da página do relatório (ver AREAS_PRIVADAS em seo.ts).
  it("não bloqueia a landing, o login, os media kits nem os relatórios", () => {
    const disallows = gerarRobots("https://brandplay.com.br")
      .split("\n")
      .filter((linha) => linha.startsWith("Disallow:"))
      .map((linha) => linha.slice("Disallow:".length).trim());

    for (const publica of ["/", "/auth", "/esqueci-senha", "/p/copa-sul-2025", "/r/relatorio-copa-sul-x7k2"]) {
      expect(disallows.some((prefixo) => publica.startsWith(prefixo))).toBe(false);
    }
  });

  it("bloqueia o login do portal do patrocinador junto com o portal", () => {
    const disallows = gerarRobots("https://brandplay.com.br")
      .split("\n")
      .filter((linha) => linha.startsWith("Disallow:"))
      .map((linha) => linha.slice("Disallow:".length).trim());

    for (const privada of ["/portal/login", "/onboarding/organizacao", "/campo/eventos", "/dashboard/relatorios"]) {
      expect(disallows.some((prefixo) => privada.startsWith(prefixo))).toBe(true);
    }
  });
});

describe("gerarSitemap", () => {
  it("lista a landing com URL absoluta", () => {
    const xml = gerarSitemap("https://brandplay.com.br");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.match(/<loc>/g)).toHaveLength(1);
    expect(xml).toContain("<loc>https://brandplay.com.br/</loc>");
  });

  it("não lista os media kits nem os relatórios", () => {
    const xml = gerarSitemap("https://brandplay.com.br");
    expect(xml).not.toContain("/p/");
    expect(xml).not.toContain("/r/");
  });

  it("gera XML bem formado", () => {
    const doc = new DOMParser().parseFromString(gerarSitemap("https://brandplay.com.br"), "application/xml");
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(doc.documentElement.localName).toBe("urlset");
  });
});
