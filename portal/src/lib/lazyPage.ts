import { lazy, type ComponentType } from "react";

/**
 * Páginas carregadas sob demanda (um chunk por rota), para a landing e o media
 * kit público não baixarem o app inteiro.
 *
 * Depois de um deploy, os chunks antigos deixam de existir no servidor: quem
 * está com a aba aberta e navega para uma página ainda não carregada recebe
 * "Failed to fetch dynamically imported module". Nesse caso a página é
 * recarregada uma vez, já com o build novo. Se o erro voltar logo depois (o
 * problema não era versão), ele sobe para o ErrorBoundary.
 */

const CHAVE_RECARGA = "brandplay:recarga-por-chunk";

const ERRO_DE_CHUNK =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

export function ehErroDeChunk(erro: unknown): boolean {
  return erro instanceof Error && ERRO_DE_CHUNK.test(erro.message);
}

interface Ambiente {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  recarregar: () => void;
}

const ambientePadrao = (): Ambiente => {
  let storage: Ambiente["storage"] = null;
  try {
    storage = window.sessionStorage;
  } catch {
    // aba privada ou storage bloqueado: sem marcação, não recarrega
  }
  return { storage, recarregar: () => window.location.reload() };
};

export async function importarComRecarga<T>(importar: () => Promise<T>, ambiente: Ambiente = ambientePadrao()): Promise<T> {
  const { storage } = ambiente;
  try {
    const modulo = await importar();
    storage?.removeItem(CHAVE_RECARGA);
    return modulo;
  } catch (erro) {
    if (!storage || !ehErroDeChunk(erro) || storage.getItem(CHAVE_RECARGA)) throw erro;
    storage.setItem(CHAVE_RECARGA, "1");
    ambiente.recarregar();
    // Segura o Suspense até a página recarregar.
    return new Promise<T>(() => {});
  }
}

export const lazyPage = (importar: () => Promise<{ default: ComponentType }>) =>
  lazy(() => importarComRecarga(importar));
