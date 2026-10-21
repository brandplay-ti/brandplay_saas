import { describe, expect, it, vi } from "vitest";
import { ehErroDeChunk, importarComRecarga } from "./lazyPage";

const storageEmMemoria = () => {
  const dados = new Map<string, string>();
  return {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    removeItem: (k: string) => void dados.delete(k),
    dados,
  };
};

const erroDeChunk = () => new TypeError("Failed to fetch dynamically imported module: /assets/Pipeline-abc.js");

describe("ehErroDeChunk", () => {
  it("reconhece as mensagens dos navegadores", () => {
    expect(ehErroDeChunk(erroDeChunk())).toBe(true);
    expect(ehErroDeChunk(new TypeError("error loading dynamically imported module"))).toBe(true);
    expect(ehErroDeChunk(new TypeError("Importing a module script failed."))).toBe(true);
    expect(ehErroDeChunk(new Error("Unable to preload CSS for /assets/x.css"))).toBe(true);
  });

  it("ignora outros erros", () => {
    expect(ehErroDeChunk(new Error("x is not a function"))).toBe(false);
    expect(ehErroDeChunk("Failed to fetch dynamically imported module")).toBe(false);
  });
});

describe("importarComRecarga", () => {
  it("devolve o módulo e limpa a marcação de recarga", async () => {
    const storage = storageEmMemoria();
    storage.setItem("brandplay:recarga-por-chunk", "1");
    const recarregar = vi.fn();
    await expect(importarComRecarga(async () => "modulo", { storage, recarregar })).resolves.toBe("modulo");
    expect(storage.dados.size).toBe(0);
    expect(recarregar).not.toHaveBeenCalled();
  });

  it("recarrega uma vez quando o chunk sumiu (deploy novo)", async () => {
    const storage = storageEmMemoria();
    const recarregar = vi.fn();
    const pendente = importarComRecarga(() => Promise.reject(erroDeChunk()), { storage, recarregar });
    await Promise.resolve();
    await Promise.resolve();
    expect(recarregar).toHaveBeenCalledTimes(1);
    expect(storage.getItem("brandplay:recarga-por-chunk")).toBe("1");
    void pendente;
  });

  it("não entra em laço: se já recarregou, repassa o erro", async () => {
    const storage = storageEmMemoria();
    storage.setItem("brandplay:recarga-por-chunk", "1");
    const recarregar = vi.fn();
    await expect(importarComRecarga(() => Promise.reject(erroDeChunk()), { storage, recarregar })).rejects.toThrow(
      /dynamically imported/,
    );
    expect(recarregar).not.toHaveBeenCalled();
  });

  it("repassa erro que não é de chunk sem recarregar", async () => {
    const storage = storageEmMemoria();
    const recarregar = vi.fn();
    await expect(importarComRecarga(() => Promise.reject(new Error("bug")), { storage, recarregar })).rejects.toThrow("bug");
    expect(recarregar).not.toHaveBeenCalled();
  });

  it("sem storage disponível, não recarrega", async () => {
    const recarregar = vi.fn();
    await expect(importarComRecarga(() => Promise.reject(erroDeChunk()), { storage: null, recarregar })).rejects.toThrow();
    expect(recarregar).not.toHaveBeenCalled();
  });
});
